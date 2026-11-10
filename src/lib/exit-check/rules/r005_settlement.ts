// 원본: ~/dev/exit-check @cab1cce
// R-005 final payroll / settlement link. Amounts are never read.
// Several payment rows are not an error; without a round key they are INCOMPLETE (PRD 6.7).

import { currentRows, groupProvided, keyOK, strValue } from "../core/context";
import type { Finding } from "../core/types";
import {
  approvalFor,
  endedEvents,
  eventFinding,
  fieldState,
  groupMissing,
  item,
  observed,
  rowEvidence,
  valueProblem,
  type RuleEval,
} from "./common";

const REQUIRED = ["pay_period_start", "pay_period_end", "payment_date", "settlement_status", "settlement_reference"];

export const evalR005: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  for (const ev of endedEvents(ctx)) {
    if (approvalFor(ctx, ev, "final_payroll_settlement")) {
      findings.push(eventFinding(meta, ev, "NOT_APPLICABLE", "final_payroll_settlement", "APPROVED_EXCLUSION_RECORD", []));
      continue;
    }
    if (!groupProvided(ctx, "final_payroll_settlement")) {
      findings.push(groupMissing(ctx, meta, ev, "final_payroll_settlement"));
      continue;
    }
    const rows = ev.rows.final_payroll_settlement;
    if (rows.length === 0) {
      findings.push(eventFinding(meta, ev, "INCOMPLETE", "final_payroll_settlement.row", "ROW_NOT_FOUND", []));
      continue;
    }
    let linked = true;
    for (const r of rows) {
      for (const col of REQUIRED) {
        const p = valueProblem(meta, ev, r, col, col);
        if (p) {
          findings.push(p);
          linked = false;
        }
      }
    }
    // A row replaced by a later row of the same payment is history kept by R-007, not another payment.
    const payments = currentRows(ev, "final_payroll_settlement");
    if (payments.length > 1) {
      // Several payment rows are told apart by the round or by the period key (PRD 6.7 「회차·기간 키」).
      // A key only separates the rows when every row has it and no two rows share it (SPEC-07).
      const distinct = (cols: string[]) =>
        payments.every((r) => cols.every((c) => fieldState(r, c) === "OK")) &&
        new Set(payments.map((r) => cols.map((c) => strValue(r, c)).join("|"))).size === payments.length;
      if (!distinct(["payment_round"]) && !distinct(["pay_period_start", "pay_period_end"])) {
        const states = payments.map((r) => fieldState(r, "payment_round"));
        const reason = states.some((s) => s === "ABSENT")
          ? "MULTIPLE_PAYMENTS_ROUND_COLUMN_ABSENT"
          : states.some((s) => s !== "OK")
            ? "MULTIPLE_PAYMENTS_ROUND_EMPTY"
            : "MULTIPLE_PAYMENTS_ROUND_NOT_DISTINCT";
        findings.push(
          eventFinding(meta, ev, "INCOMPLETE", "payment_round", reason, payments.map((r) => observed(r, "payment_date")), { payment_rows: payments.length }),
        );
        linked = false;
      }
    }
    // Sequence conflict: one settlement reference attached to several employment sequences.
    for (const r of rows) {
      const ref = strValue(r, "settlement_reference");
      if (!ref) continue;
      const others = ctx.records.final_payroll_settlement.filter(
        (o) =>
          keyOK(o) &&
          o.company_key.normalized === ev.company_key &&
          o.worker_token.normalized === ev.worker_token &&
          o.employment_sequence.normalized !== ev.employment_sequence &&
          strValue(o, "settlement_reference") === ref,
      );
      if (others.length > 0) {
        findings.push(
          eventFinding(meta, ev, "DISCREPANCY", "employment_sequence", "SETTLEMENT_REFERENCE_ON_SEVERAL_SEQUENCES", [
            observed(r, "settlement_reference"),
            ...others.map((o) => rowEvidence(o)),
          ]),
        );
      }
    }
    if (linked) compared.push(item(meta, ev.key, "settlement_reference_and_period_linked"));
  }
  return { findings, compared };
};
