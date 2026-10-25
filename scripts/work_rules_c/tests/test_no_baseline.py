"""종전 규칙 미제공 ≠ 불이익변경 없음 (PR #72 검토 의견). TS 쪽 tests/unit/laws-precise.test.ts 와 같은 사례."""
from datetime import date
from pathlib import Path

from work_rules_c.batch_judge import ArticleFinding, merge
from work_rules_c.judge import NO_BASELINE, JudgeOut
from work_rules_c.mapping import RuleHit
from work_rules_c.report import build_rows, disadvantage_of
from work_rules_c.triage import Triage

from .fakes import changed_pair

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"


def _j(disadvantage):
    return JudgeOut(result="회사 선택", disadvantage=disadvantage, reason="r", basis="", ops_note="", proposed_text="")


def _f(disadvantage):
    return ArticleFinding(no="제1조", result="회사 선택", disadvantage=disadvantage, reason="r", basis="", ops_note="",
                          proposed_text="")


def test_without_old_is_no_baseline_even_if_judge_says_none():
    rows = build_rows([changed_pair()], {}, {}, {"제50조": Triage("제50조", "확인필요", (), True)},
                      {"제50조": _j("해당 없음")}, has_old=False)
    assert rows[0]["불이익변경"] == NO_BASELINE


def test_new_bucket_without_old_is_no_baseline():
    hit = RuleHit("배우자 출산휴가 20일", "000130", "제18조의2", date(2025, 2, 23), True, "누락", None, (), ())
    assert build_rows([], {}, {"(신설 필요)": [hit]}, {}, {}, has_old=False)[0]["불이익변경"] == NO_BASELINE
    assert build_rows([], {}, {"(신설 필요)": [hit]}, {}, {})[0]["불이익변경"] == "해당 없음"


def test_disadvantage_of_cases():
    assert disadvantage_of(_j("해당"), True, False) == NO_BASELINE
    assert disadvantage_of(None, False, False) == NO_BASELINE
    assert disadvantage_of(None, False, True) == "해당 없음"
    assert disadvantage_of(_j("비교 불가"), False, True) == "확인 필요"  # 종전은 있는데 짝 없는 조문
    assert disadvantage_of(_j("해당 없음"), True, True) == "확인 필요"
    assert disadvantage_of(_j("해당"), False, True) == "해당"  # 종전 있는 점검의 새 조문 「해당」은 그대로


def test_merge_no_baseline_not_erased_by_none():
    assert merge([_f("해당 없음"), _f("비교 불가")]).disadvantage == "비교 불가"
    assert merge([_f("비교 불가"), _f("확인 필요")]).disadvantage == "확인 필요"


def test_prompts_separate_no_baseline():
    for name in ("batch_system.md", "judge_system.md"):
        text = (PROMPTS / name).read_text(encoding="utf-8")
        assert "- 비교 불가:" in text
        assert "종전 규정이 없는 점검이면 해당 없음" not in text
        assert "새로 생긴 조문이라도 새 의무·제재·공제처럼 근로조건을 낮추는 내용을 담고 있으면 해당이다" in text
        assert "종전 규칙이 없는 점검에서는 불리해졌다·저하·낮아졌다처럼 종전과 비교하는 말을 쓰지 말고 현행 법령 기준과의 차이로만 적는다" in text
