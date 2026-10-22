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


def compare_baselines(rule_only: dict, rule_ai: dict, gold: dict) -> dict:
    """저장된 두 결과만 비교한다. 유료 호출·법률 정답 생성은 하지 않는다.

    negatives 는 검수자가 확인한 비지적 항목, items 는 확인할 항목이다.
    미표기 항목은 오탐으로 단정하지 않고 unlabelled 로 따로 둔다.
    """
    def score(pred):
        result = evaluate(pred, gold)
        rows = pred.get("rows", [])
        negatives = gold.get("negatives", [])
        result["incomplete"] = sorted({r["조문"] for r in rows if r.get("review", {}).get("incomplete")})
        result["conflicts"] = sorted({r["조문"] for r in rows if r.get("review", {}).get("conflict")})
        result["unverified_citations"] = sorted({r["조문"] for r in rows
            if "AI 인용(미검증)" in r.get("근거·시행일", "")})
        result["false_alarms"] = [n["조문"] for n in negatives if any(
            all(r.get(k) == v for k, v in n.items()) for r in rows)]
        labelled = {x["조문"] for x in gold["items"] + negatives}
        result["unlabelled"] = sorted({r["조문"] for r in rows} - labelled)
        return result
    before, after = score(rule_only), score(rule_ai)
    return {"case": gold.get("case", ""), "rules_only": before, "rules_plus_ai": after,
            "recovered": sorted(set(before["missed"]) - set(after["missed"])),
            "regressed": sorted(set(after["missed"]) - set(before["missed"])),
            "added_false_alarms": sorted(set(after["false_alarms"]) - set(before["false_alarms"])),
            "legal_accuracy_proven": False}


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", required=True, type=Path)
    ap.add_argument("--gold", required=True, type=Path)
    ap.add_argument("--baseline", type=Path, help="규칙만 실행한 저장 결과")
    a = ap.parse_args(argv)
    r = evaluate(json.loads(a.pred.read_text(encoding="utf-8")), json.loads(a.gold.read_text(encoding="utf-8")))
    if a.baseline:
        r = compare_baselines(json.loads(a.baseline.read_text(encoding="utf-8")),
                              json.loads(a.pred.read_text(encoding="utf-8")),
                              json.loads(a.gold.read_text(encoding="utf-8")))
        print(json.dumps(r, ensure_ascii=False))
        return 1 if r["regressed"] or r["added_false_alarms"] or r["rules_plus_ai"]["missed"] else 0
    print(json.dumps(r, ensure_ascii=False))
    return 1 if r["missed"] else 0


if __name__ == "__main__":
    sys.exit(main())
