import { describe, expect, it, vi } from 'vitest';
import { citationReviewMessage, legalReviewOutput, verifyCitations, type CachedArticle } from '@/lib/legal-verify';
const row: CachedArticle = { law_name: '근로기준법', article_label: '제56조', body: '합성 조문',
  effective_date: '2025-01-01', article_effective_date: null, law_mst: '123', source: '법제처',
  is_deleted: false, exists_flag: true };
const run = (data: unknown) => verifyCitations('근로기준법 제56조에 따라 확실히 적법합니다.', {
  applicableOn: '2026-10-20', lookup: async () => ({ data, error: null }),
});
describe('fail closed cached legal reference review', () => {
  it('article presence never certifies meaning, applicability or correctness', async () => {
    const result = await run([row]);
    expect(result.status).toBe('review_required');
    expect(result.evidence[0].status).toBe('reference_found');
    const message = citationReviewMessage(result);
    expect(message).toContain('본문을 보류');
    expect(message).not.toContain('확실히 적법합니다');
    expect(message).toContain('정답을 보증하지 않습니다');
    expect(message).toContain('2025-01-01');
    expect(message).toContain('https://www.law.go.kr/');
    expect(legalReviewOutput('확실히 적법합니다', result, true)).not.toContain('확실히 적법합니다');
    const draft = '근로기준법 제56조 관련 합성 참고 설명';
    const output = legalReviewOutput(draft, result, true);
    expect(output).toContain('미검수 참고 초안');
    expect(output.indexOf('검토 필요')).toBeLessThan(output.indexOf(draft));
    expect(legalReviewOutput(draft, result, false)).not.toContain(draft);
  });
  it.each([
    [[], 'reference_not_found'],
    [[row, { ...row, effective_date: '2024-01-01' }], 'conflicting_revisions'],
    [[{ ...row, effective_date: null }], 'missing_effective_date'],
    [[{ ...row, article_effective_date: '2027-01-01' }], 'not_yet_effective'],
    [[{ ...row, effective_date: '2025-02-30' }], 'missing_effective_date'],
    [[{ ...row, law_mst: null }], 'missing_source_or_text'],
    [[{ ...row, is_deleted: true }], 'deleted_or_unknown'],
  ])('leaves incomplete/conflicting evidence for review', async (data, reason) => {
    const result = await run(data);
    expect(result.status).toBe('review_required');
    expect(result.evidence[0]).toMatchObject({ status: 'review_required', reason });
  });
  it.each([null, 'invalid JSON', [{ fake: true }]])('rejects malformed responses', async data => {
    expect((await run(data)).status).toBe('review_required');
    expect((await run(data)).evidence[0].status).toBe('review_required');
  });
  it('handles missing configuration without initializing a client', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    try { expect((await verifyCitations('근로기준법 제56조')).reason).toBe('lookup_unavailable'); }
    finally { vi.unstubAllEnvs(); }
  });
  it('handles rejected API and bounds hanging requests', async () => {
    expect((await verifyCitations('근로기준법 제56조', { lookup: async () => { throw new Error('synthetic'); } })).reason).toBe('lookup_unavailable');
    expect((await verifyCitations('근로기준법 제56조', { timeoutMs: 1, lookup: () => new Promise(() => {}) })).reason).toBe('lookup_timeout');
  });
  it('does not approve absent/unsupported citations', async () => {
    expect((await verifyCitations('확실히 적합합니다')).reason).toBe('no_supported_citation');
  });
});
