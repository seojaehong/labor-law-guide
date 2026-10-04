/**
 * Jev 재선택 — 검색이 올린 후보를 LLM 이 다시 고른다 (2026-10-04 신설).
 *
 * 왜 필요한가. 임베딩이 1위로 올린 것이 자주 틀린다. 서버1 실측 기록:
 * **임베딩 1위가 49건 중 16건만 맞았고, 재선택하니 44건이 맞았다.**
 *
 * 2026-10-04 에 실제로 본 예 — 「부당노동행위 구제신청은 언제까지 해야 하나요?」로 검색했더니
 * 1위가 **「실업급여 신청은 언제까지 해야 하나요?」**였다. 「언제까지 해야 하나요」라는
 * **말투가 주제를 눌렀다.** 벡터 유사도는 문장 꼴에 끌리고 주제를 놓친다.
 *
 * 그때까지 이 자리는 비어 있었다 — `faq.ts` 의 `RERANK_ON` 이 false 였고
 * NIM 리랭커는 엔드포인트가 죽어 꺼 둔 상태였다. 그 빈자리를 채운다.
 *
 * 방법 — **순서를 뒤집어 두 번 묻는다.**
 * LLM 은 목록의 앞쪽을 편애한다(위치 편향). 같은 후보를 정순과 역순으로 두 번 보여 주고
 * **두 번 다 고른 것**을 앞세운다. 한 번만 고른 것은 그 뒤에, 아무도 안 고른 것은 원래 순서로.
 * 모델을 바꾸지 않고 순서만 뒤집어 묻는 것이라 **키도 비용도 추가되지 않는다.**
 *
 * 실패하면 **원래 순서를 그대로 돌려준다.** 재선택이 안 되는 것보다 답이 안 나가는 것이 나쁘다.
 */
import { getGenerativeModel } from '@/lib/vertex/client';

export type Jevable = { question?: string | null; answer?: string | null };

const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS) || 2500;

function numbered(items: Jevable[], order: number[]): string {
  return order
    .map((idx, i) => `${i + 1}. ${(items[idx].question || '').slice(0, 120)}`)
    .join('\n');
}

/** 「3, 1, 5」 같은 답에서 1-기반 번호만 뽑아 0-기반 원본 인덱스로 돌린다. */
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

async function askOnce(query: string, items: Jevable[], order: number[], pick: number) {
  const prompt = `질문에 **실제로 답이 되는** 후보를 고르세요.

질문: ${query}

후보:
${numbered(items, order)}

규칙
- 말투나 문장 꼴이 비슷한 것이 아니라 **주제가 같은 것**을 고릅니다.
  예: 「언제까지 해야 하나요」가 같아도 주제(실업급여 vs 부당노동행위)가 다르면 답이 아닙니다.
- 답이 되는 것이 ${pick}개보다 적으면 **적게 고릅니다.** 숫자를 채우지 마세요.
- 설명 없이 **번호만 쉼표로** 적습니다. 좋은 순서대로.`;

  const model = getGenerativeModel();
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parsePicks(text, order, pick);
}

export async function jevRerank<T extends Jevable>(
  query: string,
  items: T[],
  finalN = 5
): Promise<T[]> {
  if (items.length <= 1) return items;

  const fwd = items.map((_, i) => i);
  const rev = [...fwd].reverse();

  try {
    const [a, b] = await Promise.race([
      Promise.all([
        askOnce(query, items, fwd, finalN),
        askOnce(query, items, rev, finalN),
      ]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('jev timeout')), TIMEOUT_MS)),
    ]);

    // 두 번 다 고른 것 → 한 번만 고른 것 → 나머지 원래 순서
    const score = (i: number) => (a.includes(i) ? 1 : 0) + (b.includes(i) ? 1 : 0);
    const rank = (i: number) => {
      const ia = a.indexOf(i);
      const ib = b.indexOf(i);
      const parts = [ia, ib].filter((x) => x >= 0);
      return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 99;
    };
    const picked = fwd
      .filter((i) => score(i) > 0)
      .sort((x, y) => score(y) - score(x) || rank(x) - rank(y));
    const rest = fwd.filter((i) => score(i) === 0);
    const ordered = [...picked, ...rest].slice(0, Math.max(finalN, picked.length));
    return ordered.map((i) => items[i]);
  } catch (e) {
    console.warn('[jev] 재선택 실패 — 원래 순서 유지:', (e as Error).message);
    return items.slice(0, Math.max(finalN, items.length));
  }
}
