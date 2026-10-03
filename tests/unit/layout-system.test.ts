import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const css = read('src/app/globals.css');

describe('reading-first layout contract', () => {
  it('uses CJK measure with an explicit em fallback, not a Latin zero-glyph width', () => {
    expect(css).toContain('--reading-measure: 35em');
    expect(css).toContain('@supports (max-inline-size: 1ic)');
    expect(css).toContain('--reading-measure: 35ic');
    expect(css).not.toMatch(/--reading-measure:\s*[\d.]+(?:px|ch)/);
  });
  it('separates four page families and stacks reading rails before notebook widths', () => {
    for (const family of ['reading', 'list', 'tool', 'wide']) {
      expect(css).toContain(`.layout-${family}`);
    }
    expect(css).toContain('@media (min-width: 72rem)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) var(--layout-rail)');
  });
  it.each(['blog/[slug]', 'cases/[id]', 'interpretations/[id]'])('%s preserves a separate article and supplemental rail', route => {
    const source = read(`src/app/${route}/page.tsx`);
    expect(source).toContain('layout-reading layout-reading--with-rail');
    expect(source).toContain('className="reading-main"');
    expect(source).toContain('className="reading-sidebar"');
    expect(source).not.toContain('hidden lg:block');
    expect(source).toContain('reading-sidebar-content');
    expect(source).not.toContain('sticky top-24');
    expect(source).not.toContain('1fr_280px');
  });
  it.each(['contact', 'subsidy'])('%s uses the working-area layout', route => {
    const source = read(`src/app/${route}/page.tsx`);
    expect(source).toContain('className="layout-tool"');
    expect(source).toContain('className="tool-layout"');
    expect(source).not.toContain('1fr_320px');
  });
  it('opts legal detail typography in without enlarging compact list previews', () => {
    expect(read('src/app/database/_components/MarkdownSnippet.tsx')).toContain("variant = 'snippet'");
    for (const route of ['cases', 'interpretations']) {
      expect(read(`src/app/${route}/[id]/page.tsx`)).toContain('<MarkdownSnippet variant="reading"');
    }
    expect(read('src/app/decisions/[id]/page.tsx')).toContain('reading-prose whitespace-pre-wrap');
    expect(read('src/app/decisions/page.tsx')).toContain('className="layout-list"');
  });
  it('reserves sticky-header clearance for notes and return references', () => {
    expect(css).toContain('--reading-anchor-offset: 6rem');
    expect(css).toContain('.reading-prose :is([data-footnote-ref], .footnotes li[id])');
    expect(css).toContain('.blog-content :is([data-footnote-ref], .footnotes li[id])');
    expect(css).toContain('scroll-margin-block-start: var(--reading-anchor-offset)');
  });
  it('keeps legacy outer width magic numbers out of public TSX', () => {
    const scan = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      if (e.name === 'admin') return [];
      const path = join(dir, e.name);
      return e.isDirectory() ? scan(path) : e.name.endsWith('.tsx') ? [path] : [];
    });
    const offending = scan(join(process.cwd(), 'src/app')).filter(path => /max-w-\[(?:820|1100|1400|760)px\]/.test(readFileSync(path, 'utf8')));
    expect(offending).toEqual([]);
  });
});
