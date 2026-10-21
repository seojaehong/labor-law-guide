"""표준 열 대조표(comparison.v1) — /laws 화면과 검수자가 같이 읽는다."""
import json
from pathlib import Path

from work_rules_c.articles import ArticlePair
from work_rules_c.judge import JudgeOut
from work_rules_c.mapping import NEW_BUCKET, RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.triage import Triage

COLUMNS = ["조문", "현행", "개정안", "개정 사유", "근거·시행일", "불이익변경", "점검 결과", "운영 메모", "제안 문안"]


def _basis(hits: list[RuleHit]) -> str:
    return "; ".join(f"{h.law_article} ({h.effective:%Y.%m.%d.} 시행)" for h in hits)


def build_rows(pairs: list[ArticlePair], drops: dict[str, list[Drop]], hits: dict[str, list[RuleHit]],
               triages: dict[str, Triage], judged: dict[str, JudgeOut]) -> list[dict]:
    rows = []
    for p in pairs:
        t = triages.get(p.no)
        if t is None or not t.escalate:
            continue
        j = judged.get(p.no)
        h = hits.get(p.no, [])
        row = {
            "조문": p.no,
            "현행": p.old.body if p.old else "",
            "개정안": p.new.body if p.new else "",
            "개정 사유": j.reason if j else "",
            "근거·시행일": j.basis if j and j.basis else _basis(h),
            "불이익변경": j.disadvantage if j else ("확인 필요" if drops.get(p.no) else "해당 없음"),
            "점검 결과": j.result if j else "추가 확인",
            "운영 메모": j.ops_note if j else "",
            "제안 문안": j.proposed_text if j else "",
        }
        rows.append({k: row[k] for k in COLUMNS})
    for h in hits.get(NEW_BUCKET, []):
        rows.append({
            "조문": "신설 필요", "현행": "", "개정안": "", "개정 사유": h.topic,
            "근거·시행일": _basis([h]), "불이익변경": "해당 없음", "점검 결과": "추가 확인",
            "운영 메모": "", "제안 문안": "",
        })
    return rows


def write_outputs(rows: list[dict], meta: dict, out_dir: Path) -> tuple[Path, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    j = out_dir / "comparison.json"
    j.write_text(json.dumps({"schema": "comparison.v1", "meta": meta, "rows": rows}, ensure_ascii=False, indent=1),
                 encoding="utf-8")
    lines = [f"# 취업규칙 대조표 — {meta.get('사업장', '')}", ""]
    lines += [f"- {k}: {v}" for k, v in meta.items()]
    for r in rows:
        lines += ["", f"### {r['조문']}"]
        lines += [f"- **{k}**: {r[k]}" for k in COLUMNS[1:] if r[k]]
    m = out_dir / "comparison.md"
    m.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return j, m
