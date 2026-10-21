import subprocess
import sys
from datetime import date
from pathlib import Path

from work_rules_c.judge import JudgeOut
from work_rules_c.run import pipeline
from work_rules_c.triage import HaikuTriage, TriageOut, Usage

from .fakes import FakeClient

RUN = str(Path(__file__).resolve().parents[1] / "run.py")

OLD = "\n".join([
    "제7조(강제 근로의 금지) 강요하지 못한다.",
    "제46조(경조사 휴가) ② 배우자 출산휴가는 10일로 한다.",
    "제50조(육아기 근로시간 단축) ④ 단축 기간은 최대 3년 이내로 한다.",
])
NEW = "\n".join([
    "제7조(강제 근로의 금지) 강요하지 못한다.",
    "제46조(경조사 휴가) ② 배우자 출산전후휴가는 20일로 한다.",
    "제50조(육아기 근로시간 단축) ③ 단축 기간은 1년 이내로 한다.",
])


class RecordingJudge:
    name = "recording"

    def __init__(self):
        self.seen = []
        self.usage = Usage("claude-opus-5-5")

    def judge(self, item):
        self.seen.append(item.pair.no)
        return JudgeOut(result="회사 선택", disadvantage="해당", reason="r", basis="", ops_note="", proposed_text="",
                        confidence=0.5)


def _meta():
    return {"사업장": "가상", "작성일": "2026-10-21", "점검 기간": "x", "기준 자료": "y"}


def _clean():
    return TriageOut(label="문제없음", reasons=[], topics=[])


def test_pipeline_only_escalated_reach_judge():
    judge = RecordingJudge()
    rows, c = pipeline(NEW, OLD, date(2026, 10, 21), date(2023, 1, 1), HaikuTriage(FakeClient(out=_clean())), judge,
                       _meta(), rules=[])
    assert judge.seen == ["제50조"]
    assert c["escalated"] == 1 and c["articles"] == 3
    assert set(c) >= {"triage", "judge", "total_usd"}


def test_pipeline_applies_min_confidence():
    rows, _ = pipeline(NEW, OLD, date(2026, 10, 21), date(2023, 1, 1), HaikuTriage(FakeClient(out=_clean())),
                       RecordingJudge(), _meta(), rules=[], min_confidence=0.8)
    assert rows[0]["점검 결과"] == "추가 확인"


def test_pipeline_without_old_marks_all_new():
    judge = RecordingJudge()
    _, c = pipeline(NEW, None, date(2026, 10, 21), date(2023, 1, 1),
                    HaikuTriage(FakeClient(out=TriageOut(label="확인필요", reasons=[], topics=[]))), judge, _meta(),
                    rules=[])
    assert judge.seen == ["제7조", "제46조", "제50조"]


def test_bad_asof_exits_2(tmp_path):
    f = tmp_path / "rules.txt"
    f.write_text(NEW, encoding="utf-8")
    r = subprocess.run([sys.executable, RUN, "--rules", str(f), "--asof", "2026/10/21", "--since", "2023-01-01",
                        "--out", str(tmp_path), "--triage", "haiku"], capture_output=True)
    assert r.returncode == 2


def test_missing_key_exits_2(tmp_path):
    f = tmp_path / "rules.txt"
    f.write_text(NEW, encoding="utf-8")
    env = {k: v for k, v in __import__("os").environ.items() if k != "TYPESAFE_API_KEY"}
    r = subprocess.run([sys.executable, RUN, "--rules", str(f), "--asof", "2026-10-21", "--since", "2023-01-01",
                        "--out", str(tmp_path), "--triage", "jev"], capture_output=True, env=env)
    assert r.returncode == 2 and b"TYPESAFE_API_KEY" in r.stderr
