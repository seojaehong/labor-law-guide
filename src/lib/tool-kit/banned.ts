// 도구 화면에 쓰지 않는 말 두 벌.
// SERVICE_BANNED — 직무를 표방하는 말(공인노무사법). 「손안의 노무사」류·「상담·자문·진단·판정」 전부.
// RESULT_BANNED  — 결과를 단정하는 말. 계산 결과가 「체불이다」「위법이다」라고 말하지 않는다.
// 확률·승소 가능성 숫자는 제품 어디에도 내지 않는다.

export const SERVICE_BANNED = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률'] as const;
export const RESULT_BANNED = ['체불', '위법', '승소', '받을 수 있는 금액'] as const;

/** 금지어를 품었지만 써도 되는 구절 — 이유를 함께 적는다 */
export const ALLOWED_PHRASES: Record<string, string> = {
  전자문서: '「자문」을 글자로 품은 낱말일 뿐이다',
  상위법령: '「위법」을 글자로 품은 낱말일 뿐이다',
  고충상담: '법령이 정한 절차 이름(남녀고용평등법 제25조 등)',
  건강진단: '산업안전보건법 용어',
  '노동위원회 판정': '기관이 내린 결정의 이름',
};

/** text 에 든 금지어. 허용 구절은 먼저 지운다 */
export function bannedHits(text: string, words: readonly string[] = [...SERVICE_BANNED, ...RESULT_BANNED]): string[] {
  let t = text;
  for (const p of Object.keys(ALLOWED_PHRASES)) t = t.split(p).join(' ');
  return words.filter((w) => t.includes(w));
}
