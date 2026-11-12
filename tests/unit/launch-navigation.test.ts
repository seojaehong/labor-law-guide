import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('selected launch navigation', () => {
  const nav = readFileSync('src/components/GlassNav.tsx', 'utf8');
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const items = nav.slice(nav.indexOf('const NAV_ITEMS'), nav.indexOf('function active'));
  it('keeps the approved four destinations and secondary service visible', () => {
    for (const href of ['/blog', '/laws', '/tools/work-rules', '/decisions']) expect(items).toContain(`href:'${href}'`);
    for (const href of ['/ai', '/guide', '/news', '/wiki', '/tools/severance.html']) expect(items).not.toContain(`href:'${href}'`);
    // 261105 — /contact 가 「서비스 문의」 창구로 바뀌어 메뉴 라벨도 바꿨다(종전 「소개·상담」).
    expect(nav).toContain('서비스 문의');
    expect(nav).not.toContain('상담');
  });
  it('puts the tools directory first, in the desktop menu and the mobile rail (261103)', () => {
    expect(items.indexOf("href:'/tools'")).toBeGreaterThan(-1);
    expect(items.indexOf("href:'/tools'")).toBeLessThan(items.indexOf("href:'/blog'"));
    expect(nav).not.toContain('editorial-desktop-service" href="/tools"');
  });
  it('preserves legacy URLs with a clear review status instead of global AI promotion', () => {
    expect(layout).not.toContain('<FloatingChatButton');
    expect(layout).not.toContain('<BetaBanner');
    expect(layout).toContain('검토 중 자료·기능');
    expect(layout).toContain('내용과 적용 조건을 확인 중입니다');
    // #193(261112) — 노란봉투법 전용 페이지(/guide·/news 등) 링크는 푸터에서 뺐다. 페이지와 사이트맵은 그대로다.
    for (const href of ['/ai', '/tools/severance.html']) expect(layout).toContain(`href: '${href}'`);
    const sitemap = readFileSync('src/app/sitemap/[id]/route.ts', 'utf8');
    for (const path of ['/guide', '/manual', '/checklist', '/cases', '/news']) expect(sitemap).toContain(`\${SITE_URL}${path}\``);
  });
  it('lists the main sections in the mobile drawer and shortens only the rail label (261112)', () => {
    const drawer = nav.slice(nav.indexOf('const DRAWER_ITEMS'), nav.indexOf('export default function GlassNav'));
    for (const href of ['/tools', '/ai-tools', '/blog', '/decisions', '/laws', '/faq', '/exit', '/exit-employer', '/contact']) {
      expect(drawer).toContain(`href:'${href}'`);
    }
    expect(nav).toContain("document.body.style.overflow = 'hidden'");
    expect(nav).toContain("rail ? '판례·해석'");
    expect(nav).toContain('aria-label={mobileOpen?\'추가 메뉴 닫기\':\'추가 메뉴 열기\'}');
  });
  it('uses central branding without unsupported perfection or direct-expert authorship claims', () => {
    expect(layout).toContain('description: BRAND_DESCRIPTION');
    expect(layout).not.toContain('완벽 가이드');
    for (const path of ['src/app/blog/page.tsx', 'src/app/blog/category/[category]/page.tsx']) {
      expect(readFileSync(path, 'utf8')).not.toContain('전문가가 직접 작성');
    }
  });
});
