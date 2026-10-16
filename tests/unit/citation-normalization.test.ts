import { describe, expect, it } from 'vitest';
import { linkifyFaqCitations, citationLinkComponents } from '@/lib/chat/citations';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

describe('manifest citation URL normalization', () => {
  const evidence = [{ type: 'FAQ' as const, id: '123' }, { type: 'COURT' as const, id: '대법원_2023다302838' }];
  it('preserves verified same-site absolute FAQ links as canonical relative links', () => {
    expect(linkifyFaqCitations('[원문](https://yellowenvelope.kr/faq?id=123)', evidence)).toBe('[원문](/faq?id=123)');
  });
  it('preserves raw and encoded Korean IDs with the same canonical destination', () => {
    for (const id of ['대법원_2023다302838', encodeURIComponent('대법원_2023다302838')]) {
      expect(linkifyFaqCitations(`[원문](/cases/${id})`, evidence)).toBe(`[원문](/cases/${encodeURIComponent('대법원_2023다302838')})`);
    }
  });
  it('rejects source destinations outside the exact site and malformed identities', () => {
    const bad = [
      'https://yellowenvelope.kr.evil.test/faq?id=123',
      'https://yellowenve1ope.kr/faq?id=123',
      '//evil.test/faq?id=123',
      'https://evil.test@yellowenvelope.kr/faq?id=123',
      'https://yellowenvelope.kr:444/faq?id=123',
      '/faq?id=123&id=999', '/faq?id=123&next=https://evil.test',
      '/cases/' + encodeURIComponent(encodeURIComponent('대법원_2023다302838')),
      '/cases/%ZZ', '/cases/unknown', '/faq?id=999',
      '/%63ases/invented', '/%2563ases/invented', '/%66aq?id=123',
    ];
    for (const href of bad) expect(linkifyFaqCitations(`[원문](${href})`, evidence)).toBe('원문');
  });
  it('preserves ordinary external links and verified relative ASCII links', () => {
    expect(linkifyFaqCitations('[자료](https://example.com/article)', evidence)).toBe('[자료](https://example.com/article)');
    expect(linkifyFaqCitations('[자료](/decisions/abc)', [{ type: 'CASE', id: 'abc' }])).toBe('[자료](/decisions/abc)');
  });
  const render = (text: string) => renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm], components: citationLinkComponents(evidence),
  }, linkifyFaqCitations(text, evidence)));
  it('guards reference-style links in the actual Markdown renderer', () => {
    expect(render('[원문][source]\n\n[source]: /cases/invented')).not.toContain('href=');
    expect(render('[원문][source]\n\n[source]: https://yellowenvelope.kr/faq?id=123')).toContain('href="/faq?id=123"');
    expect(render('[원문][source]\n\n[source]: /cases/대법원_2023다302838')).toContain(`href="/cases/${encodeURIComponent('대법원_2023다302838')}"`);
  });
  it('guards GFM bare and angle autolinks in the actual Markdown renderer', () => {
    for (const text of ['https://yellowenvelope.kr/cases/invented', '<https://yellowenvelope.kr/cases/invented>', 'https://yellowenvelope.kr.evil.test/faq?id=123']) {
      expect(render(text)).not.toContain('href=');
    }
    expect(render('https://yellowenvelope.kr/faq?id=123')).toContain('href="/faq?id=123"');
  });
});
