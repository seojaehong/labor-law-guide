import re
from pathlib import Path

import anthropic

from work_rules_c import triage
from work_rules_c.quantities import Drop
from work_rules_c.triage import TRIAGE_MODEL, HaikuTriage, TriageBackend, TriageOut, Usage, triage_pair

from .fakes import FakeClient, changed_pair, httpx_request, same_pair


def test_same_pair_skips_api():
    c = FakeClient(fail_if_called=True)
    t = triage_pair(c, same_pair(), [], [], Usage(TRIAGE_MODEL))
    assert t.label == "문제없음" and not t.escalate


def test_clean_label_not_escalated():
    c = FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[]))
    assert not triage_pair(c, changed_pair(), [], [], Usage(TRIAGE_MODEL)).escalate


def test_drop_forces_escalation_even_if_clean():
    c = FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[]))
    t = triage_pair(c, changed_pair(), [Drop("년", 3, 1)], [], Usage(TRIAGE_MODEL))
    assert t.escalate


def test_api_error_escalates():
    c = FakeClient(raises=anthropic.APIConnectionError(request=httpx_request()))
    t = triage_pair(c, changed_pair(), [], [], Usage(TRIAGE_MODEL))
    assert t.escalate and t.label == "확인필요" and "APIConnectionError" in t.reasons[0]


def test_refusal_escalates():
    c = FakeClient(out=None, stop_reason="refusal")
    assert triage_pair(c, changed_pair(), [], [], Usage(TRIAGE_MODEL)).escalate


def test_usage_accumulates():
    u = Usage(TRIAGE_MODEL)
    c = FakeClient(out=TriageOut(label="문제", reasons=["x"], topics=[]), usage=(100, 20, 900))
    triage_pair(c, changed_pair(), [], [], u)
    assert (u.input_tokens, u.output_tokens, u.cache_read_input_tokens) == (100, 20, 900)


def test_system_prompt_has_no_volatile_content():
    s = (Path(triage.__file__).parent / "prompts" / "triage_system.md").read_text(encoding="utf-8")
    assert not re.search(r"20\d\d[-.]\d", s)


def test_haiku_backend_protocol_and_model():
    c = FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[]))
    b = HaikuTriage(c)
    assert isinstance(b, TriageBackend) and b.name == "anthropic:claude-haiku-5-5"
    b.triage(changed_pair(), [], [])
    assert c.last_kwargs["model"] == "claude-haiku-5-5" and c.last_kwargs["output_format"] is TriageOut
    assert c.last_kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
