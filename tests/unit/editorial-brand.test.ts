import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND_NAME, SITE_URL } from '../../src/lib/constants';
const read = (path: string) => readFileSync(path, 'utf8');
describe('editorial identity and reading safeguards', () => {
  it('separates the new display name from the unchanged canonical domain', () => {
    expect(BRAND_NAME).toBe('일의 무늬');
    expect(SITE_URL).toBe('https://yellowenvelope.kr');
    expect(read('src/components/GlassNav.tsx')).toContain('alt={BRAND_NAME}');
  });
  // 261124 — 홈은 도구가 먼저이고 정보는 맨 아래 3건(대표 1 + 보조 2)이다.
  it('fetches three genuine articles for the lead and two supporting stories', () => {
    expect(read('src/app/page.tsx')).toContain('.limit(3)');
    expect(read('src/app/HomeClient.tsx')).toContain('latestBlogArticles');
  });
  it('keeps source links next to legal document titles and preserves canonical URLs', () => {
    for (const route of ['cases', 'interpretations']) {
      const source = read(`src/app/${route}/[id]/page.tsx`);
      expect(source).toContain('editorial-source');
      const bodyMarker = route === 'interpretations' ? '<CollectedSourceBody text={summary}' : '<MarkdownSnippet variant="reading"';
      expect(source.indexOf(bodyMarker)).toBeGreaterThanOrEqual(0);
      expect(source.indexOf('className="editorial-source"')).toBeLessThan(source.indexOf(bodyMarker));
      expect(source).toContain('item.original_url');
      expect(source).toContain('canonical:');
    }
  });
  it('keeps wordmarks local and free of scripts or external assets', () => {
    for (const theme of ['ink', 'dark']) {
      const svg = read(`public/brand/work-patterns-wordmark-${theme}.svg`);
      expect(svg).toContain('<path');
      expect(svg).not.toMatch(/<script|<image|<foreignObject|\shref=|\son\w+=/i);
    }
  });
});
