"""API 를 부르지 않는 가짜 클라이언트와 조문 쌍 도우미."""
from types import SimpleNamespace

import httpx

from work_rules_c.articles import pair_articles, split_articles


def httpx_request():
    return httpx.Request("POST", "https://x")


class FakeClient:
    """anthropic.Anthropic 의 messages.parse 만 흉내 낸다."""

    def __init__(self, out=None, stop_reason="end_turn", raises=None, usage=(0, 0, 0), fail_if_called=False):
        self.out, self.stop_reason, self.raises = out, stop_reason, raises
        self.usage, self.fail_if_called = usage, fail_if_called
        self.last_kwargs = None
        self.calls = 0
        self.messages = SimpleNamespace(parse=self._parse)

    def _parse(self, **kwargs):
        if self.fail_if_called:
            raise AssertionError("API 를 부르면 안 된다")
        self.calls += 1
        self.last_kwargs = kwargs
        if self.raises:
            raise self.raises
        i, o, cr = self.usage
        return SimpleNamespace(
            parsed_output=self.out, stop_reason=self.stop_reason,
            usage=SimpleNamespace(input_tokens=i, output_tokens=o, cache_read_input_tokens=cr,
                                  cache_creation_input_tokens=0),
        )


def same_pair():
    a = split_articles("제7조(금지) 강요하지 못한다.")
    return pair_articles(a, a)[0]


def changed_pair():
    o = split_articles("제50조(육아기 근로시간 단축) 단축 기간은 최대 3년 이내로 한다.")
    n = split_articles("제50조(육아기 근로시간 단축) 기간은 1년 이내로 한다.")
    return pair_articles(o, n)[0]


def new_only_pair():
    return pair_articles([], split_articles("제26조의2(단기 육아휴직) 1주 또는 2주로 한다."))[0]
