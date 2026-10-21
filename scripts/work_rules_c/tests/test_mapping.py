from datetime import date

from work_rules_c.articles import split_articles
from work_rules_c.mapping import hits_by_article, map_rules

RULE = {"lawId": "000130", "article": "제18조의2", "effective": "20250223", "topic": "배우자 출산휴가 20일",
        "required": True, "keywords": ["배우자 출산"], "ok": ["20일"], "stale": ["10일"], "art93": "8"}


def test_rule_found_in_differently_titled_article():
    arts = split_articles("제46조(경조사 휴가) ① 본인 결혼 5일\n② 배우자 출산휴가는 10일로 한다.")
    [h] = map_rules(arts, asof=date(2026, 10, 21), since=date(2023, 1, 1), rules=[RULE])
    assert h.status == "미반영" and h.where.startswith("제46조") and h.stale == ("10일",)


def test_missing_goes_to_new_bucket():
    hits = map_rules(split_articles("제1조(목적) 목적"), date(2026, 10, 21), date(2023, 1, 1), rules=[RULE])
    assert list(hits_by_article(hits)) == ["(신설 필요)"]


def test_since_filters_old_rules():
    assert map_rules(split_articles("제1조(목적) x"), date(2026, 10, 21), date(2025, 3, 1), rules=[RULE]) == []
