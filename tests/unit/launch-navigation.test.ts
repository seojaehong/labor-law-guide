import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('selected launch navigation', () => {
  const nav = readFileSync('src/components/GlassNav.tsx', 'utf8');
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const items = nav.slice(nav.indexOf('const NAV_ITEMS'), nav.indexOf('function isActive'));
  it('keeps writing, decisions, one reference tool and secondary service visible', () => {
    for (const href of ['/blog', '/decisions', '/tools/holiday-pay', '/contact']) expect(items).toContain(`href: '${href}'`);
    for (const href of ['/ai', '/guide', '/news', '/wiki', '/tools/severance.html']) expect(items).not.toContain(`href: '${href}'`);
    expect(items).toContain('입력 조건에 따른 참고 계산');
  });
  it('preserves legacy URLs with a clear review status instead of global AI promotion', () => {
    expect(layout).not.toContain('<FloatingChatButton');
    expect(layout).toContain('검토 중 자료');
    expect(layout).toContain('검토 중 기능');
    expect(layout).toContain('내용과 적용 조건을 확인 중입니다');
    for (const href of ['/ai', '/guide', '/news', '/tools/severance.html']) expect(layout).toContain(`href: '${href}'`);
  });
  it('uses central branding without unsupported perfection or direct-expert authorship claims', () => {
    expect(layout).toContain('description: BRAND_DESCRIPTION');
    expect(layout).not.toContain('완벽 가이드');
    for (const path of ['src/app/blog/page.tsx', 'src/app/blog/category/[category]/page.tsx']) {
      expect(readFileSync(path, 'utf8')).not.toContain('전문가가 직접 작성');
    }
  });
});
