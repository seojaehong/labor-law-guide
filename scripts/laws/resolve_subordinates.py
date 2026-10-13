"""별표 1 제39호 「하위법령」 목록 — 법률마다 법제처 법령체계도(target=lsStmd)를 받아 대통령령·총리령·부령을 모은다.

체계도는 시행령·시행규칙뿐 아니라 이름이 다른 하위법령(산업안전보건기준에 관한 규칙, 근로감독관규정 …)도 준다.
조례(자치법규)와 행정규칙(고시·예규·훈령)은 법령이 아니라 뺀다.
같은 하위법령이 여러 법률 밑에 걸리면(근로감독관규정 등) 처음 만난 상위법을 parent 로, 나머지는 also 에 적는다.

    python scripts/laws/resolve_subordinates.py      → scripts/laws/subordinate_laws.json
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
OC = __import__("os").environ.get("LAW_GO_KR_OC", "iceamericano9")
TARGETS = json.loads((ROOT / "scripts" / "laws" / "labor_laws.json").read_text(encoding="utf-8"))["laws"]
REVS = json.loads((ROOT / "data" / "law-revisions.json").read_text(encoding="utf-8"))
OUT = ROOT / "scripts" / "laws" / "subordinate_laws.json"
KINDS = ("대통령령", "총리령", "부령")  # 고용노동부령·산업통상자원부령 등은 「부령」으로 끝난다


def get(params: dict) -> dict:
    qs = urllib.parse.urlencode({"OC": OC, "type": "JSON", **params})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"https://www.law.go.kr/DRF/lawService.do?{qs}", timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)
    return {}


def current_law(name: str) -> tuple[str | None, str | None]:
    """법령명으로 현행 법률의 (법령ID, MST). target=law 검색은 현행본만 준다."""
    qs = urllib.parse.urlencode({"OC": OC, "type": "JSON", "target": "law", "query": name, "display": 20})
    with urllib.request.urlopen(f"https://www.law.go.kr/DRF/lawSearch.do?{qs}", timeout=40) as r:
        rows = json.loads(r.read().decode("utf-8")).get("LawSearch", {}).get("law") or []
    rows = rows if isinstance(rows, list) else [rows]
    want = "".join(name.replace("·", "").replace("ㆍ", "").split())
    for x in rows:
        if "".join(x.get("법령명한글", "").replace("·", "").replace("ㆍ", "").split()) == want and x.get("법령구분명") == "법률":
            return x.get("법령ID"), x.get("법령일련번호")
    return None, None


def walk(node, path, out):
    if isinstance(node, list):
        for x in node:
            walk(x, path, out)
        return
    if not isinstance(node, dict):
        return
    info = node.get("기본정보")
    if isinstance(info, dict):
        kind = info.get("법종구분", {})
        kind = kind.get("content") if isinstance(kind, dict) else kind
        # 「…와 그 소속기관 직제」 같은 조직 규정은 노동관계 하위법령이 아니다
        if kind and kind.endswith(KINDS) and info.get("법령ID") and not (info.get("법령명") or "").endswith("직제"):
            out.append({"lawId": info["법령ID"], "name": info.get("법령명"), "kind": kind,
                        "tier": path[-1] if path else ""})
    for k, v in node.items():
        if k != "기본정보":
            walk(v, path + [k], out)


def main():
    subs: dict[str, dict] = {}
    missing = []
    for t in TARGETS:
        pid, mst = current_law(t["name"])
        if not mst:
            missing.append(t["name"])
            print(f"  ✗ {t['name']} — 현행 판을 못 찾음")
            continue
        tree = get({"target": "lsStmd", "MST": mst}).get("법령체계도", {})
        found = []
        walk(tree.get("상하위법"), [], found)
        uniq = {f["lawId"]: f for f in found}
        for f in uniq.values():
            if f["lawId"] in subs:
                subs[f["lawId"]].setdefault("also", []).append(pid)
                continue
            subs[f["lawId"]] = {**f, "parentId": pid, "parent": t["name"], "parentNo": t["no"]}
        print(f"  ✓ {t['no']:>2} {t['name']} — 하위법령 {len(uniq)}: {', '.join(f['name'] for f in uniq.values())}")
        time.sleep(0.3)
    OUT.write_text(json.dumps({
        "_source": "법제처 법령체계도(lsStmd) — 공인노무사법 시행령 [별표 1] 제39호 「하위법령」",
        "_generated": time.strftime("%Y-%m-%d"),
        "missing_parents": missing,
        "subordinates": sorted(subs.values(), key=lambda s: (s["parentNo"], s["name"])),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n하위법령 {len(subs)}개 · 상위법 미해결 {len(missing)} → {OUT.relative_to(ROOT)}")
    if missing:
        sys.exit(2)


if __name__ == "__main__":
    main()
