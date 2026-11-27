// 도구 화면에 쓰지 않는 말 두 벌.
// SERVICE_BANNED — 정확도를 부풀리는 말(「적법합니다」·「확률 80%」).
//                  261127 재홍님 결정 — 일의무늬는 노무 자동화 업무를 모두 하는 사이트다. 직무를 나타내는 말
//                  (노무사·상담·자문·진단·판정·대신·대행·대리)은 더 막지 않는다.
// RESULT_BANNED  — 결과를 단정하는 말. 계산 결과가 「체불이다」「위법이다」라고 말하지 않는다.
// 확률·승소 가능성 숫자는 제품 어디에도 내지 않는다.

export const SERVICE_BANNED = ['적법', '확률'] as const;
export const RESULT_BANNED = ['체불', '위법', '승소', '받을 수 있는 금액'] as const;

/** 금지어를 품었지만 써도 되는 구절 — 이유를 함께 적는다 */
export const ALLOWED_PHRASES: Record<string, string> = {
  전자문서: '「자문」을 글자로 품은 낱말일 뿐이다',
  상위법령: '「위법」을 글자로 품은 낱말일 뿐이다',
  하위법령: '「위법」을 글자로 품은 낱말일 뿐이다',
  '업무를 대행케': '대법원 2006. 12. 7. 선고 2004다29736 판결 원문 인용(근로자성 판단 요소)',
  공인노무사법: '법령 이름',
  고충상담: '법령이 정한 절차 이름(남녀고용평등법 제25조 등)',
  건강진단: '산업안전보건법 용어',
  진단서: '법령이 정한 첨부 서류 이름(근로기준법 시행령 제43조제1항제3호·제43조의2)',
  '노동위원회 판정': '기관이 내린 결정의 이름',
};

/** text 에 든 금지어. 허용 구절은 먼저 지운다 */
export function bannedHits(text: string, words: readonly string[] = [...SERVICE_BANNED, ...RESULT_BANNED]): string[] {
  let t = text;
  for (const p of Object.keys(ALLOWED_PHRASES)) t = t.split(p).join(' ');
  return words.filter((w) => t.includes(w));
}

/** 공식 서식의 칸 이름 — 서식 글자 그대로 옮겨야 한다(D5 261126).
 *  ALLOWED_PHRASES 에 넣지 않는다: 사이트 문장에서 「대리인」은 계속 막고, 서식 글자와 그 칸을 받는 MCP 입력 설명만 bannedHitsInForm 으로 본다 */
export const FORM_FIELD_NAMES: Record<string, string> = {
  대리인: '취업규칙 신고서·변경신고서(근로기준법 시행규칙 별지 제15호서식) 서명란 칸 이름',
};

/** 서식 글자용 bannedHits — 서식 칸 이름을 먼저 지운다. 칸 이름 밖의 「대리」(「대리합니다」 등)는 그대로 잡는다 */
export function bannedHitsInForm(text: string, words?: readonly string[]): string[] {
  let t = text;
  for (const p of Object.keys(FORM_FIELD_NAMES)) t = t.split(p).join(' ');
  return bannedHits(t, words);
}
