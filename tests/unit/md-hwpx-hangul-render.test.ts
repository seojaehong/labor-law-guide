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

// 261123 리뷰(오푸스) 재현 입력 — 글자가 경고 없이 사라지던 것
describe('HTML 표 — 글자 손실 없음', () => {
  const tbl = (html: string) => parseMarkdown(html).find((x) => x.kind === 'table') as { rows: string[][]; headRows?: number } | undefined;
  it('칸 안 여러 문단·목록은 칸 줄바꿈으로 이어진다', () => {
    const t = tbl('<table><tr><td><p>첫 문단</p><p>둘째 문단</p></td><td><ul><li>가</li><li>나</li></ul></td></tr></table>');
    expect(t?.rows[0]).toEqual(['첫 문단<br>둘째 문단', '가<br>나']);
  });
  it('<caption> 은 표 앞 문단으로 남는다', () => {
    const items = parseMarkdown('<table>\n<caption>표 1. 중요한 캡션</caption>\n<tr><td>a</td></tr>\n</table>');
    expect(items.map((x) => x.kind)).toEqual(['body', 'table']);
    expect((items[0] as { text: string }).text).toContain('표 1. 중요한 캡션');
  });
  it('</table> 뒤 같은 줄 글자는 다음 문단이 된다', () => {
    const items = parseMarkdown('<table><tr><td>a</td></tr></table> 뒤 글자 살아야 함\n다음 줄');
    const texts = items.filter((x) => x.kind === 'body').map((x) => (x as { text: string }).text.trim());
    expect(texts).toEqual(['뒤 글자 살아야 함', '다음 줄']);
  });
  it('엔티티로 쓴 「<」 한 글자 칸은 병합 표시가 아니다', () => {
    const t = tbl('<table><tr><td>x</td><td>&lt;</td></tr></table>');
    expect(t?.rows[0][1]).not.toBe('<');
    expect(t?.rows[0][1].endsWith('<')).toBe(true);
    const sec = mdSectionXml(parseMarkdown('<table><tr><td>x</td><td>&lt;</td></tr></table>'));
    expect(sec).not.toMatch(/colSpan="2"/);
  });
  it('태그가 아닌 「<」「>」 글자는 남는다', () => {
    expect(tbl('<table><tr><td>3 &lt; 5</td><td>3 < 5 및 7 > 2</td></tr></table>')?.rows[0]).toEqual(['3 < 5', '3 < 5 및 7 > 2']);
  });
  it('둘째 머리행도 머리행이다(<thead>)', () => {
    const md = '<table><thead><tr><th rowspan="2">구분</th><th colspan="2">금액</th></tr><tr><th>가</th><th>나</th></tr></thead><tbody><tr><td>x</td><td>1</td><td>2</td></tr></tbody></table>';
    expect(tbl(md)?.headRows).toBe(2);
    const sec = mdSectionXml(parseMarkdown(md));
    expect(sec.match(/<hp:tc name="" header="1"/g)?.length).toBe(4); // 구분·금액·가·나
  });
  it('data-colspan 은 colspan 이 아니다 · 거대한 rowspan 은 문서를 죽이지 않는다', () => {
    expect(tbl('<table><tr><td data-colspan="2">a</td><td>b</td></tr></table>')?.rows[0]).toEqual(['a', 'b']);
    expect(() => parseMarkdown('<table><tr><td rowspan="3000000">a</td></tr></table>')).not.toThrow();
  });
  it('중첩 표는 표로 옮기지 않고 leftovers 로 알린다', () => {
    const items = parseMarkdown('<table><tr><td>바깥<table><tr><td>안</td></tr></table></td><td>B</td></tr></table>');
    expect(items.some((x) => x.kind === 'table')).toBe(false);
    expect(mdHwpxSummary(items).leftovers.length).toBeGreaterThan(0);
  });
});

// 261123 리뷰(아스트라) 재현 입력
describe('HTML 표 — 격자 이상은 변환을 죽이지 않고 글자로 둔다', () => {
  it('빈 <tr> 로 생긴 빈 자리', () => {
    const md = '<table>\n<tr><td>A</td><td rowspan=2>B</td></tr>\n<tr></tr>\n</table>';
    expect(parseMarkdown(md).some((x) => x.kind === 'table')).toBe(false);
    expect(() => mdSectionXml(parseMarkdown(md))).not.toThrow();
  });
  it('rowspan 예약 칸을 colspan 이 덮으면 충돌로 본다', () => {
    const md = '<table><tr><td>A</td><td rowspan="2">B</td><td>C</td></tr><tr><td colspan="2">D</td><td>E</td></tr></table>';
    expect(parseMarkdown(md).some((x) => x.kind === 'table')).toBe(false);
  });
  it('thead·th 없는 표는 머리행이 없다', () => {
    const t = parseMarkdown('<table><tbody><tr><td>WAGE001</td></tr><tr><td>2</td></tr></tbody></table>').find((x) => x.kind === 'table') as { headRows?: number };
    expect(t.headRows).toBe(0);
  });
});

// 261123 리뷰(페이블) 재현 입력
describe('HTML 표 — 페이블 리뷰', () => {
  const tbl = (html: string) => parseMarkdown(html).find((x) => x.kind === 'table') as { rows: string[][]; headRows?: number } | undefined;
  it('범위 밖 숫자 엔티티는 변환을 죽이지 않는다', () => {
    expect(() => mdSectionXml(parseMarkdown('<table><tr><td>&#1114112;</td><td>&#x110000;</td><td>&#xAC00;&#65;</td></tr></table>'))).not.toThrow();
    expect(tbl('<table><tr><td>&#xAC00;&#65; &ndash; &hellip;</td></tr></table>')?.rows[0][0]).toBe('가A – …');
  });
  it('태그 모양 글자는 지우지 않는다', () => {
    expect(tbl('<table><tr><td>x<y 그리고 y>z</td><td>A<B이고 C>D</td></tr></table>')?.rows[0]).toEqual(['x<y 그리고 y>z', 'A<B이고 C>D']);
  });
  it('칸 안 블록은 줄바꿈 하나로 나뉜다', () => {
    expect(tbl('<table><tr><td><p>a</p><ul><li>b</li></ul><p>c</p></td><td><h3>제목</h3><p>본문</p></td></tr></table>')?.rows[0]).toEqual(['a<br>b<br>c', '제목<br>본문']);
  });
  it('머리 칸 rowspan 이 내려가는 행까지 머리행이다', () => {
    const md = '<table><thead><tr><th rowspan="2">구분</th><th>내용</th></tr></thead><tbody><tr><td>x</td></tr><tr><td>p</td><td>q</td></tr></tbody></table>';
    expect(tbl(md)?.headRows).toBe(2);
  });
  it('병합 표시 방어 글자는 소스에 이스케이프로 있다', () => {
    expect(tbl('<table><tr><td>x</td><td>&lt;</td></tr></table>')?.rows[0][1]).toBe('⁠<');
  });
});

// 261123 리뷰(아스트라 2차, HEAD 810e1ab) 재현 입력
describe('HTML 표 — 아스트라 2차', () => {
  const tbl = (html: string) => parseMarkdown(html).find((x) => x.kind === 'table') as { rows: string[][] } | undefined;
  it('주석으로 지운 행은 인쇄하지 않는다', () => {
    expect(tbl('<table><!-- <tr><td>삭제본</td></tr> --><tr><td>최종본</td></tr></table>')?.rows).toEqual([['최종본']]);
  });
  it('속성 값 안의 > 와 colspan 글자는 속성으로 읽지 않는다', () => {
    expect(tbl('<table><tr><td title="1 > 0">YES</td></tr></table>')?.rows).toEqual([['YES']]);
    expect(tbl('<table><tr><td title="x colspan=2">A</td><td>B</td></tr></table>')?.rows).toEqual([['A', 'B']]);
    expect(tbl('<table><tr><td colspan="2">A</td></tr><tr><td>b</td><td>c</td></tr></table>')?.rows[0]).toEqual(['A', '<']);
  });
  it('칸 안 날짜 줄 때문에 뒤 제목이 서명부가 되지 않는다', () => {
    const kinds = parseMarkdown('<table>\n<tr><td>\n2026. 11. 23.\n</td></tr>\n</table>\n## 다음 제목').map((x) => x.kind);
    expect(kinds).not.toContain('sig');
  });
  it('원고가 쓴 <br><br> 은 둘 다 남는다', () => {
    expect(tbl('<table><tr><td>A<br><br>B</td><td><p>a</p><p>b</p></td></tr></table>')?.rows[0]).toEqual(['A<br><br>B', 'a<br>b']);
  });
});
