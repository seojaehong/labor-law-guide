// 급여 일할계산 — 월급제 근로자가 그달 중간에 입사·퇴사한 달, 그달 내내 재직하며 결근·지각한 달.
// 법은 일할 방식을 정하지 않는다. 「월 도중 퇴직자에게 그달 임금을 전액 줄지 일할할지는 법령에 명시적인 규정이 없고 노사 쌍방이
// 정한 바에 따르면 될 것」(근기68207-690, 1999. 3. 24. · 근로개선정책과-2118, 2011. 7. 11. · 근기1455-24422, 1981. 8. 11.).
// 그래서 방식을 고르지 않고 방식마다 값을 나란히 낸다. 회사 기준은 화면에서 사용자가 고른다.
//
// 범위: 주 40시간(월~금 8시간)·주휴일 일요일 월급제, 급여기간 = 그달 1일~말일. 공휴일은 달력에서 찾지 않고 사용자가 넣은 날만 센다.
// 용어(R0): 퇴사일 = 근로관계가 이어진 마지막 날(포함). 퇴직일(상실일) = 퇴사일 다음 날. 엔진 employment_end 와 같은 뜻.
//   재직 역일 = 그달 안에서 입사일(포함)부터 퇴사일(포함)까지의 달력 일수(여성고용정책과-2507 의 「5.15.~5.31. … /31 × 17」 셈).
//
// 금액은 정수 원과 정확한 분수로 다룬다. 원 미만이 남는 값의 끝수 처리를 정한 법령 조문은 없다 — 회사 기준이다.
// 그래서 엔진(src/lib/pay-check/policies.ts)의 toWon 을 그대로 써서, 기준(방법·단위)이 없으면 금액을 정하지 않는다(R7).
// 엔진에 있는 30일 기준(지급식)·시간 기준·시간 단위 결근 공제는 엔진 applyPolicy 로 금액을 낸다.
// 시간 기준은 통상시급이 원 단위로 떨어질 때만 엔진에 넘긴다 — 엔진은 hourly_rate 를 숫자로 받아 분수 시급을 정확히 곱하지 못한다(R2).
import { applyPolicy, toWon, type Fraction, type Rounding, type RoundingUnit } from '@/lib/pay-check/policies';
import type { Confirmed, PolicyId } from '@/lib/pay-check/types';
import { checkMinWage, unitHours, type MinWageResult } from './min-wage';
import { rateOn } from '@/content/rates';

export type MethodId = 'DAY_30' | 'DAY_30_DEDUCT' | 'CALENDAR' | 'WORKDAY' | 'HOUR_ACTUAL' | 'FULL';
export const METHOD_ORDER: MethodId[] = ['DAY_30', 'DAY_30_DEDUCT', 'CALENDAR', 'WORKDAY', 'HOUR_ACTUAL', 'FULL'];
/** 소정근로일 기준의 두 값 — 쉬는 공휴일을 날수(분모·분자)에서 빼는지 넣는지 */
export const WORKDAY_OUT = '공휴일을 날수에서 빼면';
export const WORKDAY_IN = '공휴일도 날수에 넣으면';

export interface RoundingRule { how: Rounding; unit: RoundingUnit }

/** 방식 하나의 값 하나. 사실·회사 기준에 따라 갈리면 한 방식에 값이 둘 이상이다(label 이 갈리는 조건) */
export interface Variant {
  label: string | null;
  exact: Fraction;
  /** 원 단위 금액. 원 미만이 남는데 끝수 기준이 없으면 null */
  amount: number | null;
  /** 시간 기준 — 유급시간 */
  hours?: number;
  /** 시간 기준 — 통상시급이 원 단위로 떨어지지 않을 때, 시급을 먼저 원 미만 버림·반올림하고 곱한 값 */
  hourlyFirst?: { floor: number; round: number };
}

export interface MethodRow {
  id: MethodId;
  variants: Variant[];
  /** 엔진에 같은 정책이 있으면 그 이름 */
  engine: PolicyId | null;
  /** 30일 기준(지급식) — 31일 달에 30일 재직해 월급 전액과 같아진 경우 */
  fullByThirty?: boolean;
}

export interface ProrationInput {
  /** 급여 달 YYYY-MM — 급여기간은 그달 1일~말일 */
  month: string;
  /** 일할하는 월급(기본급과 매달 고정으로 주는 수당) */
  monthlyPay: number;
  /** 입사일 — 그달 중간이면 */
  start?: string;
  /** 퇴사일(근로관계 마지막 날, 포함) — 그달 중간이면 */
  end?: string;
  /** 상시 5명 이상 — 관공서 공휴일 유급(근로기준법 §55②)이 적용된다. 4명 이하는 시행령 별표1로 적용 제외 */
  fivePlus: boolean;
  /** 그달 평일 중 쉬는 공휴일(관공서 공휴일·대체공휴일 등). 넣은 날만 센다 */
  holidays?: string[];
  rounding?: RoundingRule | null;
  /** 대조할 명세서 금액 */
  payslip?: number;
}

export interface PaidHours {
  /** 소정근로일(평일, 공휴일 제외) × 8 */
  work: number;
  /** 쉬는 평일 공휴일(5월 1일 빼고) × 8 — 5명 이상은 유급(§55②), 4명 이하는 회사가 정한 바 */
  publicHoliday: number;
  /** 넣은 공휴일 중 5월 1일(노동절, 종전 근로자의 날) × 8 — 별도 법률의 유급휴일이라 사업장 규모와 상관없이 유급(근로개선정책과-1113) */
  laborDay: number;
  /** 1주(월~일) 내내 근로관계가 있던 주의 주휴 × 8 */
  weekly: number;
  /** 주 중간에 입사한 첫 주의 주휴 — 생기는지 정해진 해석을 찾지 못했다. 그 주 재직 기간에 소정근로일이 없으면 0 */
  firstWeekOpen: number;
  /** 확정된 유급시간 = work + weekly + laborDay + (5명 이상이면 publicHoliday) */
  total: number;
}

export interface ProrationResult {
  status: 'calculated' | 'full-month';
  monthlyPay: number;
  month: string;
  periodStart: string;
  periodEnd: string;
  /** 그달 안의 재직 범위(포함) */
  from: string;
  to: string;
  monthDays: number;
  employedDays: number;
  notEmployedDays: number;
  monthWorkdays: number;
  employedWorkdays: number;
  holidaysInMonth: string[];
  holidaysEmployed: string[];
  /** 주말이라 세지 않은 공휴일 */
  ignoredHolidays: string[];
  hours: PaidHours;
  /** 퇴사일이 일요일이 아니어서 퇴사한 주의 주휴가 생기지 않음(임금근로시간과-1736) */
  leaveWeekNoHoliday: boolean;
  /** 통상시급 = 월급 ÷ 209 */
  hourly: Fraction;
  monthHours: number;
  rows: MethodRow[];
  /** 원 미만이 남아 끝수 기준이 필요한 값이 있다 */
  roundingOpen: boolean;
  /** 전액 지급을 뺀 방식들의 최솟값·최댓값(분수 그대로) */
  range: { min: number; max: number };
  minWage: MinWageSeam | null;
  /** 참고 — 그 기간 유급시간 × 시간급 최저임금. 유급시간이 하나로 정해지고 0보다 클 때만 */
  reference: { paidHours: number; minHourly: number; floor: number } | null;
  /** 그 기간 유급시간이 0시간(일요일 하루 재직 등) — 참고 시간당 금액을 내지 않는다 */
  zeroPaidHours: boolean;
  payslip?: { amount: number; matches: PayslipMatch[] };
}

export interface PayslipMatch {
  id: MethodId;
  label: string | null;
  /** 끝수 기준이 없을 때 이 처리로 같아진다 */
  how?: RoundingRule;
  /** 시간 기준 — 통상시급을 먼저 처리하면 같아진다 */
  hourlyFirst?: 'floor' | 'round';
}

export interface MinWageSeam { year: number; minHourly: number; check: MinWageResult }

const DAY = 86_400_000;
const WEEKLY_HOURS = 40;
const DAILY_HOURS = 8;

// ── 날짜 ──

function parse(s: string | undefined, what: string): number {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return t;
}
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dow = (t: number) => new Date(t).getUTCDay();
const isWeekday = (t: number) => dow(t) >= 1 && dow(t) <= 5;
/** 5월 1일 — 노동절(종전 근로자의 날). 관공서 공휴일(§55②)이 아니라 별도 법률이 근로기준법상 유급휴일로 정한 날(근로개선정책과-1113) */
const isLaborDay = (t: number) => iso(t).slice(5) === '05-01';

function monthRange(month: string): { ps: number; pe: number; days: number; y: number } {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('급여 달을 확인해 주세요');
  const [y, m] = month.split('-').map(Number) as [number, number];
  if (m < 1 || m > 12) throw new Error('급여 달을 확인해 주세요');
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { ps: Date.UTC(y, m - 1, 1), pe: Date.UTC(y, m - 1, days), days, y };
}

function* eachDay(a: number, b: number) {
  for (let t = a; t <= b; t += DAY) yield t;
}

/** 넣은 공휴일 — 그달 평일만 센다. 그달 밖은 오류, 주말은 따로 돌려준다 */
function holidaySet(list: string[] | undefined, ps: number, pe: number): { set: Set<number>; ignored: string[] } {
  const set = new Set<number>(), ignored: string[] = [];
  for (const s of list ?? []) {
    const t = parse(s, '공휴일');
    if (t < ps || t > pe) throw new Error('공휴일은 그달 날짜만 넣어 주세요');
    if (isWeekday(t)) set.add(t);
    else if (!ignored.includes(s)) ignored.push(s);
  }
  return { set, ignored };
}

// ── 분수 ──

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
function frac(num: number, den: number): Fraction {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
}
const value = (f: Fraction) => f.num / f.den;

function settle(f: Fraction, r: RoundingRule | null | undefined): number | null {
  const v = toWon(f, r?.how ?? null, r?.unit ?? null);
  return typeof v === 'number' ? v : null;
}

/** 엔진 정책으로 금액을 낸다. 끝수 기준이 없어 멈추면 null. 엔진이 다른 이유로 멈추면 입력 연결이 틀린 것이라 던진다 */
function viaEngine(id: PolicyId, c: Confirmed, r: RoundingRule | null | undefined): number | null {
  const out = applyPolicy(id, { ...c, ...(r ? { rounding: r.how, rounding_unit: r.unit } : {}) });
  if (out.ok) return out.amount;
  if (out.reason === 'ROUNDING_RULE_NOT_CONFIRMED') return null;
  throw new Error(`엔진 입력 연결 오류: ${out.reason}`);
}

// ── 유급시간(시간 기준) ──

/**
 * 급여기간 안의 날짜로 센 유급시간(날짜 기준 귀속 — 주휴일 날짜가 든 달에 넣는다. 회사 기준이 다르면 달라진다).
 * - 평일: 소정근로일 8시간, 쉬는 공휴일이면 공휴일 8시간(5명 이상 유급 — 근로기준법 §55②, 4명 이하는 별표1로 적용 제외).
 *   넣은 공휴일이 5월 1일이면 노동절 8시간 — 별도 법률의 유급휴일이라 별표1의 §55② 적용 제외와 상관없이 유급(근로개선정책과-1113).
 * - 일요일(주휴일): 그 주 월~일 내내 근로관계가 있고 소정근로일을 개근하면 8시간(시행령 §30①, 임금근로시간과-1736 — 퇴사 주는
 *   일요일까지 근로관계가 이어져야 생긴다). 입사가 그 주 월요일보다 늦으면 첫 주 주휴는 정해진 해석을 찾지 못해 firstWeekOpen 에 둔다.
 *   다만 입사일부터 그 일요일까지 소정근로일이 하나도 없으면(토·일 입사 등) 개근할 소정근로일이 없어 어느 해석으로도 생기지 않는다(§30①).
 * - 이 계산에서는 그 기간 소정근로일을 모두 근무한 것으로 본다(결근은 calcAbsence).
 */
export function paidHoursOf(input: { month: string; start?: string; end?: string; fivePlus: boolean; holidays?: string[] }): PaidHours {
  const { ps, pe } = monthRange(input.month);
  const start = input.start ? parse(input.start, '입사일') : -Infinity;
  const end = input.end ? parse(input.end, '퇴사일') : Infinity;
  const { set } = holidaySet(input.holidays, ps, pe);
  const isWork = (t: number) => isWeekday(t) && !set.has(t);
  const h = { work: 0, publicHoliday: 0, laborDay: 0, weekly: 0, firstWeekOpen: 0 };
  for (const t of eachDay(Math.max(start, ps), Math.min(end, pe))) {
    const d = dow(t);
    if (d >= 1 && d <= 5) {
      if (!set.has(t)) h.work += DAILY_HOURS;
      else if (isLaborDay(t)) h.laborDay += DAILY_HOURS;
      else h.publicHoliday += DAILY_HOURS;
    } else if (d === 0) {
      if (start <= t - 6 * DAY) h.weekly += DAILY_HOURS;
      else if ([...eachDay(start, t)].some(isWork)) h.firstWeekOpen += DAILY_HOURS;
    }
  }
  return { ...h, total: h.work + h.weekly + h.laborDay + (input.fivePlus ? h.publicHoliday : 0) };
}

// ── 최저임금 이음새 ──

/**
 * 월급 원금을 checkMinWage 로 대조한다 — 이 도구의 선택이다. 최저임금법 시행령 §5①3 은 월 단위 임금을 시간급으로 바꾸는 환산식일 뿐,
 * 그달 중간에 입사·퇴사한 달의 일할액을 어떻게 대조하는지는 정하지 않았다(그런 조문·해석을 찾지 못했다). 일할액은 copy 가 참고 값으로 알린다.
 * 그해 고시가 없으면 null — 다른 해 값으로 대신하지 않는다
 */
function minWageOf(month: string, monthlyPay: number): MinWageSeam | null {
  const rate = rateOn('minWageHourly', `${month}-01`);
  if (!rate) return null;
  return {
    year: Number(month.slice(0, 4)),
    minHourly: rate.value,
    check: checkMinWage({ unit: 'month', amount: monthlyPay, weeklyHours: WEEKLY_HOURS, minHourly: rate.value }),
  };
}

function checkPay(n: number) {
  if (!(n > 0) || !Number.isFinite(n) || !Number.isInteger(n)) throw new Error('월급을 원 단위로 넣어 주세요');
}

// ── 입사·퇴사 달 ──

export function calcProration(input: ProrationInput): ProrationResult {
  const { month, monthlyPay: pay, fivePlus, rounding } = input;
  checkPay(pay);
  const { ps, pe, days: monthDays } = monthRange(month);
  const start = input.start ? parse(input.start, '입사일') : null;
  const end = input.end ? parse(input.end, '퇴사일') : null;
  if (start !== null && start > pe) throw new Error('입사일이 그 달 뒤입니다');
  if (end !== null && end < ps) throw new Error('퇴사일이 그 달 앞입니다');
  if (start !== null && end !== null && end < start) throw new Error('퇴사일이 입사일보다 앞섭니다');
  if (input.payslip !== undefined && !(Number.isFinite(input.payslip) && input.payslip >= 0)) throw new Error('명세서 금액을 확인해 주세요');
  const { set, ignored } = holidaySet(input.holidays, ps, pe);

  const from = Math.max(start ?? ps, ps), to = Math.min(end ?? pe, pe);
  const employedDays = Math.round((to - from) / DAY) + 1;
  let monthWorkdays = 0, employedWorkdays = 0;
  const holidaysInMonth: string[] = [], holidaysEmployed: string[] = [];
  for (const t of eachDay(ps, pe)) {
    if (!isWeekday(t)) continue;
    monthWorkdays++;
    const inRange = t >= from && t <= to;
    if (inRange) employedWorkdays++;
    if (set.has(t)) {
      holidaysInMonth.push(iso(t));
      if (inRange) holidaysEmployed.push(iso(t));
    }
  }

  const hours = paidHoursOf({ month, start: input.start, end: input.end, fivePlus, holidays: input.holidays });
  const monthHours = unitHours('month', WEEKLY_HOURS); // 209 — 시행령 §6②4, min-wage.ts 와 같은 값
  const hourly = frac(pay, monthHours);
  const base = {
    month, monthlyPay: pay, periodStart: iso(ps), periodEnd: iso(pe), from: iso(from), to: iso(to), monthDays, employedDays,
    notEmployedDays: monthDays - employedDays, monthWorkdays, employedWorkdays, holidaysInMonth, holidaysEmployed,
    ignoredHolidays: ignored, hours, leaveWeekNoHoliday: end !== null && end < pe && dow(end) !== 0,
    hourly, monthHours, minWage: minWageOf(month, pay),
  };
  if (from === ps && to === pe) {
    return { ...base, status: 'full-month', rows: [], roundingOpen: false, range: { min: pay, max: pay }, reference: null, zeroPaidHours: false };
  }

  const v = (label: string | null, f: Fraction, amount = settle(f, rounding)): Variant => ({ label, exact: f, amount });
  const rows: MethodRow[] = [];

  // 30일 기준(지급식) = 월급 × 재직 역일 ÷ 30 — 엔진 DAY_30(인정일수 = 재직 역일)
  rows.push({
    id: 'DAY_30',
    engine: 'DAY_30',
    variants: [v(null, frac(pay * employedDays, 30), viaEngine('DAY_30', { monthly_base_pay: pay, eligible_days: employedDays }, rounding))],
    fullByThirty: employedDays === 30,
  });
  // 30일 기준(공제식) = 월급 − 월급 ÷ 30 × 재직하지 않은 역일. 엔진에 넣으면 금액은 같지만 근거가 「인정일수」로 찍혀 따로 계산한다
  rows.push({ id: 'DAY_30_DEDUCT', engine: null, variants: [v(null, frac(pay * 30 - pay * (monthDays - employedDays), 30))] });
  // 그달 달력 일수 기준 = 월급 × 재직 역일 ÷ 그달 역일(28~31)
  rows.push({ id: 'CALENDAR', engine: null, variants: [v(null, frac(pay * employedDays, monthDays))] });
  // 소정근로일 기준 = 월급 × 재직 기간 소정근로일 ÷ 그달 소정근로일. 쉬는 공휴일을 날수(분모·분자)에 넣는지는 회사 기준 → 두 값.
  // 5명 이상의 관공서 공휴일은 유급휴일(§55②)이라 소정근로일이 아니다 — 라벨은 법률 용어가 아니라 계산 방식 이름으로 쓴다.
  {
    const withOut = frac(pay * (employedWorkdays - holidaysEmployed.length), monthWorkdays - holidaysInMonth.length);
    const withIn = frac(pay * employedWorkdays, monthWorkdays);
    const same = withOut.num * withIn.den === withIn.num * withOut.den;
    rows.push({
      id: 'WORKDAY',
      engine: null,
      variants: holidaysInMonth.length && !same
        ? [v(WORKDAY_OUT, withOut), v(WORKDAY_IN, withIn)]
        : [v(null, withIn)],
    });
  }
  // 시간 기준 = 통상시급(월급 ÷ 209) × 그 기간 유급시간 — 엔진 HOUR_ACTUAL
  {
    const publicOpen = !fivePlus && hours.publicHoliday > 0;
    const pub = publicOpen
      ? [{ label: '공휴일을 유급으로 했으면', h: hours.publicHoliday }, { label: '공휴일을 무급으로 했으면', h: 0 }]
      : [{ label: '', h: fivePlus ? hours.publicHoliday : 0 }];
    const first = hours.firstWeekOpen
      ? [{ label: '첫 주 주휴를 넣지 않으면', h: 0 }, { label: '첫 주 주휴를 넣으면', h: hours.firstWeekOpen }]
      : [{ label: '', h: 0 }];
    const intHourly = hourly.den === 1;
    const variants: Variant[] = [];
    for (const p of pub) {
      for (const f of first) {
        const h = hours.work + hours.weekly + hours.laborDay + p.h + f.h;
        const exact = frac(pay * h, monthHours);
        const amount = intHourly ? viaEngine('HOUR_ACTUAL', { hourly_rate: hourly.num, paid_hours: h }, rounding) : settle(exact, rounding);
        const label = [p.label, f.label].filter(Boolean).join(' · ') || null;
        variants.push({
          label, exact, amount, hours: h,
          ...(intHourly ? {} : { hourlyFirst: { floor: Math.floor(value(hourly)) * h, round: Math.round(value(hourly)) * h } }),
        });
      }
    }
    rows.push({ id: 'HOUR_ACTUAL', engine: 'HOUR_ACTUAL', variants });
  }
  // 그달 월급 전액 — 취업규칙·계약이 「그달 전액 지급」으로 정했으면 일할하지 않는다(근기68207-690 단서, 근로개선정책과-2118)
  rows.push({ id: 'FULL', engine: null, variants: [v(null, frac(pay, 1), pay)] });

  const all = rows.filter((r) => r.id !== 'FULL').flatMap((r) => r.variants.map((x) => value(x.exact)));
  const hourRow = rows.find((r) => r.id === 'HOUR_ACTUAL')!;
  const mw = base.minWage;
  const oneHours = hourRow.variants.length === 1 ? hourRow.variants[0]!.hours! : null;
  const result: ProrationResult = {
    ...base,
    status: 'calculated',
    rows,
    roundingOpen: rows.some((r) => r.variants.some((x) => x.amount === null)),
    range: { min: Math.min(...all), max: Math.max(...all) },
    // 유급시간이 0이면 시간당 금액을 낼 수 없다(0으로 나눔) — 참고 값을 내지 않는다
    reference: mw && oneHours ? { paidHours: oneHours, minHourly: mw.minHourly, floor: oneHours * mw.minHourly } : null,
    zeroPaidHours: oneHours === 0,
  };
  if (input.payslip !== undefined) result.payslip = { amount: input.payslip, matches: payslipMatches(rows, input.payslip) };
  return result;
}

const CANDIDATE_RULES: RoundingRule[] = ([1, 10, 100] as const).flatMap((unit) => (['FLOOR', 'ROUND', 'CEIL'] as const).map((how) => ({ how, unit })));

/** f 를 어떤 끝수 처리로 n 이 되게 할 수 있으면 그 처리(1원 → 10원 → 100원, 버림 → 반올림 → 올림 순) */
function ruleTo(f: Fraction, n: number): RoundingRule | null {
  return CANDIDATE_RULES.find((r) => toWon(f, r.how, r.unit) === n) ?? null;
}

function payslipMatches(rows: MethodRow[], n: number): PayslipMatch[] {
  const out: PayslipMatch[] = [];
  for (const r of rows) {
    for (const x of r.variants) {
      if (x.amount !== null) {
        if (x.amount === n) out.push({ id: r.id, label: x.label });
      } else {
        const how = ruleTo(x.exact, n);
        if (how) out.push({ id: r.id, label: x.label, how });
      }
      if (x.hourlyFirst?.floor === n) out.push({ id: r.id, label: x.label, hourlyFirst: 'floor' });
      else if (x.hourlyFirst?.round === n) out.push({ id: r.id, label: x.label, hourlyFirst: 'round' });
    }
  }
  return out;
}

// ── 결근·지각 공제(그달 내내 재직) ──

export type DayUnit = 'HOUR8' | 'DAY_30' | 'CALENDAR';

export interface AbsenceInput {
  month: string;
  monthlyPay: number;
  fivePlus: boolean;
  /** 무급 결근일(소정근로일, 유급휴가·휴일 아님) */
  absences: string[];
  /** 지각·조퇴 합계 시간 */
  lateHours?: number;
  /** 대조할 회사 공제액 */
  companyDeduction?: number;
  /** 평균임금 1일분 — 감급 1회 한도(근로기준법 §95)를 볼 때만 */
  avgDailyWage?: number;
  holidays?: string[];
  rounding?: RoundingRule | null;
}

export interface AbsenceRow {
  unit: DayUnit;
  dayRate: Fraction;
  /** 결근일분만 */
  daysOnly: Variant;
  /** 결근일분 + 결근한 주마다 그 주 주휴 1일분 */
  withHoliday: Variant;
}

export interface AbsenceResult {
  monthlyPay: number;
  month: string;
  monthDays: number;
  hourly: Fraction;
  absentDays: number;
  /** 결근한 주 가운데 주휴일(일요일)이 그달 안인 주 */
  holidayWeeks: number;
  /** 결근한 주 가운데 주휴일이 다음 달인 주 — 이 달 공제에 넣지 않았다 */
  nextMonthWeeks: number;
  rows: AbsenceRow[];
  /**
   * 지각·조퇴 — 통상시급 × 시간. 취업규칙·근로계약에 지각·조퇴 시간만큼 빼기로 정했을 때의 값이다.
   * 월급자는 정함이 없으면 지각·조퇴를 해도 소정 임금 전액이고, 취업규칙으로 정하면 §95 범위 안에서 감급할 수 있다(법무811-21010).
   * 주휴는 빼지 않는다(근로기준과-5560, 근기01254-1103)
   */
  late: Variant | null;
  /** 결근일분 + 그 주 주휴 1일분의 최대 = 통상시급 × 8 × (결근일 + 그 주 주휴) */
  absenceMax: Fraction;
  /** 시간·일수만큼 뺀 값의 최대 = absenceMax + 통상시급 × 지각·조퇴 시간(지각·조퇴 시간분 공제를 정했을 때) */
  noWorkMax: Fraction;
  company: null | {
    amount: number;
    matches: { unit: DayUnit; holiday: boolean; how?: RoundingRule }[];
    /** noWorkMax 보다 많이 뺀 금액 — 없으면 null */
    excess: Fraction | null;
    /** 감급 한도(근로기준법 §95). 4명 이하는 적용 제외(시행령 별표1)라 null */
    limits: null | { perIncident: number | null; total: Fraction };
    /** excess 를 한 번의 감급으로 보면 1회 한도를 넘는가. 여러 번의 감급을 합친 금액이면 회마다 대조한다(근로기준팀-462) */
    overPerIncident: boolean | null;
    overTotal: boolean | null;
    /**
     * 지각·조퇴가 있을 때만 — 법무811-21010 처럼 지각·조퇴 공제 전체를 감급으로 보면 감급액 = 회사 공제액 − absenceMax.
     * 21010 은 「지각·조퇴 3회 = 결근 1일분 감액」 규정을 물은 회시라 시간만큼만 빼는 규정까지 감급인지는 원문으로 닫히지 않는다 —
     * 그래서 excess 와 나란히 둔다. 결근분 이하면 null
     */
    lateAll: null | { amount: Fraction; overPerIncident: boolean | null; overTotal: boolean | null };
  };
  roundingOpen: boolean;
  minWage: MinWageSeam | null;
}

export function calcAbsence(input: AbsenceInput): AbsenceResult {
  const { month, monthlyPay: pay, fivePlus, rounding } = input;
  checkPay(pay);
  const { ps, pe, days: monthDays } = monthRange(month);
  const { set } = holidaySet(input.holidays, ps, pe);
  const late = input.lateHours ?? 0;
  if (!(late >= 0) || !Number.isFinite(late) || late > 400) throw new Error('지각·조퇴 시간을 확인해 주세요');

  const days = new Set<number>();
  for (const s of input.absences) {
    const t = parse(s, '결근일');
    if (t < ps || t > pe) throw new Error('결근일은 그달 날짜만 넣어 주세요');
    if (!isWeekday(t)) throw new Error('결근일은 소정근로일(월~금)만 넣어 주세요');
    if (set.has(t)) throw new Error('쉬는 공휴일은 결근일로 넣지 않습니다');
    days.add(t);
  }
  if (days.size === 0 && late === 0) throw new Error('결근일이나 지각·조퇴 시간을 넣어 주세요');

  // 한 주에 여러 날 결근해도 그 주 주휴는 1일뿐이다(법무811-23530). 주휴일(일요일) 날짜가 든 달에 넣는다.
  const sundays = new Set([...days].map((t) => t + (7 - dow(t)) * DAY));
  const holidayWeeks = [...sundays].filter((t) => t <= pe).length;
  const nextMonthWeeks = sundays.size - holidayWeeks;

  const hourly = frac(pay, unitHours('month', WEEKLY_HOURS));
  const intHourly = hourly.den === 1;
  const n = days.size;
  const timesFrac = (f: Fraction, k: number) => frac(f.num * k, f.den);
  const hourCell = (h: number): Variant => {
    const exact = timesFrac(hourly, h);
    return { label: null, exact, amount: intHourly ? viaEngine('ABSENCE_HOUR', { hourly_rate: hourly.num, unpaid_absence_hours: h }, rounding) : settle(exact, rounding), hours: h };
  };
  const dayCell = (rate: Fraction, k: number): Variant => {
    const exact = timesFrac(rate, k);
    return { label: null, exact, amount: settle(exact, rounding) };
  };
  const rows: AbsenceRow[] = [
    { unit: 'HOUR8', dayRate: timesFrac(hourly, DAILY_HOURS), daysOnly: hourCell(DAILY_HOURS * n), withHoliday: hourCell(DAILY_HOURS * (n + holidayWeeks)) },
    ...([['DAY_30', frac(pay, 30)], ['CALENDAR', frac(pay, monthDays)]] as const).map(([unit, rate]) => ({
      unit, dayRate: rate, daysOnly: dayCell(rate, n), withHoliday: dayCell(rate, n + holidayWeeks),
    })),
  ];
  const lateCell = late > 0 ? hourCell(late) : null;
  const absenceMax = timesFrac(hourly, DAILY_HOURS * (n + holidayWeeks));
  const noWorkMax = timesFrac(hourly, DAILY_HOURS * (n + holidayWeeks) + late);
  if (input.avgDailyWage !== undefined && !(Number.isFinite(input.avgDailyWage) && input.avgDailyWage > 0)) {
    throw new Error('평균임금 1일분을 확인해 주세요');
  }

  let company: AbsenceResult['company'] = null;
  if (input.companyDeduction !== undefined) {
    const amount = Math.abs(input.companyDeduction);
    if (!Number.isFinite(amount)) throw new Error('회사 공제액을 확인해 주세요');
    const lateExact = lateCell?.exact ?? { num: 0, den: 1 };
    const matches: NonNullable<AbsenceResult['company']>['matches'] = [];
    for (const r of rows) {
      // 결근 없이 지각·조퇴만이면 1일 단가가 쓰이지 않는다 — 시간분 한 칸만 본다
      if (n === 0 && r.unit !== 'HOUR8') continue;
      for (const [holiday, cell] of [[false, r.daysOnly], [true, r.withHoliday]] as const) {
        if (n === 0 && holiday) continue;
        const total = frac(cell.exact.num * lateExact.den + lateExact.num * cell.exact.den, cell.exact.den * lateExact.den);
        const exactAmount = total.den === 1 ? total.num : settle(total, rounding);
        if (exactAmount !== null) {
          if (exactAmount === amount) matches.push({ unit: r.unit, holiday });
        } else {
          const how = ruleTo(total, amount);
          if (how) matches.push({ unit: r.unit, holiday, how });
        }
      }
    }
    /** amount 가 cap 보다 크면 그 차이, 아니면 null */
    const beyond = (cap: Fraction) => (amount * cap.den > cap.num ? frac(amount * cap.den - cap.num, cap.den) : null);
    const excess = beyond(noWorkMax);
    // 감급 한도 — 1회 평균임금 1일분의 2분의 1, 총액은 1임금지급기 임금 총액의 10분의 1(근로기준법 §95). 총액은 넣은 월급으로 잰다.
    // 한도를 지키면 한 달에 여러 번 감급할 수 있다(근로기준팀-462) — 1회 한도는 「한 번의 감급이라면」으로만 대조한다.
    const limits = fivePlus
      ? { perIncident: input.avgDailyWage !== undefined ? input.avgDailyWage / 2 : null, total: frac(pay, 10) }
      : null;
    // 4명 이하 = 한도 없음(null) · 감급액 없음 = false · 평균임금을 안 넣음 = 대조 못 함(null)
    const perIncident = (f: Fraction | null) => (!limits ? null : !f ? false : limits.perIncident === null ? null : value(f) > limits.perIncident);
    const overTotal = (f: Fraction | null) => (limits ? (f ? value(f) > value(limits.total) : false) : null);
    const all = late > 0 ? beyond(absenceMax) : null;
    company = {
      amount, matches, excess, limits,
      overPerIncident: perIncident(excess),
      overTotal: overTotal(excess),
      lateAll: all ? { amount: all, overPerIncident: perIncident(all), overTotal: overTotal(all) } : null,
    };
  }

  return {
    month, monthlyPay: pay, monthDays, hourly, absentDays: n, holidayWeeks, nextMonthWeeks, rows, late: lateCell, absenceMax, noWorkMax, company,
    roundingOpen: rows.some((r) => r.daysOnly.amount === null || r.withHoliday.amount === null) || lateCell?.amount === null,
    minWage: minWageOf(month, pay),
  };
}
