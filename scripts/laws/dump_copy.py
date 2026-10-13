"""/laws 에 사람이 쓴 문구(한 줄 제목·반영 포인트·예시 문안)를 한 파일로 뽑는다 — 문체·띄어쓰기 검사기에 넣기용.

    python scripts/laws/dump_copy.py <out.md>
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
head = json.loads((ROOT / "scripts" / "laws" / "headlines.json").read_text(encoding="utf-8"))
rules = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))["rules"]
lines = ["# 한 줄 제목", ""] + [f"- {v}" for k, v in head.items() if not k.startswith("_")]
for r in rules:
    lines += ["", f"## {r['topic']}", "", r["point"], "", *r["clause"].split("\n")]
Path(sys.argv[1]).write_text("\n".join(lines) + "\n", encoding="utf-8")
print(len(lines))
