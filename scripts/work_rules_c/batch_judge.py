"""묶음 판단 — 연속된 조문 몇 개를 한 번에 판단해 호출 수를 줄인다. 1차 거르기 없이 모든 조문을 본다."""
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from work_rules_c.articles import ArticlePair
from work_rules_c.judge import JudgeOut, failed
from work_rules_c.mapping import RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.triage import Usage, force_escalate, payload

SYSTEM = (Path(__file__).parent / "prompts" / "batch_system.md").read_text(encoding="utf-8")
DEFAULT_MODEL = "claude-sonnet-5-5"


class ArticleFinding(BaseModel):
    no: str
    result: Literal["문제없음", "현행 수정 필요", "시행 예정", "회사 선택", "추가 확인"]
    disadvantage: Literal["해당", "해당 없음", "확인 필요"]
    reason: str
    basis: str
    ops_note: str
    proposed_text: str


class BatchOut(BaseModel):
    findings: list[ArticleFinding]


def chunks(pairs: list[ArticlePair], size: int) -> list[list[ArticlePair]]:
    return [pairs[i:i + size] for i in range(0, len(pairs), size)]


class BatchJudge:
    def __init__(self, client, model: str = DEFAULT_MODEL, effort: str = "medium", size: int = 8):
        self.client, self.model, self.effort, self.size = client, model, effort, size
        self.name = f"anthropic-batch:{model}"
        self.usage = Usage(model)
        self.calls = 0

    def _ask(self, group: list[ArticlePair], drops: dict, hits: dict) -> dict[str, ArticleFinding] | str:
        body = {
            "조문들": [payload(p, drops.get(p.no, []), hits.get(p.no, [])) for p in group],
            "반드시 살필 조문": [p.no for p in group
                           if p.new is None or force_escalate(drops.get(p.no, []), hits.get(p.no, []))],
        }
        try:
            self.calls += 1
            resp = self.client.messages.parse(
                model=self.model,
                max_tokens=16000,
                output_config={"effort": self.effort},
                system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": json.dumps(body, ensure_ascii=False)}],
                output_format=BatchOut,
            )
        except Exception as e:  # 묶음 전체를 「추가 확인」으로
            return type(e).__name__
        self.usage.add(resp.usage)
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            return str(resp.stop_reason)
        return {f.no: f for f in resp.parsed_output.findings}

    def judge_all(self, pairs: list[ArticlePair], drops: dict[str, list[Drop]],
                  hits: dict[str, list[RuleHit]]) -> dict[str, JudgeOut]:
        """문제없음이 아닌 조문만 돌려준다. 답이 빠진 조문·실패한 묶음은 「추가 확인」."""
        out: dict[str, JudgeOut] = {}
        for group in chunks(pairs, self.size):
            got = self._ask(group, drops, hits)
            answers = {} if isinstance(got, str) else got
            left = [p for p in group if p.no not in answers]
            why = got if isinstance(got, str) else "묶음 답에서 빠짐"
            if left:  # 실패했거나 빠진 조문만 한 번 더 묻는다
                again = self._ask(left, drops, hits)
                if isinstance(again, str):
                    why = again
                else:
                    answers.update(again)
            for p in group:
                if p.no not in answers:
                    out[p.no] = failed(why)
                elif answers[p.no].result != "문제없음":
                    f = answers[p.no]
                    out[p.no] = JudgeOut(result=f.result, disadvantage=f.disadvantage, reason=f.reason,
                                         basis=f.basis, ops_note=f.ops_note, proposed_text=f.proposed_text)
        return out
