// 원본: ~/dev/exit-check @cab1cce
// R-007 duplicates and corrections. Nothing is deleted or merged by precedence:
// a correction chain keeps every row; the latest row per source is the current value.
// Rows that share a source and an order key while differing are a DISCREPANCY.
// All four file groups are covered: a payroll or leave row replaced by a later row of the same
// payment or leave period stays in a chain and is listed, as personnel and insurance rows are
// (RV-SPEC03-TRACE, PRD 6.4 / 6.7).

import { COMPARED_FIELDS, groupSources, partitionByIdentity, ROW_IDENTITY } from "../core/context";
import type { FileGroup, Finding } from "../core/types";
import { eventFinding, fieldName, item, mkFinding, observed, type RuleEval } from "./common";

type Grouped = ReturnType<typeof groupSources>;

function merge(parts: Grouped[]): Grouped {
  return {
    current: parts.flatMap((p) => p.current),
    chains: parts.flatMap((p) => p.chains),
    ties: parts.flatMap((p) => p.ties),
    identical: parts.flatMap((p) => p.identical),
    history: parts.flatMap((p) => p.history),
  };
}

const ROW_GROUPS: FileGroup[] = ["final_payroll_settlement", "annual_leave_ledger"];

export const evalR007: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];
  for (const s of ctx.supersedesIssues) {
    findings.push(
      mkFinding(meta, {
        status: "REVIEW_REQUIRED",
        key: `file:${s.file_sha256}`,
        field: `${s.file_group}.supersedes`,
        reason_code: s.reason_code,
        evidence: [{ role: "file", file_group: s.file_group, file_sha256: s.file_sha256, source_type: null, locator: null }],
      }),
    );
  }
  for (const ev of ctx.events) {
    const sets: Array<{ label: string; group: FileGroup; scheme: string | null; result: Grouped }> = [
      { label: "personnel_exit", group: "personnel_exit", scheme: null, result: ev.personnelGroups },
    ];
    const ins = ev.rows.insurance_loss.filter((r) => typeof r.values.scheme?.normalized === "string");
    for (const s of [...new Set(ins.map((r) => String(r.values.scheme!.normalized)))].sort()) {
      sets.push({
        label: `insurance_loss:${s}`,
        group: "insurance_loss",
        scheme: s,
        result: groupSources(ins.filter((r) => r.values.scheme!.normalized === s), COMPARED_FIELDS.insurance_loss!),
      });
    }
    for (const g of ROW_GROUPS) {
      if (ev.rows[g].length === 0) continue;
      const parts = partitionByIdentity(ev.rows[g], ROW_IDENTITY[g]).map((list) => groupSources(list, COMPARED_FIELDS[g]!));
      sets.push({ label: g, group: g, scheme: null, result: merge(parts) });
    }
    for (const { label, group, scheme, result } of sets) {
      for (const tie of result.ties) {
        for (const f of tie.fields) {
          findings.push(
            eventFinding(meta, ev, "DISCREPANCY", fieldName(group, f, scheme), "SAME_SOURCE_SAME_ORDER_VALUES_DIFFER", tie.records.map((r) => observed(r, f))),
          );
        }
      }
      if (result.chains.length > 0) compared.push(item(meta, ev.key, `correction_chain_preserved:${label}`));
      if (result.identical.length > 0) compared.push(item(meta, ev.key, `duplicate_rows_identical:${label}`));
    }
  }
  return { findings, compared };
};
