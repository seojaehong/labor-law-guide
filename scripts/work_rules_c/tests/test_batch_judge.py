from datetime import date

from work_rules_c.articles import pair_articles, split_articles
from work_rules_c.batch_judge import ArticleFinding, BatchJudge, BatchOut, chunks
from work_rules_c.run import pipeline

from .fakes import FakeClient
from .test_run import NEW, OLD, _meta


def _f(no, result="문제없음", disadvantage="해당 없음"):
    return ArticleFinding(no=no, result=result, disadvantage=disadvantage, reason="r", basis="", ops_note="",
                          proposed_text="")


def _pairs(n):
    return pair_articles([], split_articles("\n".join(f"제{i}조(t{i}) 본문{i}" for i in range(1, n + 1))))


def test_chunks_size():
    assert [len(c) for c in chunks(_pairs(19), 8)] == [8, 8, 3]


def test_one_call_per_chunk_and_clean_dropped():
    c = FakeClient(out=BatchOut(findings=[_f(f"제{i}조") for i in range(1, 9)]))
    out = BatchJudge(c, size=8).judge_all(_pairs(8), {}, {})
    assert c.calls == 1 and out == {}


def test_problem_finding_returned():
    fs = [_f(f"제{i}조") for i in range(1, 4)]
    fs[1] = _f("제2조", result="현행 수정 필요", disadvantage="해당")
    out = BatchJudge(FakeClient(out=BatchOut(findings=fs)), size=8).judge_all(_pairs(3), {}, {})
    assert list(out) == ["제2조"] and out["제2조"].result == "현행 수정 필요"


def test_missing_article_forced_to_check():
    out = BatchJudge(FakeClient(out=BatchOut(findings=[_f("제1조")])), size=8).judge_all(_pairs(3), {}, {})
    assert sorted(out) == ["제2조", "제3조"] and out["제2조"].result == "추가 확인"


class SequenceClient(FakeClient):
    """호출마다 다른 답(또는 예외)을 낸다."""

    def __init__(self, seq):
        super().__init__()
        self.seq = list(seq)
        self.asked = []

    def _parse(self, **kwargs):
        import json
        self.calls += 1
        self.asked.append([a["조문"] for a in json.loads(kwargs["messages"][0]["content"])["조문들"]])
        item = self.seq.pop(0)
        if isinstance(item, Exception):
            raise item
        from types import SimpleNamespace
        return SimpleNamespace(parsed_output=item, stop_reason="end_turn",
                               usage=SimpleNamespace(input_tokens=1, output_tokens=1, cache_read_input_tokens=0,
                                                     cache_creation_input_tokens=0))


def test_missing_articles_retried_once():
    c = SequenceClient([BatchOut(findings=[_f("제1조")]), BatchOut(findings=[_f("제2조"), _f("제3조")])])
    out = BatchJudge(c, size=8).judge_all(_pairs(3), {}, {})
    assert out == {} and c.asked == [["제1조", "제2조", "제3조"], ["제2조", "제3조"]]


def test_failed_chunk_retried_then_marked():
    c = SequenceClient([RuntimeError("x"), RuntimeError("y")])
    out = BatchJudge(c, size=8).judge_all(_pairs(2), {}, {})
    assert c.calls == 2 and sorted(out) == ["제1조", "제2조"]


def test_call_failure_marks_whole_chunk():
    out = BatchJudge(FakeClient(raises=RuntimeError("x")), size=8).judge_all(_pairs(3), {}, {})
    assert sorted(out) == ["제1조", "제2조", "제3조"]


def test_default_model_sonnet_and_cache():
    c = FakeClient(out=BatchOut(findings=[_f("제1조")]))
    BatchJudge(c).judge_all(_pairs(1), {}, {})
    assert c.last_kwargs["model"] == "claude-sonnet-5-5"
    assert c.last_kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_pipeline_batch_mode_rows():
    fs = [_f("제7조"), _f("제46조"), _f("제50조", result="회사 선택", disadvantage="해당")]
    c = FakeClient(out=BatchOut(findings=fs))
    rows, rep = pipeline(NEW, OLD, date(2026, 10, 21), date(2023, 1, 1), None, BatchJudge(c), _meta(), rules=[])
    assert [r["조문"] for r in rows] == ["제50조"] and rows[0]["불이익변경"] == "해당"
    assert rep["triage"]["backend"] == "none" and c.calls == 1
