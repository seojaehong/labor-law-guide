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


RESULT_RANK = {"현행 수정 필요": 0, "시행 예정": 1, "회사 선택": 2, "추가 확인": 3, "문제없음": 4}
DISADV_RANK = {"해당": 0, "확인 필요": 1, "해당 없음": 2}


def merge(found: list[ArticleFinding]) -> ArticleFinding:
    """여러 회차의 답을 하나로 — 한 번이라도 지적되면 남기고, 결과·불이익변경은 더 무거운 쪽을 쓴다."""
    flagged = [f for f in found if f.result != "문제없음"] or found
    best = min(flagged, key=lambda f: RESULT_RANK[f.result])
    worst = min((f.disadvantage for f in flagged), key=lambda d: DISADV_RANK[d])
    return best.model_copy(update={"disadvantage": worst})


class BatchJudge:
    def __init__(self, client, model: str = DEFAULT_MODEL, effort: str = "medium", size: int = 8,
                 use_batch_api: bool = False, poll: float = 15.0, runs: int = 1, workers: int = 8,
                 headcount: str = ""):
        import threading
        self.client, self.model, self.effort, self.size = client, model, effort, size
        self.headcount = headcount
        self.use_batch_api, self.poll = use_batch_api, poll
        self.runs, self.workers = runs, workers
        self.name = f"anthropic-{'batchapi' if use_batch_api else 'batch'}:{model}"
        # Batch API 는 단가가 절반이다 — 재질문(즉시 호출)도 같은 줄에 더해 비용을 조금 적게 잡는다
        self.usage = Usage(f"{model}-batch" if use_batch_api else model)
        self.calls = 0
        self._lock = threading.Lock()  # 묶음을 동시에 보내므로 사용량 집계를 잠근다

    def _body(self, group: list[ArticlePair], drops: dict, hits: dict) -> str:
        return json.dumps({
            "사업장 상시 인원": self.headcount,  # 위원회 정족수·재심 인원을 규모로 보라고 했으니 규모를 준다
            "조문들": [payload(p, drops.get(p.no, []), hits.get(p.no, [])) for p in group],
            "반드시 살필 조문": [p.no for p in group
                           if p.new is None or force_escalate(drops.get(p.no, []), hits.get(p.no, []))],
        }, ensure_ascii=False)

    def _submit(self, groups: list[list[ArticlePair]], drops: dict,
                hits: dict) -> dict[tuple[int, int], dict | str]:
        """모든 회차·묶음을 배치 하나로 보내고 끝날 때까지 기다린다. 돌려주는 값은 (회차, 묶음) → 답(또는 실패 사유)."""
        import time
        requests = [{
            "custom_id": f"r{k}c{i}",
            "params": {
                "model": self.model, "max_tokens": 16000,
                "output_config": {"effort": self.effort, "format": {"type": "json_schema", "schema": _schema()}},
                "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                "messages": [{"role": "user", "content": self._body(g, drops, hits)}],
            },
        } for k in range(self.runs) for i, g in enumerate(groups)]
        try:
            batch = self.client.messages.batches.create(requests=requests)
            while batch.processing_status != "ended":
                time.sleep(self.poll)
                batch = self.client.messages.batches.retrieve(batch.id)
            got: dict[tuple[int, int], dict | str] = {}
            for r in self.client.messages.batches.results(batch.id):
                i = tuple(int(x) for x in r.custom_id[1:].split("c"))
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
            return {(k, i): type(e).__name__ for k in range(self.runs) for i in range(len(groups))}

    def _ask(self, group: list[ArticlePair], drops: dict, hits: dict) -> dict[str, ArticleFinding] | str:
        body = json.loads(self._body(group, drops, hits))
        try:
            with self._lock:
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
        with self._lock:
            self.usage.add(resp.usage)
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            return str(resp.stop_reason)
        return {f.no: f for f in resp.parsed_output.findings}

    def judge_all(self, pairs: list[ArticlePair], drops: dict[str, list[Drop]],
                  hits: dict[str, list[RuleHit]]) -> dict[str, JudgeOut]:
        """문제없음이 아닌 조문만 돌려준다. 회차가 여럿이면 한 번이라도 지적된 조문을 남긴다(합집합).
        어느 회차도 답하지 않은 조문은 한 번 더 묻고, 그래도 없으면 「추가 확인」."""
        from concurrent.futures import ThreadPoolExecutor

        out: dict[str, JudgeOut] = {}
        groups = chunks(pairs, self.size)
        jobs = [(k, gi) for k in range(self.runs) for gi in range(len(groups))]
        if self.use_batch_api:
            first = self._submit(groups, drops, hits)
        else:  # 묶음을 한꺼번에 보낸다 — 차례로 보내면 묶음 수만큼 기다린다
            with ThreadPoolExecutor(max_workers=max(1, self.workers)) as pool:
                first = dict(zip(jobs, pool.map(lambda j: self._ask(groups[j[1]], drops, hits), jobs)))
        for gi, group in enumerate(groups):
            got = [first.get((k, gi), "답 없음") for k in range(self.runs)]
            found: dict[str, list[ArticleFinding]] = {}
            for g in got:
                for no, f in ({} if isinstance(g, str) else g).items():
                    found.setdefault(no, []).append(f)
            fails = [g for g in got if isinstance(g, str)]
            why = fails[0] if fails else "묶음 답에서 빠짐"
            left = [p for p in group if p.no not in found]
            if left:  # 어느 회차도 답하지 않은 조문만 한 번 더 묻는다
                again = self._ask(left, drops, hits)
                if isinstance(again, str):
                    why = again
                else:
                    for no, f in again.items():
                        found.setdefault(no, []).append(f)
            answers = {no: merge(fs) for no, fs in found.items()}
            for p in group:
                if p.no not in answers:
                    out[p.no] = failed(why)
                elif answers[p.no].result != "문제없음":
                    f = answers[p.no]
                    out[p.no] = JudgeOut(result=f.result, disadvantage=f.disadvantage, reason=f.reason,
                                         basis=f.basis, ops_note=f.ops_note, proposed_text=f.proposed_text)
        return out
