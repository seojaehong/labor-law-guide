// 기타 규칙 — 주휴일 특정·소급작성·연차 선지급·포괄임금·수습 감액·연소자.
//
// REST-DAY: weekly_rest_day_specified=false → risk
// WRITTEN-TERMS: retroactive_days > 30 → risk (소급작성)
// ANNUAL-LEAVE: 연차수당 선지급 시간 > 0 → risk (사용권 보장·미사용 정산 별도)
// INCLUSIVE-WAGE: inclusive_wage=true → risk (고정 스케줄이면 산정 가능)
// MINWAGE-PROBATION: 감액 후 임금을 최저임금과 같은 계산으로 보므로(261124 P1) 규칙 본문은 wage.ts 에 있다. 결과 순서를 지키려고
//   engine 이 runMiscRules 에 넘겨 이 자리(연소자 앞)에서 돈다 — 규칙 파일끼리 import 하지 않는다
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

/** 기타 규칙 실행. minwageProbation = wage.ts 의 ruleMinwageProbation(engine 이 넘긴다) */
export function runMiscRules(contract: Contract, minwageProbation: RuleFn): Finding[] {
  const rules: RuleFn[] = [
    ruleRestDay,
    ruleWrittenTerms,
    ruleAnnualLeave,
    ruleInclusiveWage,
    minwageProbation,
    ruleMinorWorker,
  ];
  return rules.map((rule) => rule(contract));
}
