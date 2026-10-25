from work_rules_c.articles import pair_articles, split_articles
from work_rules_c.quantities import Drop, extract_quantities, quantity_drops


def _pair(old, new):
    o, n = split_articles(f"제50조(단축) {old}"), split_articles(f"제50조(단축) {new}")
    return pair_articles(o, n)[0]


def test_extract_skips_article_refs():
    q = extract_quantities("제3조제1항에 따라 연간 6일, 최초 2일은 유급")
    assert [(x.value, x.unit) for x in q] == [(6, "일"), (2, "일")]


def test_extract_percent_forms():
    q = extract_quantities("통상임금의 100분의 50 이상, 평균임금 70퍼센트")
    assert {(x.value, x.unit) for x in q} == {(50, "%"), (70, "%")}


def test_drop_detected():
    p = _pair("단축 기간은 최대 3년 이내로 한다.", "기간은 1년 이내로 하되 미사용 기간의 두 배를 가산할 수 있다.")
    assert quantity_drops(p) == [Drop(unit="년", old_max=3, new_max=1)]


def test_increase_not_flagged():
    p = _pair("배우자 출산휴가 10일", "배우자 출산전후휴가 20일")
    assert quantity_drops(p) == []
