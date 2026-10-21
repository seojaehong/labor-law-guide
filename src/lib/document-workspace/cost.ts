export type Rate = { numerator: number; denominator: number };
export type RawAnthropicUsage = {
  input_tokens: number; output_tokens: number; cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cache_creation: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
};
export type TokenUsage = { inputTokens: number; outputTokens: number; anthropic?: RawAnthropicUsage };
export type ExactRates = { input: Rate; output: Rate; cacheRead: Rate; cacheWrite5m: Rate; cacheWrite1h: Rate };
export type Price = {
  inputMicroUsdPerToken: number; outputMicroUsdPerToken: number;
  reviewed: boolean; exact?: ExactRates; kind?: 'fixture' | 'official';
};
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0;
export function validUsage(u: TokenUsage): boolean {
  if (!safe(u.inputTokens) || !safe(u.outputTokens)) return false;
  if (!u.anthropic) return true;
  const r = u.anthropic;
  if (!r.cache_creation || ![r.input_tokens, r.output_tokens, r.cache_read_input_tokens,
    r.cache_creation_input_tokens, r.cache_creation.ephemeral_5m_input_tokens,
    r.cache_creation.ephemeral_1h_input_tokens].every(safe)) return false;
  const created = r.cache_creation.ephemeral_5m_input_tokens + r.cache_creation.ephemeral_1h_input_tokens;
  const total = r.input_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens;
  return safe(created) && safe(total) && created === r.cache_creation_input_tokens &&
    total === u.inputTokens && r.output_tokens === u.outputTokens;
}
export function rates(p: Price): ExactRates {
  if (!p.reviewed) throw Error('unreviewed-price');
  const input = { numerator: p.inputMicroUsdPerToken, denominator: 1 };
  const output = { numerator: p.outputMicroUsdPerToken, denominator: 1 };
  const result = p.exact || { input, output, cacheRead: input, cacheWrite5m: input, cacheWrite1h: input };
  for (const rate of Object.values(result))
    if (!safe(rate.numerator) || !safe(rate.denominator) || rate.denominator === 0) throw Error('unreviewed-price');
  return result;
}
function charge(tokens: number, rate: Rate): bigint {
  if (!safe(tokens)) throw Error('invalid-usage');
  const n = BigInt(tokens) * BigInt(rate.numerator), d = BigInt(rate.denominator);
  return (n + d - BigInt(1)) / d; // conservative ceiling per billed category
}
function number(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('invalid-reservation');
  return Number(n);
}
export function reservation(p: Price, input: number, output: number): number {
  const r = rates(p);
  const maximum = [r.input,r.cacheRead,r.cacheWrite5m,r.cacheWrite1h]
    .reduce((a,b) => BigInt(a.numerator)*BigInt(b.denominator) >= BigInt(b.numerator)*BigInt(a.denominator) ? a : b);
  return number(charge(input,maximum) + charge(output,r.output));
}
export function usageCost(p: Price, u: TokenUsage): number {
  if (!validUsage(u)) throw Error('invalid-usage');
  const r = rates(p), raw = u.anthropic;
  return number(raw ? charge(raw.input_tokens,r.input) + charge(raw.output_tokens,r.output) +
    charge(raw.cache_read_input_tokens,r.cacheRead) +
    charge(raw.cache_creation.ephemeral_5m_input_tokens,r.cacheWrite5m) +
    charge(raw.cache_creation.ephemeral_1h_input_tokens,r.cacheWrite1h) :
    charge(u.inputTokens,r.input) + charge(u.outputTokens,r.output));
}
