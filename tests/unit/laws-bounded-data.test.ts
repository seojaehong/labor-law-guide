import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchArticles, splitArticles, type StdArticle, type StdRule } from '@/lib/laws/standard-check';
const read = (f: string) => JSON.parse(readFileSync(`public/data/laws/${f}.json`, 'utf8'));
describe('bounded production review data (structural checks, not legal verification)', () => {
  // 2026-10-05 재홍님 지시로 2023.1. 이후 데이터·매핑(검수 목록 docs/work-rules-mapping-review.md)을 병합 — 22건·20251001 고정을 풀었다
  it('collection window starts 2023 and every mapping links to a standard article', () => {
    expect(read('index').since).toBe('20230101');
    const rules: StdRule[] = read('rules').rules;
    expect(rules.length).toBeGreaterThanOrEqual(22);
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
