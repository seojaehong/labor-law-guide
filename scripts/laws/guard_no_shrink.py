#!/usr/bin/env python3
"""재생성이 **조용히 줄이는 것**을 막는다 (2026-10-19 신설).

계기. 2026-10-13 에 누가 가족돌봄 anchor 를 **생성물** public/data/laws/rules.json 에
직접 써 넣고 원본 scripts/laws/work_rules_map.json 에는 넣지 않았다.
그래서 10-18 자동수집이 재생성하면서 **지웠다**(anchor 10 → 9).
알림은 없었다. PR 본문도 「새 개정 2건」만 말했다. 운영에 안 나간 것은 우연이었다.

생성물을 손으로 고치는 일은 또 생긴다. 그때마다 다음 크론이 말없이 되돌린다.
그래서 **줄어들면 멈춘다.** 늘거나 같으면 통과한다.

    guard_no_shrink.py <기준ref>     예: origin/master
    종료 0 = 통과 · 2 = 줄었다(부르는 쪽에서 PR 을 열지 말 것) · 1 = 못 쟀다

세는 것은 「있다가 없어지면 안 되는 것」뿐이다. 개정 이벤트는 시행일이 지나면 줄 수 있으므로
세지 않는다 — 규칙과 그 부속 정보만 본다.
"""
import json, subprocess, sys

RULES = "public/data/laws/rules.json"


def load(ref):
    if ref is None:
        with open(RULES, encoding="utf-8") as f:
            return json.load(f)
    out = subprocess.run(["git", "show", f"{ref}:{RULES}"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        return None
    return json.loads(out.stdout)


def counts(doc):
    rs = doc if isinstance(doc, list) else doc.get("rules", [])
    return {
        "규칙": len(rs),
        "anchor": sum(1 for r in rs if r.get("anchor")),
        "ok 문구": sum(1 for r in rs if r.get("ok")),
        "std 대응": sum(1 for r in rs if r.get("std")),
        "조문안": sum(1 for r in rs if r.get("clause")),
    }


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else "origin/master"
    try:
        before, after = load(ref), load(None)
    except Exception as e:
        print(f"[guard] 못 쟀다({type(e).__name__}) — 통과시킨다", file=sys.stderr)
        return 1
    if before is None:
        print(f"[guard] {ref} 에 {RULES} 가 없다 — 첫 생성으로 보고 통과", file=sys.stderr)
        return 0

    b, a = counts(before), counts(after)
    shrank = {k: (b[k], a[k]) for k in b if a[k] < b[k]}
    line = " · ".join(f"{k} {b[k]}→{a[k]}" for k in b)
    if not shrank:
        print(f"[guard] 통과 — {line}")
        return 0

    print(f"[guard] 🔴 재생성이 줄였다 — {line}", file=sys.stderr)
    for k, (x, y) in shrank.items():
        print(f"         {k}: {x} → {y}", file=sys.stderr)
    print("         원인은 거의 항상 **생성물을 직접 고치고 원본에 안 넣은 것**이다.", file=sys.stderr)
    print(f"         scripts/laws/work_rules_map.json 을 고치고 다시 돌린다.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
