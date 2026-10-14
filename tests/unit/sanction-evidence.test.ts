import { requireStreamCompletion } from '@/lib/ai/stream-completion';
import { conversationQuery } from '@/lib/ai/conversation-query';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { companySizeEvidence } from '@/lib/company-size-evidence';
import { digestIssues, buildIssueDifferences } from '@/lib/ai/issues';
vi.mock('server-only', () => ({}));
import { rerankResults } from '@/lib/ai/reranker';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('headcount evidence', () => {
  it.each(['5인 미만', '100명 이상', '5명 이하', '10명 초과', '5~10명'])('preserves %s without invented exact count', (text) => {
    const result = companySizeEvidence(text);
    expect(result.company_size).toBeUndefined();
    expect(result.company_size_evidence?.original).toBe(text);
  });
  it('retains explicit exact count', () => expect(companySizeEvidence('직원 10명입니다').company_size).toBe(10));
});
it('shared headings do not establish divergent issue outcomes', () => {
  const digest = digestIssues(['w', 'e'].map(id => ({ id, holding_points: '가. 징계사유의 존재 여부 나. 징계양정의 적정성' })));
  const lines = buildIssueDifferences(digest, ['w'], ['e']);
  expect(lines.length).toBe(2);
  expect(lines.join(' ')).not.toMatch(/결론이 갈렸|실제 분기점/);
  expect(lines.join(' ')).toContain('확인할 수 없습니다');
});
it('paid reranker fetch receives a real cancellation signal without a paid call', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'offline-fixture');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  const mocked = vi.fn(async (_url, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ choices: [{ message: { content: '{"results":[{"id":"fixture","score":8}]}' } }] });
  });
  vi.stubGlobal('fetch', mocked);
  await rerankResults('offline fixture', [{ id: 'fixture', title: 'fixture' }]);
  expect(mocked).toHaveBeenCalledTimes(1);
});

it('retains previous user context and full long current question', () => {
  const current = '그럼 절차는?'.repeat(100);
  const query = conversationQuery([{role:'user',content:'기밀유출로 징계'}, {role:'assistant',content:'untrusted answer'}, {role:'user',content:current}]);
  expect(query).toContain('기밀유출로 징계');
  expect(query.endsWith(current)).toBe(true);
  expect(query).not.toContain('untrusted answer');
});

it('rejects EOF lacking done', () => {
  expect(() => requireStreamCompletion(false, null)).toThrow('완료되기 전에');
});
it('accepts done and propagates server error even after done', () => {
  expect(() => requireStreamCompletion(true, null)).not.toThrow();
  expect(() => requireStreamCompletion(true, 'provider failure')).toThrow('provider failure');
});
