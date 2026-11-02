// fixtures 형식(common+contracts) 또는 단일 계약 JSON → 스키마 규격의 완전한 계약 객체 리스트.
// Python 참조구현(contract-review-skill/scripts/normalize.py)에서 왔다. 261031 부터 통상시급 파생이, 261101 부터
// 소정근로시간 파생과 단시간 판정이 파이썬과 다르다(파이썬은 아직 항상 209·실근로 기준).
//
// 파생 계산:
// - work_time.weekly_actual_hours / weekly_overtime_hours — variants·breaks에서 계산
// - work_time.weekly_scheduled_hours / weekly_scheduled_days / weekly_scheduled_source — 1주 소정근로시간·근로일·출처.
//   요일별 근무표를 믿을 수 있으면(행이 모두 유효하고 행 수 = days_per_week) 휴게를 뺀 그 합·요일 수(daily),
//   아니면 weekly_actual_hours·days_per_week(actual)
// - wage.ordinary_hourly_rate = BASE.amount / (BASE.basis_hours 가 양수면 그 값, pay_type hourly 면 1(기본급 = 시급),
//   아니면 최저임금 적용기준 월 시간 monthlyStandardHours — 근로시간을 모르면 209) (정수)
// - signatures.retroactive_days = written_date - start_date (일수)
// - employee.employment_type — 명시값 우선, 없으면 indefinite=false→fixed_term,
//   1주 소정<40→part_time, 둘 다면 fixed_term_part_time, 그 외 regular

import type { Contract, FixturesInput, WorkBreak, WorkTime } from './types';

export const MONTHLY_BASE_HOURS = 209;
export const WEEKLY_STANDARD_HOURS = 40.0;
/** 임금 규칙들이 함께 쓰는 상수 — 규칙 파일끼리 import 하지 않도록 여기 둔다(rules/wage.ts 가 다시 내보낸다) */
export const WAGE_MATH_TOLERANCE = 10;
export const WEEKS_PER_MONTH = 4.345;
export const OT_PREMIUM_RATE = 1.5;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

const DAY_MINUTES = 24 * 60;

/** 근로기준법 §54 — 근로시간 4시간 30분, 8시간 1시간 이상 */
function statutoryBreakMinutes(spanMinutes: number): number {
  if (spanMinutes >= 8 * 60) return 60;
  if (spanMinutes >= 4 * 60) return 30;
  return 0;
}

/** 하루 실근로 분 = (종업-시업) - 근무시간 창 안에 완전히 들어가는 휴게 분 - 시각 없는 휴게 분.
 * 종업이 시업보다 이르면 자정을 넘긴 근무로 보아 24시간을 더하고, 그 창 안의 휴게 시각도 같이 옮긴다.
 * 시각 없는 휴게(분만 적힌 것)는 그 행 길이의 법정 휴게(4시간 이상 30분, 8시간 이상 60분)까지만 뺀다 —
 * 폼의 「하루 휴게」 한 칸이 짧은 근로일 행에서도 통째로 빠지지 않게. 결과는 0 미만이 되지 않는다. */
export function dayWorkMinutes(start: string, end: string, breaks: WorkBreak[]): number {
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
  total -= Math.min(untimed, statutoryBreakMinutes(span));
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

/** 요일별 근무표 → [휴게 차감 주간 합(H), 근로일 수]. 믿을 수 없으면 null — 행 하나라도 start/end 가 없거나,
 * 주 근무일수(days_per_week)가 있는데 행 수와 다르면(예: 주 6일 정규직 계약에 토요일 한 줄) 근로일별 시간으로 보지 않는다.
 * 자정을 넘는 행은 dayWorkMinutes 가 24시간을 더한다. */
function dailyScheduledWeek(workTime: WorkTime): [number, number] | null {
  const schedules = workTime.daily_schedules ?? [];
  if (schedules.length === 0) return null;
  const days = workTime.days_per_week;
  if (days != null && days > 0 && schedules.length !== days) return null;
  const breaks = workTime.breaks ?? [];
  let minutes = 0;
  for (const s of schedules) {
    if (!s.start || !s.end) return null;
    minutes += dayWorkMinutes(s.start, s.end, breaks);
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
    [workTime.weekly_scheduled_hours, workTime.weekly_scheduled_days] = daily;
    workTime.weekly_scheduled_source = 'daily';
  } else if (workTime.weekly_actual_hours != null) {
    workTime.weekly_scheduled_hours = workTime.weekly_actual_hours;
    workTime.weekly_scheduled_days = workTime.days_per_week ?? null;
    workTime.weekly_scheduled_source = 'actual';
  }

  const wage = contract.wage ?? {};
  const base = (wage.items ?? []).find((i) => i.code === 'BASE');
  if (base && base.amount) {
    // 산출근거 시간(basis_hours)이 있으면 그 시간으로 나눈다. 시급제(pay_type hourly)인데 시간이 없으면 기본급이
    // 곧 시급이다. 그 밖에는 최저임금 적용기준 월 시간((1주 소정+주휴)×365/7/12, 40H 는 209H), 근로시간을 모르면 209H.
    const hasBasis = base.basis_hours != null && base.basis_hours > 0;
    const hours = hasBasis
      ? (base.basis_hours as number)
      : wage.pay_type === 'hourly'
        ? 1
        : (monthlyStandardHours(contract) ?? MONTHLY_BASE_HOURS);
    wage.ordinary_hourly_rate = Math.round(base.amount / hours);
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
