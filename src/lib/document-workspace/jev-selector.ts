import 'server-only';
import { rerankPublicLaws, preparePublicLawRequest } from '@/lib/chat/context/public-law-rerank';
import { type BudgetRepository, type Pricing } from './budget';
import { requireOfflineTransport } from './mock-transport';
type PublicLaw = { law_name: string; article_label: string; article_title: string | null; body: string | null };

/** Existing PR27 public-only selector, now bounded by a durable reservation.
 * No credentials are read unless the existing adapter is explicitly enabled.
 * Its legacy return contract omits usage/status: conservatively retain maximum cost.
 */
export async function selectPublicLawEvidence<T extends PublicLaw>(input: {
  enabled: boolean; requestId: string; publicTopic: 'dismissal'; laws: T[];
  store: BudgetRepository; pricing: Pricing;
}): Promise<T[]> {
  if (!input.enabled || process.env.TYPESAFE_JEV_PUBLIC_LAWS_ON !== 'true') return input.laws;
  const transport = requireOfflineTransport();
  // Official jev-1.13.0 pricing: $0.042/M input tokens, output free (2026-10-12).
  // Mock-only until actual quality/call approval; this is not an output-fee issue.
  const concepts = input.publicTopic === 'dismissal' ? '근로기준법 부당해고 서면 통지 구제신청' : '';
  // Complete public text/hash validation occurs before cost reservation or provider call.
  const payload = preparePublicLawRequest(concepts, input.laws);
  if (!payload) return input.laws;
  await input.store.reserve(input.requestId, 'jev-1.13.0', 32000, 0, input.pricing);
  const start = Date.now();
  try { return await rerankPublicLaws(concepts, input.laws, transport.fetch); }
  finally {
    // SDK result has no authoritative usage. Missing key/failure/success all keep reserve.
    // Settlement errors also keep the original persistent pending maximum.
    try { await input.store.finish(input.requestId, undefined, input.pricing, 32000, 0, Date.now() - start, false); }
    catch { /* never release or retry */ }
  }
}
