// 원본: ~/dev/pay-exception-check @c6c988d
// Core types. The core is pure: no IO, no network, no LLM.

export const SCENARIOS = ["MID_JOIN", "MID_LEAVE", "ABSENCE_DEDUCTION", "HOURLY_WEEKLY_HOLIDAY"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const POLICIES = ["HOUR_ACTUAL", "DAY_30", "ABSENCE_HOUR", "WEEKLY_HOLIDAY_FIXED"] as const;
export type PolicyId = (typeof POLICIES)[number];

/** Result status. Never a legal conclusion. */
export type Status = "MATCH" | "POTENTIAL_MISMATCH" | "NEEDS_CONFIRMATION" | "OUTSIDE_SCOPE";

/** Values the user has confirmed. Unconfirmed extraction candidates never get here (see extract.ts). */
export type Confirmed = Record<string, string | number | boolean | null>;

export interface CheckInput {
  case_id?: string;
  scenario: Scenario;
  confirmed: Confirmed;
  /** The company basis the user pointed to. null = 없음/모름. */
  policy_id: PolicyId | null;
}

export interface CheckResult {
  case_id: string | null;
  scenario: Scenario;
  status: Status;
  policy_id: PolicyId | null;
  /** Only for MATCH / POTENTIAL_MISMATCH. Never set when NEEDS_CONFIRMATION. */
  expected_amount: number | null;
  payslip_amount: number | null;
  /** Signed; positive = the worker gets less than the confirmed basis gives (pay: expected − payslip, deduction: payslip − expected). */
  difference: number | null;
  /** Machine reason codes, in the order they were decided. */
  reasons: string[];
  /** 관찰: what differs, in which item, by how much. */
  observation: string;
  /** 근거: the confirmed fields and the policy used. */
  grounds: string[];
  /** 조건부 해석 / 재확인 조건. */
  conditions: string[];
  /** 확인 상태: 금액은 냈지만 확인되지 않은 채 남은 것. 일치여도 화면·복사본에서 숨기지 않는다 (261022 결정). */
  open_confirmations: string[];
  /** 필요한 자료, at most 3. */
  evidence_needed: string[];
  /** 회사에 물어볼 문장 (or a self-check line). null for OUTSIDE_SCOPE. */
  required_question: string | null;
  /** Statute references the rule relies on. */
  citations: string[];
}
