// fixtures 형식(common+contracts) 또는 단일 계약 JSON → 스키마 규격의 완전한 계약 객체 리스트.
// Python 참조구현(contract-review-skill/scripts/normalize.py)에서 왔다. 261031 부터 통상시급 파생이, 261101 부터
// 소정근로시간 파생과 단시간 판정이 파이썬과 다르다(파이썬은 아직 항상 209·실근로 기준).
//
// 파생 계산:
// - work_time.weekly_actual_hours / weekly_overtime_hours — variants·breaks에서 계산
// - work_time.weekly_scheduled_hours / weekly_scheduled_days / weekly_scheduled_source — 1주 소정근로시간·근로일·출처.
//   요일별 근무표를 믿을 수 있으면(행이 모두 유효하고 행 수 = days_per_week) 휴게를 뺀 그 합·요일 수(daily — 출근·퇴근
//   칸 값으로 깎지 않는다), 아니면 weekly_actual_hours·days_per_week(actual)
// - wage.ordinary_hourly_rate = wageBasis 의 시급(시급제), 시급제인데 시급으로 볼 수 없으면 null,
//   월급제는 BASE.amount ÷ (basis_hours, 없으면 최저임금 적용기준 월 시간 — 근로시간을 모르면 209) (정수)
// - signatures.retroactive_days = written_date - start_date (일수)
// - employee.employment_type — 명시값 우선, 없으면 indefinite=false→fixed_term,
//   1주 소정<40→part_time, 둘 다면 fixed_term_part_time, 그 외 regular

import minwageJson from '@/lib/contract-check/data/minwage_table.json';

import type { Contract, FixturesInput, WorkBreak, WorkTime } from './types';

export const MONTHLY_BASE_HOURS = 209;
export const WEEKLY_STANDARD_HOURS = 40.0;
/** 규칙들이 함께 쓰는 상수 — 규칙 파일끼리 import 하지 않도록 여기 둔다 */
export const WAGE_MATH_TOLERANCE = 10;
export const WEEKS_PER_MONTH = 4.345;
export const OT_PREMIUM_RATE = 1.5;
/** 연도별 최저시급(원) */
export const MINWAGE_TABLE: Record<string, number> = minwageJson;
export const PART_TIME_TYPES = new Set(['part_time', 'fixed_term_part_time']);
export const FIXED_TERM_TYPES = new Set(['fixed_term', 'fixed_term_part_time']);
/** 시급으로 볼 수 있는 폭(시급 띠) — 최저시급의 0.5~5배. 산출시간이 월 규모(40H 이상)일 때만 쓴다(wageBasis) */
export const HOURLY_PLAUSIBLE_MIN = 0.5;
export const HOURLY_PLAUSIBLE_MAX = 5;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

const DAY_MINUTES = 24 * 60;

/** 시업~종업 길이(분). 종업이 시업보다 이르면 자정을 넘긴 근무로 본다 */
function shiftSpan(start: string, end: string): number {
  const s = minutesOf(start);
  const e = minutesOf(end);
  return e < s ? e + DAY_MINUTES - s : e - s;
}

/** 근로기준법 §54 — 근로시간 4시간 30분, 8시간 1시간 이상 */
function statutoryBreakMinutes(spanMinutes: number): number {
  if (spanMinutes >= 8 * 60) return 60;
  if (spanMinutes >= 4 * 60) return 30;
  return 0;
}

/** 하루 실근로 분 = (종업-시업) - 근무시간 창 안에 완전히 들어가는 휴게 분 - 시각 없는 휴게 분. 0 미만이 되지 않는다.
 * 종업이 시업보다 이르면 자정을 넘긴 근무로 보아 24시간을 더하고, 그 창 안의 휴게 시각도 같이 옮긴다.
 * 시각 없는 휴게(분만 적힌 것)는 전부 뺀다 — 법정 휴게(근기법 §54)는 하한이라 더 길게 준 휴게도 근로시간이 아니다.
 * capUntimed 면(근로일별 행에 하루 휴게 한 칸이 일괄 적용될 때) 그 행 길이의 법정 휴게(4시간 이상 30분, 8시간 이상
 * 60분)까지만 뺀다 — 폼의 「하루 휴게 60」이 3.5시간 행에서도 통째로 빠지지 않게. */
export function dayWorkMinutes(start: string, end: string, breaks: WorkBreak[], capUntimed = false): number {
  const startM = minutesOf(start);
  const overnight = minutesOf(end) < startM;
  const endM = minutesOf(end) + (overnight ? DAY_MINUTES : 0);
  const shift = (m: number) => (overnight && m < startM ? m + DAY_MINUTES : m);
  const span = endM - startM;
  let total = span;
  let untimed = 0;
  for (const br of breaks) {
    if (br.from && br.to) {
      if (shift(minutesOf(br.from)) >= startM && shift(minutesOf(br.to)) <= endM) {
        total -= br.minutes;
      }
    } else {
      untimed += br.minutes;
    }
  }
  total -= capUntimed ? Math.min(untimed, statutoryBreakMinutes(span)) : untimed;
  return Math.max(0, total);
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** work_time(variants·breaks) → [weekly_actual_hours, weekly_overtime_hours]. 계산 불가 시 [null, null]. */
export function computeWeeklyHours(workTime: WorkTime): [number | null, number | null] {
  const { start, end, days_per_week: days } = workTime;
  if (!start || !end || !days) return [null, null];
  const breaks = workTime.breaks ?? [];
  const variants = workTime.variants ?? [];
  const variantDays = variants.reduce((sum, v) => sum + (v.per_week ?? 0), 0);
  let weeklyMin = (days - variantDays) * dayWorkMinutes(start, end, breaks);
  for (const v of variants) {
    weeklyMin += (v.per_week ?? 0) * dayWorkMinutes(v.start ?? start, v.end ?? end, breaks);
  }
  const actual = round2(weeklyMin / 60);
  const overtime = round2(Math.max(0, actual - WEEKLY_STANDARD_HOURS));
  return [actual, overtime];
}

/** 근로일별 행 수가 주 근무일수와 다를 때 PART-TIME-OT·REQUIRED-TERMS-FIXED 가 함께 쓰는 문구 */
export const DAILY_MISMATCH_NOTE = '근로일별 시간이 주 근무일수와 맞지 않음';

/** 요일별 근무표 상태 — none(행 없음)·invalid(start/end 결손 행)·mismatch(주 근무일수와 행 수가 다름 — 예: 주 6일
 * 정규직 계약에 토요일 한 줄)·ok. ok 일 때만 근로일별 시간을 1주 소정으로 쓴다. PART-TIME-OT·REQUIRED-TERMS-FIXED 가 같은 문구를 쓴다. */
export function dailyScheduleState(workTime: WorkTime): 'none' | 'invalid' | 'mismatch' | 'ok' {
  const schedules = workTime.daily_schedules ?? [];
  if (schedules.length === 0) return 'none';
  if (schedules.some((s) => !s.start || !s.end)) return 'invalid';
  const days = workTime.days_per_week;
  if (days != null && days > 0 && schedules.length !== days) return 'mismatch';
  return 'ok';
}

/** 요일별 근무표 → [휴게 차감 주간 합(H), 근로일 수]. 상태가 ok 가 아니면 null.
 * 자정을 넘는 행은 dayWorkMinutes 가 24시간을 더한다. 시각 없는 하루 휴게는 가장 긴 하루(가장 긴 행, 출근·퇴근 칸이 더
 * 길면 그것)와 같은 길이의 행에서는 전부 빼고, 그보다 짧은 행에서만 그 행 길이의 법정 휴게까지 뺀다. 출근·퇴근 칸이 짧아도
 * 행 소정은 줄지 않는다(그 칸은 기준을 늘릴 뿐 — 월·화 09~18, 수~금 09~13 은 칸이 09~13 이든 09~18 이든 26.5H). */
function dailyScheduledWeek(workTime: WorkTime): [number, number] | null {
  if (dailyScheduleState(workTime) !== 'ok') return null;
  const schedules = workTime.daily_schedules ?? [];
  const breaks = workTime.breaks ?? [];
  const longestRow = Math.max(...schedules.map((s) => shiftSpan(s.start, s.end)));
  const reference =
    workTime.start && workTime.end ? Math.max(longestRow, shiftSpan(workTime.start, workTime.end)) : longestRow;
  let minutes = 0;
  for (const s of schedules) {
    minutes += dayWorkMinutes(s.start, s.end, breaks, shiftSpan(s.start, s.end) < reference);
  }
  return [round2(minutes / 60), schedules.length];
}

/** 근로기준법 §18③ — 1주 소정 15시간 미만이면 §55(주휴) 비적용 */
export const WEEKLY_HOLIDAY_MIN_HOURS = 15;
/** 1주 유급 주휴시간 상한 — 1일 소정근로시간(근로기준법 §2①8호 법정 1일 8시간) */
export const WEEKLY_HOLIDAY_MAX_HOURS = 8;
/** 1년 평균 주 수 ÷ 12 (최저임금법 시행령 §5①3호) */
export const WEEKS_PER_MONTH_EXACT = 365 / 7 / 12;
/** 단시간근로자 1일 소정 = 4주 소정 ÷ 통상 근로자 총 소정근로일 수(근로기준법 시행령 별표2 2.나). 통상 근로자 근로일을 모르면 주 5일로 본다 */
export const ASSUMED_FULLTIME_DAYS = 5;

export interface WeeklyHoliday {
  /** 1주 소정근로시간 — 40H 상한 */
  weekly: number;
  /** 1주 유급 주휴시간 — 반올림하지 않은 값(표시할 때만 반올림한다. 40÷6 = 6.666…) */
  holiday: number;
  /** 단시간이라 통상 근로자 주 5일을 가정했는가 */
  assumedFiveDays: boolean;
}

/** 1주 소정·주휴시간. 1주 소정을 모르면 null. 15H 미만이면 주휴 0.
 * 1일 소정 = 40H 로 자르기 전 1주 소정 ÷ 소정근로일(8H 상한) — 48H/6일은 8H 이지 40÷6 이 아니다. */
export function weeklyHoliday(contract: Contract): WeeklyHoliday | null {
  const wt = contract.work_time ?? {};
  const scheduled = wt.weekly_scheduled_hours;
  if (scheduled == null || scheduled <= 0) return null;
  const weekly = Math.min(scheduled, WEEKLY_STANDARD_HOURS);
  if (weekly < WEEKLY_HOLIDAY_MIN_HOURS) return { weekly, holiday: 0, assumedFiveDays: false };
  const partTime = weekly < WEEKLY_STANDARD_HOURS;
  const days = wt.weekly_scheduled_days;
  const assumedFiveDays = partTime || !days;
  const daily = scheduled / (assumedFiveDays ? ASSUMED_FULLTIME_DAYS : (days as number));
  return { weekly, holiday: Math.min(daily, WEEKLY_HOLIDAY_MAX_HOURS), assumedFiveDays };
}

/** 최저임금 적용기준 월 시간 = (1주 소정 + 주휴) × 365/7/12, 정수 반올림(40H → 209H). 1주 소정을 모르면 null. */
export function monthlyStandardHours(contract: Contract): number | null {
  const wh = weeklyHoliday(contract);
  if (!wh) return null;
  return Math.round((wh.weekly + wh.holiday) * WEEKS_PER_MONTH_EXACT);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** 단시간 1주 소정 초과시간 = max(0, 실근로 − 소정). 소정은 믿을 수 있는 근로일별 시간(출처 daily)일 때만 쓰고,
 * 아니면 소정 = 실근로로 보아 0. 실근로 미상 null. PART-TIME-OT(법리 E)와 포괄 총액 역산(D)이 같이 쓴다 —
 * 고용형태·상시 5인 여부는 부르는 쪽이 본다. */
export function partTimeExcessHours(contract: Contract): number | null {
  const wt = contract.work_time ?? {};
  const actual = wt.weekly_actual_hours;
  if (actual == null) return null;
  if (wt.weekly_scheduled_source !== 'daily' || wt.weekly_scheduled_hours == null) return 0;
  return round1(Math.max(0, actual - wt.weekly_scheduled_hours));
}

/** 시급 띠의 기준 최저시급 — 계약 시작 연도, 없거나 표에 없으면 표의 마지막 연도. 사진 추출 매핑(extractMap)도 쓴다. */
export function minimumWageFor(startDate: string | null | undefined): number {
  const year = (startDate ?? '').slice(0, 4);
  if (MINWAGE_TABLE[year] !== undefined) return MINWAGE_TABLE[year];
  const years = Object.keys(MINWAGE_TABLE).sort();
  return MINWAGE_TABLE[years[years.length - 1]];
}

/** 산출근거 시간이 이 폭 안이면 주휴가 들어간 월 시간으로 본다 */
const MONTHLY_BASIS_TOLERANCE_H = 1;

/** BASE 산출근거 시간이 주휴가 들어간 월 시간인가 — 최저임금 적용기준 월 시간(근로시간 미상이면 209H) ±1H.
 * 포괄이면 월 시간 + 주 연장 × 4.345 × 1.5 ±1H 도 월 시간이다(「시급 × 241.6H(주휴·연장 포함)」). */
function isMonthlyBasisHours(contract: Contract, basis: number): boolean {
  const monthly = monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS;
  if (Math.abs(basis - monthly) <= MONTHLY_BASIS_TOLERANCE_H) return true;
  const ot = contract.work_time?.weekly_overtime_hours;
  if (contract.wage?.inclusive_wage !== true || ot == null || ot <= 0) return false;
  return Math.abs(basis - (monthly + ot * WEEKS_PER_MONTH * OT_PREMIUM_RATE)) <= MONTHLY_BASIS_TOLERANCE_H;
}

/** 주휴를 뺀 월 소정근로시간(주 40H × 365/7/12 = 174H) — 산출시간이 이 값 ±1H 이면 시급 × 소정시간인지 월급인지
 * 갈리지 않는다(261102 F6) */
const SCHEDULED_MONTH_HOURS = Math.round(WEEKLY_STANDARD_HOURS * WEEKS_PER_MONTH_EXACT);

export interface WageBasis {
  /** 임금 형태 — unknown 은 시급제·월급제가 갈리지 않음(pay_type 없음 + 산출시간 174±1H) */
  form: 'hourly' | 'monthly' | 'unknown';
  /** 계약 시급 — 시급제에서만. 시급제인데 시급으로 볼 수 없으면 null(산출시간 없이 5배 초과, 또는 월 규모 산출시간인데
   * 몫도 기본급도 띠 밖 — 금액과 산출시간이 맞지 않음), 월급제·unknown 은 null */
  rate: number | null;
  /** 시급의 출처 — basis(기본급 ÷ 산출근거 시간)·amount(기본급 그대로) */
  from: 'basis' | 'amount' | null;
  /** 산출근거 시간(1H 초과일 때만) */
  basisHours: number | null;
  /** 산출근거 시간이 주휴가 들어간 월 시간(209H ±1 등)인가 */
  monthlyHours: boolean;
}

/** 임금 형태·계약 시급·그 출처 — MINWAGE·통상시급 파생·사진 추출 매핑(extractMap)이 모두 이 함수 하나를 쓴다.
 * 시급 띠 = 최저시급(계약 시작 연도, 미상이면 표의 마지막 연도)의 0.5~5배.
 * 시급(261102 K1): 산출근거 시간(1H 초과)이 있으면 기본급 ÷ 그 시간(몫)이 시급이다 — 띠 아래면 그대로 미달, 기본급으로
 *   되돌아가지 않는다. 예외는 산출시간이 월 규모(40H 이상)이고 몫이 띠 밖일 때뿐: 기본급이 띠 안이면 기본급(amount —
 *   「시급 10,320 × 87H」를 amount 10,320 으로 적은 경우), 기본급도 띠 밖이면 금액과 산출시간이 맞지 않아 rate null.
 *   산출시간이 없으면 기본급이 띠 안일 때 그 금액.
 * 형태: ①pay_type monthly → 월급제 ②pay_type hourly → 시급제(209±1 창으로 바꾸지 않는다). 산출시간 없이 띠 아래 기본급(W3)도
 *   그 값, 띠 위면 null ③pay_type 없음 → 산출시간이 174±1H(주휴를 뺀 월 소정)이면 unknown(F6 — 구조화 칸이 주휴 포함
 *   true 면 빼고), 주휴 포함 월 시간이면
 *   월급제(몫·기본급이 띠 밖이어도), 기본급이 곧 시급(amount)이거나 산출시간이 있으면 시급제, 없으면 월급제.
 *   BASE 금액이 없으면 null. */
export function wageBasis(contract: Contract): WageBasis | null {
  const wage = contract.wage ?? {};
  const base = (wage.items ?? []).find((i) => i.code === 'BASE');
  if (!base || !(base.amount > 0)) return null;
  const amount = base.amount;
  const basisHours = base.basis_hours != null && base.basis_hours > 1 ? base.basis_hours : null;
  const monthlyHours = basisHours != null && isMonthlyBasisHours(contract, basisHours);
  const monthly: WageBasis = { form: 'monthly', rate: null, from: null, basisHours, monthlyHours };
  if (wage.pay_type === 'monthly') return monthly;
  // F6 — 구조화 칸이 「시급에 주휴 포함」(true)이면 「시급 × 소정시간」이 계약서에 적힌 셈이라 갈림이 없다(법리 B)
  if (
    wage.pay_type == null &&
    basisHours != null &&
    !monthlyHours &&
    base.includes_weekly_holiday !== true &&
    Math.abs(basisHours - SCHEDULED_MONTH_HOURS) <= MONTHLY_BASIS_TOLERANCE_H
  ) {
    return { form: 'unknown', rate: null, from: null, basisHours, monthlyHours };
  }

  const minimum = minimumWageFor(contract.period?.start_date);
  const max = minimum * HOURLY_PLAUSIBLE_MAX;
  const inBand = (x: number) => x >= minimum * HOURLY_PLAUSIBLE_MIN && x <= max;
  const hourly = (rate: number | null, from: WageBasis['from']): WageBasis => ({
    form: 'hourly',
    rate,
    from,
    basisHours,
    monthlyHours,
  });
  if (basisHours == null) {
    if (inBand(amount)) return hourly(amount, 'amount');
    // 시급제 명시 — 띠 아래 기본급은 그대로 시급(최저시급 미달), 띠 위면 시급으로 볼 수 없음
    if (wage.pay_type === 'hourly') return amount <= max ? hourly(amount, 'amount') : hourly(null, null);
    return monthly;
  }
  const quotient = amount / basisHours;
  const byQuotient = wage.pay_type === 'hourly' || !monthlyHours ? hourly(quotient, 'basis') : monthly;
  // 월 규모가 아닌 산출시간 — 몫이 곧 시급(띠를 보지 않는다)
  if (basisHours < WEEKLY_STANDARD_HOURS || inBand(quotient)) return byQuotient;
  if (inBand(amount)) return hourly(amount, 'amount');
  // 월 규모 산출시간인데 몫도 기본급도 띠 밖 — 주휴 포함 월 시간이면 월급제(C 가 본다), 아니면 금액과 산출시간이 맞지 않음
  return wage.pay_type !== 'hourly' && monthlyHours ? monthly : hourly(null, null);
}

/** 근로일별 행 합(소정)이 출근·퇴근 칸 합(실근로)보다 길면 두 시간이 서로 맞지 않는다(261102 K3) — MINWAGE·PART-TIME-OT·
 * WH-52CAP 는 어느 쪽도 고르지 않고 자료 필요로 내며 이 문구(두 시간)를 적는다. 맞지 않음이 없으면 null.
 * 행 합 ≤ 칸 합이면 소정은 행, 실근로는 칸(초과근로 방향 — 0004). */
export function dailyHoursConflict(contract: Contract): string | null {
  const wt = contract.work_time ?? {};
  const scheduled = wt.weekly_scheduled_hours;
  const actual = wt.weekly_actual_hours;
  if (wt.weekly_scheduled_source !== 'daily' || scheduled == null || actual == null || scheduled <= actual) return null;
  return `근로일별 시간(주 ${round2(scheduled)}H)이 출근·퇴근 시간(주 ${round2(actual)}H)보다 김`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const MS_PER_DAY = 86400000;
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY);
}

/** 계산 필드를 (재)계산해 채운다. in-place 후 같은 객체 반환. */
export function deriveFields(contract: Contract): Contract {
  const workTime = contract.work_time ?? {};
  contract.work_time = workTime;
  const [actual, overtime] = computeWeeklyHours(workTime);
  if (actual !== null) {
    workTime.weekly_actual_hours = actual;
    workTime.weekly_overtime_hours = overtime;
  }
  // 1주 소정근로시간 — 믿을 수 있는 요일별 근무표(휴게 차감)가 있으면 그것(출처 daily), 없으면 시업·종업으로
  // 계산한 주 근로시간(출처 actual). 최저임금(MINWAGE)·단시간 초과근로(PART-TIME-OT)·단시간 판정이 모두 이 값을 쓴다.
  const daily = dailyScheduledWeek(workTime);
  if (daily) {
    // 근로일별 행이 소정이다 — 출근·퇴근 칸(실근로)으로 깎지 않는다
    [workTime.weekly_scheduled_hours, workTime.weekly_scheduled_days] = daily;
    workTime.weekly_scheduled_source = 'daily';
  } else if (workTime.weekly_actual_hours != null) {
    workTime.weekly_scheduled_hours = workTime.weekly_actual_hours;
    workTime.weekly_scheduled_days = workTime.days_per_week ?? null;
    workTime.weekly_scheduled_source = 'actual';
  }

  const wage = contract.wage ?? {};
  const base = (wage.items ?? []).find((i) => i.code === 'BASE');
  const wb = wageBasis(contract);
  if (base && wb) {
    // 시급제는 wageBasis 의 계약 시급(시급으로 볼 수 없으면 null — 월 시간으로 나누지 않는다).
    // 월급제·unknown 은 산출근거 시간, 없으면 최저임금 적용기준 월 시간((1주 소정+주휴)×365/7/12, 40H 는 209H), 근로시간을 모르면 209H.
    if (wb.form === 'hourly') {
      wage.ordinary_hourly_rate = wb.rate == null ? null : Math.round(wb.rate);
    } else {
      const hours =
        base.basis_hours != null && base.basis_hours > 0
          ? base.basis_hours
          : (monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS);
      wage.ordinary_hourly_rate = Math.round(base.amount / hours);
    }
  }

  const employee = contract.employee ?? {};
  if (!employee.employment_type) {
    const hours = workTime.weekly_scheduled_hours ?? workTime.weekly_actual_hours;
    const isFixed = contract.period?.indefinite === false;
    const isPart = hours !== null && hours !== undefined && hours < WEEKLY_STANDARD_HOURS;
    if (isFixed && isPart) employee.employment_type = 'fixed_term_part_time';
    else if (isFixed) employee.employment_type = 'fixed_term';
    else if (isPart) employee.employment_type = 'part_time';
    else employee.employment_type = 'regular';
    contract.employee = employee;
  }

  const sig = contract.signatures ?? {};
  const written = sig.written_date;
  const start = contract.period?.start_date;
  if (written && start) {
    sig.retroactive_days = daysBetween(start, written);
    contract.signatures = sig;
  }
  return contract;
}

const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** common 블록을 개별 계약에 병합해 스키마 규격의 완전한 계약 객체를 만든다. */
function mergeContract(commonSrc: FixturesInput['common'], raw: FixturesInput['contracts'][number]): Contract {
  const c = deepCopy(raw) as unknown as Contract & {
    findings_extra?: Contract['expected_findings'];
    wage?: Contract['wage'] & { items_extra?: NonNullable<Contract['wage']['items']> };
  };
  const common = deepCopy(commonSrc);

  c.schema_version = '1.1';
  c.workplace = common.workplace;

  const periodCommon = common.period_common ?? {};
  const period = c.period ?? {};
  // Python setdefault와 동일: 키가 아예 없을 때만 common 값을 채운다 (명시적 null은 유지)
  if (period.indefinite === undefined) {
    period.indefinite = periodCommon.indefinite ?? null;
  }
  period.probation = { ...(periodCommon.probation ?? {}), ...(period.probation ?? {}) };
  c.period = period;

  c.work_time = common.work_time;

  const wageCommonAll = common.wage_common ?? {};
  const { items_fixed: itemsFixed = [], ...wageCommon } = wageCommonAll;
  const wage = c.wage ?? {};
  const itemsExtra = wage.items_extra ?? [];
  delete wage.items_extra;
  c.wage = { ...wageCommon, ...wage, items: [...deepCopy(itemsFixed), ...itemsExtra] };

  c.holidays_leave = common.holidays_leave ?? {};
  c.risk_clauses = common.risk_clauses ?? [];

  c.expected_findings = [...(common.findings_common ?? []), ...(c.findings_extra ?? [])];
  delete c.findings_extra;
  return deriveFields(c);
}

function isFixturesInput(data: unknown): data is FixturesInput {
  return (
    typeof data === 'object' && data !== null && 'contracts' in data && 'common' in data
  );
}

/** fixtures 형식(common+contracts)·정규화 계약 리스트·단일 계약 객체 → 계약 객체 리스트. */
export function normalize(data: unknown): Contract[] {
  if (Array.isArray(data)) {
    return data.map((c) => deriveFields(deepCopy(c) as Contract));
  }
  if (isFixturesInput(data)) {
    return data.contracts.map((raw) => mergeContract(data.common, raw));
  }
  return [deriveFields(deepCopy(data) as Contract)];
}
