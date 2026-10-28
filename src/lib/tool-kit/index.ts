// 계산·점검 도구가 같이 쓰는 날짜 함수와 화면 토큰. 도구마다 따로 만들지 않는다.

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 오늘(KST) — YYYY-MM-DD */
export const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

/** 「11월 17일(화)」 — 해가 다르면 「2027년 1월 2일(토)」 */
export function fmtDate(d: string, today: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}년 `}${m}월 ${day}일(${w})`;
}

export const card = 'rounded-xl border border-[var(--color-border)] p-4 sm:p-5';
export const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none';
export const small = 'text-sm leading-relaxed';
export const muted = { color: 'var(--grey-700)' };
export const ink = { color: 'var(--color-text-primary)' };
