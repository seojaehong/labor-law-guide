"""날짜별 제목 원문 대조 검사(headcheck_N.json) 결과를 headlines.json 에 반영한다.

ok → 그대로 · fix → 고친 제목으로 덮어쓴다 · drop → 지운다. 검사 파일에 없는 id 는 건드리지 않는다.

    python scripts/laws/apply_headcheck.py <triage 폴더>
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HP = Path(__file__).resolve().parent / "headlines.json"
heads = json.loads(HP.read_text(encoding="utf-8"))
n = {"ok": 0, "fix": 0, "drop": 0}
for f in sorted(Path(sys.argv[1]).glob("headcheck_*.json")):
    for it in json.loads(f.read_text(encoding="utf-8"))["items"]:
        v = it["verdict"]
        n[v] = n.get(v, 0) + 1
        if v == "drop":
            heads.pop(it["id"], None)
        elif v == "fix":
            heads[it["id"]] = re.sub(r"\s+", " ", it["headline"].strip().rstrip(".").replace("—", ","))
            print(f"  fix {it['id']}: {heads[it['id']]}  ({it.get('why', '')[:80]})")
HP.write_text(json.dumps(heads, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(n)
