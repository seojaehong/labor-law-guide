import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sample = vi.hoisted(() => ({
  markdown: '> 합성 인용문: 실제 법률 자료가 아닙니다.\n\n각주를 확인합니다.[^qa] 다시 확인합니다.[^qa]\n\n[외부 출처](https://example.invalid/source)\n\n[^qa]: 합성 각주입니다.',
}));
vi.mock('@/lib/supabase-server', () => {
  const query = {
    select: () => query, eq: () => query, neq: () => query, order: () => query,
    limit: async () => ({ data: [] }),
    single: async () => ({ data: {
      id: 'synthetic', slug: 'synthetic', title: '합성 문서', subtitle: null,
      content: sample.markdown, summary: null, category: 'general', tags: [], author: 'Fixture',
      cover_image: null, published_at: '2026-10-03', updated_at: '2026-10-03',
      view_count: 0, seo_title: null, seo_description: null,
    }, error: null }),
  };
  return { supabaseServer: { from: () => query } };
});
vi.mock('@/lib/topic-picks', () => ({ getCurrentTopicPicks: async () => [] }));
vi.mock('@/components/SubscribeForm', () => ({ default: () => null }));
vi.mock('@/components/BetaSignupForm', () => ({ default: () => null }));

import BlogArticlePage from '@/app/blog/[slug]/page';
import MarkdownSnippet from '@/app/database/_components/MarkdownSnippet';

function checkActualHtml(html: string) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const fragments = [...html.matchAll(/<a\b([^>]*href="#([^"]+)"[^>]*)>/g)];
  expect(fragments.length).toBeGreaterThanOrEqual(4);
  for (const [, attributes, target] of fragments) {
    expect(ids.has(decodeURIComponent(target)), target).toBe(true);
    expect(attributes).not.toContain('target="_blank"');
  }
  for (const [, label] of html.matchAll(/aria-describedby="([^"]+)"/g)) expect(ids.has(label)).toBe(true);
  expect(html).toContain('class="sr-only"');
  expect(html).not.toContain('node="[object Object]"');
  expect(html).toContain('<blockquote');
  const external = html.match(/<a\b[^>]*href="https:\/\/example.invalid\/source"[^>]*>/)?.[0];
  expect(external).toContain('target="_blank"');
  expect(external).toContain('rel="noopener noreferrer"');
}

describe('actual reading renderers retain footnote relationships', () => {
  it('renders the real Blog page with its exact sanitizer and custom heading/list renderers', async () => {
    const page = await BlogArticlePage({ params: Promise.resolve({ slug: 'synthetic' }) });
    checkActualHtml(renderToStaticMarkup(page));
  });
  it('renders the real reading MarkdownSnippet including its custom heading renderer', () => {
    checkActualHtml(renderToStaticMarkup(createElement(MarkdownSnippet, { value: sample.markdown, variant: 'reading' })));
  });
});
