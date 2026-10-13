"""2023.1.~2025.9. 묶음 판정 결과(out_N.json + skeptic_N_a/b.json) → 제목·매핑 반영.

- 제목: 초안 그대로(빈 것 제외). 문체 정리(마침표·em dash)
- 매핑: 회의론자 2명이 모두 refuted=false 일 때만 살린다. 둘의 fixed 를 덮어쓴다(b 가 a 를 덮음)
- 기존 값은 덮어쓰지 않는다(apply_triage.py 와 같은 원칙)

    python scripts/laws/merge_window_triage.py <triage 폴더> [--apply]
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
T = Path(sys.argv[1])
APPLY = "--apply" in sys.argv
HP = ROOT / "scripts" / "laws" / "headlines.json"
MP = ROOT / "scripts" / "laws" / "work_rules_map.json"
FIELDS = ("lawId", "article", "effective", "topic", "art93", "required", "keywords", "ok", "stale", "point", "clause", "std")

heads, keep, rejected, missing = {}, [], [], []
for out in sorted(T.glob("out_*.json"), key=lambda p: int(p.stem.split("_")[1])):
    n = out.stem.split("_")[1]
    d = json.loads(out.read_text(encoding="utf-8"))
    for e in d["events"]:
        h = (e.get("headline") or "").strip().rstrip(".").replace("—", ",")
        if h:
            heads[e["id"]] = re.sub(r"\s+", " ", h)
    votes = []
    for side in ("a", "b"):
        f = T / f"skeptic_{n}_{side}.json"
        if f.exists():
            votes.append({v["key"]: v for v in json.loads(f.read_text(encoding="utf-8"))["votes"]})
        else:
            missing.append(f.name)
    for m in d["mappings"]:
        key = f"{m['eventId']}|{m['article']}|{m['topic']}"
        vs = [v.get(key) for v in votes]
        if len(vs) == 2 and all(v and not v["refuted"] for v in vs):
            for v in vs:
                for k, val in (v.get("fixed") or {}).items():
                    if k in FIELDS and val not in (None, "", []):
                        m[k] = val
            keep.append(m)
        else:
            rejected.append((key, [p for v in vs if v for p in v.get("problems", [])][:3]))

print(f"제목 {len(heads)} · 매핑 통과 {len(keep)} · 기각 {len(rejected)} · 반박 파일 없음 {missing}")
for m in keep:
    print(f"  ✓ {m['eventId']} {m['article']} [{'필수' if m['required'] else '선택'}·{m['art93']}호·{m['std']}] {m['topic']} ok={m['ok']} stale={m['stale']}")
for k, p in rejected:
    print(f"  ✗ {k} — {' / '.join(p)[:240]}")

if APPLY:
    hj = json.loads(HP.read_text(encoding="utf-8"))
    add_h = 0
    for k, v in heads.items():
        if k not in hj:
            hj[k] = v
            add_h += 1
    HP.write_text(json.dumps(hj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    rm = json.loads(MP.read_text(encoding="utf-8"))
    have = {(r["lawId"], r["article"], r["effective"], r["topic"]) for r in rm["rules"]}
    add_m = 0
    for m in keep:
        if (m["lawId"], m["article"], m["effective"], m["topic"]) in have:
            continue
        rule = {k: m[k] for k in FIELDS}
        rule["source"] = "2023.1.~2025.9. 묶음 판정 2026-10-05 · 원문 대조 2인 반박 통과 · 공인노무사 검수 전"
        rm["rules"].append(rule)
        add_m += 1
    MP.write_text(json.dumps(rm, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"반영: 제목 +{add_h} · 매핑 +{add_m} (총 {len(rm['rules'])})")
