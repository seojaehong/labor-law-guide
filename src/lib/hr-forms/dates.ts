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

/** 시작일부터 n개월 기간의 마지막 날(민법 제157조 단서·제160조) — 시작일이 0시부터면 초일을 넣고,
 * 마지막 달의 「시작일에 해당하는 날」의 전날로 끝난다. 그 달에 해당하는 날이 없으면 그 달 말일로 끝난다(제160조제3항).
 * 예: 2027-01-20 + 12개월 → 2028-01-19, 2028-02-29 + 12개월 → 2029-02-28. */
export function periodLastDay(start: Date, months: number): Date {
  const m = start.getUTCMonth() + months;
  const t = new Date(Date.UTC(start.getUTCFullYear(), m, start.getUTCDate()));
  return t.getUTCMonth() === ((m % 12) + 12) % 12 ? addDays(t, -1) : new Date(Date.UTC(start.getUTCFullYear(), m + 1, 0));
}

/** 신청일과 시작일 사이 — 「N일 전」, 같은 날이면 「당일」, 늦으면 「N일 뒤」 */
export const leadPhrase = (lead: number, what: string) =>
  lead > 0 ? `신청일이 ${what} ${lead}일 전입니다.` : lead === 0 ? `신청일이 ${what}과 같은 날입니다.` : `신청일이 ${what}보다 ${-lead}일 뒤입니다.`;
