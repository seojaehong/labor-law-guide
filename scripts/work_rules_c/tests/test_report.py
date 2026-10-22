import json
import re
from datetime import date

from work_rules_c.judge import JudgeOut
from work_rules_c.mapping import RuleHit
from work_rules_c.quantities import Drop
from work_rules_c.report import build_rows, write_outputs
from work_rules_c.triage import Triage

from .fakes import changed_pair, same_pair


def _triage(escalate=True):
    return Triage("제50조", "확인필요" if escalate else "문제없음", (), escalate)


def _judge_out():
    return JudgeOut(result="회사 선택", disadvantage="해당", reason="종전 3년이 1년으로 줄었다.",
                    basis="남녀고용평등법 제19조의2 제4항", ops_note="", proposed_text="문안")


def _hit(status="미반영"):
    return RuleHit("배우자 출산휴가 20일", "000130", "제18조의2", date(2025, 2, 23), True, status,
                   None if status == "누락" else "제46조(경조사 휴가)", (), ())


def _meta():
    return {"사업장": "가상 회사", "작성일": "2026-10-21", "점검 기간": "2023-01-01 ~ 2026-10-21", "기준 자료": "표준취업규칙 2026"}


def test_row_keys_exact():
    rows = build_rows([changed_pair()], {}, {}, {"제50조": _triage(escalate=True)}, {"제50조": _judge_out()})
    assert list(rows[0]) == ["조문", "현행", "개정안", "개정 사유", "근거·시행일", "불이익변경", "점검 결과", "운영 메모", "제안 문안"]
    assert rows[0]["불이익변경"] == "해당" and rows[0]["점검 결과"] == "회사 선택"


def test_unjudged_drop_marks_check_needed():
    rows = build_rows([changed_pair()], {"제50조": [Drop("년", 3, 1)]}, {}, {"제50조": _triage(escalate=True)}, {})
    assert rows[0]["점검 결과"] == "추가 확인" and rows[0]["불이익변경"] == "확인 필요"


def test_new_required_row_appended():
    rows = build_rows([], {}, {"(신설 필요)": [_hit(status="누락")]}, {}, {})
    assert rows[0]["조문"] == "신설 필요" and rows[0]["근거·시행일"] == "제18조의2 (2025.02.23. 시행)"


def test_unescalated_rows_dropped():
    rows = build_rows([same_pair(), changed_pair()], {}, {}, {"제50조": _triage(escalate=False)}, {})
    assert rows == []


def test_outputs_have_no_forbidden_words(tmp_path):
    rows = build_rows([changed_pair()], {}, {"제50조": [_hit()]}, {"제50조": _triage()}, {"제50조": _judge_out()})
    j, m = write_outputs(rows, _meta(), tmp_path)
    text = j.read_text(encoding="utf-8") + m.read_text(encoding="utf-8")
    assert not re.search(r"판정|자문|상담|진단|확률|정확도", text)
    assert json.loads(j.read_text(encoding="utf-8"))["schema"] == "comparison.v1"
