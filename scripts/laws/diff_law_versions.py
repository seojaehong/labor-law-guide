"""시행일별 조문 변경 — 법제처 본문 API(target=eflaw, efYd)로 시행일마다 전문을 받아 직전 판과 조문 단위로 비교한다.

왜 이렇게 하나 (2026-10-04 실측)
  - 신구대조표에는 조문별 시행일이 없다. 부칙으로 나눠 시행되는 개정(근로기준법 제21533호 → 10.8.·12.8.·2027.1.1.)을 못 가른다.
  - 본문 API 의 `조문변경여부` 는 새로 생긴 조문을 놓친다(제44조의4 신설이 2027.1.1. 판에서도 N).
  - 그래서 「시행일 d 판」과 「d 직전 판」의 전문을 조문키 단위로 비교한다. 부칙 제1조는 검산용이다.

입력은 data/law-revisions.json(fetch_law_revisions.py 산출). 출력은 data/law-diffs/<법령ID>.json.

    python scripts/laws/diff_law_versions.py [법령ID ...]     # 생략하면 시행예정이 있는 법령 전부
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
REVS = ROOT / "data" / "law-revisions.json"
OUT = ROOT / "data" / "law-diffs"
OC = __import__("os").environ.get("LAW_GO_KR_OC", "iceamericano9")
API = "https://www.law.go.kr/DRF/lawService.do"


def fetch(mst: str, ef: str) -> dict:
    # ID+efYd 는 빈 {} 를 준다(2026-10-04 실측). MST+efYd 로만 받힌다
    qs = urllib.parse.urlencode({"OC": OC, "target": "eflaw", "MST": mst, "efYd": ef, "type": "JSON"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f"{API}?{qs}", timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))["법령"]
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)
    return {}


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def label(j: dict) -> str:
    n = f"제{j['조문번호']}조"
    if j.get("조문가지번호"):
        n += f"의{j['조문가지번호']}"
    return n


def body(j: dict) -> str:
    lines = [j.get("조문내용", "").strip()]
    for h in as_list(j.get("항")):
        if h.get("항내용"):
            lines.append(h["항내용"].strip())
        for ho in as_list(h.get("호")):
            lines.append("  " + ho.get("호내용", "").strip())
            for m in as_list(ho.get("목")):
                lines.append("    " + str(m.get("목내용", "")).strip())
    return "\n".join(x for x in lines if x)


def articles(law: dict) -> dict:
    """조문키 → {label, title, text}. 장·절 제목(조문여부=전문)은 뺀다."""
    out = {}
    for j in as_list(law.get("조문", {}).get("조문단위")):
        # 조 없이 한 문장뿐인 법(노동절 제정에 관한 법률)은 조문번호 0 · 조문여부 「전문」으로 온다 — 「본문」으로 받는다
        if j.get("조문여부") == "전문" and j.get("조문번호") == "0":
            out[j["조문키"]] = {"조문": "본문", "제목": "", "본문": j.get("조문내용", "").strip()}
            continue
        if j.get("조문여부") != "조문":
            continue
        out[j["조문키"]] = {"조문": label(j), "제목": j.get("조문제목", ""), "본문": body(j)}
    # 별표 — 시행령·시행규칙의 과태료 기준·일수·직종 목록은 조문이 아니라 별표에 있다. 서식은 뺀다
    for b in as_list(law.get("별표", {}).get("별표단위")):
        if b.get("별표구분") != "별표":
            continue
        no = str(int(b.get("별표번호") or 0))
        if (b.get("별표가지번호") or "00") not in ("00", ""):
            no += f"의{int(b['별표가지번호'])}"
        out[f"B{b.get('별표키')}"] = {"조문": "별표" if no == "0" else f"별표 {no}", "제목": b.get("별표제목", ""), "본문": annex_text(b.get("별표내용"))}
    return out


def annex_text(v) -> str:
    """별표내용은 [[줄, 줄, …]] 꼴. 줄마다 오른쪽 공백을 걷고, 머리의 「<개정 …>」 꼬리표는 남긴다(diff 쪽에서 무시)."""
    lines = []

    def flat(x):
        if isinstance(x, list):
            for y in x:
                flat(y)
        elif isinstance(x, str):
            lines.append(x.rstrip())

    flat(v)
    text = "\n".join(lines)
    return "\n".join(l for l in text.split("\n") if l.strip())


DELETED = re.compile(r"^제\d+조(의\d+)?\s*삭제")


def compare(prev: dict, cur: dict) -> list[dict]:
    changes = []
    for k in sorted(set(prev) | set(cur)):
        a, b = prev.get(k), cur.get(k)
        if a and b and a["본문"] == b["본문"]:
            continue
        if not a:
            kind = "신설"
        elif not b or DELETED.match(b["본문"]):
            kind = "삭제"
        else:
            kind = "개정"
        ref = b or a
        changes.append({"조문키": k, "조문": ref["조문"], "제목": ref["제목"] or (a or {}).get("제목", ""),
                        "구분": kind, "개정전": a["본문"] if a else None, "개정후": b["본문"] if b else None})
    return changes


def addenda(law: dict, promulgation_nos: set[str]) -> list[dict]:
    out = []
    for u in as_list(law.get("부칙", {}).get("부칙단위")):
        content = [x for blk in as_list(u.get("부칙내용")) for x in (blk if isinstance(blk, list) else [blk])]
        head = content[0] if content else ""
        if any(f"제{n}호" in head for n in promulgation_nos):
            out.append({"부칙": head, "내용": content[1:]})
    return out


def run(law_id: str, revs: list[dict], base: dict | None) -> dict:
    # 직전 판(수집 기간 직전 시행본)을 기준으로 삼고 시행일마다 차례로 비교한다.
    # 직전 판이 없으면 수집 기간 중 가장 오래된 판을 기준으로 삼는다
    mst_at = {}
    for r in sorted(revs, key=lambda r: r["공포일"]):
        mst_at[r["시행일"]] = r["MST"]  # 같은 시행일이면 나중 공포의 MST 가 그 날의 전문이다
    dates = sorted(mst_at)
    if base:
        prev_ef, prev_mst = base["시행일"], base["MST"]
    else:
        prev_ef, prev_mst = dates[0], mst_at[dates[0]]
        dates = dates[1:]
    prev = articles(fetch(prev_mst, prev_ef))
    steps = []
    for d in dates:
        law = fetch(mst_at[d], d)
        cur = articles(law)
        info = law.get("기본정보", {})
        at = [r for r in revs if r["시행일"] == d]
        nos = {r["공포번호"] for r in at}
        steps.append({
            "시행일": d,
            "상태": "시행예정" if any(r["상태"] == "시행예정" for r in at) else at[0]["상태"] if at else "",
            "공포": [{"공포일": r["공포일"], "공포번호": r["공포번호"], "제개정구분": r["제개정구분"], "MST": r["MST"]} for r in at],
            "기준판_시행일": prev_ef,
            "변경": compare(prev, cur),
            "부칙": addenda(law, nos),
            "제개정이유": [x for blk in as_list(law.get("제개정이유", {}).get("제개정이유내용"))
                       for x in (blk if isinstance(blk, list) else [blk])],
        })
        print(f"  {info.get('법령명_한글', law_id)} {d}: 변경 {len(steps[-1]['변경'])}조 "
              f"({', '.join(c['조문'] + c['구분'][0] for c in steps[-1]['변경'][:12])})")
        prev, prev_ef = cur, d
        time.sleep(0.3)
    return {"법령ID": law_id, "법령명": revs[0]["법령명"], "단계": steps}


def main():
    data = json.loads(REVS.read_text(encoding="utf-8"))
    by_law: dict[str, list] = {}
    for r in data["revisions"]:
        by_law.setdefault(r["법령ID"], []).append(r)
    ids = sys.argv[1:] or list(by_law)
    bases = data.get("bases", {})
    OUT.mkdir(parents=True, exist_ok=True)
    for law_id in ids:
        res = run(law_id, by_law[law_id], bases.get(law_id))
        res["generated"] = datetime.now().strftime("%Y-%m-%d")
        (OUT / f"{law_id}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
