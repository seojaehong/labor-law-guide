"""표준 열 대조표(comparison.v1) — /laws 화면과 검수자가 같이 읽는다."""
import json
import re
from pathlib import Path

from work_rules_c.articles import ArticlePair, duplicated
from work_rules_c.judge import NO_BASELINE, JudgeOut
from work_rules_c.mapping import NEW_BUCKET, RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.triage import Triage

COLUMNS = ["조문", "현행", "개정안", "개정 사유", "근거·시행일", "불이익변경", "점검 결과", "운영 메모", "제안 문안"]

# 확률 숫자는 산출물에 쓰지 않는다(NOW.md). 모델이 쓴 판단 글(개정 사유·운영 메모)에서만 지운다.
# 「건강진단」「고충상담」「노동위원회 판정」 같은 법령 용어는 바꾸지 않는다 — 직무 표방 어휘는 프롬프트가 막는다(2026-10-22 리뷰)
PROB = re.compile(r"(?:확률|정확도)\s*[:은는이가]?\s*\d+(?:\.\d+)?\s*%?|가능성\s*[:은는이가]?\s*\d+(?:\.\d+)?\s*%")


def clean(text: str) -> str:
    return re.sub(r"\s{2,}", " ", PROB.sub("", text)).strip()


def _basis(hits: list[RuleHit]) -> str:
    # 「제11조」만으로는 어느 법인지 모른다 — 법령명이 있으면 붙인다(TS pipeline.ts mapRules 와 같다)
    return "; ".join(f"{f'{h.law} ' if h.law else ''}{h.law_article} ({h.effective:%Y.%m.%d.} 시행)" for h in hits)


def disadvantage_of(j: JudgeOut | None, hard: bool, has_old: bool) -> str:
    """불이익변경 칸. 종전 규칙이 없으면 판단과 무관하게 「비교 불가 — 종전 규칙 미제공」이다(대조하지 않은 것을 「해당 없음」으로 쓰지 않는다).
    종전 규칙은 있는데 그 조문만 짝이 없어 판단이 「비교 불가」를 낸 경우는 「확인 필요」로 올린다."""
    if not has_old:
        return NO_BASELINE
    d = j.disadvantage if j else ("확인 필요" if hard else "해당 없음")
    if d == "비교 불가":
        d = "확인 필요"
    if hard and d == "해당 없음":  # 기계 신호 — 판단이 「해당 없음」으로 지우지 못한다
        d = "확인 필요"
    return d


def build_rows(pairs: list[ArticlePair], drops: dict[str, list[Drop]], hits: dict[str, list[RuleHit]],
               triages: dict[str, Triage], judged: dict[str, JudgeOut], has_old: bool = True) -> list[dict]:
    rows = []
    dups = duplicated(p.no for p in pairs)
    for p in pairs:
        t = triages.get(p.no)
        if t is None or not t.escalate:
            continue
        j = judged.get(p.no)
        h = hits.get(p.no, [])
        d = drops.get(p.no, [])
        disadvantage = disadvantage_of(j, bool(d) or p.status == "삭제", has_old)
        memo = [clean(j.ops_note)] if j and j.ops_note else []
        if d:
            memo.append("수치 하락: " + ", ".join(f"{x.old_max:g}{x.unit} → {x.new_max:g}{x.unit}" for x in d))
        if p.no in dups:
            memo.append("조문 번호 중복 — 같은 번호의 조문이 둘 이상이다")
        if p.status == "삭제":
            memo.append("조문 삭제")
        elif p.old_no and p.old_no != p.no:
            memo.append(f"종전 {p.old_no}에서 옮김")
        row = {
            "조문": p.no,
            "현행": p.old.body if p.old else "",
            "개정안": p.new.body if p.new else "",
            "개정 사유": clean(j.reason) if j else "",
            "근거·시행일": j.basis if j and j.basis else _basis(h),
            "불이익변경": disadvantage,
            "점검 결과": "현행 수정 필요" if p.no in dups and (not j or j.result == "추가 확인") else (
                j.result if j else "추가 확인"),
            "운영 메모": " · ".join(m for m in memo if m),
            "제안 문안": j.proposed_text if j else "",  # 조문 문안은 손대지 않는다
        }
        rows.append({k: row[k] for k in COLUMNS})
    for h in hits.get(NEW_BUCKET, []):
        rows.append({
            "조문": "신설 필요", "현행": "", "개정안": "", "개정 사유": h.topic,
            "근거·시행일": _basis([h]), "불이익변경": "해당 없음" if has_old else NO_BASELINE, "점검 결과": "추가 확인",
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
