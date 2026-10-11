/** Corrective patch for PR22 head. Legacy free-text scope remains disabled by default.
 * This patch changes the failure policy; the public-only integration is separate.
 * Do not enable this legacy free-text path as part of the public-only integration.
 */
export type Jevable = { question?: string | null; answer?: string | null };

const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS) || 2500;
const API_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-1.13.0';
/** 1위 확률이 이보다 낮으면 재선택을 **적용하지 않는다**(원래 순서 유지). */
const MIN_TOP_PROB = Number(process.env.JEV_MIN_PROB) || 0.12;

/** Only locally classified errors may reach logs; provider bodies can contain user data. */
class RerankError extends Error {
  constructor(readonly code: 'timeout' | 'http' | 'invalid-response', readonly status?: number) {
    super(code);
  }
}

function failureCode(error: unknown): string {
  return error instanceof RerankError
    ? `${error.code}${error.status === undefined ? '' : `:${error.status}`}`
    : 'provider-error';
}

/** Bound the whole operation, including JSON body reads, and always release the timer.
 * TypeSafe fetch consumes the signal; no second provider is called.
 */
async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RerankError('timeout'));
          controller.abort();
        }, TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function choiceIndex(id: unknown, order: number[]): number {
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
    throw new RerankError('invalid-response');
  }
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n > order.length) throw new RerankError('invalid-response');
  return order[n - 1];
}

/** 후보를 criteria 객체로 만든다. 키는 1-기반 번호, 값은 설명이다. */
function criteria(items: Jevable[], order: number[]): Record<string, string> {
  const out: Record<string, string> = {};
  order.forEach((idx, i) => {
    out[String(i + 1)] = (items[idx].question || '').slice(0, 120);
  });
  return out;
}

async function askJev(
  query: string,
  items: Jevable[],
  order: number[],
  signal: AbortSignal
): Promise<{ picks: number[]; topProb: number }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('TYPESAFE_API_KEY 없음');

  const res = await fetch(API_URL, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      state: `사용자 질문: ${query}`,
      questions: {
        pick: {
          type: 'choice',
          question: '이 질문에 직접 답이 되는 것은 무엇인가',
          criteria: criteria(items, order),
        },
      },
    }),
  });
  if (!res.ok) throw new RerankError('http', res.status);
  const body: unknown = await res.json();
  if (!isRecord(body) || !isRecord(body.answers) || !isRecord(body.answers.pick)) {
    throw new RerankError('invalid-response');
  }
  const ans = body.answers.pick;
  // Reject malformed IDs before sorting, including aliases such as "01" for "1".
  if (ans.probabilities !== undefined) {
    if (!isRecord(ans.probabilities)) throw new RerankError('invalid-response');
    const seen = new Set<number>();
    const ranked = Object.entries(ans.probabilities).map(([id, probability]) => {
      const index = choiceIndex(id, order);
      if (!isProbability(probability) || seen.has(index)) throw new RerankError('invalid-response');
      seen.add(index);
      return { index, probability };
    }).sort((a, b) => b.probability - a.probability);
    if (ranked.length > 0) {
      return { picks: ranked.map((entry) => entry.index), topProb: ranked[0].probability };
    }
  }
  if (ans.choice !== undefined) {
    const index = choiceIndex(ans.choice, order);
    const confidence = ans.confidence === undefined ? 1 : ans.confidence;
    if (!isProbability(confidence)) throw new RerankError('invalid-response');
    return { picks: [index], topProb: confidence };
  }
  return { picks: [], topProb: 0 };
}

/** PR22 guards retained. Local order is the only fallback; no generating provider. */
export async function jevRerank<T extends Jevable>(
  query: string,
  items: T[],
  finalN = 5
): Promise<T[]> {
  if (items.length <= 1) return items;

  if (process.env.TYPESAFE_JEV_ON !== 'true' || process.env.TYPESAFE_JEV_CHAT_ON !== 'true' || !process.env.TYPESAFE_API_KEY) return items.slice(0, finalN);

  try {
    const order = items.map((_, i) => i);
    const { picks, topProb } = await withTimeout((signal) => askJev(query, items, order, signal));

    // 아무것도 못 고르거나 1위 확률이 너무 낮으면 **손대지 않는다.**
    // 노무 자문은 틀린 답의 비용이 크다 — 확신 없으면 검색 순서를 그대로 둔다.
    if (picks.length === 0 || topProb < MIN_TOP_PROB) {
      console.warn(
        `[jev] 적용 안 함 picks=${picks.length} topProb=${topProb.toFixed(3)} (<${MIN_TOP_PROB})`
      );
      return items.slice(0, finalN);
    }

    // 고른 것을 앞세우고 나머지는 원래 순서로 뒤에 붙인다.
    const seen = new Set(picks);
    const rest = items.map((_, i) => i).filter((i) => !seen.has(i));
    return [...picks, ...rest].slice(0, finalN).map((i) => items[i]);
  } catch (err) {
    console.warn('[jev] failed; original order:', failureCode(err));
    return items.slice(0, finalN);
  }
}
