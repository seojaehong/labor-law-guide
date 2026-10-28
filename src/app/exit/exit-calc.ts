// 퇴사 점검(/exit) 순수 계산 — 날짜·요건·확인용 추정치.
// 화면 없이 단위 시험(tests/unit/exit-calc.test.ts)으로 경계값을 본다.
// 날짜는 모두 'YYYY-MM-DD' 문자열, 내부 계산은 UTC 자정 기준(시간대 밀림 방지).
//
// 날짜 세는 법(화면 각주와 같다)
//   · 퇴직일 = 마지막 근무일 다음 날(근로자퇴직급여 보장법 실무, 고용보험법 §14①3, 국민건강보험법 §9①3)
//   · 「○일 이내」 기한 = 퇴직일을 1일째로 세어 ○일째 되는 날 → 마지막 근무일 + ○일
//   · 계속근로 1년 = 입사일의 1년 뒤 같은 날까지 근무가 이어졌는지(만 나이 방식). 날수 365로 보지 않는다

import { calcSeverance } from '@/lib/calc/severance';
import { unitHours } from '@/lib/calc/min-wage';

const DAY = 86_400_000;

export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function must(s: string, label: string): Date {
  const d = parseYmd(s);
  if (!d) throw new Error(`${label} 날짜 형식이 올바르지 않습니다`);
  return d;
}

export function addDays(s: string, n: number): string {
  return ymd(new Date(must(s, '날짜').getTime() + n * DAY));
}

/** n개월 뒤 같은 날. 그 달에 같은 날이 없으면 다음 달 1일로 넘어간다(Date.UTC 규칙) */
function addMonthsRaw(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

export function diffDays(later: string, earlier: string): number {
  return Math.round((must(later, '날짜').getTime() - must(earlier, '날짜').getTime()) / DAY);
}

/** 퇴직일 = 마지막 근무일 다음 날 */
export function retirementDate(lastDay: string): string {
  return addDays(lastDay, 1);
}

/** 「○일 이내」 기한 — 퇴직일을 1일째로 세어 n일째 되는 날 */
export function withinDaysFromRetirement(lastDay: string, n: number): string {
  return addDays(lastDay, n);
}

/** 그 날짜가 속한 달의 다음 달 15일 */
export function fifteenthOfNextMonth(s: string): string {
  const d = must(s, '날짜');
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15)));
}

/** 고용보험 피보험자격 상실일(이직한 날의 다음 날)이 속한 달의 다음 달 15일 — 고용보험법 시행령 §7① */
export function employmentInsuranceReportDeadline(lastDay: string): string {
  return fifteenthOfNextMonth(retirementDate(lastDay));
}

/** 구직급여 수급기간 끝 — 이직일 다음 날부터 12개월(고용보험법 §48①) */
export function jobseekerPeriodEnd(lastDay: string): string {
  const start = must(retirementDate(lastDay), '날짜');
  return ymd(new Date(addMonthsRaw(start, 12).getTime() - DAY));
}

/** 퇴직일 기준 계속근로가 1년 이상인지 — 입사 1년 뒤 같은 날 이후 퇴직이면 1년 이상 */
export function hasOneYear(hireDate: string, lastDay: string): boolean {
  const hire = must(hireDate, '입사일');
  const retire = must(retirementDate(lastDay), '퇴사일');
  return retire.getTime() >= addMonthsRaw(hire, 12).getTime();
}

export interface Input {
  hireDate: string;
  lastDay: string;
  /** 세전 월 급여(최근 3개월 평균으로 넣는다) */
  monthlyWage: number;
  /** 4주 평균 주 소정근로시간 */
  weeklyHours: number;
  /** 남은 연차 일수 — 근로자가 직접 확인해서 넣는다 */
  unusedLeaveDays?: number;
}

export type InputError = 'hire' | 'last' | 'order' | 'wage' | 'hours' | 'leave';

export function validate(i: Input): InputError[] {
  const errs: InputError[] = [];
  const h = parseYmd(i.hireDate);
  const l = parseYmd(i.lastDay);
  if (!h) errs.push('hire');
  if (!l) errs.push('last');
  if (h && l && l.getTime() < h.getTime()) errs.push('order');
  if (!(i.monthlyWage > 0)) errs.push('wage');
  if (!(i.weeklyHours > 0 && i.weeklyHours <= 168)) errs.push('hours');
  if (i.unusedLeaveDays !== undefined && !(i.unusedLeaveDays >= 0 && i.unusedLeaveDays <= 400)) errs.push('leave');
  return errs;
}

export interface SeveranceCheck {
  serviceDays: number;
  oneYear: boolean;
  hours15: boolean;
  eligible: boolean;
}

/** 퇴직금 요건 — 계속근로 1년 이상, 4주 평균 주 15시간 이상(근로자퇴직급여 보장법 §4① 단서) */
export function severanceCheck(hireDate: string, lastDay: string, weeklyHours: number): SeveranceCheck {
  const serviceDays = diffDays(retirementDate(lastDay), hireDate);
  const oneYear = hasOneYear(hireDate, lastDay);
  const hours15 = weeklyHours >= 15;
  return { serviceDays, oneYear, hours15, eligible: oneYear && hours15 };
}

export interface SeveranceEstimate {
  periodStart: string;
  periodDays: number;
  wageTotal: number;
  dailyAverage: number;
  amount: number;
}

/**
 * 퇴직금 확인용 추정 — 월 급여 × 3 을 3개월 임금총액으로 놓고 정본 엔진(src/lib/calc/severance.ts)으로 센다.
 * 1일 평균임금 × 30 × 재직일수 / 365. 상여·연차수당 가산, 평균임금 제외 기간, 통상임금 비교(§2②)는 넣지 않는다.
 */
export function estimateSeverance(hireDate: string, lastDay: string, monthlyWage: number): SeveranceEstimate {
  const r = calcSeverance({ hireDate, lastWorkDate: lastDay, wageTotal: monthlyWage * 3 });
  return { periodStart: r.segments[0]?.from ?? r.retirementDate, periodDays: r.periodDays, wageTotal: monthlyWage * 3, dailyAverage: r.dailyAverage, amount: r.amount };
}

/**
 * 월 소정근로시간 환산 — (주 소정시간 + 주휴시간) × 365 / 7 / 12 반올림, 주휴 = 주 소정시간 ÷ 5(8시간까지). 주 40시간 → 209.
 * /tools/leave-pay 와 같은 함수(min-wage unitHours)를 쓴다 — 주휴는 1일분이라 주 44시간이면 226시간(52.8시간으로 세면 229).
 */
export function monthlyPaidHours(weeklyHours: number): number {
  return unitHours('month', weeklyHours);
}

export interface LeaveEstimate {
  applicable: boolean;
  hourly: number;
  dailyHours: number;
  /** 1일 통상임금(원 미만 그대로) */
  daily: number;
  amount: number;
}

/**
 * 미사용 연차수당 확인용 추정 — 주 5일 근무로 보고 1일 소정시간 = 주 소정시간 ÷ 5.
 * 1일 통상임금 = 월 급여 ÷ 월 소정근로시간 환산 × 1일 소정시간. 주 15시간 미만이면 연차 규정 적용 제외(근로기준법 §18③).
 */
export function estimateLeavePay(monthlyWage: number, weeklyHours: number, unusedDays: number): LeaveEstimate {
  const applicable = weeklyHours >= 15;
  const hours = monthlyPaidHours(weeklyHours);
  const hourly = hours > 0 ? monthlyWage / hours : 0;
  const dailyHours = Math.min(weeklyHours / 5, 8);
  // 1일 통상임금은 원 미만을 남겨 두고, 수당에서 한 번만 버린다 — /tools/leave-pay(calculateAllowance)와 같은 순서·같은 식.
  // 곱셈 먼저(월급 × 1일 시간 ÷ 월 시간) 하고, 참값이 정수인데 0.999…로 나온 부동소수 잡음만 지운다.
  const daily = hours > 0 ? (monthlyWage * dailyHours) / hours : 0;
  const product = unusedDays * daily;
  const raw = Math.abs(product - Math.round(product)) < 1e-6 ? Math.round(product) : product;
  const amount = applicable ? Math.floor(raw) : 0;
  return { applicable, hourly, dailyHours, daily, amount };
}

export interface Milestone {
  key: 'before' | 'retire' | 'health' | 'settle' | 'employment' | 'jobseeker';
  date: string;
}

/** 날짜가 정해지는 이정표 — 화면 문구는 exit-worker-data.ts 에 있다 */
export function milestones(lastDay: string): Milestone[] {
  return [
    { key: 'before', date: lastDay },
    { key: 'retire', date: retirementDate(lastDay) },
    { key: 'settle', date: withinDaysFromRetirement(lastDay, 14) },
    { key: 'health', date: withinDaysFromRetirement(lastDay, 14) },
    { key: 'employment', date: employmentInsuranceReportDeadline(lastDay) },
    { key: 'jobseeker', date: jobseekerPeriodEnd(lastDay) },
  ];
}
