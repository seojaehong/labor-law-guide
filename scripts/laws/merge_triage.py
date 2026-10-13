"""워크플로(law-subordinate-triage) 결과 → 검토용 요약 + 반영 후보 JSON.

    python scripts/laws/merge_triage.py <workflow output> <out.json>

- 제목: 검사 ok → 초안 그대로, fix → 고친 문장, drop → 버림. 검사를 안 거친 제목은 없다(초안 제목이 있을 때만 검사했다)
- 매핑: 회의론자 2명이 모두 refuted=false 일 때만 살린다. 둘이 낸 fixed 필드를 덮어쓴다(뒤 표가 앞 표를 덮음)
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
# 출력 파일 = {summary, logs, result, …}. result 는 배열이거나 배열을 담은 문자열이다
data = raw.get("result", raw) if isinstance(raw, dict) else raw
if isinstance(data, str):
    data = json.loads(data)

headlines, rel, mappings, rejected = {}, {}, [], []
for b in data:
    checked = {it["id"]: it for it in (b.get("headCheck") or {}).get("items", [])}
    for e in b["draft"]["events"]:
        c = checked.get(e["id"])
        final_rel = c["relevance"] if c else e["relevance"]
        rel[e["id"]] = (final_rel, e["relevance_reason"])
        if not e["headline"]:
            continue
        if not c:
            print(f"  ⚠ 검사 없는 제목: {e['id']}")
            continue
        if c["verdict"] == "drop":
            continue
        headlines[e["id"]] = c["headline"] if c["verdict"] == "fix" else e["headline"]
    for mc in b["mappingChecks"]:
        m, votes = mc["mapping"], mc["votes"]
        if len(votes) == 2 and all(not v["refuted"] for v in votes):
            for v in votes:
                for k, val in (v.get("fixed") or {}).items():
                    if val not in (None, "", []):
                        m[k] = val
            mappings.append(m)
        else:
            rejected.append({"mapping": f"{m['eventId']} {m['article']} {m['topic']}",
                             "problems": [p for v in votes for p in v.get("problems", [])][:4]})

# 문체 — 제목 끝 마침표는 기존 제목 형식(마침표 없음)에 맞춘다, em dash 금지
for k, v in list(headlines.items()):
    v = v.strip().rstrip(".").replace("—", ",")
    headlines[k] = re.sub(r"\s+", " ", v)

print(f"제목 {len(headlines)} · 관련성 required {sum(r == 'required' for r, _ in rel.values())} · optional "
      f"{sum(r == 'optional' for r, _ in rel.values())} · 매핑 통과 {len(mappings)} · 기각 {len(rejected)}\n")
print("== 통과한 매핑")
for m in mappings:
    print(f"- {m['eventId']} {m['article']} [{'필수' if m['required'] else '선택'} · 제93조 {m['art93']}호] {m['topic']}")
    print(f"    point: {m['point'][:300]}")
    print(f"    clause: {m['clause'][:300]}")
    print(f"    keywords {m['keywords']} ok {m['ok']} stale {m['stale']}")
    print(f"    근거: {m['quote_after'][:200]}")
print("\n== 기각된 매핑")
for r in rejected:
    print(f"- {r['mapping']}: {' / '.join(p[:160] for p in r['problems'])}")
print("\n== required/optional 판정인데 매핑이 없는 이벤트")
mapped_ev = {m["eventId"] for m in mappings}
for k, (r, why) in rel.items():
    if r != "none" and k not in mapped_ev:
        print(f"- {k} [{r}] {why[:200]}")
Path(sys.argv[2]).write_text(json.dumps({"headlines": headlines, "mappings": mappings, "rejected": rejected,
                                         "relevance": rel}, ensure_ascii=False, indent=1), encoding="utf-8")
