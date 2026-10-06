/**
 * Jev 재선택 — 검색이 올린 후보를 판단 모델이 다시 고른다.
 *
 * 왜 필요한가. 임베딩이 1위로 올린 것이 자주 틀린다. 서버1 실측 기록:
 * **임베딩 1위가 49건 중 16건만 맞았고, 재선택하니 44건이 맞았다.**
 *
 * 2026-10-04 에 실제로 본 예 — 「부당노동행위 구제신청은 언제까지 해야 하나요?」로 검색했더니
 * 1위가 **「실업급여 신청은 언제까지 해야 하나요?」**였다. 「언제까지 해야 하나요」라는
 * **말투가 주제를 눌렀다.** 벡터 유사도는 문장 꼴에 끌리고 주제를 놓친다.
 *
 * ────────────────────────────────────────────────────────────────────
 * ★ 2026-10-06 — Vertex Gemini 에서 **진짜 Jev(TypeSafe System One)** 로 바꿨다.
 *
 * 종전 이 파일은 이름이 Jev 지만 안에서 Vertex Gemini 를 불렀다. Jev 의 **방법론**
 * (선택지 순서를 뒤집어 두 번 묻고 두 번 다 고른 것을 앞세우기)만 가져온 것이었다.
 * 그 방법론은 **일반 LLM 의 위치 편향을 막기 위한 것**이다.
 *
 * Jev 는 `choice` 질문에 **선택지별 확률(probabilities)** 을 돌려준다. 순서에 의존하지
 * 않으므로 위치 편향 방어가 필요 없다. 실측으로 확인했다 — 조문 재선택 8질의에서
 *
 *     2회(정순+역순)   7/8
 *     1회              7/8   · 중위 **208ms**
 *
 * 같은 정확도에 **호출이 절반**이다. 그래서 1회로 간다.
 * 천장은 7/8 이었다(정답이 후보 32개 안에 드는 수). 즉 **Jev 가 천장을 다 찍었다.**
 * 못 맞힌 하나는 정답이 후보 밖이어서 재선택으로는 불가능한 건이다.
 *
 * ⚠ **분류에는 쓰지 말 것.** 같은 모델로 노동법 12라벨 분류를 재니 **55.0%** 였다
 * (`work-orchestrator/evals/jev/`, 120건). 재선택은 「주어진 후보 중 고르기」이고
 * 분류는 「라벨 뜻 알기」다 — 과제가 다르다.
 *
 * ## 순서 — Jev → Gemini → 원래 순서
 *
 * Jev 키가 없거나 Jev 가 죽으면 **종전 경로(Gemini 2회)로 떨어진다.** 둘 다 안 되면
 * 검색 순서를 그대로 돌려준다.
 *
 * 왜 Gemini 를 남겨 두나. 이 변경을 배포하는 순간 **재선택이 꺼지면 손실**이다 —
 * 종전 운영은 Gemini 로 재선택을 하고 있었다. Vercel 에 Jev 키가 들어갔는지 확인되지
 * 않은 상태에서 병합하면 「키 없음 → 재선택 꺼짐 → 검색 1위 그대로」가 된다.
 * 폴백이 있으면 **키가 없어도 종전 수준은 유지된다.**
 *
 * 로그로 어느 경로였는지 가른다 —
 *   `[jev] 적용 안 함 …`        Jev 는 답했으나 확률이 낮아 손대지 않음
 *   `[jev] 실패 → Gemini 폴백`   Jev 가 죽어 종전 경로로
 *   `[jev] 키 없음 + Gemini 폴백 실패`  둘 다 안 됨 → 검색 순서 그대로
 */
import { getGenerativeModel } from '@/lib/vertex/client';

export type Jevable = { question?: string | null; answer?: string | null };

const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS) || 2500;
const API_URL = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';
/** 1위 확률이 이보다 낮으면 재선택을 **적용하지 않는다**(원래 순서 유지). */
const MIN_TOP_PROB = Number(process.env.JEV_MIN_PROB) || 0.12;

type ChoiceAnswer = {
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

/** 후보를 criteria 객체로 만든다. 키는 1-기반 번호, 값은 설명이다. */
function criteria(items: Jevable[], order: number[]): Record<string, string> {
  const out: Record<string, string> = {};
  order.forEach((idx, i) => {
    out[String(i + 1)] = (items[idx].question || '').slice(0, 120);
  });
  return out;
}

/**
 * Vertex Gemini 폴백 — Jev 키가 없거나 Jev 가 실패할 때 쓴다.
 *
 * 왜 남겨 두나. 이 변경을 배포하는 순간 **재선택이 꺼지면 손실**이다. 종전 운영은
 * Gemini 로 재선택을 하고 있었다. Jev 키가 Vercel 에 들어갔는지 확인되지 않은 상태에서
 * 병합하면 「키 없음 → 재선택 꺼짐 → 검색 1위 그대로」가 된다.
 * 그래서 Jev 를 1순위로 두고, 안 되면 **종전 경로로 떨어진다.**
 *
 * 이쪽은 일반 LLM 이라 **위치 편향 방어가 필요하다** — 순서를 뒤집어 두 번 묻고
 * 두 번 다 고른 것을 앞세운다(종전 동작 그대로).
 */
function numbered(items: Jevable[], order: number[]): string {
  return order
    .map((idx, i) => `${i + 1}. ${(items[idx].question || '').slice(0, 120)}`)
    .join('\n');
}

function parsePicks(text: string, order: number[], max: number): number[] {
  const nums = (text.match(/\d+/g) || []).map((n) => parseInt(n, 10));
  const out: number[] = [];
  for (const n of nums) {
    if (n < 1 || n > order.length) continue;
    const orig = order[n - 1];
    if (!out.includes(orig)) out.push(orig);
    if (out.length >= max) break;
  }
  return out;
}

async function askGemini(
  query: string,
  items: Jevable[],
  order: number[],
  pick: number
): Promise<number[]> {
  const prompt = `질문에 **실제로 답이 되는** 후보를 고르세요.

질문: ${query}

후보:
${numbered(items, order)}

규칙
- 말투나 문장 꼴이 비슷한 것이 아니라 **주제가 같은 것**을 고릅니다.
  예: 「언제까지 해야 하나요」가 같아도 주제(실업급여 vs 부당노동행위)가 다르면 답이 아닙니다.
- 답이 되는 것이 ${pick}개보다 적으면 **적게 고릅니다.** 숫자를 채우지 마세요.
- 설명 없이 **번호만 쉼표로** 적습니다. 좋은 순서대로.`;

  // generationConfig 를 주지 않는다 — maxOutputTokens 를 작게 주면 gemini-2.5-flash 가
  // thinking 에 다 쓰고 parts 가 아예 없는 응답을 준다(2026-10-06 실측).
  const model = getGenerativeModel();
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parsePicks(text, order, pick);
}

/** 종전 동작 — 정순·역순 두 번 묻고 두 번 다 고른 것을 앞세운다. */
async function geminiRerank<T extends Jevable>(
  query: string,
  items: T[],
  finalN: number
): Promise<T[]> {
  const fwd = items.map((_, i) => i);
  const rev = [...fwd].reverse();
  const [a, b] = await Promise.all([
    askGemini(query, items, fwd, finalN),
    askGemini(query, items, rev, finalN),
  ]);
  const score = (i: number) => (a.includes(i) ? 1 : 0) + (b.includes(i) ? 1 : 0);
  const ranked = [...fwd].sort((x, y) => {
    const d = score(y) - score(x);
    if (d !== 0) return d;
    const ax = a.indexOf(x) < 0 ? 99 : a.indexOf(x);
    const ay = a.indexOf(y) < 0 ? 99 : a.indexOf(y);
    if (ax !== ay) return ax - ay;
    return x - y;
  });
  return ranked.slice(0, finalN).map((i) => items[i]);
}

async function askJev(
  query: string,
  items: Jevable[],
  order: number[]
): Promise<{ picks: number[]; topProb: number }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('TYPESAFE_API_KEY 없음');

  const res = await fetch(API_URL, {
    method: 'POST',
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
  if (!res.ok) {
    throw new Error(`jev http ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
  const body = (await res.json()) as { answers?: Record<string, ChoiceAnswer> };
  const ans: ChoiceAnswer = body.answers?.pick ?? {};

  // 확률 내림차순. 확률이 없으면 choice 하나만 쓴다.
  const probs = ans.probabilities ?? {};
  const ranked = Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .filter(([k]) => /^\d+$/.test(k));
  if (ranked.length > 0) {
    const picks = ranked
      .map(([k]) => order[parseInt(k, 10) - 1])
      .filter((v) => typeof v === 'number');
    return { picks, topProb: ranked[0][1] };
  }
  if (ans.choice && /^\d+$/.test(ans.choice)) {
    const one = order[parseInt(ans.choice, 10) - 1];
    return { picks: typeof one === 'number' ? [one] : [], topProb: ans.confidence ?? 1 };
  }
  return { picks: [], topProb: 0 };
}

export async function jevRerank<T extends Jevable>(
  query: string,
  items: T[],
  finalN = 5
): Promise<T[]> {
  if (items.length <= 1) return items;

  // ① Jev 가 1순위. 키가 없으면 바로 폴백으로 간다
  if (!process.env.TYPESAFE_API_KEY) {
    try {
      return await Promise.race([
        geminiRerank(query, items, finalN),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('gemini timeout')), TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      console.error('[jev] 키 없음 + Gemini 폴백 실패:', (err as Error)?.message?.slice(0, 120));
      return items.slice(0, finalN);
    }
  }

  try {
    const order = items.map((_, i) => i);
    const { picks, topProb } = await Promise.race([
      askJev(query, items, order),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('jev timeout')), TIMEOUT_MS)
      ),
    ]);

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
    // ② Jev 가 죽었으면 종전 경로(Gemini)로 떨어진다. 재선택이 꺼지는 것보다 낫다
    console.warn('[jev] 실패 → Gemini 폴백:', (err as Error)?.message?.slice(0, 160));
    try {
      return await Promise.race([
        geminiRerank(query, items, finalN),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('gemini timeout')), TIMEOUT_MS)
        ),
      ]);
    } catch (err2) {
      console.error('[jev] 폴백도 실패 — 원래 순서 유지:',
        (err2 as Error)?.message?.slice(0, 120));
      return items.slice(0, finalN);
    }
  }
}
