"""comparison.json 을 정답지(로컬 전용)와 대조한다. 지표는 콘솔에만 — 산출물에 넣지 않는다.

python3 scripts/work_rules_c/eval.py --pred <comparison.json> --gold <gold.json>
"""
import argparse
import json
import sys
from pathlib import Path


def evaluate(pred: dict, gold: dict) -> dict:
    rows: dict[str, list[dict]] = {}
    for r in pred.get("rows", []):
        rows.setdefault(r["조문"], []).append(r)
    found, missed, dis_missed = 0, [], []
    for item in gold["items"]:
        no = item["조문"]
        checks = {k: v for k, v in item.items() if k != "조문"}
        ok = any(all(r.get(k) == v for k, v in checks.items()) for r in rows.get(no, []))
        if ok:
            found += 1
        else:
            missed.append(no)
            if item.get("불이익변경") == "해당":
                dis_missed.append(no)
    return {"case": gold.get("case", ""), "gold_items": len(gold["items"]), "found": found,
            "missed": missed, "disadvantage_missed": dis_missed}


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", required=True, type=Path)
    ap.add_argument("--gold", required=True, type=Path)
    a = ap.parse_args(argv)
    r = evaluate(json.loads(a.pred.read_text(encoding="utf-8")), json.loads(a.gold.read_text(encoding="utf-8")))
    print(json.dumps(r, ensure_ascii=False))
    return 1 if r["missed"] else 0


if __name__ == "__main__":
    sys.exit(main())
