"""최종 리뷰 지적(2026-10-21)을 재현하는 회귀 테스트."""
from datetime import date

import pytest

from work_rules_c.articles import pair_articles, split_articles
from work_rules_c.decisions import DA, DecisionTriage
from work_rules_c.judge import JudgeOut
from work_rules_c.mapping import NEW_BUCKET, RuleHit
from work_rules_c.quantities import Drop, quantity_drops
from work_rules_c.report import build_rows
from work_rules_c.run import pipeline
from work_rules_c.triage import HaikuTriage, Triage, TriageOut, Usage

from .fakes import FakeClient, changed_pair, same_pair
from .test_run import RecordingJudge, _meta


def _clean_haiku():
    return HaikuTriage(FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[])))


# Critical 1 — 삭제 조문
def test_deleted_article_gets_row():
    old = "제1조(목적) 목적\n제3조(경조사휴가) 본인 결혼 5일."
    new = "제1조(목적) 목적"
    rows, c = pipeline(new, old, date(2026, 10, 21), date(2023, 1, 1), _clean_haiku(), RecordingJudge(), _meta(),
                       rules=[], min_confidence=0.0)
    row = next(r for r in rows if r["조문"] == "제3조")
    assert row["개정안"] == "" and row["불이익변경"] != "해당 없음"
    assert c["articles"] == 2


# Critical 2 — 번호가 밀린 조문
def test_renumbered_article_paired_by_title():
    old = split_articles("제2조(휴직) 단축은 총 3년으로 한다.\n제3조(경조사휴가) 결혼 5일.")
    new = split_articles("제2조(교육) 연 1회 교육한다.\n제3조(휴직) 단축은 1년 이내로 한다.\n제4조(경조사휴가) 결혼 5일.")
    pairs = {p.no: p for p in pair_articles(old, new)}
    assert pairs["제3조"].old.title == "휴직" and pairs["제3조"].old_no == "제2조"
    assert quantity_drops(pairs["제3조"]) == [Drop("년", 3, 1)]
    assert pairs["제4조"].status == "동일" and pairs["제2조"].status == "신설"


# Critical 3 — 다양한 부칙 머리
@pytest.mark.parametrize("stop", ["부칙 <2026. 1. 1.>", "부칙(2026.1.1.)", "부칙 (제정 2020.1.1)", "附則",
                                  "[별표 1] 징계 양정", "【별지 1】 출석통지서", "별지 제1호 서식"])
def test_supplementary_variants_stop(stop):
    arts = split_articles(f"제1조(목적) 본칙 목적\n제2조(적용범위) 정규직에 적용\n{stop}\n제1조(시행일) 시행\n제2조(경과조치) 경과")
    assert [a.body for a in arts] == ["본칙 목적", "정규직에 적용"]


def test_supplementary_heading_inline_stops():
    arts = split_articles("제1조(목적) 본칙 목적\n부칙 제1조(시행일) 2026년부터 시행")
    assert [(a.no, a.body) for a in arts] == [("제1조", "본칙 목적")]


# Critical 4 — 목차에 부칙이 있다
def test_toc_listing_supplementary_does_not_stop_body():
    t = "목 차\n제1조(목적)\n제2조(적용범위)\n부칙\n제1조(목적) 실제 목적\n제2조(적용범위) 실제 범위\n부 칙\n제1조(시행일) 시행"
    assert [a.body for a in split_articles(t)] == ["실제 목적", "실제 범위"]


def test_pipeline_refuses_empty_document():
    with pytest.raises(ValueError):
        pipeline("목 차\n제1조(목적)\n제2조(적용)", None, date(2026, 10, 21), date(2023, 1, 1), _clean_haiku(),
                 RecordingJudge(), _meta(), rules=[])


# Critical 5 — 괄호 아닌 조 머리
def test_lenticular_bracket_heading():
    arts = split_articles("제1조【목적】 목적\n제2조【적용】 적용")
    assert [(a.no, a.title) for a in arts] == [("제1조", "목적"), ("제2조", "적용")]


def test_heading_without_brackets():
    arts = split_articles("제1조 이 규칙은 목적을 정한다.\n제2조 배우자 출산휴가는 10일로 한다.")
    assert [a.no for a in arts] == ["제1조", "제2조"] and arts[1].body.startswith("배우자")


def test_body_reference_is_not_a_heading():
    arts = split_articles("제1조(목적) 목적\n제3조에 따라 정한다.")
    assert len(arts) == 1 and "제3조에 따라" in arts[0].body


def test_orphan_hit_goes_to_new_bucket():
    rule = {"lawId": "000130", "article": "제18조의2", "effective": "20250223", "topic": "배우자 출산휴가 20일",
            "required": True, "keywords": ["배우자 출산"], "ok": ["20일"], "stale": ["10일"], "art93": "8"}
    rows, _ = pipeline("제1조(목적) 목적\n② 배우자 출산휴가는 10일, 제9조 참조", None, date(2026, 10, 21),
                       date(2023, 1, 1), _clean_haiku(), RecordingJudge(), _meta(), rules=[rule], min_confidence=0.0)
    assert any("배우자 출산휴가" in r["개정 사유"] or r["조문"] == "제1조" for r in rows)


# Important 6 — 판단 모델의 일부 답 누락
class PartialDecision:
    name = "fake"

    def __init__(self, answers):
        self.answers = answers

    def ask(self, state, questions):
        return self.answers, {"input_tokens": 1}


def test_partial_answer_escalates():
    b = DecisionTriage(PartialDecision({"kind": DA("kind", None, "문제없음", 0.95)}))
    assert b.triage(changed_pair(), [], []).escalate


def test_kind_without_confidence_escalates():
    answers = {n: DA(n, 0.01, None, None) for n in ("below_law", "worse_than_old", "hard_to_run")}
    answers["kind"] = DA("kind", None, "문제없음", None)
    assert DecisionTriage(PartialDecision(answers)).triage(changed_pair(), [], []).escalate


# Important 7 — 수치 비교
def _pair(old, new):
    return pair_articles(split_articles(f"제50조(단축) {old}"), split_articles(f"제50조(단축) {new}"))[0]


def test_second_value_drop_detected():
    assert quantity_drops(_pair("총 3년, 근속 10년", "1년 이내, 근속 10년"))


def test_lost_unit_is_drop():
    assert quantity_drops(_pair("휴가 30일을 준다.", "회사가 정하는 기간의 휴가를 준다."))


def test_unit_conversion_drop():
    assert quantity_drops(_pair("휴직 기간은 1년", "휴직 기간은 6개월"))


def test_unit_conversion_increase_not_flagged():
    assert quantity_drops(_pair("휴직 기간은 6개월", "휴직 기간은 1년")) == []


# Important 8 — 판단이 하락 신호를 지우지 못한다
def test_judge_cannot_erase_drop():
    j = JudgeOut(result="회사 선택", disadvantage="해당 없음", reason="r", basis="", ops_note="", proposed_text="")
    rows = build_rows([changed_pair()], {"제50조": [Drop("년", 3, 1)]}, {}, {"제50조": Triage("제50조", "확인필요", (), True)},
                      {"제50조": j})
    assert rows[0]["불이익변경"] == "확인 필요" and "3" in rows[0]["운영 메모"]


# Important 9 — 바뀌지 않은 조문도 점검한다
def test_unchanged_article_is_checked():
    c = FakeClient(out=TriageOut(label="문제", reasons=["x"], topics=[]))
    t = HaikuTriage(c).triage(same_pair(), [], [])
    assert c.calls == 1 and t.escalate


# Important 10 — 금지어·확률이 산출물로 새지 않는다
def test_forbidden_words_scrubbed_from_rows():
    j = JudgeOut(result="회사 선택", disadvantage="해당", reason="노무사 판정과 자문이 필요하다. 확률 0.72",
                 basis="", ops_note="상담 권장", proposed_text="")
    rows = build_rows([changed_pair()], {}, {}, {"제50조": Triage("제50조", "확인필요", (), True)}, {"제50조": j})
    text = rows[0]["개정 사유"] + rows[0]["운영 메모"]
    for w in ("판정", "자문", "상담", "확률"):
        assert w not in text


def test_judge_payload_has_no_probabilities():
    from work_rules_c.judge import AnthropicJudge, JudgeInput
    c = FakeClient(out=JudgeOut(result="회사 선택", disadvantage="해당", reason="", basis="", ops_note="", proposed_text=""))
    AnthropicJudge(c).judge(JudgeInput(changed_pair(), (), (), Triage("제50조", "확인필요", ("worse_than_old 0.72",), True)))
    assert "0.72" not in c.last_kwargs["messages"][0]["content"]
