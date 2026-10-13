// 조항 태그 규칙 — risk_clauses[].tags 기반 자동 판정.
// 태그: 금품청산·조건부지급·즉시해고·자동만료·부제소·위약예정

import type { Contract, Finding, RiskClause } from '../types';
import { makeFinding, type RuleFn } from './index';

function tagged(contract: Contract, tag: string): RiskClause[] {
  return (contract.risk_clauses ?? []).filter((rc) => (rc.tags ?? []).includes(tag));
}

function refs(clauses: RiskClause[]): string {
  return clauses.map((rc) => rc.clause_ref || '?').join('·');
}

function tagRule(
  contract: Contract,
  code: string,
  tag: string,
  problem: string,
  okDetail: string,
): Finding {
  const clauses = tagged(contract, tag);
  if (clauses.length > 0) {
    return makeFinding(code, 'violation', `${refs(clauses)} ${problem}`);
  }
  return makeFinding(code, 'ok', okDetail);
}

export const rulePay14d: RuleFn = (contract) =>
  tagRule(contract, 'PAY-14D', '금품청산', '퇴직 금품청산 14일 초과 지급기일 약정', '금품청산 위반 조항 없음');

export const rulePayDirect: RuleFn = (contract) =>
  tagRule(contract, 'PAY-DIRECT', '조건부지급', '반납·방문 등 조건부 임금 지급 조항', '조건부 지급 조항 없음');

export const ruleDismissNotice: RuleFn = (contract) =>
  tagRule(contract, 'DISMISS-NOTICE', '즉시해고', '즉시해고 문구 — 30일 예고·서면통지 절차 배제', '즉시해고 조항 없음');

/** 자동만료 태그 + 무기계약(indefinite=true)이면 violation. 기간제면 risk. */
export const ruleDismissJust: RuleFn = (contract) => {
  const clauses = tagged(contract, '자동만료');
  if (clauses.length === 0) return makeFinding('DISMISS-JUST', 'ok', '자동만료 조항 없음');
  const detail = `${refs(clauses)} 자동만료 조항`;
  if (contract.period?.indefinite) {
    return makeFinding('DISMISS-JUST', 'violation', `${detail} — 무기계약의 해고사유 의제`);
  }
  return makeFinding(
    'DISMISS-JUST',
    'risk',
    `${detail} — 기간제라도 갱신기대권·해고 회피 목적 여부 검토 필요`,
  );
};

export const ruleNoLawsuitWaiver: RuleFn = (contract) =>
  tagRule(contract, 'NO-LAWSUIT-WAIVER', '부제소', '이의제기 금지·부제소 특약', '부제소 특약 없음');

export const rulePenaltyBan: RuleFn = (contract) =>
  tagRule(contract, 'PENALTY-BAN', '위약예정', '위약금·손해배상액 예정 조항', '위약예정 조항 없음');

export const CLAUSE_RULES: RuleFn[] = [
  rulePay14d,
  rulePayDirect,
  ruleDismissNotice,
  ruleDismissJust,
  ruleNoLawsuitWaiver,
  rulePenaltyBan,
];

export function runClauseRules(contract: Contract): Finding[] {
  return CLAUSE_RULES.map((rule) => rule(contract));
}
