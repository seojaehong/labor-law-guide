"""법령 개정 → 취업규칙 매핑. 판정은 scripts/laws/rules_impact.py 의 judge() 를 그대로 쓴다."""
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

from work_rules_c.articles import Article

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "laws"))
import rules_impact  # noqa: E402

NEW_BUCKET = "(신설 필요)"


@dataclass(frozen=True)
class RuleHit:
    topic: str
    law_id: str
    law_article: str
    effective: date
    required: bool
    status: Literal["반영됨", "미반영", "누락"]
    where: str | None
    stale: tuple[str, ...]
    missing: tuple[str, ...]


def _date(s: str) -> date:
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def map_rules(articles: list[Article], asof: date, since: date, rules: list[dict] | None = None) -> list[RuleHit]:
    if rules is None:
        rules = rules_impact.MAP["rules"]
    text = "\n".join(f"{a.no}({a.title}) {a.body}" for a in articles)
    paras = rules_impact.paragraphs(text)
    out = []
    for rule in rules:
        effective = _date(rule["effective"])
        if effective < since:
            continue
        r = rules_impact.judge(rule, paras)
        out.append(RuleHit(
            topic=rule["topic"], law_id=rule["lawId"], law_article=rule["article"], effective=effective,
            required=bool(rule.get("required")), status=r["status"], where=r.get("where"),
            stale=tuple(r.get("stale", ())), missing=tuple(r.get("missing", ())),
        ))
    return out


def hits_by_article(hits: list[RuleHit]) -> dict[str, list[RuleHit]]:
    out: dict[str, list[RuleHit]] = {}
    for h in hits:
        if h.where:
            m = re.match(r"제\d+조(?:의\d+)?", h.where)
            key = m.group(0) if m else h.where
        else:
            key = NEW_BUCKET
        out.setdefault(key, []).append(h)
    return out
