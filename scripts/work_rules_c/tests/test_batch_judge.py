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


class FakeBatchClient(SequenceClient):
    """messages.batches 만 흉내 낸다. results 는 custom_id → BatchOut | 'errored'."""

    def __init__(self, results, retry_seq=()):
        super().__init__(retry_seq)
        from types import SimpleNamespace
        self.results_map, self.created = results, None
        self.messages.batches = SimpleNamespace(create=self._create, retrieve=self._retrieve, results=self._results)

    def _create(self, requests):
        from types import SimpleNamespace
        self.created = requests
        return SimpleNamespace(id="b1", processing_status="in_progress")

    def _retrieve(self, bid):
        from types import SimpleNamespace
        return SimpleNamespace(id=bid, processing_status="ended")

    def _results(self, bid):
        from types import SimpleNamespace
        for cid, out in self.results_map.items():
            if out == "errored":
                yield SimpleNamespace(custom_id=cid, result=SimpleNamespace(type="errored"))
                continue
            msg = SimpleNamespace(content=[SimpleNamespace(type="text", text=out.model_dump_json())],
                                  usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0,
                                                        cache_creation_input_tokens=0))
            yield SimpleNamespace(custom_id=cid, result=SimpleNamespace(type="succeeded", message=msg))


def test_batch_api_submits_all_chunks_once():
    c = FakeBatchClient({"r0c0": BatchOut(findings=[_f(f"제{i}조") for i in range(1, 9)]),
                         "r0c1": BatchOut(findings=[_f("제9조", result="현행 수정 필요")])})
    out = BatchJudge(c, size=8, use_batch_api=True, poll=0).judge_all(_pairs(9), {}, {})
    assert len(c.created) == 2 and c.calls == 0 and list(out) == ["제9조"]
    fmt = c.created[0]["params"]["output_config"]["format"]
    assert fmt["type"] == "json_schema" and "findings" in fmt["schema"]["properties"]
    assert c.created[0]["params"]["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_batch_api_errored_chunk_retried_sync():
    c = FakeBatchClient({"r0c0": "errored"}, retry_seq=[BatchOut(findings=[_f("제1조"), _f("제2조")])])
    out = BatchJudge(c, size=8, use_batch_api=True, poll=0).judge_all(_pairs(2), {}, {})
    assert out == {} and c.asked == [["제1조", "제2조"]]


def test_batch_api_usage_priced_as_batch():
    from work_rules_c import cost
    c = FakeBatchClient({"r0c0": BatchOut(findings=[_f("제1조")])})
    j = BatchJudge(c, size=8, use_batch_api=True, poll=0)
    j.judge_all(_pairs(1), {}, {})
    assert j.usage.model == "claude-sonnet-5-5-batch" and cost.usd(j.usage) > 0


def test_call_failure_marks_whole_chunk():
    out = BatchJudge(FakeClient(raises=RuntimeError("x")), size=8).judge_all(_pairs(3), {}, {})
    assert sorted(out) == ["제1조", "제2조", "제3조"]


def test_default_model_sonnet_and_cache():
    c = FakeClient(out=BatchOut(findings=[_f("제1조")]))
    BatchJudge(c).judge_all(_pairs(1), {}, {})
    assert c.last_kwargs["model"] == "claude-sonnet-5-5"
    assert c.last_kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}


class SlowClient(FakeClient):
    """호출마다 잠깐 멈춘다 — 동시에 몇 개가 떠 있었는지 센다."""

    def __init__(self, out, wait=0.05):
        super().__init__(out=out)
        import threading
        self.wait, self.live, self.peak, self.lock = wait, 0, 0, threading.Lock()

    def _parse(self, **kwargs):
        import time
        with self.lock:
            self.live += 1
            self.peak = max(self.peak, self.live)
        time.sleep(self.wait)
        with self.lock:
            self.live -= 1
            return super()._parse(**kwargs)


def test_chunks_sent_in_parallel():
    c = SlowClient(BatchOut(findings=[]))
    BatchJudge(c, size=2, workers=4, runs=1).judge_all(_pairs(8), {}, {})
    assert c.peak > 1


def test_runs_union_keeps_finding_from_either_run():
    """1회차는 제2조를 놓치고 2회차는 잡는다 — 합집합이면 남는다."""
    clean = BatchOut(findings=[_f("제1조"), _f("제2조")])
    hit = BatchOut(findings=[_f("제1조"), _f("제2조", result="현행 수정 필요", disadvantage="확인 필요")])
    c = SequenceClient([clean, hit])
    j = BatchJudge(c, size=8, runs=2, workers=1)
    out = j.judge_all(_pairs(2), {}, {})
    assert c.calls == 2 and list(out) == ["제2조"] and out["제2조"].result == "현행 수정 필요"


def test_runs_union_takes_stronger_result_and_disadvantage():
    a = BatchOut(findings=[_f("제1조", result="추가 확인", disadvantage="해당")])
    b = BatchOut(findings=[_f("제1조", result="현행 수정 필요", disadvantage="해당 없음")])
    out = BatchJudge(SequenceClient([a, b]), size=8, runs=2, workers=1).judge_all(_pairs(1), {}, {})
    assert out["제1조"].result == "현행 수정 필요" and out["제1조"].disadvantage == "해당"


def test_runs_retry_only_when_no_run_answered():
    """한 회차라도 답했으면 재질문하지 않는다."""
    c = SequenceClient([BatchOut(findings=[_f("제1조")]), RuntimeError("x")])
    out = BatchJudge(c, size=8, runs=2, workers=1).judge_all(_pairs(1), {}, {})
    assert out == {} and c.calls == 2


def test_batch_api_runs_in_one_batch():
    c = FakeBatchClient({"r0c0": BatchOut(findings=[_f("제1조")]),
                         "r1c0": BatchOut(findings=[_f("제1조", result="회사 선택")])})
    out = BatchJudge(c, size=8, use_batch_api=True, poll=0, runs=2).judge_all(_pairs(1), {}, {})
    assert len(c.created) == 2 and c.calls == 0 and out["제1조"].result == "회사 선택"


def test_pipeline_batch_mode_rows():
    fs = [_f("제7조"), _f("제46조"), _f("제50조", result="회사 선택", disadvantage="해당")]
    c = FakeClient(out=BatchOut(findings=fs))
    rows, rep = pipeline(NEW, OLD, date(2026, 10, 21), date(2023, 1, 1), None, BatchJudge(c), _meta(), rules=[])
    assert [r["조문"] for r in rows] == ["제50조"] and rows[0]["불이익변경"] == "해당"
    assert rep["triage"]["backend"] == "none" and c.calls == 1


def test_pipeline_flags_duplicate_numbers_even_if_clean():
    text = "제55조(예방교육) 연 1회 교육한다.\n제55조(예방·대응조직) 담당자를 둔다.\n제56조(접수) 신고한다."
    c = FakeClient(out=BatchOut(findings=[_f("제55조"), _f("제55조(번호 중복)"), _f("제56조")]))
    rows, _ = pipeline(text, None, date(2026, 10, 21), date(2023, 1, 1), None, BatchJudge(c), _meta(), rules=[])
    assert [r["조문"] for r in rows] == ["제55조", "제55조(번호 중복)"]
    assert all("조문 번호 중복" in r["운영 메모"] for r in rows)
    assert all(r["점검 결과"] == "현행 수정 필요" for r in rows)


def test_headcount_in_body():
    import json
    c = FakeClient(out=BatchOut(findings=[_f("제1조")]))
    BatchJudge(c, headcount="24").judge_all(_pairs(1), {}, {})
    assert json.loads(c.last_kwargs["messages"][0]["content"])["사업장 상시 인원"] == "24"
