import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFaqContext } from '@/lib/chat/context/faq';
import { faqReferences, validateFaqCitations, createFaqCitationGuard, providerCompletion, requireProviderCompletion } from '@/lib/ai/faq-evidence';
vi.mock('@/lib/chat/context/jev', () => ({ jevRerank: async (_query: string, rows: unknown[], count: number) => rows.slice(0, count) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('uses the selected record snapshot for both prompt and UI even if a later lookup would differ', async () => {
  vi.stubEnv('JEV_ON', 'true');
  const rows = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, question: `질문${index}`, answer: `첫 조회 답변${index}`, source: `출처${index}` }));
  const secondLookup = vi.fn(() => ({ select: () => ({ in: () => ({ limit: async () => ({ data: rows.map(row => ({ ...row, answer: '변경된 두 번째 조회 답변' })) }) }) }) }));
  const db = { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }), from: secondLookup } as unknown as SupabaseClient;
  const selected = await buildFaqContext(db, '오프라인 질문', null);
  const refs = faqReferences(selected.selectedFaqs);
  expect(refs).toHaveLength(5);
  expect(refs.map(row => row.id)).toEqual(selected.topIds);
  for (const row of refs) expect(selected.context).toContain(row.answer);
  expect(refs[0].source).toBe('출처0');
  expect(secondLookup).not.toHaveBeenCalled();
});
it('only current FAQ IDs survive bracket, bare, arbitrary bracket and markdown citation forms', () => {
  const text = '[FAQ#123] FAQ#999 [설명 FAQ#999] [허구](/faq?id=999) [허구](https://fake.invalid/faq?id=999) [원문](/faq?id=123)';
  const result = validateFaqCitations(text, [123]);
  expect(result).toContain('[FAQ#123]');expect(result).toContain('[원문](/faq?id=123)');
  expect(result).not.toContain('FAQ#999');expect(result).not.toContain('id=999');
  expect(validateFaqCitations('[FAQ#123]', [])).not.toContain('FAQ#123');
});
it('every stream split hides invented citation IDs before display', () => {
  const text = '설명 [임의 FAQ#999] [허구](/faq?id=999) [FAQ#123] 끝';
  const expected = validateFaqCitations(text, [123]);
  for (let index = 0; index <= text.length; index++) {
    const guard = createFaqCitationGuard([123]);
    const first = guard.push(text.slice(0, index));
    const second = guard.push(text.slice(index));
    expect(first + second + guard.flush()).toBe(expected);
    expect(first + second).not.toContain('FAQ#999');
  }
});
it.each(['openai', 'gemini', 'anthropic'])('requires %s provider terminal rather than app EOF', provider => {
  const terminal = provider === 'anthropic' ? '{"type":"message_stop"}' : '[DONE]';
  expect(providerCompletion(provider, terminal)).toBe(true);
  expect(providerCompletion(provider, '{"choices":[{"delta":{"content":"partial"}}]}')).toBe(false);
  expect(() => requireProviderCompletion(false)).toThrow('완료되기 전에');
  expect(() => requireProviderCompletion(true)).not.toThrow();
});

it('closed FAQ citation releases following prose before stream completion', () => {
  const guard = createFaqCitationGuard([123]);
  expect(guard.push('[FAQ#123] ')).toContain('[FAQ#123]');
  expect(guard.push('첫 문장이 보입니다. 다음 문장도 ')).toContain('첫 문장이 보입니다.');
  expect(guard.flush()).not.toContain('FAQ#999');
});
it('verified same-origin absolute FAQ links normalize while lookalikes are stripped', () => {
  expect(validateFaqCitations('[원문](https://yellowenvelope.kr/faq?id=123)', [123])).toBe('[원문](/faq?id=123)');
  expect(validateFaqCitations('[허구](https://yellowenvelope.kr/faq?id=999)', [123])).toBe('허구');
  expect(validateFaqCitations('[외부](https://fake.invalid/faq?id=123)', [123])).toBe('외부');
});
