"""headlines.json 에서 지정 이벤트의 제목을 지운다(구성이 바뀌어 다시 써야 하는 것).

    python scripts/laws/drop_headlines.py id1 id2 ...
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
P = Path(__file__).resolve().parents[0] / "headlines.json"
h = json.loads(P.read_text(encoding="utf-8"))
gone = [k for k in sys.argv[1:] if h.pop(k, None) is not None]
P.write_text(json.dumps(h, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("지움:", gone)
