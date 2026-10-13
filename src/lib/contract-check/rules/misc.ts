// 기타 규칙 — 주휴일 특정·소급작성·연차 선지급·포괄임금·수습 감액·연소자.
//
// REST-DAY: weekly_rest_day_specified=false → risk
// WRITTEN-TERMS: retroactive_days > 30 → risk (소급작성)
// ANNUAL-LEAVE: 연차수당 선지급 시간 > 0 → risk (사용권 보장·미사용 정산 별도)
// INCLUSIVE-WAGE: inclusive_wage=true → risk (고정 스케줄이면 산정 가능)
// MINWAGE-PROBATION: 감액 문구 있으나 applied=false/null → minor risk (문구 정리 권고)
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
  if ((prob.months ?? 0) > 3) {
    return makeFinding(
      'MINWAGE-PROBATION',
      'violation',
      `수습 감액 기간 ${prob.months}개월 > 한도 3개월`,
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
