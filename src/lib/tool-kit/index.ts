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

/** 「2026년 10월 31일(토)」 — 해를 늘 붙인다. 두 날짜를 나란히 쓸 때 올해 것만 해가 빠져 헷갈리지 않게 */
export function fmtDateWithYear(d: string): string {
  return `${Number(d.slice(0, 4))}년 ${fmtDate(d, d)}`;
}

/** 금액 칸 상한 — 실수령액(take-home-pay)·용역(contractor-check)·일용직(daily-worker-tax) 계산과 같은 10억원 */
export const MAX_WON = 1_000_000_000;

/**
 * 금액 칸 글자 확인 — 문제가 없으면 null, 있으면 화면에 그대로 띄울 문장. 쉼표·빈칸은 무시한다.
 * required 면 비었거나 0 이어도 알린다(0원으로 계산한 답을 내지 않는다). 계산식은 건드리지 않는다.
 */
export function wonInputError(label: string, raw: string, { required = false }: { required?: boolean } = {}): string | null {
  const s = raw.replace(/[,\s]/g, '');
  if (s !== '' && !/^\d+(\.\d+)?$/.test(s)) return `${label} 금액은 0 이상의 숫자로 넣어 주세요.`;
  const n = s === '' ? 0 : Number(s);
  if (n === 0) return required ? `${label} 금액을 넣어 주세요. 0원으로는 계산하지 않습니다.` : null;
  if (n > MAX_WON) return `${label} 금액을 확인해 주세요(원 단위, 10억원까지).`;
  return null;
}

export const card = 'rounded-xl border border-[var(--color-border)] p-4 sm:p-5';
export const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none';
export const small = 'text-sm leading-relaxed';
export const muted = { color: 'var(--grey-700)' };
export const ink = { color: 'var(--color-text-primary)' };
