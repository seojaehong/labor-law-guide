"""너무 흔한 옛 문구 걷어내기(2026-10-05 공공기관 규칙 시험) — 「10일」「10일의」가 같은 조문의 다른 휴가 일수(경조사 등)에 걸려
이미 20일로 고친 배우자 출산휴가를 「옛 문구 남음」으로 짚었다(한전원자력연료 「배우자 출산 : 20일」).

    python scripts/laws/tighten_stale_261005.py
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
MP = Path(__file__).resolve().parent / "work_rules_map.json"
DROP = {"10일", "10일의"}
TOPICS = ("배우자 출산휴가 20일 미부여 과태료", "배우자 출산휴가 20일·3회 분할")
m = json.loads(MP.read_text(encoding="utf-8"))
n = 0
for r in m["rules"]:
    if r["topic"] in TOPICS:
        before = list(r["stale"])
        r["stale"] = [s for s in r["stale"] if s not in DROP]
        if before != r["stale"]:
            n += 1
            print(r["topic"], before, "→", r["stale"])
MP.write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("수정", n)
