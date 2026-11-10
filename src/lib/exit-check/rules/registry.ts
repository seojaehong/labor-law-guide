// 원본: ~/dev/exit-check @cab1cce
// Rule registry (PRD 6.6). One registry for every workspace: no per-customer branches.
// Versions are fixture-stage drafts: nothing here has been approved yet (approval is a D28 item).

import { evalR001 } from "./r001_keys";
import { evalR002 } from "./r002_dates";
import { evalR003 } from "./r003_insurance";
import { evalR004 } from "./r004_freshness";
import { evalR005 } from "./r005_settlement";
import { evalR006 } from "./r006_leave";
import { evalR007 } from "./r007_corrections";
import { evalR008 } from "./r008_evidence";
import { evalR009 } from "./r009_deadlines";
import type { RuleEval } from "./common";
import type { ItemStatus } from "../core/types";

export const RULE_REGISTRY_VERSION = "fixture-0.1";

export interface RuleDefinition {
  rule_id: string;
  rule_version: string;
  /** Not set until the rule is approved. */
  effective_from: string | null;
  approved_at: string | null;
  approval_status: "draft_unapproved";
  /** Short label shown in the report (Korean, docs/02 allow-safe). */
  title: string;
  basis: string[];
  input_requirements: string[];
  statuses: ItemStatus[];
  evaluate: RuleEval;
}

const V = RULE_REGISTRY_VERSION;

export const RULES: RuleDefinition[] = [
  {
    rule_id: "R-001",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "키 완전성",
    basis: ["PRD 6.3", "PRD 6.6 R-001", "docs/03 2"],
    input_requirements: ["4 file groups: company_key, worker_token, employment_sequence"],
    statuses: ["MISSING_INPUT", "INCOMPLETE"],
    evaluate: evalR001,
  },
  {
    rule_id: "R-002",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "퇴사 날짜 분리",
    basis: ["PRD 4.1", "PRD 6.6 R-002", "PRD 6.7", "docs/03 3.5"],
    input_requirements: [
      "personnel_exit: employment_end_date, last_worked_date, employment_status",
      "insurance_loss: scheme, insurance_loss_date",
    ],
    statuses: ["MISSING_INPUT", "INCOMPLETE", "DISCREPANCY", "REVIEW_REQUIRED", "ON_HOLD"],
    evaluate: evalR002,
  },
  {
    rule_id: "R-003",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "보험 행·상태 대조",
    basis: ["PRD 6.6 R-003", "docs/03 3.3"],
    input_requirements: ["insurance_loss: scheme, submission_at, receipt_or_processing_status, observed_at", "required_schemes"],
    statuses: ["MISSING_INPUT", "INCOMPLETE", "DISCREPANCY", "NOT_APPLICABLE"],
    evaluate: evalR003,
  },
  {
    rule_id: "R-004",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "최신성",
    basis: ["PRD 4.3", "PRD 6.4", "PRD 6.6 R-004"],
    input_requirements: ["source_as_of (ledger_as_of)", "cutoff_at", "freshness_policy"],
    statuses: ["MISSING_INPUT", "INCOMPLETE", "STALE"],
    evaluate: evalR004,
  },
  {
    rule_id: "R-005",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "최종급여·정산 연결",
    basis: ["PRD 6.6 R-005", "PRD 6.7", "docs/03 3.2"],
    input_requirements: [
      "final_payroll_settlement: pay_period_start, pay_period_end, payment_date, settlement_status, settlement_reference",
      "payment_round when a key has several payment rows",
    ],
    statuses: ["MISSING_INPUT", "INCOMPLETE", "DISCREPANCY", "NOT_APPLICABLE"],
    evaluate: evalR005,
  },
  {
    rule_id: "R-006",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "연차대장 연결",
    basis: ["PRD 6.6 R-006", "docs/01 decision 2", "docs/03 3.4"],
    input_requirements: ["annual_leave_ledger: leave_period, granted_days, used_days, remaining_days, ledger_as_of"],
    statuses: ["MISSING_INPUT", "INCOMPLETE", "NOT_APPLICABLE"],
    evaluate: evalR006,
  },
  {
    rule_id: "R-007",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "중복·정정",
    basis: ["PRD 6.4", "PRD 6.6 R-007", "PRD 6.7"],
    input_requirements: ["rows of any file group sharing a key", "record_revision, source_system (provisional columns)", "supersedes links"],
    statuses: ["DISCREPANCY", "REVIEW_REQUIRED"],
    evaluate: evalR007,
  },
  {
    rule_id: "R-008",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "근거 추적성",
    basis: ["PRD 6.4", "PRD 6.6 R-008"],
    input_requirements: ["file_sha256", "source_locator", "source_type"],
    statuses: ["INCOMPLETE"],
    evaluate: evalR008,
  },
  {
    rule_id: "R-009",
    rule_version: V,
    effective_from: null,
    approved_at: null,
    approval_status: "draft_unapproved",
    title: "법정기한 후보 표시",
    basis: ["PRD 6.6 R-009", "docs/04", "rules/deadline-rules.json (verified: true only)"],
    input_requirements: ["employment_end_date", "payment_date", "insurance_loss_date", "submission_at"],
    statuses: ["REVIEW_REQUIRED"],
    evaluate: evalR009,
  },
];

export function ruleVersions(): Array<{ rule_id: string; rule_version: string; effective_from: string | null; approved_at: string | null }> {
  return RULES.map((r) => ({ rule_id: r.rule_id, rule_version: r.rule_version, effective_from: r.effective_from, approved_at: r.approved_at }));
}
