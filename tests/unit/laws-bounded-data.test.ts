import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchArticles, splitArticles, type StdArticle, type StdRule } from '@/lib/laws/standard-check';
const read = (f: string) => JSON.parse(readFileSync(`public/data/laws/${f}.json`, 'utf8'));
describe('bounded production review data (structural checks, not legal verification)', () => {
  it('retains existing collection window and mapping count', () => {
    expect(read('index').since).toBe('20251001');
    const rules: StdRule[] = read('rules').rules;
    expect(rules).toHaveLength(22);
    const ids = new Set(read('standard').articles.map((s: StdArticle) => s.id));
    expect(rules.every(r => !!r.std?.length && r.std.every(id => ids.has(id)))).toBe(true);
  });
  it('matches each standard article back to itself', () => {
    const std: StdArticle[] = read('standard').articles;
    const matched = matchArticles(splitArticles(std.map(s => s.text).join('\n')), std);
    expect(std).toHaveLength(100);
    for (const s of std) expect(matched.get(s.id)?.some(u => u.no === s.no)).toBe(true);
  });
});
