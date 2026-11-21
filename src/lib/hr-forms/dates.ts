/** 서식 날짜 도우미 — 입력은 YYYY-MM-DD 문자열, 계산은 UTC 자정 기준(시간대 영향 없음). */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(s: string): Date | null {
  const m = YMD.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 2026-02-30 같은 없는 날짜는 거른다
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** b - a 의 일수 */
export const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
/** 양 끝을 포함한 일수 */
export const spanDays = (a: Date, b: Date) => diffDays(a, b) + 1;
/** 같은 날의 n개월 뒤 — 그 달에 같은 날이 없으면 그 달 말일(1월 31일 + 1개월 = 2월 28일) */
export function addMonths(d: Date, n: number): Date {
  const m = d.getUTCMonth() + n;
  const t = new Date(Date.UTC(d.getUTCFullYear(), m, d.getUTCDate()));
  return t.getUTCMonth() === ((m % 12) + 12) % 12 ? t : new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0));
}

/** 2026. 12. 1. */
export const fmtDate = (d: Date) => `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
export const toYmd = (d: Date) => d.toISOString().slice(0, 10);
