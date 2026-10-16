import { type BudgetRepository, type Pricing, type Usage } from './budget';
import { PUBLIC_EVIDENCE } from './workflow';

export type Role = 'ordinary' | 'complex' | 'document';
export type ModelPolicy = { model: string; pricing: Pricing; inputCap: number; outputCap: number; timeoutMs: number };
export type Generator = (request: { model: string; prompt: string; maxOutputTokens: number; signal: AbortSignal }) => Promise<{ text: string; usage?: Usage }>;
export type PublicSelector = (request: { topic: 'dismissal'; candidates: typeof PUBLIC_EVIDENCE }) => Promise<string[]>;

export async function choosePublicEvidence(selector?: PublicSelector): Promise<string[]> {
  const ordinary = PUBLIC_EVIDENCE.map(e => e.id);
  if (!selector) return ordinary;
  try {
    // Fixed public legal topic and public headings only. No case facts or document body.
    const ids = await selector({ topic: 'dismissal', candidates: PUBLIC_EVIDENCE });
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !ordinary.includes(id as typeof ordinary[number]))) return ordinary;
    return [...ids, ...ordinary.filter(id => !ids.includes(id))];
  } catch { return ordinary; }
}

export async function runModel(input: {
  enabled: boolean; requestId: string; role: Role; prompt: string; policies: Partial<Record<Role, ModelPolicy>>;
  store: BudgetRepository; generator: Generator;
}): Promise<{ text: string; model: string; role: Role }> {
  if (!input.enabled) throw Error('model-mix-disabled');
  const p = input.policies[input.role];
  if (!p || !p.pricing.reviewed) throw Error('model-role-unreviewed');
  if (!Number.isSafeInteger(p.timeoutMs) || p.timeoutMs < 1 || p.timeoutMs > 60000 ||
    p.inputCap > 32768 || p.outputCap > 16384 || p.outputCap < 1) throw Error('invalid-policy');
  // UTF-8 bytes bound the synthetic input without an unverified tokenizer estimate.
  if (Buffer.byteLength(input.prompt, 'utf8') > p.inputCap) throw Error('input-cap');
  await input.store.reserve(input.requestId, p.model, p.inputCap, p.outputCap, p.pricing);
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  try {
    const result = await Promise.race([
      input.generator({ model: p.model, prompt: input.prompt, maxOutputTokens: p.outputCap, signal: controller.signal }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('generation-timeout')); }, p.timeoutMs); }),
    ]);
    if (typeof result.text !== 'string' || !result.text.trim() || Buffer.byteLength(result.text, 'utf8') > p.outputCap * 16 ||
      !result.usage || result.usage.inputTokens > p.inputCap || result.usage.outputTokens > p.outputCap ||
      ![result.usage.inputTokens, result.usage.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('invalid-generation');
    await input.store.finish(input.requestId, result.usage, p.pricing, p.inputCap, p.outputCap, Date.now() - started, true);
    return { text: result.text, model: p.model, role: input.role };
  } catch {
    // Do not retry or start fallback: abort is not proof the provider stopped billing.
    try { await input.store.finish(input.requestId, undefined, p.pricing, p.inputCap, p.outputCap, Date.now() - started, false); }
    catch { /* persistent pending reservation continues blocking; never release on storage error */ }
    throw Error('generation-abstained');
  } finally { clearTimeout(timer); controller.abort(); }
}
