"""공인노무사 검수용 매핑 목록 — 지정한 출처(source) 매핑을 한 장으로. 검수 칸(✓/✗/수정)을 비워 둔다.

    python scripts/laws/review_sheet.py "2023.1.~2025.9." > docs/work-rules-mapping-review.md
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
rules = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))["rules"]
std = {s["id"]: s["title"] for s in json.loads((ROOT / "scripts" / "laws" / "standard_rules.json").read_text(encoding="utf-8"))["articles"]}
names = {r["법령ID"]: r["법령명"] for r in json.loads((ROOT / "data" / "law-revisions.json").read_text(encoding="utf-8"))["revisions"]}
key = sys.argv[1] if len(sys.argv) > 1 else ""
pick = [r for r in rules if key in r.get("source", "")]
d = lambda s: f"{s[:4]}.{int(s[4:6])}.{int(s[6:])}."
out = [
    "# 취업규칙 매핑 검수 목록",
    "",
    f"- 대상: `work_rules_map.json` 중 출처에 「{key}」가 있는 매핑 {len(pick)}건 — 원문 대조 초안 + 회의론자 2인 반박 통과, **공인노무사 검수 전**",
    "- 검수 칸: ✓(그대로) · ✗(빼기) · 수정(고칠 내용). 판정 문구는 「반영됨」을 가르는 짧은 구절(ok)과 「낡음」을 가르는 구절(stale)",
    "- 원문 보기: `python scripts/laws/show_change.py <법령ID> <시행일> <조문>`",
    "",
]
for i, r in enumerate(sorted(pick, key=lambda r: (r["effective"], r["lawId"], r["article"])), 1):
    out += [
        f"## {i}. {r['topic']}",
        "",
        f"- **{names.get(r['lawId'], r['lawId'])} {r['article']}** · {d(r['effective'])} 시행 · 제93조 {r['art93']}호 · {'필수' if r['required'] else '선택'} · 표준취업규칙 {', '.join(f'{s}({std.get(s, s)})' for s in r.get('std', []))}",
        f"- 무엇이 바뀌었나: {r['point']}",
        f"- 반영됨 판정 구절(ok): {' / '.join(r['ok']) or '(없음)'} · 낡음 구절(stale): {' / '.join(r['stale']) or '(없음)'}",
        "- 예시 문안:",
        "",
        "  > " + r["clause"].replace("\n", "\n  > "),
        "",
        "- 검수: ☐ ✓ ☐ ✗ ☐ 수정 — ",
        "",
    ]
print("\n".join(out))
