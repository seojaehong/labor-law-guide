// 글자 폭 추정 — 덱 빌더와 design/ 부품이 같이 쓴다. 다른 모듈을 가져오지 않는 잎(leaf) 모듈이라
// meeting.ts 가 design/ 을 가져와도 가져오는 순서에 따라 깨지는 고리(cycle)가 생기지 않는다.

/** 글자 폭 단위: 한글·전각 1, ASCII 0.55 */
export function textUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += ch.charCodeAt(0) < 128 ? 0.55 : 1;
  return u;
}

export function capacityOf(widthIn: number, fontPt: number, maxLines: number): number {
  const perLine = Math.max(1, Math.floor(((widthIn - 0.1) * 72) / fontPt));
  return perLine * maxLines;
}
