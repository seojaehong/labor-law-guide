// fixtures 형식(common+contracts) 또는 단일 계약 JSON → 스키마 규격의 완전한 계약 객체 리스트.
// Python 참조구현(contract-review-skill/scripts/normalize.py)과 동일 스펙.
//
// 파생 계산:
// - wage.ordinary_hourly_rate = BASE.amount / 209 (정수)
// - work_time.weekly_actual_hours / weekly_overtime_hours — variants·breaks에서 계산
// - signatures.retroactive_days = written_date - start_date (일수)
// - employee.employment_type — 명시값 우선, 없으면 indefinite=false→fixed_term,
//   weekly_actual_hours<40→part_time, 둘 다면 fixed_term_part_time, 그 외 regular

import type { Contract, FixturesInput, WorkBreak, WorkTime } from './types';

export const MONTHLY_BASE_HOURS = 209;
export const WEEKLY_STANDARD_HOURS = 40.0;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/** 하루 실근로 분 = (종업-시업) - 근무시간 창 안에 완전히 들어가는 휴게 분. */
export function dayWorkMinutes(start: string, end: string, breaks: WorkBreak[]): number {
  const startM = minutesOf(start);
  const endM = minutesOf(end);
  let total = endM - startM;
  for (const br of breaks) {
    if (br.from && br.to) {
      if (minutesOf(br.from) >= startM && minutesOf(br.to) <= endM) {
        total -= br.minutes;
      }
    } else {
      total -= br.minutes;
    }
  }
  return total;
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

function daysBetween(fromIso: string, toIso: string): number {
  const MS_PER_DAY = 86400000;
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY);
}

/** 계산 필드를 (재)계산해 채운다. in-place 후 같은 객체 반환. */
export function deriveFields(contract: Contract): Contract {
  const wage = contract.wage ?? {};
  const base = (wage.items ?? []).find((i) => i.code === 'BASE');
  if (base && base.amount) {
    wage.ordinary_hourly_rate = Math.round(base.amount / MONTHLY_BASE_HOURS);
  }

  const workTime = contract.work_time ?? {};
  const [actual, overtime] = computeWeeklyHours(workTime);
  if (actual !== null) {
    workTime.weekly_actual_hours = actual;
    workTime.weekly_overtime_hours = overtime;
  }

  const employee = contract.employee ?? {};
  if (!employee.employment_type) {
    const hours = workTime.weekly_actual_hours;
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
