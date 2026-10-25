// 스캔 쪽을 「읽었다」고 볼 기준 — 이 기준을 못 넘으면 하이쿠 대신 소넷으로 다시 읽는다.
// 맞게 읽었는지는 알 수 없다. 여기서 거르는 것은 덜 읽은 것(잘림·판독 불가·거의 빈 쪽·거절)뿐이다.
export const UNREADABLE = '[판독 불가]';
export const MIN_CHARS = 20;

export function looksRead(text: string, stopReason: string | null | undefined): boolean {
  if (stopReason !== 'end_turn') return false;
  if (text.includes(UNREADABLE)) return false;
  return text.replace(/[^가-힣0-9]/g, '').length >= MIN_CHARS;
}

/** 스캔 쪽 옮겨 적기 지시 — 라우트와 정확도 실측 스크립트가 같은 글을 쓴다 */
export const OCR_SYSTEM = `한국 기관 규정(정관·규정·세칙) 문서를 스캔한 쪽 한 장을 글자로 옮깁니다.
- 보이는 글자를 그대로 옮깁니다. 고치거나 요약하거나 빠진 글자를 짐작해 채우지 않습니다.
- 줄 구조를 지킵니다. 조(제N조), 항(①②), 호(1. 2.), 목(가. 나.)은 각각 새 줄에서 시작합니다. 한 문장이 화면에서 줄바꿈된 것은 한 줄로 잇습니다.
- 개정 표시(<개정 2023. 9. 1.>), 낫표(「」), 괄호, 숫자는 보이는 대로 둡니다.
- 표는 한 행을 한 줄로, 칸 사이는 " | " 로 씁니다.
- 쪽 번호·머리말·꼬리말은 옮기지 않습니다.
- 설명이나 머리말 없이 옮긴 글자만 출력합니다.
- 글자를 거의 알아볼 수 없으면 ${UNREADABLE} 한 줄만 출력합니다.`;
