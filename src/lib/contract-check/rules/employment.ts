// 고용형태 특칙 — 기간제법 §4(사용기간 2년)·§6(단시간 초과근로 12시간).
//
// FIXED-TERM-2Y: 기간제만 적용. 계약기간이 2년 초과(end ≥ start+2년, 양끝 포함이라
//   end == start+2년이면 2년+1일) → risk(무기계약 간주 검토).
//   2년 이하는 ok — 갱신이력은 데이터에 없으므로 detail에 "갱신 누계 별도 확인".
// PART-TIME-OT: 단시간만 적용. 소정 = daily_schedules 주간 합(휴게 미차감),
//   없으면 소정=실근로로 보아 초과 0. weekly_actual − 소정 > 12H → violation,
//   12H 이내 초과는 ok + 가산 50% 지급 별도 확인.

import type { Contract, DailySchedule, Finding } from '../types';
import { makeFinding, type RuleFn } from './index';
import { FIXED_TERM_TYPES, PART_TIME_TYPES } from './required_terms';

export const FIXED_TERM_LIMIT_YEARS = 2;
export const PART_TIME_OT_LIMIT_HOURS = 12;
const DAYS_PER_YEAR = 365.25;
const MS_PER_DAY = 86400000;

const round1 = (x: number) => Math.round(x * 10) / 10;

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

function addYears(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const result = new Date(Date.UTC(y, m, d.getUTCDate()));
  // 2/29 → 2/28
  if (result.getUTCMonth() !== m) return new Date(Date.UTC(y, m, 28));
  return result;
}

function fmtH(hours: number): string {
  return String(hours);
}

/** daily_schedules 주간 합(H). start/end 결손 항목이 있으면 null. */
function weeklyScheduledHours(schedules: DailySchedule[]): number | null {
  let total = 0;
  for (const s of schedules) {
    if (!s.start || !s.end) return null;
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60; // 익일 종업
    total += minutes / 60;
  }
  return round1(total);
}

export const ruleFixedTerm2y: RuleFn = (contract) => {
  const empType = contract.employee?.employment_type ?? '';
  if (!FIXED_TERM_TYPES.has(empType)) {
    return makeFinding('FIXED-TERM-2Y', 'ok', '기간제 아님 — 비적용');
  }
  const period = contract.period ?? {};
  const start = parseDate(period.start_date);
  const end = parseDate(period.end_date);
  if (!start || !end) {
    return makeFinding('FIXED-TERM-2Y', 'needs_data', '계약 시작일·종료일 미기재 — 기간 산정 불가');
  }
  const years = round1(((end.getTime() - start.getTime()) / MS_PER_DAY + 1) / DAYS_PER_YEAR);
  if (end.getTime() >= addYears(start, FIXED_TERM_LIMIT_YEARS).getTime()) {
    return makeFinding(
      'FIXED-TERM-2Y',
      'risk',
      `계약기간 ${years}년 > 2년 — 무기계약 간주 검토(기간제법 §4②)`,
    );
  }
  return makeFinding('FIXED-TERM-2Y', 'ok', `계약기간 ${years}년 ≤ 2년 — 갱신 누계 별도 확인`);
};

export const rulePartTimeOt: RuleFn = (contract) => {
  const empType = contract.employee?.employment_type ?? '';
  if (!PART_TIME_TYPES.has(empType)) {
    return makeFinding('PART-TIME-OT', 'ok', '단시간 아님 — 비적용');
  }
  const actual = contract.work_time?.weekly_actual_hours;
  if (actual == null) {
    return makeFinding('PART-TIME-OT', 'needs_data', '주간 실근로시간 산정 불가');
  }
  const schedules = contract.work_time?.daily_schedules ?? [];
  const contracted = schedules.length > 0 ? weeklyScheduledHours(schedules) : null;
  if (contracted == null) {
    return makeFinding(
      'PART-TIME-OT',
      'ok',
      `근로일별 시간 미명시 — 소정=실근로 ${fmtH(actual)}H로 보아 초과 없음`,
    );
  }
  const excess = round1(actual - contracted);
  if (excess > PART_TIME_OT_LIMIT_HOURS) {
    return makeFinding(
      'PART-TIME-OT',
      'violation',
      `소정 주 ${fmtH(contracted)}H(daily_schedules) 대비 실근로 ${fmtH(actual)}H` +
        ` — 초과 ${fmtH(excess)}H > 한도 ${PART_TIME_OT_LIMIT_HOURS}H`,
    );
  }
  if (excess > 0) {
    return makeFinding(
      'PART-TIME-OT',
      'ok',
      `초과 ${fmtH(excess)}H ≤ 한도 ${PART_TIME_OT_LIMIT_HOURS}H — 가산 50% 지급 별도 확인(기간제법 §6③)`,
    );
  }
  return makeFinding(
    'PART-TIME-OT',
    'ok',
    `소정 주 ${fmtH(contracted)}H, 실근로 ${fmtH(actual)}H — 초과근로 없음`,
  );
};

export const EMPLOYMENT_RULES: RuleFn[] = [ruleFixedTerm2y, rulePartTimeOt];

export function runEmploymentRules(contract: Contract): Finding[] {
  return EMPLOYMENT_RULES.map((rule) => rule(contract));
}
