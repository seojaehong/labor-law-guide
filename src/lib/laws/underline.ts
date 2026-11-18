// 밑줄 표시 — 글자를 이 두 글자(사용자 영역 U+E000·U+E001)로 감싸면 문서 쓰기(doc-io compareDocx · work-rules-report formHwpx)가 밑줄 런으로 바꾼다.
// rules-review/outputs.ts 의 U0·U1 과 같은 글자다. 표시는 줄을 넘지 않는다(줄마다 따로 감싼다).
export const UL_OPEN = '';
export const UL_CLOSE = '';
export const unmarkUnderline = (s: string) => s.replace(/[]/g, '');
/** 한 줄을 [글자, 밑줄 여부] 조각으로 */
export const underlineParts = (line: string): [string, boolean][] =>
  line
    .split(/([^]*)/)
    .filter(Boolean)
    .map((p) => [unmarkUnderline(p), p.startsWith(UL_OPEN)] as [string, boolean])
    .filter(([t]) => t);
