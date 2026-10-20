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

describe('reference-backed draft versus withheld output', () => {
  const draft = '근로기준법 제56조 관련 합성 설명. 사업장 적용 여부는 별도 검토가 필요합니다.';
  it.each([
    ['complete reference', [row], true, true],
    ['missing article', [], true, false],
    ['missing date', [{ ...row, effective_date: null }], true, false],
    ['conflicting revisions', [row, row], true, false],
    ['future date', [{ ...row, article_effective_date: '2027-01-01' }], true, false],
    ['incomplete generation', [row], false, false],
  ])('%s', async (_name, data, complete, released) => {
    const result = await run(data);
    const output = legalReviewOutput(draft, result, complete);
    expect(output.includes(draft)).toBe(released);
    expect(result.status).toBe('review_required');
    expect(output).toContain('검토 필요');
    if (released) expect(output.indexOf('검토 필요')).toBeLessThan(output.indexOf(draft));
  });
  it('withholds a mixed answer if even one reference is unresolved', async () => {
    const text = '근로기준법 제56조와 고용보험법 제40조 관련 합성 설명';
    const result = await verifyCitations(text, { applicableOn: '2026-10-20', lookup: async () => ({ data: [row] }) });
    expect(result.evidence.map(e => e.status)).toEqual(['reference_found', 'review_required']);
    expect(legalReviewOutput(text, result, true)).not.toContain(text);
  });
});

describe('explicit statutory citation coverage', () => {
  it.each([
    '근로기준법 제56조와 민법 제99999조 관련 합성 설명',
    '근로기준법 제56조 및 제99999조 관련 합성 설명',
    '근로기준법 제56조, 제57조 관련 합성 설명',
    '근로기준법 제56조·57조 관련 합성 설명',
    '근로기준법 제56조 제57조 관련 합성 설명',
    '근로기준법 제56조와 근로기준법 시행령 제99999조 관련 합성 설명',
    '근로기준법 제56조와 근로기준법 시행규칙 제99999조 관련 합성 설명',
    '근로기준법 제56조부터 제58조 관련 합성 설명',
  ])('withholds unresolved explicit citation: %s', async text => {
    const result = await verifyCitations(text, { lookup: async () => ({ data: [row] }) });
    expect(result.citations.length).toBeGreaterThan(1);
    expect(result.evidence.some(e => e.status === 'review_required')).toBe(true);
    expect(legalReviewOutput(text, result, true)).not.toContain(text);
  });
  it.each(['「근로기준법」 제56조', '『근로기준법』 제56조', '근로기준법 제56조에 관한 2026년 10월 20일, 2명, 50시간, 출근율 100% 관련 합성 설명'])('preserves supported spelling and ordinary numbers: %s', async text => {
    const result = await verifyCitations(text, { lookup: async () => ({ data: [row] }) });
    expect(result.citations).toHaveLength(1);
    expect(result.evidence[0].status).toBe('reference_found');
    expect(legalReviewOutput(text, result, true)).toContain(text);
  });
  it('releases a listed pair only after both references are found', async () => {
    const text = '근로기준법 제56조 및 제57조 관련 합성 설명';
    const result = await verifyCitations(text, { lookup: async () => ({ data: [row, { ...row, article_label: '제57조' }] }) });
    expect(result.citations).toHaveLength(2);
    expect(legalReviewOutput(text, result, true)).toContain(text);
  });
  it('does not confuse the Retirement Benefit Act name with guaranteed correctness', async () => {
    const text = '「근로자퇴직급여 보장법」 제8조 관련 합성 참고 설명';
    const result = await verifyCitations(text, { lookup: async () => ({ data: [{ ...row, law_name: '근로자퇴직급여 보장법', article_label: '제8조' }] }) });
    expect(result.evidence[0].status).toBe('reference_found');
    expect(legalReviewOutput(text, result, true)).toContain(text);
    expect(legalReviewOutput(text + ' 정답을 보장합니다.', result, true)).not.toContain('정답을 보장합니다.');
  });
  it('cancels a hanging cache lookup when the request aborts', async () => {
    const controller = new AbortController();
    const pending = verifyCitations('근로기준법 제56조', { signal: controller.signal, lookup: () => new Promise(() => {}) });
    controller.abort();
    expect((await pending).reason).toBe('lookup_cancelled');
  });
});
