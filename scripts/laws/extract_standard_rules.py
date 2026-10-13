"""표준취업규칙 2026(일반 근로자용) → scripts/laws/standard_rules.json

조문 본문 뒤에 [필수]/[선택] 착안사항이 오고, 착안사항 하나가 바로 앞 조문 여러 개에 걸린다(제2조·제3조 → [필수] 1개).
착안사항·조문의 법령 인용(「근로기준법 제17조 및 시행령 제8조」, 「남녀고용평등법 제10조」)을 뽑아 lawId 에 잇는다.
사람이 검수한 조문(status=checked)과 손으로 더한 laws·keywords 는 다시 돌려도 보존한다.

    python scripts/laws/extract_standard_rules.py [표준취업규칙-2026.md]
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("C:/Users/iceam/dev/employment-rules-reviewer/references/표준취업규칙-2026.md")
OUT = ROOT / "scripts" / "laws" / "standard_rules.json"
REVS = ROOT / "data" / "law-revisions.json"

# 약칭 → 정식 법령명. 정식명도 그대로 잡는다(긴 이름부터 맞춘다)
ALIAS = {
    "근로기준법": "근로기준법", "근기법": "근로기준법",
    "남녀고용평등법": "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률",
    "남녀고용평등과 일·가정 양립 지원에 관한 법률": "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률",
    "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률": "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률",
    "고령자고용법": "고용상 연령차별금지 및 고령자고용촉진에 관한 법률",
    "고용상 연령차별금지 및 고령자고용촉진에 관한 법률": "고용상 연령차별금지 및 고령자고용촉진에 관한 법률",
    "기간제법": "기간제 및 단시간근로자 보호 등에 관한 법률",
    "기간제 및 단시간근로자 보호 등에 관한 법률": "기간제 및 단시간근로자 보호 등에 관한 법률",
    "파견법": "파견근로자 보호 등에 관한 법률",
    "파견근로자 보호 등에 관한 법률": "파견근로자 보호 등에 관한 법률",
    "장애인차별금지법": "장애인차별금지 및 권리구제 등에 관한 법률",
    "장애인차별금지 및 권리구제 등에 관한 법률": "장애인차별금지 및 권리구제 등에 관한 법률",
    "장애인고용법": "장애인고용촉진 및 직업재활법",
    "장애인고용촉진 및 직업재활법": "장애인고용촉진 및 직업재활법",
    "고용정책기본법": "고용정책 기본법", "고용정책 기본법": "고용정책 기본법",
    "최저임금법": "최저임금법",
    "근로자퇴직급여 보장법": "근로자퇴직급여 보장법", "퇴직급여법": "근로자퇴직급여 보장법", "근퇴법": "근로자퇴직급여 보장법",
    "산업안전보건법": "산업안전보건법", "산안법": "산업안전보건법",
    "산업재해보상보험법": "산업재해보상보험법", "산재보험법": "산업재해보상보험법",
    "고용보험법": "고용보험법",
    "채용절차의 공정화에 관한 법률": "채용절차의 공정화에 관한 법률", "채용절차법": "채용절차의 공정화에 관한 법률",
    "근로자참여 및 협력증진에 관한 법률": "근로자참여 및 협력증진에 관한 법률", "근로자참여법": "근로자참여 및 협력증진에 관한 법률",
    "노동조합 및 노동관계조정법": "노동조합 및 노동관계조정법", "노동조합법": "노동조합 및 노동관계조정법",
    "공익신고자 보호법": "공익신고자 보호법",
    "개인정보 보호법": "개인정보 보호법",
    "관공서의 공휴일에 관한 규정": "관공서의 공휴일에 관한 규정",
    "공직선거법": "공직선거법",
    "직업안정법": "직업안정법",
    "외국인근로자의 고용 등에 관한 법률": "외국인근로자의 고용 등에 관한 법률", "외국인고용법": "외국인근로자의 고용 등에 관한 법률",
    "임금채권보장법": "임금채권보장법",
    "노동절 제정에 관한 법률": "노동절 제정에 관한 법률",
}
NAMES = sorted(ALIAS, key=len, reverse=True)
TOKEN = re.compile(
    "(?P<law>" + "|".join(re.escape(n) for n in NAMES) + r")"
    r"|(?P<sub>(?:같은 법 |동법 |법 )?(?:시행령|시행규칙))?\s*제\s*(?P<jo>\d+)\s*조(?:\s*의\s*(?P<ui>\d+))?"
)
ART = re.compile(r"^제(\d+)조(?:의(\d+))?\s*\(([^)]+)\)\s*(.*)$")
CHAPTER = re.compile(r"^제\s*\d+\s*장\s")
NOTE = re.compile(r"^\[(필수|선택)\]\s*(.*)$")


def law_ids() -> dict[str, str]:
    data = json.loads(REVS.read_text(encoding="utf-8"))
    return {r["법령명"]: r["법령ID"] for r in data["revisions"]}


def norm(s: str) -> str:
    return s.replace("·", "ㆍ")


def refs(text: str, ids: dict[str, str]) -> list[dict]:
    out, seen = [], set()
    for line in text.splitlines():
        law = None
        for m in TOKEN.finditer(line):
            if m.group("law"):
                law = ALIAS[m.group("law")]
                continue
            if not law:
                continue  # 법령명 없는 「제N조」 는 취업규칙 자기 조문이다
            name = law + (" " + m.group("sub").split()[-1] if m.group("sub") else "")
            article = f"제{m.group('jo')}조" + (f"의{m.group('ui')}" if m.group("ui") else "")
            key = (name, article)
            if key in seen:
                continue
            seen.add(key)
            out.append({"lawId": ids.get(name) or ids.get(norm(name)), "law": name, "article": article})
    return out


def keywords(title: str) -> list[str]:
    words = [w for w in re.split(r"[·ㆍ,\s및등]+", title) if len(w) >= 2]
    return list(dict.fromkeys([title.replace(" ", "")] + words))


def main():
    lines = SRC.read_text(encoding="utf-8").splitlines()
    start = next(i for i, l in enumerate(lines) if "(작성시 착안사항)" in l)
    ids = law_ids()
    arts, chapter, pending, note_for = [], None, [], None
    for raw in lines[start + 1:]:
        line = raw.strip()
        if not line or line.startswith("- ") and line.endswith(" -"):
            continue
        if line.startswith("부") and line.replace(" ", "") == "부칙":
            break
        if "단시간" in line and "근로자용" in line and line.startswith(("<", "[", "【", "단시간")):
            break
        if CHAPTER.match(line):
            chapter, pending, note_for = re.sub(r"\s+", " ", line), [], None
            continue
        if line.startswith("◈"):
            continue
        m = ART.match(line)
        if m:
            if note_for is not None:
                pending, note_for = [], None
            jo = f"제{m.group(1)}조" + (f"의{m.group(2)}" if m.group(2) else "")
            a = {"no": jo, "title": m.group(3).strip(), "chapter": chapter, "kind": None,
                 "text": f"{jo}({m.group(3).strip()}) {m.group(4)}".strip(), "note": ""}
            arts.append(a)
            pending.append(a)
            continue
        n = NOTE.match(line)
        if n:
            note_for = pending[:]
            for a in note_for:
                a["kind"] = a["kind"] or n.group(1)
                a["note"] += ("\n" if a["note"] else "") + line
            continue
        if note_for:
            for a in note_for:
                a["note"] += "\n" + line
        elif pending:
            pending[-1]["text"] += "\n" + line

    # 표준규칙은 같은 번호에 택일 안을 둘 낸다(제62조 중도인출 / 중간정산) → id = 번호(제목)
    dup = {n for n in (a["no"] for a in arts) if sum(x["no"] == n for x in arts) > 1}
    old = {a["id"]: a for a in json.loads(OUT.read_text(encoding="utf-8"))["articles"]} if OUT.exists() else {}
    out = []
    seen_ids: dict[str, int] = {}
    for a in arts:
        aid = f"{a['no']}({a['title']})" if a["no"] in dup else a["no"]
        # 번호·제목까지 같은 택일 안(제61조 퇴직연금형 / 퇴직금형) → 두 번째부터 「·안2」
        seen_ids[aid] = seen_ids.get(aid, 0) + 1
        if seen_ids[aid] > 1:
            aid = f"{aid}·안{seen_ids[aid]}"
        auto = refs(a["note"] + "\n" + a["text"], ids)
        prev = old.get(aid, {})
        keep = prev.get("status") == "checked"
        out.append({
            "id": aid, "no": a["no"], "title": a["title"], "chapter": a["chapter"], "kind": a["kind"] or "선택",
            "text": a["text"], "note": a["note"],
            "laws": prev["laws"] if keep else auto,
            "keywords": prev.get("keywords") if keep else keywords(a["title"]),
            "status": "checked" if keep else "auto",
        })
    OUT.write_text(json.dumps({
        "_source": "고용노동부 표준취업규칙(2026년, 배포) 일반 근로자용 — employment-rules-reviewer/references/표준취업규칙-2026.md",
        "_note": "laws 는 착안사항·조문 본문의 법령 인용 자동 추출(status=auto). 검수하면 status=checked 로 바꾸고 다시 돌려도 보존된다.",
        "articles": out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    kinds = {k: sum(a["kind"] == k for a in out) for k in ("필수", "선택")}
    no_id = sorted({l["law"] for a in out for l in a["laws"] if not l["lawId"]})
    print(f"조문 {len(out)} · 필수 {kinds['필수']} · 선택 {kinds['선택']} · 법령 인용 있는 조문 {sum(bool(a['laws']) for a in out)}")
    print("lawId 없는 인용(수집 대상 밖):", no_id)


if __name__ == "__main__":
    main()
