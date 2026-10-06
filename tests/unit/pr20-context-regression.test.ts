import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  jevRerank: vi.fn(),
  getGenerativeModel: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/chat/context/jev', () => ({ jevRerank: mocks.jevRerank }));
vi.mock('@/lib/vertex/client', () => ({ getGenerativeModel: mocks.getGenerativeModel }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

import { buildFaqContext } from '@/lib/chat/context/faq';
import { buildLawsContext } from '@/lib/chat/context/laws';
import { lookupLawArticle } from '@/lib/labor-calc';

const db = { rpc: mocks.rpc } as unknown as SupabaseClient;
const query = '검증 질의';
const embedding = [0.1, 0.2];

function makeFaq(id: number) {
  return {
    id,
    unified_category: `category-${id % 4}`,
    question: `Fixture question ${id}`,
    answer: `Fixture answer ${id}`,
  };
}

function makeLaw(id: number, body = `Fixture body ${id}`) {
  return {
    law_name: '테스트법',
    article_label: `제${id}조`,
    article_title: `검증 제목 ${id}`,
    body,
    law_kind: '법률',
    effective_date: '2026-01-01',
    score: 100 - id,
    matched: 1,
  };
}

function faqIds(context: string) {
  return [...context.matchAll(/^#(\d+) \[/gm)].map((match) => Number(match[1]));
}

function lawIds(context: string) {
  return [...context.matchAll(/^\[테스트법 제(\d+)조 /gm)].map((match) => Number(match[1]));
}

// These exercise the real context builders with synthetic data, not legal quality.
// All DB/provider modules are mocked before import; no credentials are needed.
describe('PR20 context selection and truncation regressions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('JEV_ON', 'true');
    vi.stubEnv('JEV_IN', '32');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockRejectedValue(new Error('Unexpected external request'));
    mocks.getGenerativeModel.mockImplementation(() => {
      throw new Error('Unexpected provider request');
    });

    const chain = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      limit: mocks.limit,
    };
    mocks.from.mockReturnValue(chain);
    mocks.select.mockReturnValue(chain);
    mocks.eq.mockReturnValue(chain);
    mocks.order.mockReturnValue(chain);
    mocks.limit.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    try {
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.getGenerativeModel).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('buildFaqContext renders the final five reranked items in selected order', async () => {
    const candidates = Array.from({ length: 40 }, (_, i) => makeFaq(i + 1));
    const selected = [candidates[31], candidates[16], candidates[7], candidates[3], candidates[0]];
    mocks.rpc.mockResolvedValue({ data: candidates, error: null });
    mocks.jevRerank.mockResolvedValue(selected);

    const result = await buildFaqContext(db, query, embedding);

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('search_faq_combined', {
      query_text: query,
      query_embedding: embedding,
      max_results: 100,
      canonical_only: false,
    });
    expect(mocks.jevRerank).toHaveBeenCalledExactlyOnceWith(query, candidates.slice(0, 32), 5);
    expect(result.matched).toBe(true);
    expect(result.count).toBe(5);
    expect(faqIds(result.context)).toEqual([32, 17, 8, 4, 1]);
    expect(result.topIds).toEqual([32, 17, 8]);
    expect(result.categories).toEqual(['category-0', 'category-1']);
    for (const faq of selected) {
      expect(result.context).toContain(`Q: ${faq.question}\nA: ${faq.answer}\n`);
    }
    expect(result.context).toContain('[인용 규칙');
  });

  it('buildLawsContext renders the final three reranked articles in selected order', async () => {
    const candidates = Array.from({ length: 40 }, (_, i) => makeLaw(i + 1));
    mocks.rpc.mockResolvedValue({ data: candidates, error: null });
    type Candidate = { question: string; answer: string; __row: ReturnType<typeof makeLaw> };
    mocks.jevRerank.mockImplementation(async (_query: string, items: Candidate[]) => [
      items[31], items[9], items[1],
    ]);

    const result = await buildLawsContext(db, query, embedding);

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('search_law_articles_hybrid', {
      query_text: query,
      query_embedding: embedding,
      max_results: 60,
      law_hint: null,
    });
    expect(mocks.jevRerank).toHaveBeenCalledExactlyOnceWith(
      query,
      candidates.slice(0, 32).map((row) => ({
        question: `${row.law_name} ${row.article_label} (${row.article_title}) — ${row.body}`,
        answer: row.body,
        __row: row,
      })),
      3,
    );
    expect(result).toMatchObject({ rows: 3, via: 'rpc', status: 'ok' });
    expect(lawIds(result.ctx)).toEqual([32, 10, 2]);
    for (const index of [31, 9, 1]) {
      expect(result.ctx).toContain(`\n  ${candidates[index].body}\n`);
    }
    expect(result.ctx).toContain('관련 법령 조문 (3건, 법제처 원문)');
  });

  it('JEV_ON=false bypasses FAQ reranking and preserves the first eight results', async () => {
    vi.stubEnv('JEV_ON', 'false');
    const candidates = Array.from({ length: 12 }, (_, i) => makeFaq(i + 1));
    mocks.rpc.mockResolvedValue({ data: candidates, error: null });

    const result = await buildFaqContext(db, query, null);

    expect(mocks.jevRerank).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('search_faq_combined', {
      query_text: query,
      query_embedding: null,
      max_results: 8,
      canonical_only: false,
    });
    expect(result.count).toBe(8);
    expect(faqIds(result.context)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.topIds).toEqual([1, 2, 3]);
  });

  it('JEV_ON=false bypasses law reranking and preserves the first three results', async () => {
    vi.stubEnv('JEV_ON', 'false');
    const candidates = Array.from({ length: 8 }, (_, i) => makeLaw(i + 1));
    mocks.rpc.mockResolvedValue({ data: candidates, error: null });

    const result = await buildLawsContext(db, query);

    expect(mocks.jevRerank).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('search_law_articles_hybrid', {
      query_text: query,
      query_embedding: null,
      max_results: 60,
      law_hint: null,
    });
    expect(result).toMatchObject({ rows: 3, via: 'rpc', status: 'ok' });
    expect(lawIds(result.ctx)).toEqual([1, 2, 3]);
  });

  it.each([2999, 3000, 3001])('buildLawsContext handles a %i-character body at the 3000-character limit', async (length) => {
    const body = '가'.repeat(length - 1) + '끝';
    mocks.rpc.mockResolvedValue({ data: [makeLaw(1, body)], error: null });

    const result = await buildLawsContext(db, query, null);

    const renderedBody = result.ctx.match(/^  (.*)$/m)?.[1];
    const truncated = length > 3000;
    expect(result).toMatchObject({ rows: 1, via: 'rpc', status: 'ok' });
    expect(renderedBody).toBe(body.slice(0, 3000) + (truncated ? ' …(이하 생략)' : ''));
    expect(renderedBody?.includes('끝')).toBe(!truncated);
    expect(mocks.jevRerank).not.toHaveBeenCalled();
    if (truncated) {
      expect(result.ctx).toContain('단서나 준용 규정이 뒤에 있을 수 있다고');
    }
  });

  it.each([3999, 4000, 4001])('lookupLawArticle handles a %i-character body at the 4000-character limit', async (length) => {
    const body = '나'.repeat(length - 1) + '끝';
    const row = {
      ...makeLaw(76, body),
      article_number: 76,
      sub_number: 3,
      article_label: '제76조의3',
      raw_title: null,
      is_deleted: false,
      is_heading: false,
      is_byeolpyo: false,
    };
    mocks.limit.mockResolvedValue({ data: [row], error: null });

    const result = await lookupLawArticle({ law: '테스트법', article: 76, sub: 3 });

    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('law_articles');
    expect(mocks.eq.mock.calls).toEqual([
      ['law_name', '테스트법'],
      ['article_label', '제76조의3'],
    ]);
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
    expect(result).toMatchObject({
      exists: true,
      article: 76,
      sub: 3,
      body: body.slice(0, 4000),
      truncated: length > 4000,
    });
    expect(result.body?.length).toBe(Math.min(length, 4000));
    expect(result.message.endsWith(`\n${body.slice(0, 4000)}`)).toBe(true);
    expect(result.message.includes('뒷부분이 잘렸다')).toBe(length > 4000);
    expect(result.message.includes('단서가 더 있을 수 있다')).toBe(length > 4000);
  });
});
