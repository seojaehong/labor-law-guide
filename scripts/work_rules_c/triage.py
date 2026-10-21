"""조문별 1차 분류. 「문제없음」은 확신할 때만, 나머지는 판단 단계로 올린다."""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel

from work_rules_c.articles import ArticlePair
from work_rules_c.mapping import RuleHit
from work_rules_c.quantities import Drop

TRIAGE_MODEL = "claude-haiku-5-5"
SYSTEM = (Path(__file__).parent / "prompts" / "triage_system.md").read_text(encoding="utf-8")


class TriageOut(BaseModel):
    label: Literal["문제없음", "확인필요", "문제"]
    reasons: list[str]
    topics: list[str]


@dataclass
class Usage:
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def add(self, u) -> None:
        for f in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
            setattr(self, f, getattr(self, f) + (getattr(u, f, 0) or 0))


@dataclass(frozen=True)
class Triage:
    no: str
    label: str
    reasons: tuple[str, ...]
    escalate: bool


@runtime_checkable
class TriageBackend(Protocol):
    name: str
    usage: Usage

    def triage(self, pair: ArticlePair, drops: list[Drop], hits: list[RuleHit]) -> Triage: ...


def force_escalate(drops: list[Drop], hits: list[RuleHit]) -> bool:
    return bool(drops) or any(h.status != "반영됨" for h in hits)


def skip_same(pair: ArticlePair, drops: list[Drop], hits: list[RuleHit]) -> Triage | None:
    if pair.status != "동일":
        return None
    return Triage(pair.no, "문제없음", (), force_escalate(drops, hits))


def payload(pair: ArticlePair, drops: list[Drop], hits: list[RuleHit]) -> dict:
    return {
        "조문": pair.no,
        "종전": pair.old.body if pair.old else "",
        "개정안": pair.new.body if pair.new else "",
        "수치 하락": [{"단위": d.unit, "종전": d.old_max, "개정안": d.new_max} for d in drops],
        "관련 법령 기준": [{"항목": h.topic, "상태": h.status, "시행일": h.effective.isoformat()} for h in hits],
    }


def triage_pair(client, pair: ArticlePair, drops: list[Drop], hits: list[RuleHit], usage: Usage) -> Triage:
    skipped = skip_same(pair, drops, hits)
    if skipped:
        return skipped
    try:
        resp = client.messages.parse(
            model=TRIAGE_MODEL,
            max_tokens=1024,
            output_config={"effort": "low"},
            system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": json.dumps(payload(pair, drops, hits), ensure_ascii=False)}],
            output_format=TriageOut,
        )
    except Exception as e:  # 호출 실패는 「문제없음」이 아니라 위로 올린다
        return Triage(pair.no, "확인필요", (f"1차 분류 실패: {type(e).__name__}",), True)
    usage.add(resp.usage)
    out = resp.parsed_output
    if resp.stop_reason == "refusal" or out is None:
        return Triage(pair.no, "확인필요", (f"1차 분류 실패: {resp.stop_reason}",), True)
    escalate = out.label != "문제없음" or force_escalate(drops, hits)
    return Triage(pair.no, out.label, tuple(out.reasons), escalate)


class HaikuTriage:
    def __init__(self, client):
        self.client = client
        self.name = f"anthropic:{TRIAGE_MODEL}"
        self.usage = Usage(TRIAGE_MODEL)

    def triage(self, pair: ArticlePair, drops: list[Drop], hits: list[RuleHit]) -> Triage:
        return triage_pair(self.client, pair, drops, hits, self.usage)
