import type { Pricing } from './budget';
// Reference only, not activation approval. First-party standard rates; no batch/geo premium.
// Checked https://platform.claude.com/docs/en/about-claude/pricing and
// https://docs.typesafe.ai/models on 2026-10-13. Fixtures remain separate.
const rate = (numerator: number, denominator = 1000) => ({ numerator, denominator });
export const PRICE_REFERENCE: Record<string, Pricing> = {
  'claude-haiku-5-5': { reviewed: true, kind: 'official', inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0,
    exact: { input: rate(100), output: rate(500), cacheRead: rate(10),
      cacheWrite5m: rate(125), cacheWrite1h: rate(200) } },
  'claude-sonnet-5-5': { reviewed: true, kind: 'official', inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0,
    exact: { input: rate(2000), output: rate(10000), cacheRead: rate(100),
      cacheWrite5m: rate(2500), cacheWrite1h: rate(4000) } },
  'jev-1.13.0': { reviewed: true, kind: 'official', inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0,
    exact: { input: rate(42), output: rate(0), cacheRead: rate(42),
      cacheWrite5m: rate(42), cacheWrite1h: rate(42) } },
};
