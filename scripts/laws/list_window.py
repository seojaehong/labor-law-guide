"""기간 안 개정 중 매핑 후보 — 표준 조문 인용에 걸리는 이벤트와 매핑 유무를 본다.

    python scripts/laws/list_window.py 20230101 20251001 [--json batches.json]
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "public" / "data" / "laws"
idx = json.loads((D / "index.json").read_text(encoding="utf-8"))
std = json.loads((D / "standard.json").read_text(encoding="utf-8"))["articles"]
rules = json.loads((D / "rules.json").read_text(encoding="utf-8"))["rules"]
lo, hi = sys.argv[1], sys.argv[2]
mapped = {(r["lawId"], r["effective"]) for r in rules}

out = []
for e in idx["events"]:
    if not (lo < e["date"] <= hi):
        continue
    hits = sorted({s["id"] for s in std for c in e["changes"]
                   for l in s["laws"] if l["lawId"] == e["lawId"] and l["article"] == c["article"]})
    out.append({"id": e["id"], "law": e["law"], "short": e["short"], "level": e["level"], "date": e["date"],
                "cause": e["cause"], "n": len(e["changes"]), "std": hits, "mapped": (e["lawId"], e["date"]) in mapped,
                "articles": [f"{c['article']}({c['title']}){c['kind'][0]}" for c in e["changes"]][:30]})

by_law: dict[str, list] = {}
for o in out:
    by_law.setdefault(o["short"], []).append(o)
print(f"이벤트 {len(out)} · 표준 조문에 걸림 {sum(bool(o['std']) for o in out)} · 타법개정 {sum(bool(o['cause']) for o in out)}")
for k, v in sorted(by_law.items(), key=lambda kv: -len(kv[1])):
    print(f"  {k}: {len(v)}건 (표준 걸림 {sum(bool(o['std']) for o in v)})")
if "--json" in sys.argv:
    Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
