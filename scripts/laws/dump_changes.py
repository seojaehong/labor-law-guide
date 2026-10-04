"""한 줄 제목을 쓰기 위한 점검용 — 시행예정이면서 제목이 없는 이벤트의 「바뀐 줄」만 뽑는다.

    python scripts/laws/dump_changes.py [--all]
"""
import difflib
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
HEAD = json.loads((ROOT / "scripts" / "laws" / "headlines.json").read_text(encoding="utf-8"))
ANNOT = re.compile(r"\s*<(?:개정|신설|전문개정|제목개정|타법개정|종전)[^>]*>")
today = date.today().strftime("%Y%m%d")

for f in sorted((ROOT / "data" / "law-diffs").glob("*.json")):
    d = json.loads(f.read_text(encoding="utf-8"))
    for s in d["단계"]:
        ev = f"{d['법령ID']}-{s['시행일']}"
        if s["시행일"] <= today or (ev in HEAD and "--all" not in sys.argv) or not s["변경"]:
            continue
        print(f"\n##### {ev} {d['법령명']} {[p['제개정구분'] for p in s['공포']]}")
        for c in s["변경"]:
            a = [ANNOT.sub("", x) for x in (c["개정전"] or "").split("\n")]
            b = [ANNOT.sub("", x) for x in (c["개정후"] or "").split("\n")]
            lines = [x for x in difflib.unified_diff(a, b, lineterm="", n=0) if x[:1] in "+-" and x[:3] not in ("+++", "---")]
            print(f"-- {c['조문']} {c['제목']} [{c['구분']}]")
            for x in lines[:6]:
                print("   " + x[:230])
