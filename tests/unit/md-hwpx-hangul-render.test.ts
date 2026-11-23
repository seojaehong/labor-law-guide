import { describe, expect, it } from 'vitest';
import { mdHwpxSummary, mdSectionXml, parseMarkdown } from '@/lib/md-hwpx';

// 261123 한글 실측(dev/claude-setup/docs/hangul-io-261123) — 한글 2024 COM 으로 열어 드러난 결함 두 가지

describe('쪽번호 꼬리말 — 한글이 읽는 자리', () => {
  // 한글은 secPr 안 subList(FOOTER) 를 읽지 않는다(꼬리말 컨트롤 0, 다시 저장하면 autoNum 0).
  // 한글이 그린 모양 = 첫 문단 run 안 <hp:ctrl><hp:footer> + autoNumFormat
  const sec = mdSectionXml(parseMarkdown('본문'));
  it('꼬리말이 hp:ctrl > hp:footer 로 들어간다', () => {
    expect(sec).toMatch(/<hp:ctrl><hp:footer id="\d+" applyPageType="BOTH"><hp:subList [^>]*>[\s\S]*<\/hp:subList><\/hp:footer><\/hp:ctrl>/);
  });
  it('secPr 안에는 꼬리말이 없다', () => {
    const secPr = /<hp:secPr\b[\s\S]*?<\/hp:secPr>/.exec(sec)![0];
    expect(secPr).not.toContain('FOOTER');
    expect(secPr).not.toContain('numType="PAGE"'); // 각주·미주 autoNumFormat 은 secPr 에 원래 있다
  });
  it('쪽번호는 autoNumFormat 을 가진 PAGE 번호다(「- N -」)', () => {
    const foot = /<hp:footer\b[\s\S]*?<\/hp:footer>/.exec(sec)![0];
    expect(foot).toMatch(/<hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT"[^>]*\/><\/hp:autoNum>/);
    expect(foot.replace(/<[^>]+>/g, '')).toBe('-  -');
  });
  it('footer:false 면 꼬리말이 없다', () => {
    expect(mdSectionXml(parseMarkdown('본문'), { footer: false })).not.toContain('<hp:footer');
  });
});

describe('HTML 표 — 글자로 찍지 않고 한글 표로', () => {
  // pandoc 이 병합 칸이 있는 docx 를 md 로 바꾸면 HTML <table> 을 낸다. 종전에는 태그가 본문 글자로 찍혔고 검사기도 통과시켰다
  const md = [
    '# 제목',
    '',
    '<table>',
    '<thead><tr><th>구분</th><th>내용</th><th>금액</th></tr></thead>',
    '<tbody>',
    '<tr><td rowspan="2">가</td><td>첫째</td><td>1,000</td></tr>',
    '<tr><td>둘째</td><td>2,000</td></tr>',
    '<tr><td colspan="2"><strong>합계</strong></td><td>3,000</td></tr>',
    '</tbody>',
    '</table>',
    '',
    '끝 문단',
  ].join('\n');
  const items = parseMarkdown(md);
  const sec = mdSectionXml(items);
  it('표 항목 하나가 된다(병합 표시 포함)', () => {
    const t = items.filter((x) => x.kind === 'table');
    expect(t).toHaveLength(1);
    expect(t[0].kind === 'table' && t[0].rows).toEqual([
      ['구분', '내용', '금액'],
      ['가', '첫째', '1,000'],
      ['^', '둘째', '2,000'],
      ['**합계**', '<', '3,000'],
    ]);
  });
  it('기능 플래그 없이도 병합 칸이 된다(HTML 이 병합을 명시했다)', () => {
    expect(sec).toContain('<hp:cellSpan colSpan="1" rowSpan="2"/>');
    expect(sec).toContain('<hp:cellSpan colSpan="2" rowSpan="1"/>');
  });
  it('태그가 글자로 남지 않는다', () => {
    const text = (sec.match(/<hp:t>[\s\S]*?<\/hp:t>/g) ?? []).join('');
    expect(text).not.toMatch(/&lt;\/?(table|tr|td|th|tbody|thead)/);
    expect(mdHwpxSummary(items).leftovers).toEqual([]);
  });
  it('앞뒤 문단은 그대로다', () => {
    expect(items.map((x) => x.kind)).toEqual(['h1', 'table', 'body']); // 빈 줄은 서명부 앞 것만 남는다
  });
});

describe('옮기지 못한 HTML 표 태그는 leftovers 로 알린다', () => {
  it('본문에 섞인 <td> 는 잔존 기호다', () => {
    expect(mdHwpxSummary(parseMarkdown('앞 <td>칸</td> 뒤')).leftovers).toContain('<td');
  });
});
