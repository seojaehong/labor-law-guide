import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import ReadingMarkdownLink from '@/components/ReadingMarkdownLink';

const sample = '합성 인용문입니다.[^qa] 같은 각주를 다시 확인합니다.[^qa]\n\n[외부 출처](https://example.invalid/source)\n\n[^qa]: 화면 검증용 각주이며 실제 법률 자료가 아닙니다.';
function render(variant: 'blog' | 'snippet', content = sample) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm],
    rehypePlugins: variant === 'blog' ? [rehypeRaw, rehypeSanitize] : [],
    components: { a: props => createElement(ReadingMarkdownLink, { ...props, variant }) },
  }, content));
}

describe('reading Markdown footnote link contract', () => {
  it.each(['blog', 'snippet'] as const)('%s links both notes and repeated back-references to existing IDs', variant => {
    const html = render(variant);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const fragments = [...html.matchAll(/<a\b([^>]*href="#([^"]+)"[^>]*)>/g)];
    expect(fragments.length).toBeGreaterThanOrEqual(4);
    for (const [, attributes, target] of fragments) {
      expect(ids.has(decodeURIComponent(target)), target).toBe(true);
      expect(attributes).not.toContain('target="_blank"');
    }
    for (const [, label] of html.matchAll(/aria-describedby="([^"]+)"/g)) expect(ids.has(label)).toBe(true);
    expect(html).toContain('aria-label="Back to reference');
  });
  it.each(['blog', 'snippet'] as const)('%s retains external-link target and rel', variant => {
    const html = render(variant);
    const external = html.match(/<a\b[^>]*href="https:\/\/example.invalid\/source"[^>]*>/)?.[0];
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer"');
  });
  it('preserves the existing sanitizer and rejects unsafe URL/event markup', () => {
    const html = render('blog', '<a href="javascript:alert(1)" onclick="alert(1)">검증</a><script>alert(1)</script>');
    expect(html).not.toMatch(/javascript:|onclick|<script/i);
  });
  it('never forwards untrusted events, node metadata or style props to the DOM', () => {
    const props = {
      href: '#normal-anchor', children: '내부 링크', onClick: () => undefined,
      node: { unexpected: true }, style: { position: 'fixed' },
    } as unknown as Parameters<typeof ReadingMarkdownLink>[0];
    const element = ReadingMarkdownLink(props);
    expect(element.props).not.toHaveProperty('onClick');
    expect(element.props).not.toHaveProperty('node');
    expect(element.props.style).toEqual({ color: 'var(--color-accent-ink)' });
    expect(element.props.href).toBe('#normal-anchor');
    expect(element.props.target).toBeUndefined();
  });
});
