// 통합 규칙엔진 — Python check_compliance.run_all_rules 포트.
// checkContract(정규화된 계약) → 자동판정 규칙(auto:true) 전체의 Finding 리스트.

import { runClauseRules } from './rules/clauses';
import { runEmploymentRules } from './rules/employment';
import { runHoursRules } from './rules/hours';
import { runMiscRules } from './rules/misc';
import { runRequiredTermsRules } from './rules/required_terms';
import { runWageRules } from './rules/wage';
import type { Contract, Finding } from './types';

/** 규칙엔진 전체 실행 → Finding 리스트 (실행 순서는 Python 참조구현과 동일). */
export function checkContract(contract: Contract): Finding[] {
  return [
    ...runClauseRules(contract),
    ...runWageRules(contract),
    ...runHoursRules(contract),
    ...runMiscRules(contract),
    ...runRequiredTermsRules(contract),
    ...runEmploymentRules(contract),
  ];
}
