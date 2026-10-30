import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomeClient from '@/app/HomeClient';

const articles = Array.from({ length: 4 }, (_, index) => ({
  id: `article-${index + 1}`,
  slug: `article-${index + 1}`,
  title: `Existing article ${index + 1}`,
  subtitle: index === 2 ? null : `Existing subtitle ${index + 1}`,
  summary: `Existing summary ${index + 1}`,
  category: index === 0 ? 'general' : '판례분석',
  published_at: `2026-09-${20 - index}T23:30:00-09:00`,
}));

const faqItems = [
  { question: 'Existing FAQ question', answer: 'Existing FAQ answer, without edits.' },
] as const;

function renderHome(latestBlogArticles = articles) {
  return renderToStaticMarkup(createElement(HomeClient, {
    totalCases: 1234,
    totalAdmin: 567,
    totalNews: 987654,
    latestBlogArticles,
    faqItems,
    topicPicksSlot: createElement('div', { 'data-topic-picks': 'preserved' }, 'Existing topic picks'),
  }));
}

describe('Home launch scope', () => {
  it('promotes the approved four sections with an explicit law review status', () => {
    const html = renderHome();
    const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(hrefs.filter(href => !href.startsWith('/blog/')))).toEqual(new Set(['/blog', '/laws', '/tools/work-rules', '/decisions', '/contact']));
    for (const label of ['글', '법령 개정', '취업규칙 점검', '판례·행정해석']) expect(html).toContain(label);
    expect(html).toContain('법령 검수 전 자료입니다.');
  });

  it('does not assert unverified human editing or promote AI and guide services', () => {
    const html = renderHome();

    expect(html).not.toMatch(/10년차|매일 업데이트|직접 운영하고 검수|AI 노동법 상담|AI에게 노동법|교섭 의무 체크리스트 보기|노란봉투법 핵심 가이드|고용·창업 지원금/);
    expect(html).not.toContain('987,654');
  });

  it('preserves the real lead and three supporting articles, including source dates', () => {
    const html = renderHome();

    expect(html.match(/<article\b/g)).toHaveLength(4);
    expect(html.match(/class="editorial-lead-story"/g)).toHaveLength(1);
    articles.forEach(article => {
      expect(html).toContain(`href="/blog/${article.slug}"`);
      expect(html).toContain(article.title);
      expect(html).toContain(`<time dateTime="${article.published_at}">${article.published_at.slice(0, 10).replace(/-/g, '.')}</time>`);
    });
    expect(html).toContain(articles[0].summary);
    expect(html).toContain(articles[2].summary);
    expect(html).toContain('Existing topic picks');
  });

  it('does not invent editorial stories when none were supplied', () => {
    const html = renderHome([]);

    expect(html).not.toContain('editorial-lead-story');
    expect(html).not.toContain('id="latest-heading"');
    expect(html).toContain('href="/blog"');
  });

  it('keeps the supplied counts and accessible GET search for decisions', () => {
    const html = renderHome();
    const searchForm = html.match(/<form\b[^>]*role="search"[^>]*>/)?.[0] ?? '';

    expect(html).toContain('판례 1,234건 · 공개 행정해석 567건');
    expect(searchForm).toContain('action="/decisions"');
    expect(searchForm).toContain('method="get"');
    expect(html).toContain('for="home-search"');
    expect(html).toMatch(/<input id="home-search"[^>]+name="q"/);
    expect(html).toContain('판례·행정해석 검색');
  });

  // 🔴 2026-10-30. 종전에 이 토막은 뉴스레터 폼이 **없어야 한다**고 단정했고, 폼이 올라간
  // 뒤로 계속 실패하고 있었다. 아무도 몰랐던 이유는 **CI 가 vitest 를 돌리지 않기** 때문이다
  // (PR 체크 둘은 Vercel 빌드다). 그래서 단정을 지우는 대신 **뒤집었다** —
  // 실측으로 홈 하단 폼이 구독 유입 1위다(17명 중 10명, source='home-bottom').
  // 폼이 사라지면 가장 큰 유입구가 닫히는 것이므로, 없어지는 쪽을 실패로 잡는다.
  it('retains FAQ text, secondary contact, and the newsletter form that drives signups', () => {
    const html = renderHome();
    const contactLink = html.match(/<a\b[^>]*href="\/contact"[^>]*>/)?.[0] ?? '';

    expect(html).toContain(faqItems[0].question);
    expect(html).toContain(faqItems[0].answer);
    expect(html).toContain('type="email"');
    expect(html).toContain('aria-label="이메일 주소"');
    expect(html).toContain('type="checkbox"');   // 수신 동의 — 없으면 동의 없이 받는 셈이 된다
    expect(html).toContain('구독하기');
    expect(contactLink).toContain('border-[var(--color-border)]');
    expect(contactLink).not.toContain('bg-[var(--color-accent-ink)]');
    expect(html.match(/href="\/contact"/g)).toHaveLength(1);
  });
});
