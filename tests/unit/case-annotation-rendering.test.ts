import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const db = vi.hoisted(() => ({ item: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase-server', () => ({ supabaseServer: {
  from: () => {
    const query = {
      select: () => query, eq: () => query, neq: () => query,
      order: () => query, limit: () => query,
      single: async () => ({ data: db.item, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return query;
  },
} }));
import CaseDetailPage, { generateMetadata } from '@/app/cases/[id]/page';

const wrap = (text: string) => `<law_cite ref="javascript:alert(1)" onclick="evil()">${text}</law_cite>`;
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
afterEach(() => vi.unstubAllGlobals());

describe('case detail citation display boundaries', () => {
  it.each([wrap, (s: string) => escape(wrap(s)), (s: string) => escape(escape(wrap(s)))])('preserves references, summary and detail without exposing wrappers', async annotate => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network allowed'); }));
    db.item = Object.freeze({
      id: 'ilabor_annotation_fixture', case_number: '합성 사건', court: '합성 법원',
      title: '합성 회귀 검증', decision_date: '2026-10-01', case_type: null,
      verdict_type: null, keywords_matched: [], summary: annotate('요약 근로기준법 제23조'),
      holding_points: annotate('상세 근로기준법 제23조 제1항') + ' 그 법률관계가 위와 같이 <law_cite ref="파',
      law_references: annotate('근로기준법 제23조\r\n제1항') + '<script>evil()</script>',
      url: 'https://example.invalid/source', original_url: null,
    });
    const original = structuredClone(db.item);
    const params = Promise.resolve({ id: 'ilabor_annotation_fixture' });
    const html = renderToStaticMarkup(await CaseDetailPage({ params }));
    expect(html).not.toMatch(/law_cite/i);
    expect(html).toContain('근로기준법 제23조\r\n제1항');
    expect(html).toContain('요약 근로기준법 제23조');
    expect(html).toContain('상세 근로기준법 제23조 제1항');
    expect(html).toContain('그 법률관계가 위와 같이 [수집 중 끊긴 인용 표기]');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
    expect(html).not.toMatch(/onclick=|href="javascript:|<script>evil/);
    const metadata = await generateMetadata({ params });
    expect(metadata.description).toBe('요약 근로기준법 제23조');
    expect(metadata.alternates?.canonical).toContain('/cases/ilabor_annotation_fixture');
    expect(db.item).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });
});
