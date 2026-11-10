// 원본: ~/dev/exit-check @cab1cce
// R-002 exit date separation. Each date concept is compared only with itself:
// employment_end_date, last_worked_date and per-scheme insurance_loss_date never cross.

import { groupSources, COMPARED_FIELDS, strValue, type EventCtx, type RunContext } from "../core/context";
import type { NormRecord } from "../core/normalize";
import type { Finding } from "../core/types";
import {
  approvalFor,
  eventFinding,
  fieldName,
  fieldState,
  item,
  observed,
  rowEvidence,
  valueProblem,
  type RuleEval,
  type RuleMeta,
} from "./common";

function sameConceptConflict(
  meta: RuleMeta,
  ev: EventCtx,
  current: NormRecord[],
  column: string,
  field: string,
  basisSensitive: boolean,
): Finding[] {
  const usable = current.filter((r) => strValue(r, column) !== null);
  const distinct = [...new Set(usable.map((r) => strValue(r, column)!))];
  if (distinct.length < 2) return [];
  const evidence = usable.map((r) => observed(r, column));
  if (basisSensitive) {
    // Rows of one file share one declaration. Across files the declared basis must match.
    const files = new Set(usable.map((r) => r.file_sha256 ?? "inline"));
    const bases = new Set(usable.map((r) => r.basis));
    const comparable = files.size === 1 || (bases.size === 1 && !bases.has("UNDECLARED"));
    if (!comparable) {
      return [
        eventFinding(meta, ev, "REVIEW_REQUIRED", field, "END_DATE_BASIS_NOT_COMPARABLE", evidence, {
          bases: [...bases].sort(),
        }),
      ];
    }
  }
  return [eventFinding(meta, ev, "DISCREPANCY", field, "SAME_CONCEPT_VALUES_DIFFER", evidence)];
}

export const evalR002: RuleEval = (ctx: RunContext, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  for (const ev of ctx.events) {
    const current = ev.personnelGroups.current;
    if (ev.state === "STATUS_COLUMN_MISSING") {
      findings.push(eventFinding(meta, ev, "MISSING_INPUT", "employment_status", "COLUMN_NOT_PROVIDED", []));
      continue;
    }
    if (ev.state === "STATUS_BLANK") {
      for (const r of current) {
        const p = valueProblem(meta, ev, r, "employment_status", "employment_status");
        if (p) findings.push(p);
      }
      continue;
    }
    if (ev.state === "STATUS_CONFLICT") {
      findings.push(
        eventFinding(meta, ev, "DISCREPANCY", "employment_status", "SAME_CONCEPT_VALUES_DIFFER", current.map((r) => observed(r, "employment_status"))),
      );
      continue;
    }
    if (ev.state === "HOLD") {
      const reason =
        ev.holdStatus === "LEAVE_OF_ABSENCE" ? "LEAVE_OF_ABSENCE" : ev.holdStatus === "RETURNED" ? "RETURNED" : "STATUS_UNKNOWN";
      findings.push(eventFinding(meta, ev, "ON_HOLD", "employment_status", reason, current.map((r) => observed(r, "employment_status"))));
      continue;
    }
    if (ev.state === "EMPLOYED") {
      // Not an exit event, but rows that look like an exit are not dropped silently (SPEC-09).
      const withEnd = current.filter((r) => fieldState(r, "employment_end_date") === "OK");
      const exitRows = [...ev.rows.final_payroll_settlement, ...ev.rows.insurance_loss];
      if (withEnd.length > 0 || exitRows.length > 0) {
        findings.push(
          eventFinding(meta, ev, "REVIEW_REQUIRED", "employment_status", "STATUS_ACTIVE_WITH_EXIT_RECORDS", [
            ...current.map((r) => observed(r, "employment_status")),
            ...withEnd.map((r) => observed(r, "employment_end_date")),
            ...exitRows.map((r) => rowEvidence(r)),
          ]),
        );
      } else {
        compared.push(item(meta, ev.key, "employment_status_not_ended"));
      }
      continue;
    }
    if (ev.state !== "ENDED") continue;

    for (const col of ["employment_end_date", "last_worked_date"]) {
      for (const r of current) {
        const p = valueProblem(meta, ev, r, col, col);
        if (p) findings.push(p);
      }
      findings.push(...sameConceptConflict(meta, ev, current, col, col, col === "employment_end_date"));
    }

    // Per-scheme loss dates: compared only within the same scheme.
    const ins = ev.rows.insurance_loss.filter((r) => typeof r.values.scheme?.normalized === "string");
    const schemes = [...new Set(ins.map((r) => String(r.values.scheme!.normalized)))].filter((s) => s !== "UNKNOWN").sort();
    for (const s of schemes) {
      if (approvalFor(ctx, ev, `insurance_loss:${s}`)) continue;
      const cur = groupSources(
        ins.filter((r) => r.values.scheme!.normalized === s),
        COMPARED_FIELDS.insurance_loss!,
      ).current;
      for (const r of cur) {
        const p = valueProblem(meta, ev, r, "insurance_loss_date", fieldName("insurance_loss", "insurance_loss_date", s));
        if (p) findings.push(p);
      }
      findings.push(...sameConceptConflict(meta, ev, cur, "insurance_loss_date", fieldName("insurance_loss", "insurance_loss_date", s), false));
    }

    // Optional employment_end_date on insurance forms: same concept as personnel, basis must match.
    const insEnd = ins.filter((r) => strValue(r, "employment_end_date") !== null);
    if (insEnd.length > 0) {
      findings.push(...sameConceptConflict(meta, ev, [...current, ...insEnd], "employment_end_date", "employment_end_date", true));
    }

    const okEnd = current.filter((r) => strValue(r, "employment_end_date") !== null);
    if (okEnd.length === current.length && ev.endDates.length === 1) {
      compared.push(item(meta, ev.key, current.length === 1 ? "employment_end_date_single_source" : "employment_end_date_sources_equal"));
    }
  }
  return { findings, compared };
};
