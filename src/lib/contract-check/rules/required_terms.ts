// 필수 명시사항 규칙 — 근로기준법 §17①②·시행령 §8 + 기간제법 §17.
//
// REQUIRED-TERMS: 전 근로자. 구조화 필드 존재로 서면 명시 여부 판정 —
//   임금 구성항목(wage.items)·계산방법(basis_text)·지급방법(payment_method),
//   소정근로시간(start/end/days_per_week), 주휴일(weekly_rest),
//   연차(annual_leave_clause), 취업장소·업무(job.location/duty).
//   1개라도 누락 → violation (detail에 누락 항목 나열).
//
// REQUIRED-TERMS-FIXED: employment_type이 fixed_term/part_time 계열일 때만.
//   ①근로계약기간 ②근로시간·휴게 ③임금 구성·계산·지불 ④휴일·휴가
//   ⑤취업장소·업무 ⑥(단시간 한정) 근로일 및 근로일별 근로시간(daily_schedules).
//   regular → ok(비적용 명시), 누락 → violation.

import type { Contract, Finding, Wage } from '../types';
import { makeFinding, type RuleFn } from './index';

export const PART_TIME_TYPES = new Set(['part_time', 'fixed_term_part_time']);
export const FIXED_TERM_TYPES = new Set(['fixed_term', 'fixed_term_part_time']);

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

/** 근기법 §17 필수 명시사항 누락 라벨 리스트 (amendments 보완 문안도 재사용). */
export function requiredTermsMissing(contract: Contract): string[] {
  const workTime = contract.work_time ?? {};
  const holidays = contract.holidays_leave ?? {};
  const job = contract.job ?? {};

  const missing = wageMissing(contract.wage ?? {});
  if (!(workTime.start && workTime.end && workTime.days_per_week)) {
    missing.push('소정근로시간');
  }
  if (!holidays.weekly_rest) missing.push('주휴일');
  if (!holidays.annual_leave_clause) missing.push('연차유급휴가');
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
  if (!(holidays.weekly_rest && holidays.annual_leave_clause)) missing.push('휴일·휴가');
  if (!(job.location && job.duty)) missing.push('취업장소·종사업무');
  if (PART_TIME_TYPES.has(empType) && (workTime.daily_schedules ?? []).length === 0) {
    missing.push('근로일 및 근로일별 근로시간');
  }
  return missing;
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
  if (missing.length > 0) {
    return makeFinding(
      'REQUIRED-TERMS-FIXED',
      'violation',
      '기간제법 §17 서면명시 누락: ' + missing.map((m) => `${m} 미명시`).join(' · '),
    );
  }
  const count = PART_TIME_TYPES.has(empType) ? 6 : 5;
  return makeFinding('REQUIRED-TERMS-FIXED', 'ok', `기간제법 §17 서면명시 ${count}개 항목 모두 기재`);
};

export const REQUIRED_TERMS_RULES: RuleFn[] = [ruleRequiredTerms, ruleRequiredTermsFixed];

export function runRequiredTermsRules(contract: Contract): Finding[] {
  return REQUIRED_TERMS_RULES.map((rule) => rule(contract));
}
