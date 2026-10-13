"""merge_triage.py 결과를 headlines.json · work_rules_map.json 에 반영한다. 기존 값은 덮어쓰지 않는다.

    python scripts/laws/apply_triage.py <triage.json>
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
T = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
HP = ROOT / "scripts" / "laws" / "headlines.json"
MP = ROOT / "scripts" / "laws" / "work_rules_map.json"
heads = json.loads(HP.read_text(encoding="utf-8"))
rmap = json.loads(MP.read_text(encoding="utf-8"))

added_h = 0
for k, v in T["headlines"].items():
    if k not in heads:
        heads[k] = v
        added_h += 1
HP.write_text(json.dumps(heads, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

have = {(r["lawId"], r["article"], r["effective"], r["topic"]) for r in rmap["rules"]}
FIELDS = ("lawId", "article", "effective", "topic", "art93", "required", "keywords", "ok", "stale", "point", "clause")
added_m = 0
for m in T["mappings"]:
    key = (m["lawId"], m["article"], m["effective"], m["topic"])
    if key in have:
        continue
    rule = {k: m[k] for k in FIELDS}
    rule["source"] = "워크플로 law-subordinate-triage 2026-10-05 · 원문 대조 2인 반박 검증 통과 · 공인노무사 검수 전"
    rmap["rules"].append(rule)
    added_m += 1
MP.write_text(json.dumps(rmap, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"제목 +{added_h} (총 {len([k for k in heads if not k.startswith('_')])}) · 매핑 +{added_m} (총 {len(rmap['rules'])})")
