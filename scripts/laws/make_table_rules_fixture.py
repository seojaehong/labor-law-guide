# 합성 픽스처 tests/fixtures/laws/table-rules.hwp(x) 를 만든다. 고객 문서가 아니다.
# 본문 대부분이 표 셀 안에 있는 취업규칙(바깥 1x1 틀 표 + 셀 안 중첩 표) + 표 밖 본문 조문 + 부칙 제1조.
# 조문 머리 「제N조(제목)」 은 굵은 12pt, 본문은 보통 10pt 로 런을 나눈다(머리 굵은 글씨 상속 시험용).
# rhwp 0.8.7 의 getTextFileText 는 둘째 구역부터 표 셀 글자를 내지 않는다(실제 회사 규칙 2건에서 118자·19조만 나온 결함).
# 그 조건을 재현하려고 구역을 둘로 나눈다(구역 0 = 제목, 구역 1 = 틀 표·본문). hwp 는 rhwp convert 로 만든다.
#
# 사용: RHWP=<rhwp.exe 경로> python scripts/laws/make_table_rules_fixture.py
import os, re, subprocess, sys, tempfile, zipfile

sys.stdout.reconfigure(encoding='utf-8')
RHWP = os.environ.get('RHWP', 'rhwp')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'laws')
TMP = tempfile.mkdtemp(prefix='table-rules-')


def scaffold(name, blocks):
    spec = os.path.join(TMP, name + '.json')
    with open(spec, 'w', encoding='utf-8') as f:
        f.write('{"version":"1","title":"표 안 취업규칙","blocks":[' + ','.join(blocks) + ']}')
    out = os.path.join(TMP, name + '.hwpx')
    subprocess.run([RHWP, 'scaffold', spec, '-o', out], check=True, capture_output=True)
    with zipfile.ZipFile(out) as z:
        xml = z.read('Contents/section0.xml').decode('utf-8')
    return out, re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', '', xml)


base, xml = scaffold('base', [
    '{"type":"paragraph","text":"시험 회사 취업규칙"}',
    '{"type":"table","rows":[["OUTER"]]}',
    '{"type":"paragraph","text":"BODY"}',
])
_, ixml = scaffold('inner', ['{"type":"table","rows":[["INNER1"],["INNER2"]]}'])

BOLD, NORMAL = '2', '0'  # scaffold header.xml: charPr 2 = 굵게 12pt, 0 = 보통 10pt
pid = [1000]
HEAD = re.compile(r'^(제\d+조(?:의\d+)?\([^)]*\))(.*)$')


def para(text):
    pid[0] += 1
    m = HEAD.match(text)
    runs = (f'<hp:run charPrIDRef="{BOLD}"><hp:t>{m[1]}</hp:t></hp:run><hp:run charPrIDRef="{NORMAL}"><hp:t>{m[2]}</hp:t></hp:run>'
            if m else f'<hp:run charPrIDRef="{NORMAL}"><hp:t>{text}</hp:t></hp:run>')
    return f'<hp:p id="{pid[0]}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{runs}</hp:p>'


def fill(src, marker, paras):
    m = re.search(r'<hp:p [^>]*><hp:run charPrIDRef="\d+"><hp:t>' + marker + r'</hp:t></hp:run></hp:p>', src)
    assert m, marker
    return src[:m.start()] + ''.join(paras) + src[m.end():]


tbl = re.search(r'<hp:tbl .*?</hp:tbl>', ixml, re.S).group(0).replace('<hp:tbl id="1"', '<hp:tbl id="7"')
tbl = fill(tbl, 'INNER1', [
    para('제4조(근로시간) ① 근로시간은 휴게시간을 제외하고 1일 8시간으로 한다.'),
    para('② 1주 근로시간은 40시간으로 한다.'),
])
tbl = fill(tbl, 'INNER2', [
    para('제5조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 청구하는 경우 10일의 유급휴가를 준다.'),
    para('② 배우자 출산휴가는 배우자가 출산한 날부터 90일이 지나면 사용할 수 없다.'),
])
nest = f'<hp:p id="2000" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">{tbl}</hp:run></hp:p>'
xml = fill(xml, 'OUTER', [
    para('제1장 총칙'),
    para('제1조(목적) 이 규칙은 시험 회사 직원의 근로조건을 정한다.'),
    para('제2조(적용범위) 이 규칙은 모든 직원에게 적용한다.'),
    para('제3조(휴가) ① 연차유급휴가는 근로기준법에 따른다.'),
    para('② 근로자의 날에는 휴가를 신청하지 않는다.'),
    para('제2장 근로시간'),
    nest,
    para('제6조(휴직) 휴직은 회사가 정한다.'),
])
xml = fill(xml, 'BODY', [
    para('제7조(유급휴일) ① 근로자의 날은 유급휴일로 한다.'),
    para('② 회사는 주 1회 이상 유급휴일을 준다.'),
    para('부칙'),
    para('제1조(시행일) 이 규칙은 2026년 1월 1일부터 시행한다.'),
])

# 구역 둘로 나눈다 — 구역 0 = 제목 두 줄, 구역 1 = 틀 표 + 본문. 구역마다 첫 문단이 구역 정의(secPr)를 가진다.
# (rhwp breakAtCursor('section') 로 나눈 파일은 한컴 한글이 열지 못했다 — XML 로 직접 나눈다)
m = re.match(r'(<\?xml[^>]*\?>\s*<hs:sec [^>]*>)(<hp:p .*?</hp:p>)(<hp:p .*?</hp:p>)(.*)(</hs:sec>)\s*$', xml, re.S)
assert m, 'section layout'
opening, first, title, rest, closing = m.groups()
sec0 = opening + first + title + closing
first1 = re.sub(r'<hp:run charPrIDRef="\d+"><hp:t>[^<]*</hp:t></hp:run>', '', first)  # 구역 정의만 남긴다
sec1 = opening + first1 + rest + closing


def patch(name, data):
    if name == 'Contents/section0.xml':
        return sec0.encode('utf-8')
    if name == 'Contents/content.hpf':
        s = data.decode('utf-8')
        s = s.replace('<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>',
                      '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
                      '<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/>')
        s = s.replace('<opf:itemref idref="section0" linear="yes"/>', '<opf:itemref idref="section0" linear="yes"/><opf:itemref idref="section1" linear="yes"/>')
        assert 'section1' in s
        return s.encode('utf-8')
    if name == 'Contents/header.xml':
        s = data.decode('utf-8')
        assert 'secCnt="1"' in s
        return s.replace('secCnt="1"', 'secCnt="2"').encode('utf-8')
    return data


out_hwpx = os.path.join(OUT, 'table-rules.hwpx')
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(out_hwpx, 'w') as zout:
    for item in zin.infolist():
        zout.writestr(item, patch(item.filename, zin.read(item.filename)))
        if item.filename == 'Contents/section0.xml':
            info = zipfile.ZipInfo('Contents/section1.xml', item.date_time)
            info.compress_type = item.compress_type
            zout.writestr(info, sec1.encode('utf-8'))
out_hwp = os.path.join(OUT, 'table-rules.hwp')
if os.path.exists(out_hwp):
    os.remove(out_hwp)
subprocess.run([RHWP, 'convert', out_hwpx, out_hwp], check=True, capture_output=True)
print('ok', out_hwp, out_hwpx)
