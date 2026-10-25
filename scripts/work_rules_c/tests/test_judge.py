from work_rules_c.judge import AnthropicJudge, JudgeBackend, JudgeInput, JudgeOut, apply_threshold
from work_rules_c.triage import Triage

from .fakes import FakeClient, changed_pair


def _ok_out(**kw):
    base = dict(result="회사 선택", disadvantage="해당", reason="r", basis="b", ops_note="", proposed_text="p")
    base.update(kw)
    return JudgeOut(**base)


def _input():
    return JudgeInput(changed_pair(), (), (), Triage("제50조", "확인필요", (), True))


def test_protocol_satisfied():
    j = AnthropicJudge(FakeClient(out=_ok_out()))
    assert isinstance(j, JudgeBackend) and j.name == "anthropic:claude-opus-5-5"


def test_model_override_used():
    c = FakeClient(out=_ok_out())
    AnthropicJudge(c, model="claude-sonnet-5-5").judge(_input())
    assert c.last_kwargs["model"] == "claude-sonnet-5-5" and "thinking" not in c.last_kwargs


def test_failure_returns_needs_check():
    out = AnthropicJudge(FakeClient(raises=RuntimeError("x"))).judge(_input())
    assert (out.result, out.disadvantage) == ("추가 확인", "확인 필요")


def test_low_confidence_downgrades():
    assert apply_threshold(_ok_out(confidence=0.5), 0.8).result == "추가 확인"


def test_none_confidence_untouched():
    assert apply_threshold(_ok_out(), 0.8).result == "회사 선택"
