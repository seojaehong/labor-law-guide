"""특정 이벤트·조문의 개정 전·후 원문 보기(매핑·제목을 쓰기 전 원문 대조용).

    python scripts/laws/show_change.py <법령ID> <시행일> [조문 ...]
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
law_id, date, *arts = sys.argv[1:]
d = json.loads((ROOT / "data" / "law-diffs" / f"{law_id}.json").read_text(encoding="utf-8"))
for s in d["단계"]:
    if s["시행일"] != date:
        continue
    for c in s["변경"]:
        if arts and c["조문"] not in arts:
            continue
        print(f"===== {d['법령명']} {date} {c['조문']} {c['제목']} [{c['구분']}]")
        print("[전]", c["개정전"])
        print("[후]", c["개정후"])
