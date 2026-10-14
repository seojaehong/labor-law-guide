import { expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { normalizeSnippetMarkdown } from '@/app/database/_components/utils';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';
it.each(['처분을 취소한다. 다음 문장이다.','임금을 지급받았다. 판단한다.','책무가 있습니다. 해당 경우.'])('does not split Korean sentence endings: %s',text=>{
 expect(normalizeSnippetMarkdown(text)).toBe(text);
 const html=renderToStaticMarkup(createElement(MarkdownSnippet,{value:text}));expect(html).toContain(text);expect(html.match(/<p>/g)).toHaveLength(1);
});
it('retains internal paragraph boundaries, indented code and table cell text',()=>{
 const text='앞 문단\n\n    원본 들여쓰기\n    다음 코드 줄\n\n| 항목 | 값 |\n| --- | --- |\n| 근로조건 | 취소한다. 지급받았다. |';
 expect(normalizeSnippetMarkdown(text)).toBe(text);
 const html=renderToStaticMarkup(createElement(MarkdownSnippet,{value:text}));expect(html).toContain('<table>');expect(html).toContain('<pre>');expect(html).toContain('취소한다. 지급받았다.');
});
it('preserves the exact screenshot case without silently correcting stored word spaces',()=>{
 const text='근로시간이 감소하는 경우. - 법령에서 정한 사유가 아닌 보직변경 등으로 사용자 책무 가 달라지는 경우.';
 expect(normalizeSnippetMarkdown(text)).toBe(text);
 const html=renderToStaticMarkup(createElement(MarkdownSnippet,{value:text}));expect(html).toContain('감소하는 경우. - 법령에서 정한 사유가 아닌 보직변경 등으로');expect(html).toContain('사용자 책무 가');
});
