import { describe, expect, it } from 'vitest';
import { unwrapSourceAnnotations } from '@/lib/legal-display-text';
import { parseHoldingText } from '@/lib/format-holding';

const raw = '<law_cite ref="군사법원법/제431조/20260213">군사법원법 제431조</law_cite>';
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

describe('source annotation display text', () => {
  it.each([raw, escape(raw), escape(escape(raw))])('unwraps raw and entity encoded tokens: %s', input => {
    expect(unwrapSourceAnnotations(input)).toBe('군사법원법 제431조');
  });
  it.each([
    ['<LAW_CITE REF="x > y">제431조</LAW_CITE>', '제431조'],
    ['<law_cite ref=abc>조문</law_cite>', '조문'],
    ["<law_cite title='x > y' data-ref='z'>조문</law_cite>", '조문'],
    ['<law_cite>제1조 <law_cite ref="b">제2조</law_cite></law_cite>', '제1조 제2조'],
    ['<law_cite ref="a">조문&lt;/law_cite&gt;', '조문'],
    ['&#60;law_cite ref=&#34;a&#34;&#62;조문&#x3c;/law_cite&#x3e;', '조문'],
    ['<law_cite ref="a">조문', '조문'],
    ['조문</law_cite>', '조문'],
    ['가<law_cite ref="x"/>나', '가나'],
    ['<law_cite\nref="a">첫줄\n둘째줄</law_cite>', '첫줄\n둘째줄'],
  ])('retains every inner character across token variations', (input, output) => {
    expect(unwrapSourceAnnotations(input)).toBe(output);
  });
  it.each([
    '<law_cite ref="닫히지 않은 조문과 본문',
    '<law_cite ref="잘못 > 열린 속성 본문',
    '<law_cite 제431조 본문>',
    '<law_cite_extra ref="a">조문</law_cite_extra>',
    '<law_cite-example>조문</law_cite-example>',
    '<case_cite ref="a">2025노2844</case_cite>',
    '임금 <개정 2026. 2. 13.> 1 < 2 > 0',
    'R&amp;D &lt;script&gt;비활성&lt;/script&gt;',
    '<span title="법률">조문</span>',
    '[원문](https://example.invalid)\n\n- 목록[^a]\n\n|법|조문|\n|-|-|\n|가|나|\n\n[^a]: 각주',
  ])('preserves unrelated or ambiguous syntax byte for byte', input => {
    expect(unwrapSourceAnnotations(input)).toBe(input);
  });
  it('does not treat deeper quote entities as delimiters', () => {
    const cited = '<law_cite ref="A &quot; B">제431조</law_cite>';
    for (const input of [cited, escape(cited), escape(escape(cited))]) expect(unwrapSourceAnnotations(input)).toBe('제431조');
  });
  it('preserves annotations quoted inside unknown tag attributes', () => {
    const source = '<span title="<law_cite>주석</law_cite>">법문</span>';
    expect(unwrapSourceAnnotations(source)).toBe(source);
    expect(unwrapSourceAnnotations(escape(source))).toBe(escape(source));
  });
  it('discards annotation attributes without manufacturing links or HTML', () => {
    expect(unwrapSourceAnnotations('<law_cite ref="javascript:alert(1)" onclick="evil()">법조문</law_cite>')).toBe('법조문');
  });
  it('is idempotent after removing complete wrappers', () => {
    const once = unwrapSourceAnnotations(escape(escape(raw)));
    expect(unwrapSourceAnnotations(once)).toBe(once);
  });
  it('does not globally decode entities even inside a legal citation', () => {
    expect(unwrapSourceAnnotations('<law_cite>R&amp;D &lt;개정&gt;</law_cite>')).toBe('R&amp;D &lt;개정&gt;');
  });
  it('does not swallow later paragraphs after malformed markup', () => {
    expect(unwrapSourceAnnotations('<law_cite ref=x\n법문\n<law_cite>제2조</law_cite>')).toBe('<law_cite ref=x\n법문\n제2조');
  });
  it('feeds the existing holding formatter only cleaned display text', () => {
    expect(parseHoldingText(`가. 결론\n${raw}`).map(block => block.text).join('\n')).toBe('가. 결론\n군사법원법 제431조');
  });
  it('handles long decisions without spread-argument overflow or content loss', () => {
    const body = '법률 본문입니다. '.repeat(25000);
    expect(unwrapSourceAnnotations(body + escape(raw))).toBe(body + '군사법원법 제431조');
  });
  it('preserves original line endings, Unicode and entity bytes around and inside wrappers', () => {
    const legal = '제23조\r\n① 정당한 이유\t𠮷·👩🏽‍⚖️ R&amp;D &lt;개정&gt; e\u0301';
    const before = '원문\r\n\r\n';
    const after = '\r\n끝\u00a0문장';
    const source = `${before}<law_cite ref="x">${legal}</law_cite>${after}`;
    expect(unwrapSourceAnnotations(source)).toBe(before + legal + after);
    expect(source).toBe(`${before}<law_cite ref="x">${legal}</law_cite>${after}`);
  });
  it('leaves unsupported deeper encoding intact instead of globally decoding source text', () => {
    const source = escape(escape(escape(escape(raw))));
    expect(unwrapSourceAnnotations(source)).toBe(source);
  });
  it('preserves an ambiguous wrapper while removing a later confirmed citation', () => {
    const ambiguous = '<law_cite ref=>법률 A &amp; B';
    expect(unwrapSourceAnnotations(`${ambiguous}\r\n${raw}`)).toBe(`${ambiguous}\r\n군사법원법 제431조`);
  });
});
