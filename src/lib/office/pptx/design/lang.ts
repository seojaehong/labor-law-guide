// 글 언어 ko-KR 을 슬라이드의 모든 글에 단다 — 프리셋 판에서만 쓴다(기본 출력은 en-US 그대로 둔다).
// PowerPoint 는 글 언어가 en-US 면 한글을 낱자 사이에서도 끊는다(「설 / 치」). ko-KR 이면 낱말 사이에서 끊는다(261128 COM 실측).
// 글 조각 배열·표 칸·칸 안 글 조각까지 각각 단다 — 라이브러리가 바깥 옵션을 안쪽 조각에 물려준다고 가정하지 않는다.
import type { DeckSlide } from './slide-types';

export const KO = 'ko-KR';

type Run = { text?: unknown; options?: Record<string, unknown> };

function runs(text: unknown): unknown {
  if (!Array.isArray(text)) return text;
  return (text as Run[]).map((r) => (r && typeof r === 'object' ? { ...r, options: { ...(r.options ?? {}), lang: KO } } : r));
}

/** 같은 슬라이드를 감싸 addText·addTable 에 lang 을 넣는다. 배경 지정 등 나머지는 그대로 넘긴다 */
export function koSlide<T extends DeckSlide>(slide: T): T {
  return new Proxy(slide, {
    get(target, p, recv) {
      if (p === 'addText') return (text: unknown, o: Record<string, unknown>) => target.addText(runs(text), { ...o, lang: KO });
      if (p === 'addTable')
        return (rows: unknown, o: Record<string, unknown>) =>
          target.addTable(
            (rows as Run[][]).map((row) => row.map((cell) => ({ ...cell, text: runs(cell.text), options: { ...(cell.options ?? {}), lang: KO } }))),
            { ...o, lang: KO },
          );
      const v = Reflect.get(target, p, recv);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
