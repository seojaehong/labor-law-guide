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
  it('fetches four genuine articles for the lead and three supporting stories', () => {
    expect(read('src/app/page.tsx')).toContain('.limit(4)');
    expect(read('src/app/HomeClient.tsx')).toContain('latestBlogArticles');
  });
  it('keeps source links next to legal document titles and preserves canonical URLs', () => {
    for (const route of ['cases', 'interpretations']) {
      const source = read(`src/app/${route}/[id]/page.tsx`);
      expect(source).toContain('editorial-source');
      expect(source.indexOf('className="editorial-source"')).toBeLessThan(source.indexOf('<MarkdownSnippet variant="reading"'));
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
