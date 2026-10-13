/**
 * 오늘 날짜(YYYY-MM-DD) — **브라우저 현지 시각 기준**.
 *
 * `new Date().toISOString().slice(0, 10)` 을 쓰면 안 된다. UTC 로 찍히기 때문에
 * KST 오전 9시 이전에는 하루 전 날짜가 나온다. 연차는 발생일 당일에 일수가
 * 바뀌므로 하루 차이가 그대로 결과 차이가 되고, 퇴사일 입력칸의 `max` 에 쓰면
 * 오전에 당일 퇴사를 고를 수 없게 된다.
 *
 * 화면에서 "오늘"이 필요한 곳은 전부 이 함수를 쓴다.
 * (lib/leave-ledger.ts, lib/leave-promotion.ts 의 fmt 는 Date.UTC 로 만든 값만
 *  다루므로 toISOString 이 맞다 — 여기와 혼동하지 말 것.)
 */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
