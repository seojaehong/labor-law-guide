// 근로계약서 작성 — 출력 글자 공용(화면 입력·엑셀·한글·PDF). 점검 엔진을 끌어오지 않게 따로 둔다.

/** XML 1.0 이 허용하지 않는 글자(탭·줄바꿈 말고 제어문자, U+FFFE·U+FFFF, 짝 없는 서로게이트) */
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** 붙여 넣은 글에 섞인 제어문자를 지운다 — 한글(hwpx)·엑셀이 XML 이라 그대로 두면 파일이 깨진다 */
export function stripControl(s: string): string {
  return s.replace(XML_FORBIDDEN, '');
}

/** 화면 입력 글 칸 정리 — 제어문자를 지우고 ㈜ 를 (주) 로(글꼴에 없거나 한글 파일에서 한 글자 기호로 깨지는 일을 막는다) */
export function cleanInput(s: string): string {
  return stripControl(s).replace(/㈜/g, '(주)').trim();
}

/** 금액 — 1,234,567원 */
export const wonText = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/** 시간 — 소수 둘째 자리까지(계약서 제5조: 금액은 줄이기 전 시간으로 계산) */
export const hoursText = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}시간`;
