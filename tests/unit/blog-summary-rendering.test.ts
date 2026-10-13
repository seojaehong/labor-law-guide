import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BlogArticle } from '@/app/blog/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
import BlogClient from '@/app/blog/BlogClient';

describe('blog list plain text boundary', () => {
  it('renders raw and encoded HTML summaries as text while keeping source records intact', () => {
    const article: BlogArticle = {
      slug: 'summary-regression', title: '표시 검사',
      subtitle: '&lt;h2&gt;부제&lt;/h2&gt;',
      summary: '<p>요약 R&amp;D</p><img src="x" onerror="alert(1)"><script>alert(2)</script>',
      category: 'general', subtype: null, tags: [], author: '합성 자료',
      published_at: '2026-10-03', seo_title: null, seo_description: null,
    };
    const before = structuredClone(article);
    Object.freeze(article.tags);
    Object.freeze(article);
    const articles = [article];
    Object.freeze(articles);
    const html = renderToStaticMarkup(createElement(BlogClient, {
      articles, total: 1, page: 1, activeCategory: 'all', activeSubtype: null, query: '',
    }));
    expect(html).toContain('부제');
    expect(html).toContain('요약 R&amp;D');
    expect(html).not.toContain('&lt;h2&gt;');
    expect(html).not.toContain('&lt;p&gt;');
    expect(html).not.toMatch(/<(?:script|img)\b|\sonerror=/i);
    expect(article).toEqual(before);
    expect(articles).toEqual([before]);
  });
});
