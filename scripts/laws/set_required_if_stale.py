"""절차·인용 정비형 매핑을 「옛 문구가 남았을 때만 필수」로 바꾼다(2026-10-05).

규칙에 그 절차를 옮겨 적지 않았으면 법이 바로 적용돼 위법이 아니다. 법보다 좁은 옛 문구가 남아 있을 때만 고쳐야 한다.
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parents[0] / "work_rules_map.json"
m = json.loads(P.read_text(encoding="utf-8"))
TARGET = {("001872", "제60조", "20260820"), ("003140", "제11조", "20260820"), ("003140", "제11조", "20260918")}
for r in m["rules"]:
    if (r["lawId"], r["article"], r["effective"]) in TARGET:
        r["required"] = False
        r["requiredIfStale"] = True
        if r["article"] == "제60조":
            r["keywords"] = ["출근한 것으로"]
P.write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print([(r["lawId"], r["article"], r["effective"], r["required"], r.get("requiredIfStale")) for r in m["rules"]
       if (r["lawId"], r["article"], r["effective"]) in TARGET])
