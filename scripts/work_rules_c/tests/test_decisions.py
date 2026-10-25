from types import SimpleNamespace

from work_rules_c.decisions import DA, DQ, DecisionTriage, JevClient, OpenAIDecisionsClient
from work_rules_c.triage import TriageBackend

from .fakes import changed_pair, new_only_pair

YES_NAMES = ("below_law", "worse_than_old", "hard_to_run")


class FakeDecision:
    """DecisionClient 가짜. p 는 모든 예/아니오 질문 공통 값 또는 {이름: 값}."""

    name = "fake"

    def __init__(self, p=0.0, kind="문제없음", confidence=0.95, refuse=None, raises=None):
        self.p, self.kind, self.confidence, self.refuse, self.raises = p, kind, confidence, refuse, raises
        self.last_questions = []

    def ask(self, state, questions):
        self.last_questions = questions
        if self.raises:
            raise self.raises
        out = {}
        for q in questions:
            if q.name == self.refuse:
                out[q.name] = DA(q.name, None, None, None, refused=True)
            elif q.kind == "yesno":
                p = self.p.get(q.name, 0.0) if isinstance(self.p, dict) else self.p
                out[q.name] = DA(q.name, p, None, None)
            else:
                out[q.name] = DA(q.name, None, self.kind, self.confidence)
        return out, {"input_tokens": 10, "output_tokens": 0}


class FakeOpenAI:
    def __init__(self, answers):
        self.answers, self.last = answers, None
        self.decisions = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.last = kwargs
        return SimpleNamespace(answers=[SimpleNamespace(**a) for a in self.answers],
                               usage=SimpleNamespace(input_tokens=7, output_tokens=0))


def test_jev_request_shape():
    c = JevClient(api_key="k")
    sent = {}

    def post(body):
        sent.update(body)
        return {"answers": {"below_law": {"type": "noul", "noul": 0.1}}, "usage": {"input_tokens": 9, "output_tokens": 1}}

    c._post = post
    ans, usage = c.ask({"개정안": "x"}, [DQ("below_law", "yesno", "q", true="t", false="f")])
    assert sent["questions"]["below_law"] == {"type": "noul", "instructions": "q", "criteria": {"true": "t", "false": "f"}}
    assert sent["model"] == "jev-latest"
    assert ans["below_law"].p_yes == 0.1 and usage["input_tokens"] == 9


def test_jev_choice_shape():
    c = JevClient(api_key="k")
    sent = {}
    c._post = lambda body: (sent.update(body), {"answers": {"kind": {"type": "choice", "choice": "a", "confidence": 0.9}}, "usage": {}})[1]
    ans, _ = c.ask({}, [DQ("kind", "choice", "q", choices=(("a", "A 설명"), ("b", "B 설명")))])
    assert sent["questions"]["kind"] == {"type": "choice", "instructions": "q", "criteria": {"a": "A 설명", "b": "B 설명"}}
    assert (ans["kind"].choice, ans["kind"].confidence) == ("a", 0.9)


def test_openai_request_shape():
    fake = FakeOpenAI(answers=[{"type": "predicate", "name": "below_law", "probability": 0.7}])
    ans, usage = OpenAIDecisionsClient(fake).ask({"개정안": "x"}, [DQ("below_law", "yesno", "q", true="t", false="f")])
    assert fake.last["model"] == "gpt-6-luna" and fake.last["questions"][0]["type"] == "predicate"
    assert ans["below_law"].p_yes == 0.7 and usage["input_tokens"] == 7


def test_openai_refusal_answer_marked():
    fake = FakeOpenAI(answers=[{"type": "refusal", "name": "kind"}])
    ans, _ = OpenAIDecisionsClient(fake).ask({}, [DQ("kind", "choice", "q", choices=(("a", "A"),))])
    assert ans["kind"].refused


def test_openai_refusal_escalates():
    t = DecisionTriage(FakeDecision(refuse="kind")).triage(changed_pair(), [], [])
    assert t.escalate


def test_low_probabilities_clean_not_escalated():
    b = DecisionTriage(FakeDecision(p=0.05, kind="문제없음", confidence=0.95))
    assert isinstance(b, TriageBackend)
    t = b.triage(changed_pair(), [], [])
    assert not t.escalate and t.label == "문제없음"


def test_worse_than_old_over_threshold_escalates():
    t = DecisionTriage(FakeDecision(p={"worse_than_old": 0.4}, kind="문제없음", confidence=0.95)).triage(changed_pair(), [], [])
    assert t.escalate and "worse_than_old" in t.reasons[0]


def test_low_confidence_escalates():
    assert DecisionTriage(FakeDecision(p=0.05, kind="문제없음", confidence=0.6)).triage(changed_pair(), [], []).escalate


def test_new_article_skips_worse_than_old():
    fake = FakeDecision(p=0.05, kind="문제없음", confidence=0.95)
    DecisionTriage(fake).triage(new_only_pair(), [], [])
    names = [q.name for q in fake.last_questions]
    assert "worse_than_old" not in names and "below_law" in names


def test_http_error_escalates():
    t = DecisionTriage(FakeDecision(raises=OSError("timeout"))).triage(changed_pair(), [], [])
    assert t.escalate and t.label == "확인필요"
