"""개정 이벤트 지문 — 매일 수집에서 「실제로 바뀐 것」만 가려낸다.

generated 날짜는 매일 바뀌므로 파일 diff 로는 판단할 수 없다. 이벤트 id·시행일·변경 조문 수·제목 유무만 본다.

    python scripts/laws/fingerprint.py > before.txt          # 지문 출력
    python scripts/laws/fingerprint.py --compare before.txt   # 바뀐 이벤트를 마크다운으로, 없으면 빈 출력
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "public" / "data" / "laws" / "index.json"


def current() -> dict[str, str]:
    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    return {e["id"]: f'{e["id"]}\t{e["date"]}\t{len(e["changes"])}\t{1 if e.get("headline") else 0}\t{e["law"]}'
            for e in idx["events"]}


def main():
    now = current()
    if len(sys.argv) < 3 or sys.argv[1] != "--compare":
        print("\n".join(sorted(now.values())))
        return
    before = {}
    for line in Path(sys.argv[2]).read_text(encoding="utf-8").splitlines():
        if line.strip():
            before[line.split("\t")[0]] = line
    added = [now[k] for k in sorted(now) if k not in before]
    changed = [now[k] for k in sorted(now) if k in before and before[k].split("\t")[2] != now[k].split("\t")[2]]
    removed = [before[k] for k in sorted(before) if k not in now]
    if not (added or changed or removed):
        return

    def rows(title, items):
        if not items:
            return []
        out = [f"### {title} {len(items)}건", "", "| 시행일 | 법령 | 변경 조문 | 날짜별 제목 |", "|---|---|---|---|"]
        for it in items:
            _, d, n, h, law = it.split("\t")
            out.append(f"| {d[:4]}.{d[4:6]}.{d[6:]}. | {law} | {n} | {'있음' if h == '1' else '**없음 — 원문 보고 작성**'} |")
        return out + [""]

    print("\n".join(rows("새 개정", added) + rows("변경 조문 수가 바뀐 개정", changed) + rows("목록에서 빠진 개정", removed)))


if __name__ == "__main__":
    main()
