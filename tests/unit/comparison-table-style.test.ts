import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync('src/app/globals.css', 'utf8');
describe('small-screen comparison table scope', () => {
  it('opts only fourth-cell tables inside their existing scroll region into a readable minimum', () => {
    expect(css).toContain('@media (max-width: 47.999rem)');
    expect(css).toContain('.reading-table-scroll > table:has(> thead > tr > :nth-child(4), > tbody > tr > :nth-child(4))');
    expect(css).toContain('min-inline-size: 35rem;');
    expect(css).not.toContain('.reading-table-scroll > table { min-inline-size: 35rem');
  });
});
