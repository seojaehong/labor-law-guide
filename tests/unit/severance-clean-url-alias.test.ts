// 261126 · #303 — 퇴직금 계산기 클린 URL 을 **별칭으로만** 연다.
// 이 페이지는 네이버 검색 수요 1위(「퇴직금계산기」 월 263,300회)이고
// shared/NOW.md 가 「이미 색인된 글의 URL 변경」을 금지한다.
// 그래서 301·canonical·사이트맵은 건드리지 않는다 — 색인 신호는 .html 에 남긴다.
// 에르메스 판단(2026-11-26): 네이버는 301 반영이 구글보다 느려(체감 4~8주) 지금 옮기면
// 그 기간 노출이 빠진다. 클린 URL 에 크롤 이력을 먼저 쌓고 나중에 깃발만 넘긴다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const cfg = readFileSync('next.config.ts', 'utf8');
const html = readFileSync('public/tools/severance.html', 'utf8');
const registry = readFileSync('src/content/tools-registry.ts', 'utf8');

it('클린 URL 이 rewrite 로 열린다', () => {
  expect(cfg).toContain("{ source: '/tools/severance', destination: '/tools/severance.html' }");
});

it('🔴 301 을 넣지 않는다 — 넣는 순간 색인이 옮겨간다', () => {
  const redirects = cfg.slice(cfg.indexOf('async redirects()'), cfg.indexOf('async rewrites()'));
  expect(redirects).not.toContain('/tools/severance');
});

it('🔴 canonical·og:url 은 .html 을 가리킨 채로 둔다', () => {
  expect(html).toContain('<link rel="canonical" href="https://yellowenvelope.kr/tools/severance.html">');
  expect(html).toContain('<meta property="og:url" content="https://yellowenvelope.kr/tools/severance.html">');
});

it('🔴 사이트맵에 올라가는 주소도 .html 그대로다', () => {
  // sitemap/[id]/route.ts 가 이 레지스트리의 href 를 읽는다
  expect(registry).toContain("href: '/tools/severance.html'");
  expect(registry).not.toContain("href: '/tools/severance'");
});

it('전환을 잊지 않도록 NOW.md 에 날짜가 박혀 있다', () => {
  // 에르메스 지적 — 두 주소가 다 200 인 상태가 길어지면 「나중에 301」을 까먹는다
  const now = readFileSync('/home/ubuntu/shared/NOW.md', 'utf8');
  expect(now).toMatch(/tools\/severance[\s\S]{0,400}301/);
});
