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


def test_duplicate_number_keeps_both():
    """번호가 두 번 나오면 뒤 조문이 앞 조문을 덮어쓰지 않는다(2026-10-22 강동 제55조)."""
    t = "제55조(예방교육) 연 1회 교육한다.\n제55조(예방·대응조직) 담당자를 둔다.\n제56조(접수) 신고한다."
    arts = split_articles(t)
    assert [a.no for a in arts] == ["제55조", "제55조(번호 중복)", "제56조"]
    assert arts[0].body == "연 1회 교육한다." and arts[1].title == "예방·대응조직"


def test_same_title_repeat_is_not_duplicate():
    """목차 항목에 군더더기 줄이 붙어도, 제목이 같은 본문 조문은 번호 중복이 아니다(2026-10-22 드리븐 종전 제32조)."""
    t = "제32조(대기발령)\n(인사)\n제32조(대기발령) ① 대기발령할 수 있다."
    arts = split_articles(t)
    assert [(a.no, a.body) for a in arts] == [("제32조", "① 대기발령할 수 있다.")]


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


def test_three_duplicate_numbers_keep_all_bodies():
    from work_rules_c.articles import split_articles, duplicated
    a = split_articles('제55조(교육) 교육한다.\n제55조(조직) 조직한다.\n제55조(접수) 접수한다.')
    assert [x.body for x in a] == ['교육한다.', '조직한다.', '접수한다.']
    assert len(duplicated(x.no for x in a)) == 3



def test_hwpx_nested_paragraphs_preserve_tail_exceptions_and_section_order(tmp_path):
    import zipfile
    from work_rules_c.articles import read_text
    path = tmp_path / "synthetic.hwpx"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("Contents/section10.xml", '<hp:p xmlns:hp="urn:test"><hp:t>제3조(합성) 마지막</hp:t></hp:p>')
        z.writestr("Contents/section2.xml", '<hp:p xmlns:hp="urn:test"><hp:t>제1조(합성) 원칙</hp:t><hp:tbl><hp:p><hp:t>중첩 &amp; 예외</hp:t></hp:p></hp:tbl><hp:t>다만, 표 뒤 예외는 보존한다.</hp:t></hp:p>')
    text = read_text(path)
    assert text == '제1조(합성) 원칙\n중첩 & 예외\n다만, 표 뒤 예외는 보존한다.\n제3조(합성) 마지막'
    assert split_articles(text)[0].body.endswith('다만, 표 뒤 예외는 보존한다.')
