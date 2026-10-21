"""판단 모델(Jev · OpenAI Decisions) 1차 분류 백엔드. 글은 쓰지 않고 「위로 올릴지」만 확률로 정한다."""
import json
import urllib.request
from dataclasses import dataclass
from typing import Literal, Protocol

from work_rules_c.articles import ArticlePair
from work_rules_c.mapping import RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.triage import Triage, Usage, force_escalate, skip_same

JEV_URL = "https://api.typesafe.ai/v1/systemone"


@dataclass(frozen=True)
class DQ:
    name: str
    kind: Literal["yesno", "choice"]
    instructions: str
    true: str = ""
    false: str = ""
    choices: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class DA:
    name: str
    p_yes: float | None
    choice: str | None
    confidence: float | None
    refused: bool = False


class DecisionClient(Protocol):
    name: str

    def ask(self, state: dict, questions: list[DQ]) -> tuple[dict[str, DA], dict]: ...


class JevClient:
    def __init__(self, api_key: str, model: str = "jev-latest", timeout: float = 10.0):
        self.api_key, self.model, self.timeout = api_key, model, timeout
        self.name = f"jev:{model}"

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(
            JEV_URL, data=json.dumps(body, ensure_ascii=False).encode("utf-8"), method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)

    def ask(self, state: dict, questions: list[DQ]) -> tuple[dict[str, DA], dict]:
        qs = {}
        for q in questions:
            if q.kind == "yesno":
                qs[q.name] = {"type": "noul", "instructions": q.instructions,
                              "criteria": {"true": q.true, "false": q.false}}
            else:
                qs[q.name] = {"type": "choice", "instructions": q.instructions, "criteria": dict(q.choices)}
        resp = self._post({"model": self.model, "state": state, "questions": qs})
        out = {}
        for name, a in resp.get("answers", {}).items():
            if a.get("type") == "noul":
                out[name] = DA(name, float(a["noul"]), None, None)
            elif a.get("type") == "choice":
                out[name] = DA(name, None, a.get("choice"), a.get("confidence"))
            else:
                out[name] = DA(name, None, None, None, refused=True)
        return out, resp.get("usage", {})


class OpenAIDecisionsClient:
    def __init__(self, client, model: str = "gpt-6-luna"):
        self.client, self.model = client, model
        self.name = f"openai:{model}"

    def ask(self, state: dict, questions: list[DQ]) -> tuple[dict[str, DA], dict]:
        qs = []
        for q in questions:
            if q.kind == "yesno":
                qs.append({"type": "predicate", "name": q.name,
                           "instructions": f"{q.instructions} 예: {q.true} / 아니오: {q.false}"})
            else:
                qs.append({"type": "choice", "name": q.name, "instructions": q.instructions,
                           "choices": [{"value": v, "description": d} for v, d in q.choices]})
        resp = self.client.decisions.create(model=self.model, input=json.dumps(state, ensure_ascii=False),
                                            questions=qs)
        out = {}
        for a in resp.answers:
            if a.type == "predicate":
                out[a.name] = DA(a.name, float(a.probability), None, None)
            elif a.type == "choice":
                out[a.name] = DA(a.name, None, a.choice, getattr(a, "confidence", None))
            else:
                out[a.name] = DA(a.name, None, None, None, refused=True)
        u = getattr(resp, "usage", None)
        return out, {"input_tokens": getattr(u, "input_tokens", 0) or 0,
                     "output_tokens": getattr(u, "output_tokens", 0) or 0}


KIND_CHOICES = (
    ("현행 수정 필요", "현행 법령 기준에 못 미쳐 지금 고쳐야 한다"),
    ("시행 예정", "앞으로 시행되는 법령에 맞춰 고쳐야 한다"),
    ("회사 선택", "법령상 의무는 아니고 회사가 정할 수 있다"),
    ("추가 확인", "사실관계나 다른 규정을 더 봐야 정할 수 있다"),
    ("문제없음", "법령 기준을 충족하고 종전보다 불리하지 않으며 운영에 무리가 없다"),
)


def questions_for(pair: ArticlePair) -> list[DQ]:
    qs = [DQ("below_law", "yesno", "개정안이 관련 법령 기준보다 근로자에게 불리하거나 법이 요구하는 사항을 빠뜨렸다.",
             true="법령 기준 미달 또는 필수 사항 누락이 있다", false="법령 기준을 충족한다")]
    if pair.status == "변경":
        qs.append(DQ("worse_than_old", "yesno", "개정안이 종전 규정보다 근로조건을 낮췄다.",
                     true="종전보다 근로자에게 불리해졌다", false="종전과 같거나 유리해졌다"))
    qs.append(DQ("hard_to_run", "yesno", "규정한 절차(정족수·재심 인원·필수 심의)를 이 사업장 규모로 지키기 어렵다.",
                 true="절차를 그대로 지키기 어렵다", false="절차를 지키는 데 무리가 없다"))
    qs.append(DQ("kind", "choice", "이 조문의 점검 결과로 가장 알맞은 것을 고른다.", choices=KIND_CHOICES))
    return qs


class DecisionTriage:
    def __init__(self, client: DecisionClient, yes_threshold: float = 0.3, min_confidence: float = 0.8,
                 headcount: str = ""):
        self.client, self.yes_threshold, self.min_confidence = client, yes_threshold, min_confidence
        self.headcount = headcount
        self.name = client.name
        self.usage = Usage(client.name.split(":", 1)[-1])

    def triage(self, pair: ArticlePair, drops: list[Drop], hits: list[RuleHit]) -> Triage:
        skipped = skip_same(pair, drops, hits)
        if skipped:
            return skipped
        state = {"조문": pair.no, "종전": pair.old.body if pair.old else "",
                 "개정안": pair.new.body if pair.new else "",
                 "관련 법령 기준": [h.topic for h in hits], "사업장 상시 인원": self.headcount}
        questions = questions_for(pair)
        try:
            answers, usage = self.client.ask(state, questions)
        except Exception as e:  # 호출 실패는 위로 올린다
            return Triage(pair.no, "확인필요", (f"1차 분류 실패: {type(e).__name__}",), True)
        self.usage.add(_UsageView(usage))
        reasons = [f"{q.name} 답 없음" for q in questions if q.name not in answers]
        for name, a in answers.items():
            if a.refused:
                reasons.append(f"{name} 거부")
            elif a.p_yes is not None and a.p_yes >= self.yes_threshold:
                reasons.append(f"{name} {a.p_yes:.2f}")
        kind = answers.get("kind")
        if kind is not None and not kind.refused:
            if kind.choice != "문제없음":
                reasons.append(f"kind {kind.choice}")
            if kind.confidence is None:
                reasons.append("kind confidence 없음")
            elif kind.confidence < self.min_confidence:
                reasons.append(f"kind confidence {kind.confidence:.2f}")
        escalate = bool(reasons) or force_escalate(drops, hits)
        return Triage(pair.no, "확인필요" if escalate else "문제없음", tuple(reasons), escalate)


class _UsageView:
    def __init__(self, d: dict):
        self.input_tokens = d.get("input_tokens", 0) or 0
        self.output_tokens = d.get("output_tokens", 0) or 0
