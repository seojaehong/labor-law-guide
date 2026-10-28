import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOOLS } from '@/content/tools-registry';

// 🔴 2026-10-22. /duties 를 만들고도 사이트맵에 안 넣어 구글이 모르는 채였다.
//   실측: 사이트맵 1,129건 중 /duties 0건. 같은 상태인 페이지가 여덟이었다.
//   staticRoutes 는 손으로 관리하는 목록이라 새 페이지를 만들 때마다 빠뜨린다.
//   **페이지를 만들면 이 시험이 먼저 막는다.** 일부러 빼려면 아래 EXCLUDED 에 이유와 함께 적는다.

const APP = 'src/app';

/** 사이트맵에 일부러 넣지 않는 것 — 이유를 반드시 적는다 */
const EXCLUDED: Record<string, string> = {
  '/database': '301 로 /decisions 에 보낸다. 리다이렉트를 사이트맵에 실으면 크롤 예산 낭비',
  '/search': '301 로 /decisions 에 보낸다',
  '/og': '이미지 생성 라우트',
};

function staticRoutes(dir = APP, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('[') || e.name.startsWith('_') || e.name === 'api') continue;
    const here = `${prefix}/${e.name}`;
    const full = path.join(dir, e.name);
    if (fs.existsSync(path.join(full, 'page.tsx'))) out.push(here);
    out.push(...staticRoutes(full, here));
  }
  return out;
}

/** layout.tsx·page.tsx 어디든 index:false 가 있으면 검색에 안 올린다는 뜻 */
function isNoindex(route: string): boolean {
  const dir = path.join(APP, route.replace(/^\//, ''));
  for (const f of ['layout.tsx', 'page.tsx']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p) && /index:\s*false/.test(fs.readFileSync(p, 'utf8'))) return true;
  }
  // 상위가 noindex 면 하위도 따라간다(/admin/* 처럼)
  const parent = route.split('/').slice(0, -1).join('/');
  return parent.length > 1 ? isNoindex(parent) : false;
}

// 도구 주소는 route.ts 에 글자로 없고 등록부(TOOLS)에서 만들어진다. 둘을 합쳐 본다.
const sitemapSrc = fs.readFileSync(`${APP}/sitemap/[id]/route.ts`, 'utf8');
const inSitemap = new Set(
  [...sitemapSrc.matchAll(/\$\{SITE_URL\}(\/[\w\-./]*)/g)]
    .map(m => m[1])
    .concat('/')
    .concat(TOOLS.filter(t => t.sitemap).map(t => t.href)),
);

describe('만든 페이지는 사이트맵에 들어간다', () => {
  const routes = staticRoutes();

  it('페이지를 찾기는 한다', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('/duties');
  });

  it('검색에 올릴 페이지가 전부 사이트맵에 있다', () => {
    const missing = routes.filter(r => !inSitemap.has(r) && !isNoindex(r) && !(r in EXCLUDED));
    expect(missing, `사이트맵에 넣거나, 뺄 거면 EXCLUDED 에 이유와 함께 적으세요`).toEqual([]);
  });

  it('EXCLUDED 에 적은 것은 실제로 존재하는 경로다 — 죽은 줄을 남기지 않는다', () => {
    for (const r of Object.keys(EXCLUDED)) {
      expect(routes.includes(r) || fs.existsSync(path.join(APP, r.replace(/^\//, ''))), `${r}`).toBe(true);
    }
  });
});
