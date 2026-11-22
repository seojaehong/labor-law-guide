// 기타 규칙 — 주휴일 특정·소급작성·연차 선지급·포괄임금·수습 감액·연소자.
//
// REST-DAY: weekly_rest_day_specified=false → risk
// WRITTEN-TERMS: retroactive_days > 30 → risk (소급작성)
// ANNUAL-LEAVE: 연차수당 선지급 시간 > 0 → risk (사용권 보장·미사용 정산 별도)
// INCLUSIVE-WAGE: inclusive_wage=true → risk (고정 스케줄이면 산정 가능)
// MINWAGE-PROBATION: 감액 문구 있으나 applied=false/null → minor risk (문구 정리 권고). 감액 기간 = reduced_months(있으면) 또는
//   months — 3개월 넘으면 violation. 시작·종료일로 1년 미만 기간을 정한 계약이면 violation(최저임금법 §5②, 261122). 근로계약서 작성은 수습 6개월 중 처음 3개월만 감액하므로 reduced_months 를 따로 넘긴다(PR #140 검토 5)
// MINOR-WORKER: is_minor=true → risk, 아니면 ok

import type { Contract, Finding } from '../types';
import { makeFinding, type RuleFn } from './index';

export const RETROACTIVE_LIMIT_DAYS = 30;

export const ruleRestDay: RuleFn = (contract) => {
  const specified = contract.holidays_leave?.weekly_rest_day_specified;
  if (specified == null) return makeFinding('REST-DAY', 'needs_data', '주휴일 특정 여부 미기재');
  if (specified) return makeFinding('REST-DAY', 'ok', '주휴일 요일 특정됨');
  return makeFinding('REST-DAY', 'risk', '주휴일 요일 미특정');
};

export const ruleWrittenTerms: RuleFn = (contract) => {
  const days = contract.signatures?.retroactive_days;
  if (days == null) {
    return makeFinding('WRITTEN-TERMS', 'needs_data', '작성일 또는 입사일 미기재 — 소급 여부 산정 불가');
  }
  if (days > RETROACTIVE_LIMIT_DAYS) {
    return makeFinding('WRITTEN-TERMS', 'risk', `입사 후 ${days}일 소급 작성 — 서면 명시·교부 시점 지연`);
  }
  return makeFinding('WRITTEN-TERMS', 'ok', `작성 시점 적정 (입사 대비 ${days}일)`);
};

export const ruleAnnualLeave: RuleFn = (contract) => {
  const prepaid = contract.holidays_leave?.annual_leave_prepaid_hours_per_month;
  if (!prepaid) return makeFinding('ANNUAL-LEAVE', 'ok', '연차수당 선지급 없음');
  return makeFinding(
    'ANNUAL-LEAVE',
    'risk',
    `연차수당 월 ${prepaid}H 선지급 — 사용권 보장·미사용 정산 별도 확인 필요`,
  );
};

export const ruleInclusiveWage: RuleFn = (contract) => {
  const inclusive = contract.wage?.inclusive_wage;
  if (inclusive == null) return makeFinding('INCLUSIVE-WAGE', 'needs_data', '포괄임금 여부 미기재');
  if (!inclusive) return makeFinding('INCLUSIVE-WAGE', 'ok', '포괄임금 약정 없음');
  return makeFinding(
    'INCLUSIVE-WAGE',
    'risk',
    '포괄임금 약정 — 고정 스케줄로 근로시간 산정 가능, 출퇴근기록 관리·유효성 검토 필요',
  );
};

/** 시작일부터 종료일까지가 1년 이상인지(종료일 = 시작일 + 1년 − 1일이면 1년). 수습 감액 요건(최저임금법 §5② 「1년 이상의
 * 기간을 정하여 근로계약을 체결」)을 점검 규칙(MINWAGE-PROBATION)과 근로계약서 작성(contract-write probationIssue)이 같이 쓴다 */
export function atLeastOneYear(start: string, end: string): boolean {
  const [y, m, d] = start.split('-').map(Number);
  const oneYearLast = new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
  return end >= oneYearLast;
}

/** 1년 미만 기간을 정한 계약인가 — 수습 감액 대상이 아니다(최저임금법 §5②, 261122 원격 점검 P1). 시작·종료일이 다 있고
 * 기간의 정함이 없다고 표시되지 않았을 때만 true. 종료일이 없는 기간제는 기간을 알 수 없어 false(종전대로) */
export function probationTermUnderOneYear(contract: Contract): boolean {
  const start = contract.period?.start_date;
  const end = contract.period?.end_date;
  // 날짜가 YYYY-MM-DD 가 아니면(검사를 거치지 않은 입력) 기간을 셀 수 없다 — 던지지 않고 보지 않는다
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!start || !end || !iso.test(start) || !iso.test(end)) return false;
  return contract.period?.indefinite !== true && !atLeastOneYear(start, end);
}

export const ruleMinwageProbation: RuleFn = (contract) => {
  const prob = contract.period?.probation ?? {};
  const pct = prob.wage_rate_pct;
  if (pct == null || pct >= 100) {
    return makeFinding('MINWAGE-PROBATION', 'ok', '수습 감액 문구 없음');
  }
  if (!prob.applied) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'risk',
      `수습 ${pct}% 감액 문구 잔존하나 실제 적용 없음(applied=${prob.applied}) — ` +
        "재작성 시 '해당사항 없음' 통일 권고",
      'minor',
    );
  }
  if (prob.simple_labor_job) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'violation',
      `단순노무직 수습 감액 ${pct}% — 최저임금법 시행령 §3 감액 불가`,
    );
  }
  if (probationTermUnderOneYear(contract)) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'violation',
      `계약기간 ${contract.period?.start_date}~${contract.period?.end_date} 은 1년 미만 — ` +
        `수습 ${pct}% 감액은 1년 이상의 기간을 정한 계약에만 가능(최저임금법 §5②)`,
    );
  }
  // 감액 기간을 따로 적었으면(근로계약서 작성 — 수습 6개월 중 처음 3개월) 그 기간으로 본다. 없으면 수습 기간 전체
  const reducedMonths = prob.reduced_months ?? prob.months ?? 0;
  if (reducedMonths > 3) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'violation',
      `수습 감액 기간 ${reducedMonths}개월 > 한도 3개월`,
    );
  }
  if (prob.reduced_months != null && (prob.months ?? 0) > prob.reduced_months) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'ok',
      `수습 ${prob.months}개월 중 처음 ${prob.reduced_months}개월만 ${pct}% 감액 — 3개월 이내 적용, 요건 충족`,
    );
  }
  return makeFinding('MINWAGE-PROBATION', 'ok', `수습 ${pct}% 감액 — 3개월 이내 적용, 요건 충족`);
};

export const ruleMinorWorker: RuleFn = (contract) => {
  if (contract.employee?.is_minor) {
    return makeFinding(
      'MINOR-WORKER',
      'risk',
      '연소자 — 근로시간 상한·야간근로 제한·친권자 동의서·가족관계증명 비치 특칙 점검 필요',
    );
  }
  return makeFinding('MINOR-WORKER', 'ok', '연소자 아님');
};

export const MISC_RULES: RuleFn[] = [
  ruleRestDay,
  ruleWrittenTerms,
  ruleAnnualLeave,
  ruleInclusiveWage,
  ruleMinwageProbation,
  ruleMinorWorker,
];

export function runMiscRules(contract: Contract): Finding[] {
  return MISC_RULES.map((rule) => rule(contract));
}
