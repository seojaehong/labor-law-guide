import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fetch: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc: mocks.rpc,
  from: () => {
    const builder = { select: () => builder, in: () => builder, overlaps: () => builder,
      not: () => builder, limit: () => Promise.resolve({ data: mocks.rows, error: null }) };
    return builder;
  },
}) }));
vi.mock('@/lib/ai/reranker', () => ({ rerankResults: vi.fn() }));
vi.mock('@/lib/search/ai-query-rewriter', () => ({ rewriteQuery: vi.fn() }));
import { searchCases } from '@/lib/ai/retrieval';

function fixture(id: string, score: number, outcome = 'dismissed') {
  return { id, title: `기밀유출 ${id}`, decision_result: outcome,
    holding_points: '회사의 영업비밀 유출 사실과 징계 절차를 구체적으로 검토한 판정 내용입니다.',
    reason_category: ['misconduct'], issue_type_primary: 'misconduct',
    embedding: [score, Math.sqrt(1 - score * score)] };
}

describe('retrieval request and evidence contract (offline)', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    let tick = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => tick++);
    vi.stubEnv('OPENAI_API_KEY', 'offline-placeholder');
    vi.stubEnv('SKIP_RPC', 'true');
    vi.stubEnv('SKIP_AI_RETRIEVAL_HEAVY', 'true');
    mocks.rpc.mockReset();
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: [1, 0] }] }) });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('embeds each distinct request even after prior timing was nonzero', async () => {
    mocks.rows = [fixture('id_1', 0.8)];
    const first = await searchCases(['징계해고'], '기밀유출 첫 번째 독립 질문');
    const second = await searchCases(['징계해고'], '기밀유출 두 번째 독립 질문');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(first.timings).not.toBe(second.timings);
    expect(first.cases).toHaveLength(1);
    expect(second.cases).toHaveLength(1);
  });

  it('reuses the request embedding when RPC falls back to candidate queries', async () => {
    vi.stubEnv('SKIP_RPC', 'false');
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.rows = [fixture('id_fallback', 0.8)];
    const result = await searchCases(['징계해고'], '기밀유출 RPC fallback 질문');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(result.cases.map(c => c.id)).toEqual(['id_fallback']);
    expect(result.timings.rpcRows).toBe(0);
  });

  it('does not restore unrelated cases to fill a minimum of three', async () => {
    mocks.rows = [fixture('id_good', 0.8), fixture('id_noise1', 0.2), fixture('id_noise2', 0.1)];
    const result = await searchCases(['징계해고'], '기밀유출 임계값 검증 질문');
    expect(result.cases.map(c => c.id)).toEqual(['id_good']);
    expect(result.allCases).toHaveLength(1);
    expect(result.allCases[0]).not.toHaveProperty('embedding');
  });

  it('returns no evidence when every semantic candidate is below threshold', async () => {
    mocks.rows = [fixture('id_noise', 0.2)];
    const result = await searchCases(['징계해고'], '기밀유출 근거 부족 질문');
    expect(result.cases).toEqual([]);
  });

  it('preserves relevance order instead of promoting an opposite outcome or source', async () => {
    mocks.rows = [...[0.95, 0.9, 0.85, 0.8, 0.75].map((n, i) => fixture(`id_${i}`, n)),
      fixture('id_opposite', 0.4, 'granted')];
    const result = await searchCases(['징계해고'], '기밀유출 순위 보존 질문');
    expect(result.cases.map(c => c.id)).toEqual(['id_0', 'id_1', 'id_2', 'id_3', 'id_4']);
  });

  it('never uses empty holding stubs as evidence', async () => {
    mocks.rows = [{ ...fixture('id_stub', 0.9), holding_points: '별지 기재 참조' }];
    const result = await searchCases(['징계해고'], '기밀유출 빈 본문 질문');
    expect(result.cases).toEqual([]);
  });
});
