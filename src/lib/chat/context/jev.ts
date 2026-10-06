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
 * 실패하면 **원래 순서를 그대로 돌려준다.** 재선택이 안 되는 것보다 답이 안 나가는 것이 나쁘다.
 */
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
    console.error('[jev] 실패 — 원래 순서 유지:', (err as Error)?.message?.slice(0, 160));
    return items.slice(0, finalN);
  }
}
