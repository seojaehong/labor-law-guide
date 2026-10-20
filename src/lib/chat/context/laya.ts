/** Experimental adapter. Deliberately not connected to live FAQ/law retrieval.
 * A reviewed local inference bridge must be supplied explicitly. Scores express
 * model preference, never legal correctness. No remote or generating fallback.
 */
import type { Jevable } from './jev';

export type LayaScore = (query: string, candidates: readonly Jevable[], signal: AbortSignal) => Promise<unknown>;
export async function layaRerank<T extends Jevable>(
  query: string, items: T[],
  options: { enabled?: boolean; score?: LayaScore; timeoutMs?: number; topN?: number } = {},
): Promise<T[]> {
  const topN = Number.isSafeInteger(options.topN) && options.topN! > 0 ? options.topN! : 5;
  const baseline = () => items.slice(0, topN);
  if (!options.enabled || !options.score || items.length < 2) return baseline();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = options.timeoutMs ?? 2500;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30000) return baseline();
  try {
    const result = await Promise.race([
      options.score(query, items, controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeout); }),
    ]);
    // Require a complete positional vector; reject omissions, NaN, infinity and aliases.
    if (!Array.isArray(result) || result.length !== items.length ||
        !result.every(s => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1)) return baseline();
    return items.map((item, index) => ({ item, index, score: result[index] as number }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, topN).map(x => x.item);
  } catch {
    return baseline();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
