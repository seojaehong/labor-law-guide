import pytest

from work_rules_c import cost
from work_rules_c.triage import Usage


def test_usd_haiku():
    u = Usage("claude-haiku-5-5", input_tokens=1_000_000, output_tokens=1_000_000, cache_read_input_tokens=1_000_000)
    assert cost.usd(u) == pytest.approx(0.10 + 0.50 + 0.01)


def test_usd_jev_input_only():
    assert cost.usd(Usage("jev-latest", input_tokens=1_000_000, output_tokens=500)) == pytest.approx(0.042)


def test_unknown_model_warns_zero():
    with pytest.warns(UserWarning):
        assert cost.usd(Usage("laya")) == 0.0
