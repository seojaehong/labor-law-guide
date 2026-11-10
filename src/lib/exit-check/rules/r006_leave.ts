// 원본: ~/dev/exit-check @cab1cce
// R-006 annual leave ledger link: presence, period, ledger_as_of, day fields present.
// Day arithmetic and accrual questions are out of MVP scope (decision 2).

import { groupProvided } from "../core/context";
import type { Finding } from "../core/types";
import { approvalFor, endedEvents, eventFinding, groupMissing, item, valueProblem, type RuleEval } from "./common";

const REQUIRED: Array<[string, string]> = [
  ["ledger_as_of", "ledger_as_of"],
  ["leave_period_start", "leave_period"],
  ["leave_period_end", "leave_period"],
  ["granted_days", "granted_days"],
  ["used_days", "used_days"],
  ["remaining_days", "remaining_days"],
];

export const evalR006: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];
  for (const ev of endedEvents(ctx)) {
    if (approvalFor(ctx, ev, "annual_leave_ledger")) {
      findings.push(eventFinding(meta, ev, "NOT_APPLICABLE", "annual_leave_ledger", "APPROVED_EXCLUSION_RECORD", []));
      continue;
    }
    if (!groupProvided(ctx, "annual_leave_ledger")) {
      findings.push(groupMissing(ctx, meta, ev, "annual_leave_ledger"));
      continue;
    }
    const rows = ev.rows.annual_leave_ledger;
    if (rows.length === 0) {
      findings.push(eventFinding(meta, ev, "INCOMPLETE", "annual_leave_ledger.row", "ROW_NOT_FOUND", []));
      continue;
    }
    let linked = true;
    for (const r of rows) {
      for (const [col, field] of REQUIRED) {
        const p = valueProblem(meta, ev, r, col, field);
        if (p) {
          findings.push(p);
          linked = false;
        }
      }
    }
    if (linked) compared.push(item(meta, ev.key, "ledger_as_of_and_period_linked"));
  }
  return { findings, compared };
};
