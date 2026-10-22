"""판단 단계 — 1차 분류에서 올라온 조문만. 백엔드는 교체할 수 있다."""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel

from work_rules_c.articles import ArticlePair
from work_rules_c.mapping import RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.triage import Triage, Usage, payload

SYSTEM = (Path(__file__).parent / "prompts" / "judge_system.md").read_text(encoding="utf-8")


@dataclass(frozen=True)
class JudgeInput:
    pair: ArticlePair
    drops: tuple[Drop, ...]
    hits: tuple[RuleHit, ...]
    triage: Triage


class JudgeOut(BaseModel):
    result: Literal["현행 수정 필요", "시행 예정", "회사 선택", "추가 확인"]
    disadvantage: Literal["해당", "해당 없음", "확인 필요"]
    reason: str
    basis: str
    ops_note: str
    proposed_text: str
    confidence: float | None = None


@runtime_checkable
class JudgeBackend(Protocol):
    name: str
    usage: Usage

    def judge(self, item: JudgeInput) -> JudgeOut: ...


def failed(why: str) -> JudgeOut:
    return JudgeOut(result="추가 확인", disadvantage="확인 필요", reason=f"판단 실패: {why}",
                    basis="", ops_note="", proposed_text="")


def apply_threshold(out: JudgeOut, min_confidence: float) -> JudgeOut:
    if out.confidence is not None and out.confidence < min_confidence:
        return out.model_copy(update={"result": "추가 확인"})
    return out


class AnthropicJudge:
    def __init__(self, client, model: str = "claude-opus-5-5", effort: str = "high"):
        self.client, self.model, self.effort = client, model, effort
        self.name = f"anthropic:{model}"
        self.usage = Usage(model)

    def judge(self, item: JudgeInput) -> JudgeOut:
        body = payload(item.pair, list(item.drops), list(item.hits))
        # 확률 숫자는 넘기지 않는다 — 모델이 산출물에 옮겨 적는다
        body["1차 분류 사유"] = [r.split(" ")[0] if r[:1].isascii() else r for r in item.triage.reasons]
        try:
            resp = self.client.messages.parse(
                model=self.model,
                max_tokens=16000,
                output_config={"effort": self.effort},
                system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": json.dumps(body, ensure_ascii=False)}],
                output_format=JudgeOut,
            )
        except Exception as e:  # 실패는 「추가 확인」으로 돌린다
            return failed(type(e).__name__)
        self.usage.add(resp.usage)
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            return failed(str(resp.stop_reason))
        return resp.parsed_output
