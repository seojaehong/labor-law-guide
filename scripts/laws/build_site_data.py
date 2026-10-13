"""/laws 화면용 데이터 — data/law-revisions.json + data/law-diffs/*.json + scripts/laws/work_rules_map.json
→ public/data/laws/index.json (목록·타임라인, 가볍게) · public/data/laws/<법령ID>.json (조문 전·후 본문)

    python scripts/laws/build_site_data.py
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DIFFS = ROOT / "data" / "law-diffs"
OUT = ROOT / "public" / "data" / "laws"
REVS = json.loads((ROOT / "data" / "law-revisions.json").read_text(encoding="utf-8"))
RULES = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))
TARGETS = json.loads((ROOT / "scripts" / "laws" / "labor_laws.json").read_text(encoding="utf-8"))["laws"]
SUBS = ROOT / "scripts" / "laws" / "subordinate_laws.json"
HEADLINES = json.loads((ROOT / "scripts" / "laws" / "headlines.json").read_text(encoding="utf-8"))
STD = ROOT / "scripts" / "laws" / "standard_rules.json"

# 화면에서 쓰는 짧은 이름. 없으면 정식 명칭
SHORT = {
    "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률": "남녀고용평등법",
    "고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률": "고용산재보험료징수법",
    "기간제 및 단시간근로자 보호 등에 관한 법률": "기간제법",
    "파견근로자보호 등에 관한 법률": "파견법",
    "파견근로자 보호 등에 관한 법률": "파견법",
    "노동조합 및 노동관계조정법": "노동조합법",
    "근로자참여 및 협력증진에 관한 법률": "근로자참여법",
    "외국인근로자의 고용 등에 관한 법률": "외국인고용법",
    "장애인고용촉진 및 직업재활법": "장애인고용법",
    "고용상 연령차별금지 및 고령자고용촉진에 관한 법률": "고령자고용법",
    "건설근로자의 고용개선 등에 관한 법률": "건설근로자법",
    "가사근로자의 고용개선 등에 관한 법률": "가사근로자법",
    "진폐의 예방과 진폐근로자의 보호 등에 관한 법률": "진폐법",
    "중대재해 처벌 등에 관한 법률": "중대재해처벌법",
    "근로자퇴직급여 보장법": "퇴직급여법",
    "산업재해보상보험법": "산재보험법",
    "교원의 노동조합 설립 및 운영 등에 관한 법률": "교원노조법",
    "공무원의 노동조합 설립 및 운영 등에 관한 법률": "공무원노조법",
    "채용절차의 공정화에 관한 법률": "채용절차법",
    "산업현장 일학습병행 지원에 관한 법률": "일학습병행법",
    "구직자 취업촉진 및 생활안정지원에 관한 법률": "구직자취업촉진법",
    "어선원 및 어선 재해보상보험법": "어선원재해보험법",
}

ANNOT = re.compile(r"\s*<(?:개정|신설|본조신설|전문개정|제목개정|종전[^>]*)[^>]*>")


def summary(reason_lines: list[str]) -> str:
    """제개정이유에서 「주요내용」 문단만. 법제처 꼬리표·머리표를 걷어낸다."""
    text = " ".join(x.strip() for x in reason_lines)
    text = re.sub(r"^\[[^\]]+\]\s*", "", text)
    text = re.sub(r"◇\s*(?:개정|제정)이유(?:\s*및\s*주요내용)?", "", text)
    text = re.sub(r"◇\s*주요내용", "", text)
    text = re.sub(r"<법제처 제공>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def cause_law(addenda: list[dict]) -> str | None:
    """타법개정이면 부칙 머리 「부칙(형사소송법) <제21857호…>」에서 원인 법률을 뽑는다."""
    for a in addenda:
        m = re.match(r"부칙\s*\(([^)]+)\)", a.get("부칙", ""))
        if m:
            return m.group(1)
    return None


def main():
    today = date.today().strftime("%Y%m%d")
    scope = {t["name"].replace("·", "ㆍ"): t.get("scope") for t in TARGETS}
    rules_by = {}
    for r in RULES["rules"]:
        rules_by.setdefault((r["lawId"], r["effective"]), []).append(r)

    # 위계 — 법률 / 대통령령 / 부령. 하위법령은 상위 법률로 묶어 보여 준다(법령 칩 = 상위 법률 단위)
    kind_of = {r["법령ID"]: r["법령구분"] for r in REVS["revisions"]}
    parent_of = {r["법령ID"]: r.get("상위법ID") for r in REVS["revisions"] if r.get("상위법ID")}
    name_of = {r["법령ID"]: r["법령명"] for r in REVS["revisions"] if not r.get("상위법ID")}
    subs = json.loads(SUBS.read_text(encoding="utf-8"))["subordinates"] if SUBS.exists() else []
    for s in subs:
        name_of.setdefault(s["parentId"], s["parent"].replace("·", "ㆍ"))

    def short_name(law_id: str, name: str) -> str:
        if name in SHORT:
            return SHORT[name]
        pid = parent_of.get(law_id)
        if pid:
            pname = name_of.get(pid, "")
            key = lambda x: "".join(x.replace("·", "ㆍ").split())
            if pname and key(name).startswith(key(pname)):
                rest = name.replace("·", "ㆍ")[len(pname):].strip() if name.replace("·", "ㆍ").startswith(pname) else key(name)[len(key(pname)):]
                return f"{SHORT.get(pname, pname)} {rest}".strip()
        return name

    def level_of(law_id: str) -> str:
        k = kind_of.get(law_id, "법률")
        return "법률" if k == "법률" else "시행령" if k == "대통령령" else "시행규칙"

    OUT.mkdir(parents=True, exist_ok=True)
    events, laws = [], []
    for f in sorted(DIFFS.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        law_id, name = d["법령ID"], d["법령명"]
        short = short_name(law_id, name)
        group = parent_of.get(law_id) or law_id
        detail = {"lawId": law_id, "name": name, "short": short, "steps": []}
        for s in d["단계"]:
            if not s["변경"]:
                continue
            reason = summary(s.get("제개정이유", []))
            kinds = [p["제개정구분"] for p in s["공포"]]
            ev_id = f"{law_id}-{s['시행일']}"
            rules = rules_by.get((law_id, s["시행일"]), [])
            changes = [{
                "key": c["조문키"], "article": c["조문"], "title": c["제목"], "kind": c["구분"],
                "rule": next((r["topic"] for r in rules if r["article"] == c["조문"]), None),
            } for c in s["변경"]]
            events.append({
                "id": ev_id,
                "lawId": law_id,
                "law": name,
                "short": short,
                "group": group,
                "level": level_of(law_id),
                "lawKind": kind_of.get(law_id, "법률"),
                "scope": scope.get(name),
                "date": s["시행일"],
                "upcoming": s["시행일"] > today,
                "promulgations": [{"date": p["공포일"], "no": p["공포번호"], "kind": p["제개정구분"], "mst": p["MST"]}
                                  for p in s["공포"]],
                "kinds": sorted(set(kinds)),
                "cause": cause_law(s.get("부칙", [])) if all(k == "타법개정" for k in kinds) else None,
                "headline": HEADLINES.get(ev_id),
                "summary": reason,
                "counts": {k: sum(c["구분"] == k for c in s["변경"]) for k in ("신설", "개정", "삭제")},
                "changes": changes,
                "rules": [{"article": r["article"], "topic": r["topic"], "art93": r["art93"], "required": r["required"]}
                          for r in rules],
            })
            detail["steps"].append({
                "id": ev_id, "date": s["시행일"], "base": s["기준판_시행일"],
                "mst": s["공포"][0]["MST"] if s["공포"] else None,
                "changes": [{"key": c["조문키"], "article": c["조문"], "title": c["제목"], "kind": c["구분"],
                             "before": c["개정전"], "after": c["개정후"]} for c in s["변경"]],
                "addenda": s.get("부칙", []),
                "reason": reason,
                "rules": rules,
            })
        if detail["steps"]:
            (OUT / f"{law_id}.json").write_text(json.dumps(detail, ensure_ascii=False), encoding="utf-8")
            laws.append({"lawId": law_id, "name": name, "short": short, "group": group, "level": level_of(law_id),
                         "events": len(detail["steps"]),
                         "upcoming": sum(st["date"] > today for st in detail["steps"])})

    events.sort(key=lambda e: (e["date"], e["level"] != "법률", e["short"]))
    # 법령 칩 = 상위 법률 단위. 하위법령만 바뀐 법률(근로복지기본법 등)도 칩이 있어야 한다
    groups = {}
    for e in events:
        g = groups.setdefault(e["group"], {"lawId": e["group"], "name": name_of.get(e["group"], e["law"]),
                                           "events": 0, "upcoming": 0})
        g["events"] += 1
        g["upcoming"] += e["date"] > today
    for g in groups.values():
        g["short"] = SHORT.get(g["name"], g["name"])
    index = {
        "generated": REVS["generated"],
        "since": REVS["since"],
        "source": "국가법령정보센터(법제처) Open API",
        "scopeNote": "공인노무사법 시행령 [별표 1] 노동 관계 법령 37개 법률(15호 삭제)과 그 하위법령(시행령·시행규칙 등, 제39호), 「노동절 제정에 관한 법률」",
        "subCount": len(subs),
        "lawCount": len(TARGETS),
        "art93": RULES["_art93"],
        "laws": sorted(laws, key=lambda l: (-l["upcoming"], l["short"])),
        "groups": sorted(groups.values(), key=lambda g: (-g["upcoming"], -g["events"], g["short"])),
        "events": events,
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    # 「내 취업규칙 점검」 — 브라우저에서 rules_impact.py 와 같은 판정을 한다
    short_of = {l["lawId"]: l["short"] for l in laws}
    # 취업규칙 기간 점검 — 표준취업규칙 2026 조문(뼈대)과, 매핑마다 걸리는 표준 조문 id(std)
    std = json.loads(STD.read_text(encoding="utf-8"))["articles"] if STD.exists() else []
    # lawId 는 빌드 때마다 이름으로 다시 푼다 — 추출 당시 개정이 없던 법(고령자고용법 등)도 개정이 들어오면 이어진다
    id_by_name = {r["법령명"].replace("·", "ㆍ"): r["법령ID"] for r in REVS["revisions"]}
    for s in std:
        for l in s["laws"]:
            l["lawId"] = l["lawId"] or id_by_name.get(l["law"].replace("·", "ㆍ"))

    def std_of(r: dict) -> list[str]:
        if r.get("std"):
            return r["std"]
        cited = [s["id"] for s in std if any(l["lawId"] == r["lawId"] and l["article"] == r["article"] for l in s["laws"])]
        if cited:
            return cited
        kws = ["".join(k.split()) for k in r["keywords"]]
        by_title = [s["id"] for s in std if any(k in "".join(s["title"].split()) for k in kws)]
        if by_title:
            return by_title
        # 제목에 없으면 표준 문안 본문 — 「근로자의 날」은 휴일 조문 본문에만 있다
        return [s["id"] for s in std if any(k in "".join(s["text"].split()) for k in kws)][:3]

    (OUT / "standard.json").write_text(json.dumps({
        "source": "고용노동부 표준취업규칙(2026년, 배포) 일반 근로자용",
        "asof": "20260201",
        "art93": json.loads((ROOT / "scripts" / "laws" / "art93_check.json").read_text(encoding="utf-8"))["items"],
        "articles": [{k: s[k] for k in ("id", "no", "title", "chapter", "kind", "text", "laws", "keywords", "status")}
                     for s in std],
    }, ensure_ascii=False), encoding="utf-8")
    (OUT / "rules.json").write_text(json.dumps({
        "art93": RULES["_art93"],
        "rules": [{**r, "std": std_of(r), "law": short_of.get(r["lawId"], r["lawId"]),
                   "mst": next((e["promulgations"][0]["mst"] for e in events
                                if e["lawId"] == r["lawId"] and e["date"] == r["effective"] and e["promulgations"]), None)}
                  for r in RULES["rules"]],
    }, ensure_ascii=False), encoding="utf-8")
    up = sum(e["upcoming"] for e in events)
    print(f"이벤트 {len(events)} (시행예정 {up}) · 법령 {len(laws)} · 취업규칙 매핑 {sum(len(e['rules']) for e in events)} → {OUT.relative_to(ROOT)}")
    # 상시 점검(always) 매핑은 수집 기간(since) 이전 개정이라 이벤트가 없다 — 대조에서 뺀다
    unmatched = [r for r in RULES["rules"] if not r.get("always") and not any(e["lawId"] == r["lawId"] and e["date"] == r["effective"]
                                                       and any(c["article"] == r["article"] for c in e["changes"])
                                                       for e in events)]
    if unmatched:
        print("✗ 매핑이 개정 조문과 안 맞음:", [(r["lawId"], r["article"], r["effective"]) for r in unmatched])
        sys.exit(2)


if __name__ == "__main__":
    main()
