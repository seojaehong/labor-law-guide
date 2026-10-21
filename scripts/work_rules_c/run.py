"""취업규칙 정밀 점검(C) 고정 파이프라인 실행.

python3 scripts/work_rules_c/run.py --rules <개정안> [--old <종전>] --asof 2026-10-21 --since 2023-01-01 \
    --out <폴더> --triage haiku|jev|openai [--judge-model claude-sonnet-5-5] [--min-confidence 0.8] [--site 사업장명]
"""
import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from work_rules_c import cost  # noqa: E402
from work_rules_c.articles import pair_articles, read_text, split_articles  # noqa: E402
from work_rules_c.judge import JudgeBackend, JudgeInput, apply_threshold  # noqa: E402
from work_rules_c.mapping import NEW_BUCKET, hits_by_article, map_rules  # noqa: E402
from work_rules_c.quantities import quantity_drops  # noqa: E402
from work_rules_c.report import build_rows, write_outputs  # noqa: E402
from work_rules_c.triage import TriageBackend  # noqa: E402


DEFAULT_JUDGE_MODEL = "claude-sonnet-5-5"  # 2026-10-21 재홍님 「소넷만 가도 되지 않을까」


def pipeline(new_text: str, old_text: str | None, asof: date, since: date, triage: TriageBackend,
             judge: JudgeBackend, meta: dict, rules: list[dict] | None = None,
             min_confidence: float = 0.8) -> tuple[list[dict], dict]:
    new = split_articles(new_text)
    old = split_articles(old_text) if old_text is not None else []
    for label, arts in (("개정안", new), ("종전", old if old_text is not None else None)):
        if arts is not None and not any(a.body.strip() for a in arts):
            raise ValueError(f"{label}에서 본문이 있는 조문을 찾지 못했다 — 조 머리 형식이나 목차를 확인한다")
    pairs = pair_articles(old, new)
    drops = {p.no: quantity_drops(p) for p in pairs}
    hits = hits_by_article(map_rules(new, asof, since, rules))
    known = {p.no for p in pairs}
    for key in [k for k in hits if k != NEW_BUCKET and k not in known]:  # 조문 짝이 없는 매핑은 버리지 않는다
        hits.setdefault(NEW_BUCKET, []).extend(hits.pop(key))
    triages, judged = {}, {}
    t0 = time.time()
    for p in pairs:
        t = triage.triage(p, drops[p.no], hits.get(p.no, []))
        triages[p.no] = t
        if t.escalate:
            out = judge.judge(JudgeInput(p, tuple(drops[p.no]), tuple(hits.get(p.no, [])), t))
            judged[p.no] = apply_threshold(out, min_confidence)
    rows = build_rows(pairs, drops, hits, triages, judged)
    tu, ju = cost.usd(triage.usage), cost.usd(judge.usage)
    report = {
        "triage": {"backend": triage.name, **asdict(triage.usage), "usd": round(tu, 6)},
        "judge": {"backend": judge.name, **asdict(judge.usage), "usd": round(ju, 6)},
        "total_usd": round(tu + ju, 6),
        "articles": len(triages),
        "escalated": sum(1 for t in triages.values() if t.escalate),
        "seconds": round(time.time() - t0, 2),
    }
    return rows, report


def _need(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        print(f"환경변수 {name} 가 없다", file=sys.stderr)
        sys.exit(2)
    return v


def _triage_backend(kind: str, headcount: str):
    if kind == "haiku":
        import anthropic

        from work_rules_c.triage import HaikuTriage
        return HaikuTriage(anthropic.Anthropic())
    from work_rules_c.decisions import DecisionTriage, JevClient, OpenAIDecisionsClient
    if kind == "jev":
        return DecisionTriage(JevClient(_need("TYPESAFE_API_KEY")), headcount=headcount)
    _need("OPENAI_API_KEY")
    from openai import OpenAI
    return DecisionTriage(OpenAIDecisionsClient(OpenAI()), headcount=headcount)


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules", required=True, type=Path)
    ap.add_argument("--old", type=Path)
    ap.add_argument("--asof", required=True, type=date.fromisoformat)
    ap.add_argument("--since", required=True, type=date.fromisoformat)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--triage", required=True, choices=["haiku", "jev", "openai"])
    ap.add_argument("--judge-model", default=DEFAULT_JUDGE_MODEL)
    ap.add_argument("--min-confidence", type=float, default=0.8)
    ap.add_argument("--site", default="")
    ap.add_argument("--headcount", default="")
    a = ap.parse_args(argv)

    triage = _triage_backend(a.triage, a.headcount)
    import anthropic

    from work_rules_c.judge import AnthropicJudge
    judge = AnthropicJudge(anthropic.Anthropic(), model=a.judge_model)
    meta = {"사업장": a.site, "작성일": date.today().isoformat(), "점검 기간": f"{a.since} ~ {a.asof}",
            "기준 자료": "표준취업규칙 2026 · 법제처 원문"}
    try:
        rows, report = pipeline(read_text(a.rules), read_text(a.old) if a.old else None, a.asof, a.since,
                                triage, judge, meta, min_confidence=a.min_confidence)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    write_outputs(rows, meta, a.out)
    (a.out / "cost.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
