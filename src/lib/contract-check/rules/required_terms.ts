// 필수 명시사항 규칙 — 근로기준법 §17①②·시행령 §8 + 기간제법 §17.
//
// REQUIRED-TERMS: 전 근로자. 구조화 필드 존재로 서면 명시 여부 판정 —
//   임금 구성항목(wage.items)·계산방법(basis_text)·지급방법(payment_method),
//   소정근로시간(start/end/days_per_week), 주휴일(weekly_rest),
//   연차(annual_leave_clause), 취업장소·업무(job.location/duty).
//   1개라도 누락 → violation (detail에 누락 항목 나열).
//   261124 P1 — 1주 소정 15시간 미만이면 주휴일·연차, 상시 4명 이하(employee_count_5plus=false)면 연차는 해당 없음
//   (근기법 §18③, 시행령 §7 별표1). 인원·소정시간 미상은 종전대로 본다. REQUIRED-TERMS-FIXED ④휴일·휴가는 상시 4명 이하만
//   「휴일」로 한정(기간제법 시행령 §2 별표1) — 주 15시간 미만 예외는 기간제법 §17 에 두지 않았다(확인 못 함).
//
// REQUIRED-TERMS-FIXED: employment_type이 fixed_term/part_time 계열일 때만.
//   ①근로계약기간 ②근로시간·휴게 ③임금 구성·계산·지불 ④휴일·휴가
//   ⑤취업장소·업무 ⑥(단시간 한정) 근로일 및 근로일별 근로시간(daily_schedules — 행이 없거나 결손이면 누락).
//   regular → ok(비적용 명시), 누락 → violation.
//   행 수가 주 근무일수와 다르면 §17 누락(detail 에 DAILY_MISMATCH_NOTE — PART-TIME-OT 와 같은 문구). 단 사이트 폼이 덜 채운
//   행을 버린 표시(work_time.daily_schedules_dropped)가 있을 때만 「근로일별 시간 일부 미입력」 — 그것만이면 needs_data,
//   다른 누락이 있으면 violation 에 덧붙인다(261102 K5 — JSON·사진 경로는 §17 위반 그대로).

import { DAILY_MISMATCH_NOTE, FIXED_TERM_TYPES, PART_TIME_TYPES, WEEKLY_HOLIDAY_MIN_HOURS, dailyScheduleState } from '../normalize';
import type { Contract, Finding, Wage, WorkTime } from '../types';
import { makeFinding, type RuleFn } from './index';

const DAILY_TERMS = '근로일 및 근로일별 근로시간';
const DAILY_PARTIAL = `근로일별 시간 일부 미입력(${DAILY_MISMATCH_NOTE})`;

/** 임금 구성항목·계산방법·지급방법 누락 라벨 리스트. */
function wageMissing(wage: Wage): string[] {
  const missing: string[] = [];
  const items = wage.items ?? [];
  if (items.length === 0) {
    missing.push('임금 구성항목');
  } else if (items.some((i) => !i.basis_text)) {
    const noBasis = items.filter((i) => !i.basis_text).map((i) => i.label || i.code);
    missing.push(`임금 계산방법(산출근거 없는 항목: ${noBasis.join(', ')})`);
  }
  if (!wage.payment_method) missing.push('임금 지급방법');
  return missing;
}

/** 1주 소정근로시간이 15시간 미만으로 확인되면 true — 근기법 §55·§60 을 적용하지 않는다(§18③). 모르면 false */
function under15(contract: Contract): boolean {
  const scheduled = contract.work_time?.weekly_scheduled_hours;
  return scheduled != null && scheduled > 0 && scheduled < WEEKLY_HOLIDAY_MIN_HOURS;
}

/** 주휴일·연차를 명시해야 하는가(261124 P1). 주 15시간 미만이면 둘 다 없음(근기법 §18③), 상시 4명 이하로 표시되면
 * 연차(§60)는 적용하지 않음(시행령 §7 별표1 — §55①·§17 은 적용). 상시 인원 미상(null)은 5명 이상 전제 */
export function holidayLeaveApplies(contract: Contract): { weeklyRest: boolean; annualLeave: boolean; note: string } {
  if (under15(contract)) {
    return { weeklyRest: false, annualLeave: false, note: '1주 소정 15시간 미만 — 주휴일·연차 해당 없음(근기법 §18③)' };
  }
  if (contract.workplace?.employee_count_5plus === false) {
    return { weeklyRest: true, annualLeave: false, note: '상시 4명 이하 — 연차 해당 없음(근기법 시행령 §7 별표1)' };
  }
  return { weeklyRest: true, annualLeave: true, note: '' };
}

/** 근기법 §17 필수 명시사항 누락 라벨 리스트 (amendments 보완 문안도 재사용). */
export function requiredTermsMissing(contract: Contract): string[] {
  const workTime = contract.work_time ?? {};
  const holidays = contract.holidays_leave ?? {};
  const job = contract.job ?? {};
  const applies = holidayLeaveApplies(contract);

  const missing = wageMissing(contract.wage ?? {});
  if (!(workTime.start && workTime.end && workTime.days_per_week)) {
    missing.push('소정근로시간');
  }
  if (applies.weeklyRest && !holidays.weekly_rest) missing.push('주휴일');
  if (applies.annualLeave && !holidays.annual_leave_clause) missing.push('연차유급휴가');
  if (!job.location) missing.push('취업장소');
  if (!job.duty) missing.push('종사업무');
  return missing;
}

export const ruleRequiredTerms: RuleFn = (contract) => {
  const missing = requiredTermsMissing(contract);
  if (missing.length > 0) {
    return makeFinding(
      'REQUIRED-TERMS',
      'violation',
      '필수 명시사항 누락: ' + missing.map((m) => `${m} 미명시`).join(' · '),
    );
  }
  const applies = holidayLeaveApplies(contract);
  if (applies.note) {
    const terms = applies.weeklyRest ? '소정근로시간, 주휴일' : '소정근로시간';
    return makeFinding(
      'REQUIRED-TERMS',
      'ok',
      `근기법 §17 필수 명시사항(임금 구성·계산·지급방법, ${terms}, 취업장소·업무) 모두 기재 — ${applies.note}`,
    );
  }
  return makeFinding(
    'REQUIRED-TERMS',
    'ok',
    '근기법 §17 필수 명시사항(임금 구성·계산·지급방법, 소정근로시간, 주휴일, 연차, 취업장소·업무) 모두 기재',
  );
};

/** 기간제법 §17 누락 라벨 리스트 — fixed_term/part_time 계열 전제로 호출할 것. */
export function fixedTermsMissing(contract: Contract): string[] {
  const empType = contract.employee?.employment_type ?? '';
  const period = contract.period ?? {};
  const workTime = contract.work_time ?? {};
  const holidays = contract.holidays_leave ?? {};
  const job = contract.job ?? {};

  const missing: string[] = [];
  const hasPeriod =
    !!period.start_date && (!FIXED_TERM_TYPES.has(empType) || !!period.end_date);
  if (!hasPeriod) missing.push('근로계약기간');
  if (!(workTime.start && workTime.end && (workTime.breaks ?? []).length > 0)) {
    missing.push('근로시간·휴게');
  }
  if (wageMissing(contract.wage ?? {}).length > 0) {
    missing.push('임금의 구성항목·계산방법·지불방법');
  }
  // 상시 4명 이하는 제4호가 「휴일에 관한 사항」으로 한정된다(기간제법 시행령 §2 별표1) — 연차 문구가 없어도 누락이 아니다.
  // 주 15시간 미만은 근기법 §18③ 으로 주휴·연차가 없지만 기간제법 §17 제4호 「휴일·휴가에 관한 사항」을 적지 않아도 되는지는
  // 확인하지 못해 종전대로 본다(261124 P1)
  const leaveRequired = contract.workplace?.employee_count_5plus !== false;
  if (!holidays.weekly_rest || (leaveRequired && !holidays.annual_leave_clause)) missing.push('휴일·휴가');
  if (!(job.location && job.duty)) missing.push('취업장소·종사업무');
  if (PART_TIME_TYPES.has(empType) && dailyScheduleState(workTime) !== 'ok' && !formDroppedRows(workTime)) {
    missing.push(DAILY_TERMS);
  }
  return missing;
}

/** 사이트 폼이 덜 채운 근로일별 행을 버려 행 수가 주 근무일수와 달라진 경우 */
function formDroppedRows(workTime: WorkTime): boolean {
  return dailyScheduleState(workTime) === 'mismatch' && (workTime.daily_schedules_dropped ?? 0) > 0;
}

export const ruleRequiredTermsFixed: RuleFn = (contract) => {
  const empType = contract.employee?.employment_type ?? '';
  if (!PART_TIME_TYPES.has(empType) && !FIXED_TERM_TYPES.has(empType)) {
    return makeFinding(
      'REQUIRED-TERMS-FIXED',
      'ok',
      '기간의 정함 없는 통상 근로자 — 기간제법 §17 비적용',
    );
  }

  const missing = fixedTermsMissing(contract);
  const workTime = contract.work_time ?? {};
  const partial = PART_TIME_TYPES.has(empType) && formDroppedRows(workTime);
  if (missing.length > 0) {
    const mismatch = dailyScheduleState(workTime) === 'mismatch' ? `(${DAILY_MISMATCH_NOTE})` : '';
    return makeFinding(
      'REQUIRED-TERMS-FIXED',
      'violation',
      '기간제법 §17 서면명시 누락: ' +
        missing.map((m) => (m === DAILY_TERMS ? `${m} 미명시${mismatch}` : `${m} 미명시`)).join(' · ') +
        (partial ? ` / ${DAILY_PARTIAL} — 확인 필요` : ''),
    );
  }
  if (partial) {
    return makeFinding('REQUIRED-TERMS-FIXED', 'needs_data', `${DAILY_PARTIAL} — 요일별 시업·종업을 모두 채워야 판단 가능`);
  }
  const count = PART_TIME_TYPES.has(empType) ? 6 : 5;
  return makeFinding('REQUIRED-TERMS-FIXED', 'ok', `기간제법 §17 서면명시 ${count}개 항목 모두 기재`);
};

export const REQUIRED_TERMS_RULES: RuleFn[] = [ruleRequiredTerms, ruleRequiredTermsFixed];

export function runRequiredTermsRules(contract: Contract): Finding[] {
  return REQUIRED_TERMS_RULES.map((rule) => rule(contract));
}
