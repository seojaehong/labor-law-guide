"""워크플로 판정 뒤 구성이 바뀐 이벤트(변경 조문 수가 다름) + 제목 없는 고유 개정 → 재판정용 배치 JSON.

    python scripts/laws/changed_since_triage.py <이전 batches.json> > rebatch.json
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
old = {e["id"]: e for b in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) for e in b}
idx = json.loads((ROOT / "public" / "data" / "laws" / "index.json").read_text(encoding="utf-8"))
rules = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))["rules"]
mapped = {(r["lawId"], r["effective"]) for r in rules}

todo, changed = [], []
for e in idx["events"]:
    n = len(e["changes"])
    was = old.get(e["id"])
    if was and was["n"] != n:
        changed.append(e["id"])
    if (was and was["n"] != n) or (not was) or (not e["headline"] and not e["cause"]):
        todo.append({"id": e["id"], "short": e["short"], "level": e["level"], "cause": e["cause"], "n": n,
                     "hasHeadline": False, "mapped": (e["lawId"], e["date"]) in mapped})
seen, uniq = set(), []
for t in todo:
    if t["id"] not in seen:
        seen.add(t["id"])
        uniq.append(t)
batches = [uniq[i:i + 6] for i in range(0, len(uniq), 6)]
print(json.dumps(batches, ensure_ascii=False))
print(f"재판정 {len(uniq)} (구성 변경 {len(changed)}: {changed}) · 배치 {len(batches)}", file=sys.stderr)
