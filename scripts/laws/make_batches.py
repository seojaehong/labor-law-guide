"""워크플로 입력 — 전체 이벤트를 상위 법률 단위로 묶어 배치로 나눈다(배치당 변경 조문 ~40개 이내).

    python scripts/laws/make_batches.py > batches.json
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
idx = json.loads((ROOT / "public" / "data" / "laws" / "index.json").read_text(encoding="utf-8"))
rules = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))["rules"]
mapped = {(r["lawId"], r["effective"]) for r in rules}

by_group: dict[str, list] = {}
for e in idx["events"]:
    by_group.setdefault(e["group"], []).append(e)

batches, cur, cur_n = [], [], 0
for g, evs in sorted(by_group.items(), key=lambda kv: -sum(len(e["changes"]) for e in kv[1])):
    for e in evs:
        n = len(e["changes"])
        if cur and (cur_n + n > 40 or len(cur) >= 8):
            batches.append(cur)
            cur, cur_n = [], 0
        cur.append({"id": e["id"], "short": e["short"], "level": e["level"], "cause": e["cause"], "n": n,
                    "hasHeadline": bool(e["headline"]), "mapped": (e["lawId"], e["date"]) in mapped})
        cur_n += n
if cur:
    batches.append(cur)
print(json.dumps(batches, ensure_ascii=False))
print(f"배치 {len(batches)} · 이벤트 {sum(len(b) for b in batches)}", file=sys.stderr)
