import json
import subprocess
import sys
from pathlib import Path

from work_rules_c.eval import evaluate

EVAL = str(Path(__file__).resolve().parents[1] / "eval.py")


def test_found_and_missed():
    pred = {"rows": [{"조문": "제50조", "불이익변경": "해당", "점검 결과": "회사 선택"}]}
    gold = {"case": "t", "items": [{"조문": "제50조", "불이익변경": "해당"}, {"조문": "제26조", "점검 결과": "현행 수정 필요"}]}
    r = evaluate(pred, gold)
    assert (r["found"], r["missed"]) == (1, ["제26조"])


def test_disadvantage_missed_listed():
    pred = {"rows": [{"조문": "제50조", "불이익변경": "해당 없음"}]}
    gold = {"case": "t", "items": [{"조문": "제50조", "불이익변경": "해당"}]}
    assert evaluate(pred, gold)["disadvantage_missed"] == ["제50조"]


def test_cli_exit_1_on_miss(tmp_path):
    p, g = tmp_path / "p.json", tmp_path / "g.json"
    p.write_text(json.dumps({"rows": []}), encoding="utf-8")
    g.write_text(json.dumps({"case": "t", "items": [{"조문": "제1조"}]}), encoding="utf-8")
    r = subprocess.run([sys.executable, EVAL, "--pred", str(p), "--gold", str(g)], capture_output=True)
    assert r.returncode == 1 and json.loads(r.stdout)["missed"] == ["제1조"]


def test_offline_comparison_reports_added_value_and_false_alarms():
    from work_rules_c.eval import compare_baselines
    gold = {"case": "synthetic-routing-not-legal-gold", "items": [{"조문": "제1조"}, {"조문": "제2조"}],
            "negatives": [{"조문": "제3조", "점검 결과": "현행 수정 필요"}]}
    baseline = {"rows": [{"조문": "제1조"}]}
    augmented = {"rows": [{"조문": "제2조"}, {"조문": "제3조", "점검 결과": "현행 수정 필요"}, {"조문": "제4조"}]}
    r = compare_baselines(baseline, augmented, gold)
    assert r["recovered"] == ["제2조"]
    assert r["regressed"] == ["제1조"]
    assert r["added_false_alarms"] == ["제3조"]
    assert r["rules_plus_ai"]["unlabelled"] == ["제4조"]
    assert r["legal_accuracy_proven"] is False
