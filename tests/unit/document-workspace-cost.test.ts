import { expect, it } from 'vitest';
import { reservation, usageCost, validUsage, type TokenUsage } from '@/lib/document-workspace/cost';
import { PRICE_REFERENCE } from '@/lib/document-workspace/official-prices';
const usage = (): TokenUsage => ({ inputTokens: 20, outputTokens: 3,
  anthropic: { input_tokens: 4, output_tokens: 3, cache_read_input_tokens: 6,
    cache_creation_input_tokens: 10, cache_creation: { ephemeral_5m_input_tokens: 7, ephemeral_1h_input_tokens: 3 } } });
it('fractional Haiku/Jev rates retain exact scale and ceil conservatively', () => {
  expect(reservation(PRICE_REFERENCE['jev-1.13.0'], 1000, 0)).toBe(42);
  expect(reservation(PRICE_REFERENCE['jev-1.13.0'], 1, 0)).toBe(1);
  expect(reservation(PRICE_REFERENCE['claude-haiku-5-5'], 1000, 0)).toBe(200);
  expect(usageCost(PRICE_REFERENCE['claude-haiku-5-5'], usage())).toBe(6);
});
it('cache totals and normalized totals agree exactly', () => {
  expect(validUsage(usage())).toBe(true);
  const a=usage();a.anthropic!.cache_creation_input_tokens++;expect(validUsage(a)).toBe(false);
  const b=usage();b.inputTokens++;expect(validUsage(b)).toBe(false);
});
it.each([NaN,Infinity,-1,.5,Number.MAX_SAFE_INTEGER+1])('rejects every invalid raw token %s', n => {
  for(const field of ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'] as const) {
    const a=usage();a.anthropic![field]=n;expect(validUsage(a)).toBe(false);
  }
  for(const field of ['ephemeral_5m_input_tokens','ephemeral_1h_input_tokens'] as const) {
    const a=usage();a.anthropic!.cache_creation[field]=n;expect(validUsage(a)).toBe(false);
  }
});
