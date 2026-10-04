"""취업규칙 본문 ↔ 노동법 개정 영향 판정 — /노동법개정반영 스킬의 결정형 도구.

입력: 취업규칙 텍스트(.md/.txt. hwp·hwpx·pdf 는 먼저 텍스트로 바꾼다)
판정: scripts/laws/work_rules_map.json 의 개정 항목마다
  반영됨 — keywords 문단이 있고 ok 문구가 모두 있다
  미반영 — keywords 문단이 있는데 stale 문구가 남았거나 ok 문구가 빠졌다
  누락   — keywords 문단이 없다(새 조문을 넣어야 한다)
출력: 표(stdout) + --json 이면 판정 JSON(변경지시 초안 재료). 문안 확정·anchor 선정은 사람이 한다.

    python scripts/laws/rules_impact.py <취업규칙.md> [--asof 20261004] [--json out.json] [--include-optional]
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
MAP = json.loads((ROOT / "scripts" / "laws" / "work_rules_map.json").read_text(encoding="utf-8"))
INDEX = ROOT / "public" / "data" / "laws" / "index.json"

SHORT: dict[str, str] = {}
ART = re.compile(r"^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(\([^)]*\))?")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("ㆍ", "·")).strip()


def paragraphs(text: str) -> list[dict]:
    """문단(줄) 단위로 자르고 각 문단이 속한 조문 제목을 붙인다."""
    out, current = [], None
    for raw in text.splitlines():
        line = norm(raw)
        if not line:
            continue
        m = ART.match(line)
        if m:
            current = (m.group(1).replace(" ", "") + (m.group(2) or "")).strip()
        out.append({"article": current, "text": line})
    return out


def has(text: str, needle: str) -> bool:
    return norm(needle).replace(" ", "") in text.replace(" ", "")


def judge(rule: dict, paras: list[dict]) -> dict:
    hits = [p for p in paras if any(has(p["text"], k) for k in rule["keywords"])]
    if not hits:
        return {"status": "누락", "where": None, "found": [], "missing": rule["ok"]}
    # 같은 조문에 속한 문단을 한 덩어리로 보고 판정한다(① 에 없어도 ② 에 있으면 반영된 것)
    arts = []
    for h in hits:
        if h["article"] not in arts:
            arts.append(h["article"])
    best = None
    for a in arts:
        block = " ".join(p["text"] for p in paras if p["article"] == a) if a else " ".join(h["text"] for h in hits)
        stale = [s for s in rule["stale"] if has(block, s)]
        missing = [o for o in rule["ok"] if not has(block, o)]
        score = len(stale) * 10 + len(missing)
        cand = {"where": a, "stale": stale, "missing": missing, "score": score,
                "paragraphs": [p["text"] for p in paras if p["article"] == a][:6] if a else [h["text"] for h in hits][:6]}
        if best is None or score < best["score"]:
            best = cand
    status = "반영됨" if best["score"] == 0 else "미반영"
    return {"status": status, "where": best["where"], "stale": best["stale"], "missing": best["missing"],
            "paragraphs": best["paragraphs"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rules_file")
    ap.add_argument("--asof", default=date.today().strftime("%Y%m%d"))
    ap.add_argument("--json")
    ap.add_argument("--include-optional", action="store_true", help="required=false(선택·정비) 항목도 미반영으로 올린다")
    args = ap.parse_args()
    # 2026-10-04 실측 — 「2026-10-04」를 그대로 문자열 비교하면 시행 중인 개정이 오류 없이 「시행 예정」으로 나온다
    asof = re.sub(r"[^0-9]", "", args.asof)
    if not re.fullmatch(r"20\d{6}", asof):
        sys.exit(f"--asof 는 날짜(YYYYMMDD 또는 YYYY-MM-DD)여야 합니다: {args.asof!r}")
    args.asof = asof

    paras = paragraphs(Path(args.rules_file).read_text(encoding="utf-8"))
    idx = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {"generated": "?", "laws": []}
    gen = idx["generated"]
    SHORT.update({l["lawId"]: l["short"] for l in idx["laws"]})
    print(f"기준일 {args.asof} · 개정 데이터 {gen} 수집분 · 매핑 {len(MAP['rules'])}건 · 문단 {len(paras)}개\n")

    results = []
    for r in sorted(MAP["rules"], key=lambda r: (r["effective"], r["lawId"])):
        j = judge(r, paras)
        # 절차·인용 정비형은 법보다 좁은 옛 문구가 남았을 때만 필수다(옮겨 적지 않았으면 법이 바로 적용된다)
        r = {**r, "required": r["required"] or bool(r.get("requiredIfStale") and j.get("stale"))}
        timing = "시행 중" if r["effective"] <= args.asof else f"{r['effective'][:4]}.{int(r['effective'][4:6])}.{int(r['effective'][6:])}. 시행 예정"
        need = j["status"] != "반영됨" and (r["required"] or args.include_optional)
        results.append({**{k: r[k] for k in ("lawId", "article", "effective", "topic", "art93", "required", "point", "clause")},
                        "timing": timing, "action_needed": need, **j})
        mark = {"반영됨": "✓", "미반영": "✗", "누락": "＋"}[j["status"]]
        req = "필수" if r["required"] else "선택"
        law = SHORT.get(r["lawId"], r["lawId"])
        print(f"{mark} {j['status']:<3} [{req}] {law} {r['article']} {r['topic']} — {timing}")
        if j["status"] != "반영됨":
            if j.get("where"):
                print(f"      위치: {j['where']}")
            if j.get("stale"):
                print(f"      남은 옛 문구: {', '.join(j['stale'])}")
            if j.get("missing"):
                print(f"      빠진 문구: {', '.join(j['missing'])}")
            if j["status"] == "누락":
                print("      → 새 조문을 넣는다(insert_after). 자리는 관련 조문 바로 뒤, 없으면 같은 장 끝")

    todo = [x for x in results if x["action_needed"]]
    print(f"\n고칠 것 {len(todo)}건 (시행 중 {sum(x['effective'] <= args.asof for x in todo)} · 시행 예정 {sum(x['effective'] > args.asof for x in todo)})"
          f" · 반영됨 {sum(x['status'] == '반영됨' for x in results)}건 · 선택 항목 미반영 {sum(x['status'] != '반영됨' and not x['required'] for x in results)}건")
    if args.json:
        Path(args.json).write_text(json.dumps({"asof": args.asof, "data": gen, "results": results}, ensure_ascii=False, indent=1),
                                   encoding="utf-8")
        print(f"→ {args.json}")


if __name__ == "__main__":
    main()
