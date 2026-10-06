import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const shared = read('src/components/editorial-navigation.css');
const overrides = read('src/components/site-refactor.css');
const staticTool = read('public/tools/severance-brand.css');

// Source guards complement browser QA: later CSS must not undo the approved sizes.
describe('approved original header logo sizes', () => {
  it('sets the shared desktop logo to 120px with automatic height', () => {
    expect(shared).toMatch(/\.editorial-wordmark img\s*\{\s*width:\s*120px;\s*height:\s*auto;\s*aspect-ratio:\s*4\.01945;/);
  });
  it('sets the shared mobile logo to 104px below 768px', () => {
    expect(shared).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*\.editorial-wordmark img\s*\{\s*width:\s*104px;\s*\}/);
  });
  it('does not override the shared logo size or aspect ratio in the later stylesheet', () => {
    expect(overrides).not.toMatch(/\.editorial-wordmark\s+img\s*\{/);
  });
  it('uses the same desktop and mobile widths in the static tool header', () => {
    expect(staticTool).toMatch(/\.work-nav img\s*\{\s*width:\s*120px;\s*height:\s*auto;\s*aspect-ratio:\s*4\.01945;/);
    expect(staticTool).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{\s*\.work-nav img\s*\{\s*width:\s*104px;/);
  });
  it('keeps the original SVG proportions in both light and dark assets', () => {
    for (const suffix of ['', '-dark']) {
      const svg = read(`public/brand/work-patterns-wordmark-original${suffix}.svg`);
      const viewBox = svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
      expect(viewBox[2] / viewBox[3]).toBeCloseTo(4.01945, 5);
    }
  });
});
