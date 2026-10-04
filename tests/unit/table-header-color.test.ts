import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('blog table header foreground', () => {
  it('inherits authored row colors instead of overriding paired backgrounds', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    const rule = css.match(/\.blog-content th\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain('color: inherit');
    expect(rule).not.toContain('color: var(--grey-900)');
  });
});
