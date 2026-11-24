import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('selected launch navigation', () => {
  const nav = readFileSync('src/components/GlassNav.tsx', 'utf8');
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const items = nav.slice(nav.indexOf('const NAV_ITEMS'), nav.indexOf('function active'));
  it('keeps the approved destinations and secondary service visible', () => {
    // 261124 — 「AI 연결」을 상단 탭에 올리고 「법령 개정」을 햄버거로 내렸다(모바일 줄은 5칸 그대로).
    for (const href of ['/tools', '/ai-tools', '/blog', '/tools/work-rules', '/decisions']) expect(items).toContain(`href:'${href}'`);
    expect(items.match(/href:'/g)).toHaveLength(5);
    expect(items).toContain("{ href:'/ai-tools', label:'AI 연결' }");
    expect(items).not.toContain("href:'/laws'");
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
  it('keeps only what the tab rail lacks in the mobile drawer and shortens only the rail label', () => {
    const drawer = nav.slice(nav.indexOf('const DRAWER_ITEMS'), nav.indexOf('export default function GlassNav'));
    // 261124 — 모바일에서는 탭 줄(5칸)이 늘 보이므로 햄버거에는 탭에 없는 갈래만 둔다(종전 10줄 중 5줄이 탭과 겹쳤다).
    for (const href of ['/laws', '/faq', '/exit', '/exit-employer', '/contact']) expect(drawer).toContain(`href:'${href}'`);
    for (const href of [...items.matchAll(/href:'([^']+)'/g)].map(m => m[1])) expect(drawer).not.toContain(`href:'${href}'`);
    expect(drawer).toContain("label:'퇴사 점검표'");
    expect(nav).toContain("document.body.style.overflow = 'hidden'");
    expect(nav).toContain("rail ? '판례·해석'");
    expect(nav).toContain('aria-label={mobileOpen?\'추가 메뉴 닫기\':\'추가 메뉴 열기\'}');
  });
  // 261124 — 768px 에서 「서비스 문의」가 두 줄로 꺾였다(높이 56px). 한 줄로 묶는다.
  it('keeps the header service link on one line', () => {
    expect(nav).toMatch(/className="[^"]*editorial-desktop-service[^"]*whitespace-nowrap[^"]*" href="\/contact"/);
  });
  // 261124 — 같은 곳을 「AI 연결 도구·AI 도구·연결 도구·AI에 연결해서 쓰기」 넷으로 불렀다. 「AI 연결」 하나로 쓴다.
  it('calls /ai-tools by one name and drops the top banner', () => {
    for (const f of ['src/components/GlassNav.tsx', 'src/app/HomeClient.tsx', 'src/app/ai-tools/page.tsx', 'src/app/ai-tools/ConnectGuide.tsx']) {
      const code = readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\{\/\*|\*)/.test(l)).join('\n');
      expect(code, f).not.toMatch(/AI 연결 도구|AI 도구'|>AI 도구<|연결 도구 전체|AI에 연결해서 쓰기/);
    }
    expect(layout).not.toContain('ConnectorBanner');
    expect(layout).not.toContain('connector-banner');
  });
  // 261124 — /tools 의 <title> 「노무 계산기 모음」이 화면 h1 「계산·점검 도구」와 달랐다.
  it('names /tools the same in <title> and h1', () => {
    const tools = readFileSync('src/app/tools/page.tsx', 'utf8');
    expect(tools).toContain('계산·점검 도구\n      </h1>');
    for (const m of tools.matchAll(/title: '([^']+)'/g)) expect(m[1]).toMatch(/^계산·점검 도구 /);
  });
  it('uses central branding without unsupported perfection or direct-expert authorship claims', () => {
    expect(layout).toContain('description: BRAND_DESCRIPTION');
    expect(layout).not.toContain('완벽 가이드');
    for (const path of ['src/app/blog/page.tsx', 'src/app/blog/category/[category]/page.tsx']) {
      expect(readFileSync(path, 'utf8')).not.toContain('전문가가 직접 작성');
    }
  });
});
