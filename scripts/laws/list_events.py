"""이벤트 목록을 JSON 으로 — 워크플로 입력용. 기본은 하위법령(시행령·시행규칙) 이벤트.

    python scripts/laws/list_events.py [--level 시행령,시행규칙] [--no-headline]
"""
import argparse
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--level", default="시행령,시행규칙")
ap.add_argument("--no-headline", action="store_true")
a = ap.parse_args()
levels = set(a.level.split(","))
idx = json.loads((ROOT / "public" / "data" / "laws" / "index.json").read_text(encoding="utf-8"))
out = [{"id": e["id"], "lawId": e["lawId"], "date": e["date"], "law": e["law"], "short": e["short"],
        "kinds": e["kinds"], "cause": e["cause"], "n": len(e["changes"]),
        "articles": [f"{c['article']}({c['kind']})" for c in e["changes"]][:25]}
       for e in idx["events"] if e["level"] in levels and not (a.no_headline and e["headline"])]
print(json.dumps(out, ensure_ascii=False))
