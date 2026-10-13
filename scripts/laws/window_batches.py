"""list_window.py 결과 → 취업규칙 관련 법령군만 묶음으로(묶음당 이벤트 6개·변경 조문 40개 이내).

    python scripts/laws/window_batches.py window.json > window_batches.json
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
RELEVANT = ("근로기준법", "남녀고용평등", "산업안전보건법", "근로자퇴직급여", "고령자", "파견근로자", "기간제",
            "장애인고용", "근로자참여", "최저임금")
SKIP = ("산업안전보건기준에 관한 규칙",)  # 설비 기준 — 취업규칙 문안에 옮겨지지 않는다

evs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
pick = [e for e in evs if any(k in e["law"] for k in RELEVANT) and not any(k in e["law"] for k in SKIP) and not e["mapped"]]
pick.sort(key=lambda e: (e["law"], e["date"]))
batches, cur, n = [], [], 0
for e in pick:
    if cur and (len(cur) >= 6 or n + e["n"] > 40):
        batches.append(cur)
        cur, n = [], 0
    cur.append(e)
    n += e["n"]
if cur:
    batches.append(cur)
print(json.dumps(batches, ensure_ascii=False, indent=1))
print(f"이벤트 {len(pick)} · 묶음 {len(batches)}", file=sys.stderr)
