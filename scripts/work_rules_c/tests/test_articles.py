from work_rules_c.articles import pair_articles, split_articles


def test_split_basic():
    t = "제1조(목적) 이 규칙은...\n제2조(적용) ① 근로자에게 적용한다.\n② 예외는 없다."
    arts = split_articles(t)
    assert [a.no for a in arts] == ["제1조", "제2조"]
    assert arts[1].title == "적용" and "② 예외는 없다." in arts[1].body


def test_supplementary_does_not_override_body():
    t = "제1조(목적) 본칙 목적\n부 칙\n제1조(시행일) 2026년부터 시행"
    assert split_articles(t)[0].body.startswith("본칙 목적")
    assert len(split_articles(t)) == 1


def test_toc_then_body_uses_body():
    t = "제1조(목적)\n제2조(적용)\n제1조(목적) 실제 본문\n제2조(적용) 실제 적용"
    assert split_articles(t)[0].body == "실제 본문"


def test_page_markers_ignored():
    old = split_articles("제7조(금지) 강요하지 못한다.\n- 7 -")
    new = split_articles("제7조(금지) 강요하지 못한다.")
    assert pair_articles(old, new)[0].status == "동일"


def test_inline_page_marker_at_line_end_ignored():
    old = split_articles("제7조(금지) ① 강요하지 못한다.  - 7 -\n② 저축을 강제하지 못한다.")
    new = split_articles("제7조(금지) ① 강요하지 못한다.\n② 저축을 강제하지 못한다.")
    assert pair_articles(old, new)[0].status == "동일"


def test_pair_statuses_and_order():
    old = split_articles("제26조(육아휴직) A\n제27조(가족돌봄) B")
    new = split_articles("제26조(육아휴직) A2\n제26조의2(단기 육아휴직) C\n제27조(가족돌봄) B")
    got = [(p.no, p.status) for p in pair_articles(old, new)]
    assert got == [("제26조", "변경"), ("제26조의2", "신설"), ("제27조", "동일")]
