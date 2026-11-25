import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomeClient from '@/app/HomeClient';
import { formatPublicationDate } from '@/lib/publication-date';
import { HOME_PICKS, TOOL_GROUPS } from '@/content/tools-groups';

const articles = Array.from({ length: 4 }, (_, index) => ({
  id: `article-${index + 1}`,
  slug: `article-${index + 1}`,
  title: `Existing article ${index + 1}`,
  subtitle: index === 2 ? null : `Existing subtitle ${index + 1}`,
  summary: `Existing summary ${index + 1}`,
  category: index === 0 ? 'general' : '판례분석',
  published_at: `2026-09-${20 - index}T23:30:00-09:00`,
}));

function renderHome(latestBlogArticles = articles) {
  return renderToStaticMarkup(createElement(HomeClient, {
    totalCases: 1234,
    totalAdmin: 567,
    totalNews: 987654,
    latestBlogArticles,
    topicPicksSlot: createElement('div', { 'data-topic-picks': 'preserved' }, 'Existing topic picks'),
  }));
}

// #190(261112) — 「AI 연결」 지면이 홈에 있다. 링크는 /ai-tools 와 그 카드뿐이다.
// 261122 — SafeClaw 토큰 발급 화면(관리자 로그인) 직링크를 뺐다. 연결 안내는 /ai-tools#safeclaw 가 맡는다.
// 261124 — 도구 우선 재배치로 AI 지면을 줄였다(묶음 세부 링크 #list·#checks·#work-rules 는 /ai-tools 안에서 찾는다).
const AI_LINKS = ['/ai-tools', '/ai-tools#calc', '/ai-tools#sanjae-apply', '/ai-tools#safeclaw'];
// 261124 — 첫 화면 대표 도구 4개(재홍님 결정 「도구 먼저」). 퇴사 점검표는 /exit 이다.
const REP_LINKS = ['/tools/severance.html', '/tools/weekly-holiday-pay', '/tools/notice-pay', '/exit'];

describe('Home launch scope', () => {
  it('links only to tools, the AI connection page and the latest writing', () => {
    const html = renderHome();
    const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map(match => match[1]);
    // #141(261103) — 「상황별 도구」 지면: 도구 전체 보기, 묶음 이름 → /tools#묶음, 묶음별 대표 도구 바로가기.
    // 그 링크는 도구 묶음 등록부(tools-groups.ts)에서만 온다. 그 밖의 링크가 새로 올라오면 여전히 실패한다
    const toolLinks = ['/tools', ...TOOL_GROUPS.flatMap(g => [`/tools#${g.id}`, ...HOME_PICKS[g.id].map(p => p.href)])];
    // 261124 — 내비와 겹치던 「메뉴 안내」·「바로 읽기」 줄을 뺐다(글·법령 개정·판례는 상단 메뉴와 햄버거에 있다).
    expect(new Set(hrefs.filter(href => !href.startsWith('/blog/')))).toEqual(new Set(['/blog', ...REP_LINKS, ...AI_LINKS, ...toolLinks]));
    expect(html).not.toContain('메뉴 안내');
    expect(html).not.toContain('바로 읽기');
  });

  // 261124 결정 순서 ①도구 → ②AI 연결 → ③정보. 검색은 도구 아래 한 줄이다.
  it('orders the page tools first, then search, AI connection and information', () => {
    const html = renderHome();
    const at = (needle: string) => { const i = html.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };
    const h1 = at('<h1');
    const reps = REP_LINKS.map(href => at(`href="${href}"`));
    const groups = at('id="home-tools-heading"');
    const search = at('role="search"');
    const ai = at('id="home-ai-heading"');
    const latest = at('id="latest-heading"');
    expect(Math.max(h1, ...reps)).toBeLessThan(groups);
    expect(groups).toBeLessThan(search);
    expect(search).toBeLessThan(ai);
    expect(ai).toBeLessThan(latest);
  });

  it('names the page by its tools, not as a legal AI service', () => {
    const html = renderHome();
    const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '') ?? '';
    expect(h1).toContain('계산·점검 도구');
    expect(h1).not.toMatch(/AI|검색/);
    const page = readFileSync('src/app/page.tsx', 'utf8');
    const meta = page.slice(page.indexOf('export const metadata'), page.indexOf('async function getHomeStats'));
    expect(meta).toMatch(/title:\s*\{\s*absolute:\s*'[^']*계산·점검 도구[^']*'/);
    expect(meta).toMatch(/description:\s*'[^']*퇴직금[^']*'/);
    expect(meta).not.toMatch(/노동법 AI|AI 질의응답|상담|자문/);
  });

  it('does not assert unverified human editing or promote AI and guide services', () => {
    const html = renderHome();

    expect(html).not.toMatch(/10년차|매일 업데이트|직접 운영하고 검수|AI 노동법 상담|AI에게 노동법|교섭 의무 체크리스트 보기|노란봉투법 핵심 가이드|고용·창업 지원금/);
    expect(html).not.toContain('987,654');
  });

  // 261124 — 정보는 맨 아래, 최신 글은 3건(대표 1 + 보조 2)으로 줄였다. 넷째 글은 그리지 않는다.
  it('preserves the real lead and two supporting articles, including source dates', () => {
    const html = renderHome();

    expect(html.match(/<article\b/g)).toHaveLength(3);
    expect(html.match(/class="editorial-lead-story"/g)).toHaveLength(1);
    expect(html).not.toContain(`href="/blog/${articles[3].slug}"`);
    articles.slice(0, 3).forEach(article => {
      expect(html).toContain(`href="/blog/${article.slug}"`);
      expect(html).toContain(article.title);
      expect(html).toContain(`<time dateTime="${article.published_at}">${formatPublicationDate(article.published_at)}</time>`);
    });
    expect(html).toContain(articles[0].summary);
    expect(html).toContain(articles[2].summary);
    expect(html).toContain('Existing topic picks');
  });

  it('does not invent editorial stories when none were supplied', () => {
    const html = renderHome([]);

    expect(html).not.toContain('editorial-lead-story');
    expect(html).not.toContain('id="latest-heading"');
    // 261124 — 글이 없으면 「최신 글」 지면이 통째로 빠진다. 글 목록은 상단 탭 「글」에서 닿는다.
    expect(html).toContain('id="home-tools-heading"');
    expect(readFileSync('src/components/GlassNav.tsx', 'utf8')).toContain("href:'/blog'");
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
  it('keeps the newsletter form that drives signups', () => {
    const html = renderHome();

    expect(html).toContain('type="email"');
    expect(html).toContain('aria-label="이메일 주소"');
    expect(html).toContain('type="checkbox"');   // 수신 동의 — 없으면 동의 없이 받는 셈이 된다
    expect(html).toContain('구독하기');
  });

  // 261112 — 홈은 노란봉투법 사이트로 보이지 않는다. 노란봉투법 페이지 자체는 /guide 등에 그대로 있다.
  it('does not present the home as a 노란봉투법 site', () => {
    const html = renderHome();
    const page = readFileSync('src/app/page.tsx', 'utf8');

    expect(html).not.toContain('노란봉투법');
    expect(html).not.toContain('자주 묻는 질문');
    expect(page).not.toContain("'@type': 'FAQPage'");
    expect(page).not.toContain('homeFaqItems');
    expect(page).not.toContain('개정 노동조합법(노란봉투법)'); // JSON-LD about
  });
});
