"""노동관계법령 개정 목록 수집 — 법제처 Open API(target=eflaw).

대상은 scripts/laws/labor_laws.json(공인노무사법 시행령 별표 1).
법령마다 시행일별 판을 공포일 내림차순으로 받아,
  - 현행연혁코드 == '시행예정'  (공포됐지만 아직 시행 전)
  - 공포일이 기준일(--since) 이후인 판
을 모아 data/law-revisions.json 으로 쓴다. 이름이 맞는 법령을 못 찾으면 조용히 빼지 않고 unresolved 에 남긴다.

    python scripts/laws/fetch_law_revisions.py [--since 20251001]
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ROOT / "scripts" / "laws" / "labor_laws.json"
SUBS = ROOT / "scripts" / "laws" / "subordinate_laws.json"
OUT = ROOT / "data" / "law-revisions.json"
OC = os.environ.get("LAW_GO_KR_OC", "iceamericano9")
API = "https://www.law.go.kr/DRF/lawSearch.do"
PAGE = 100


def norm(s: str) -> str:
    # 별표는 「일·가정」(U+00B7), 법제처는 「일ㆍ가정」(U+318D)을 쓴다. 공백도 다르다
    return "".join(s.replace("·", "").replace("ㆍ", "").replace("・", "").split())


def search(query: str, page: int) -> dict:
    qs = urllib.parse.urlencode({
        "OC": OC, "target": "eflaw", "type": "JSON", "query": query,
        "display": PAGE, "page": page, "sort": "ddes",
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{API}?{qs}", timeout=30) as r:
                return json.loads(r.read().decode("utf-8")).get("LawSearch", {})
        except Exception as e:  # 법제처는 대량 호출 중간에 빈 응답을 준다
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)
    return {}


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def row(x: dict) -> dict:
    return {
        "법령ID": x.get("법령ID"),
        "MST": x.get("법령일련번호"),
        "법령명": x.get("법령명한글"),
        "법령구분": x.get("법령구분명"),
        "제개정구분": x.get("제개정구분명"),
        "공포일": x.get("공포일자"),
        "공포번호": x.get("공포번호"),
        "시행일": x.get("시행일자"),
        "상태": x.get("현행연혁코드"),
        "소관부처": x.get("소관부처명"),
    }


def collect(name: str, since: str, aliases: list[str] = (), id_hint: str | None = None) -> tuple[list[dict], str | None, dict | None]:
    # 법령명이 바뀐 법(근로자의 날 → 노동절)은 옛 이름으로도 찾아 같은 법령ID 의 옛 판을 기준판으로 쓴다.
    # 하위법령은 체계도에서 받은 법령ID(id_hint)로만 맞춘다 — 「근로기준법시행령」·「…시행규칙」처럼 이름이 섞여 나와서다
    rows, law_id, older = [], id_hint, []
    for i, query in enumerate([name, *aliases]):
        want = norm(query)
        page = 1
        while True:
            res = search(query, page)
            items = as_list(res.get("law"))
            if not items:
                break
            oldest = "99999999"
            for x in items:
                oldest = min(oldest, x.get("공포일자") or oldest)
                if id_hint:
                    if x.get("법령ID") != id_hint:
                        continue
                else:
                    if x.get("법령구분명") != "법률":
                        continue
                    same = norm(x.get("법령명한글", "")) == want or (law_id and x.get("법령ID") == law_id)
                    if not same:
                        continue
                    if i == 0:
                        law_id = law_id or x.get("법령ID")
                    elif x.get("법령ID") != law_id:
                        continue
                pending = x.get("현행연혁코드") == "시행예정"
                # 공포는 기준일 전이어도 시행이 기준일 이후면 넣는다(2026-10-04 실측 — 근기법 체불 강화 개정이
                # 2025년에 공포되고 2026.8.20. 시행돼 빠졌고, 그 변경이 같은 날 시행된 타법개정에 잘못 붙었다)
                if pending or (x.get("공포일자") or "") >= since or (x.get("시행일자") or "") >= since:
                    rows.append(row(x))
                else:
                    older.append(row(x))
            total = int(res.get("totalCnt") or 0)
            # 공포일 내림차순이므로 한 페이지 전체가 기준일보다 오래되면 끊는다.
            # 단 시행예정은 공포일이 오래돼도(장기 유예) 있을 수 있어 한 페이지 더 본다.
            if page * PAGE >= total or oldest < since[:4] + "0000":
                break
            page += 1
            time.sleep(0.3)
    # 같은 MST 가 시행일별로 여러 줄 나오면 그대로 둔다(부칙 분할 시행). 중복만 제거
    seen, uniq = set(), []
    for r in rows:
        k = (r["MST"], r["시행일"])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    # 직전 판 — 수집 기간 첫 시행일 바로 앞에 시행된 판. 첫 개정도 비교할 수 있게 기준으로 쓴다
    first = min((r["시행일"] for r in uniq), default="99999999")
    before = [r for r in older if (r["시행일"] or "") < first]
    base = max(before, key=lambda r: (r["시행일"], r["공포일"]), default=None)
    return uniq, law_id, base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default=(date.today() - timedelta(days=365)).strftime("%Y%m%d"))
    args = ap.parse_args()

    targets = json.loads(TARGETS.read_text(encoding="utf-8"))["laws"]
    out, unresolved, bases = [], [], {}
    for t in targets:
        rows, law_id, base = collect(t["name"], args.since, t.get("aliases", []))
        if base and rows:
            bases[law_id] = base
        if not law_id:
            unresolved.append(t)
            print(f"  ✗ {t['no']:>2} {t['name']} — 법제처에서 이름이 맞는 법률을 못 찾음")
            continue
        pend = sum(r["상태"] == "시행예정" for r in rows)
        print(f"  ✓ {t['no']:>2} {t['name']} [{law_id}] 판 {len(rows)} · 시행예정 {pend}")
        for r in rows:
            r["별표호"] = t["no"]
            r["상위법ID"] = None
            if t.get("scope"):
                r["적용범위"] = t["scope"]
        out.extend(rows)
        time.sleep(0.3)

    # 별표 1 제39호 하위법령 — resolve_subordinates.py 가 체계도에서 뽑아 둔 목록
    subs = json.loads(SUBS.read_text(encoding="utf-8"))["subordinates"] if SUBS.exists() else []
    if not SUBS.exists():
        print("  ⚠ subordinate_laws.json 없음 — 하위법령은 건너뛴다(resolve_subordinates.py 를 먼저 돌린다)")
    for s in subs:
        rows, law_id, base = collect(s["name"], args.since, [], s["lawId"])
        if base and rows:
            bases[law_id] = base
        for r in rows:
            r["별표호"] = 39
            r["상위법ID"] = s["parentId"]
        if rows:
            print(f"  ✓ 39 {s['name']} [{law_id}] 판 {len(rows)} · 시행예정 {sum(r['상태'] == '시행예정' for r in rows)}")
        out.extend(rows)
        time.sleep(0.3)

    out.sort(key=lambda r: (r["시행일"] or "", r["법령명"]), reverse=True)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": date.today().isoformat(),
        "since": args.since,
        "source": "법제처 국가법령정보 Open API target=eflaw",
        "unresolved": unresolved,
        "revisions": out,
        "bases": bases,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    pend = [r for r in out if r["상태"] == "시행예정"]
    print(f"\n대상 법률 {len(targets)} · 해결 {len(targets) - len(unresolved)} · 미해결 {len(unresolved)} · 하위법령 {len(subs)}")
    print(f"수집 판 {len(out)} · 시행예정 {len(pend)} → {OUT.relative_to(ROOT)}")
    if unresolved:
        sys.exit(2)


if __name__ == "__main__":
    main()
