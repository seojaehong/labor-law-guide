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


def _schema() -> dict:
    """messages.parse 가 쓰는 것과 같은 변환 — Batch API 는 parse 를 못 쓰므로 스키마를 직접 넘긴다."""
    from anthropic.lib._parse._transform import transform_schema
    from pydantic import TypeAdapter
    return transform_schema(TypeAdapter(BatchOut).json_schema())


class BatchJudge:
    def __init__(self, client, model: str = DEFAULT_MODEL, effort: str = "medium", size: int = 8,
                 use_batch_api: bool = False, poll: float = 15.0):
        self.client, self.model, self.effort, self.size = client, model, effort, size
        self.use_batch_api, self.poll = use_batch_api, poll
        self.name = f"anthropic-{'batchapi' if use_batch_api else 'batch'}:{model}"
        # Batch API 는 단가가 절반이다 — 재질문(즉시 호출)도 같은 줄에 더해 비용을 조금 적게 잡는다
        self.usage = Usage(f"{model}-batch" if use_batch_api else model)
        self.calls = 0

    @staticmethod
    def _body(group: list[ArticlePair], drops: dict, hits: dict) -> str:
        return json.dumps({
            "조문들": [payload(p, drops.get(p.no, []), hits.get(p.no, [])) for p in group],
            "반드시 살필 조문": [p.no for p in group
                           if p.new is None or force_escalate(drops.get(p.no, []), hits.get(p.no, []))],
        }, ensure_ascii=False)

    def _submit(self, groups: list[list[ArticlePair]], drops: dict, hits: dict) -> dict[int, dict | str]:
        """묶음 전부를 배치 하나로 보내고 끝날 때까지 기다린다. 돌려주는 값은 묶음 번호 → 답(또는 실패 사유)."""
        import time
        requests = [{
            "custom_id": f"c{i}",
            "params": {
                "model": self.model, "max_tokens": 16000,
                "output_config": {"effort": self.effort, "format": {"type": "json_schema", "schema": _schema()}},
                "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                "messages": [{"role": "user", "content": self._body(g, drops, hits)}],
            },
        } for i, g in enumerate(groups)]
        try:
            batch = self.client.messages.batches.create(requests=requests)
            while batch.processing_status != "ended":
                time.sleep(self.poll)
                batch = self.client.messages.batches.retrieve(batch.id)
            got: dict[int, dict | str] = {}
            for r in self.client.messages.batches.results(batch.id):
                i = int(r.custom_id[1:])
                if r.result.type != "succeeded":
                    got[i] = r.result.type
                    continue
                self.usage.add(r.result.message.usage)
                text = next((b.text for b in r.result.message.content if b.type == "text"), "")
                try:
                    got[i] = {f.no: f for f in BatchOut.model_validate_json(text).findings}
                except Exception as e:
                    got[i] = type(e).__name__
            return got
        except Exception as e:  # 배치 자체가 실패하면 묶음마다 즉시 호출로 넘어간다
            return {i: type(e).__name__ for i in range(len(groups))}

    def _ask(self, group: list[ArticlePair], drops: dict, hits: dict) -> dict[str, ArticleFinding] | str:
        body = json.loads(self._body(group, drops, hits))
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
        groups = chunks(pairs, self.size)
        first = self._submit(groups, drops, hits) if self.use_batch_api else {}
        for gi, group in enumerate(groups):
            got = first.get(gi, "답 없음") if self.use_batch_api else self._ask(group, drops, hits)
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
