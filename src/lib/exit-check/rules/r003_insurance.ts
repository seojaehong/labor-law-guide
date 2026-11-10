// 원본: ~/dev/exit-check @cab1cce
// R-003 insurance rows and status observations per scheme.

import { COMPARED_FIELDS, groupProvided, groupSources, strValue, type RunContext } from "../core/context";
import { instantSortKey as instantKey } from "../core/values";
import type { Finding, Scheme } from "../core/types";
import {
  approvalFor,
  endedEvents,
  eventFinding,
  fieldName,
  fieldState,
  groupMissing,
  item,
  observed,
  rowEvidence,
  valueProblem,
  type RuleEval,
} from "./common";

const SUBMITTED_OR_LATER = new Set(["SUBMITTED", "RECEIVED", "PROCESSED", "RETURNED"]);

function schemeCovered(ctx: RunContext, s: Scheme): boolean {
  const byFile = ctx.accepted.insurance_loss.some((f) => {
    const covered = f.config.schemes_covered;
    return !covered || covered.includes(s);
  });
  const byInline = ctx.inlineByGroup.insurance_loss.some((i) => !i.blocked && i.records.some((r) => r.values.scheme?.normalized === s));
  return byFile || byInline;
}

export const evalR003: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  for (const ev of endedEvents(ctx)) {
    if (!groupProvided(ctx, "insurance_loss")) {
      findings.push(groupMissing(ctx, meta, ev, "insurance_loss"));
      continue;
    }
    const rows = ev.rows.insurance_loss;

    for (const r of rows) {
      const st = fieldState(r, "scheme");
      if (st === "ABSENT") findings.push(eventFinding(meta, ev, "MISSING_INPUT", "scheme", "COLUMN_NOT_PROVIDED", [rowEvidence(r)]));
      else if (st === "EMPTY") findings.push(eventFinding(meta, ev, "INCOMPLETE", "scheme", "EMPTY", [observed(r, "scheme", false)]));
      else if (r.values.scheme!.normalized === "UNKNOWN") {
        findings.push(eventFinding(meta, ev, "INCOMPLETE", "scheme", "SCHEME_VALUE_NOT_INTERPRETED", [observed(r, "scheme")]));
      }
    }

    const present: string[] = [];
    for (const s of ctx.required_schemes) {
      const field = `scheme:${s}`;
      if (approvalFor(ctx, ev, `insurance_loss:${s}`)) {
        findings.push(eventFinding(meta, ev, "NOT_APPLICABLE", field, "APPROVED_EXCLUSION_RECORD", []));
        continue;
      }
      const sRows = rows.filter((r) => r.values.scheme?.normalized === s);
      if (sRows.length === 0) {
        findings.push(
          schemeCovered(ctx, s)
            ? eventFinding(meta, ev, "INCOMPLETE", field, "SCHEME_ROW_NOT_FOUND", [])
            : eventFinding(meta, ev, "MISSING_INPUT", field, "SCHEME_NOT_COVERED_BY_ANY_FILE", []),
        );
        continue;
      }
      present.push(s);
    }

    // Value checks for every scheme row present (required or not).
    const schemes = [...new Set(rows.map((r) => r.values.scheme?.normalized).filter((v): v is string => typeof v === "string" && v !== "UNKNOWN"))].sort();
    for (const s of schemes) {
      if (approvalFor(ctx, ev, `insurance_loss:${s}`)) continue;
      const cur = groupSources(rows.filter((r) => r.values.scheme?.normalized === s), COMPARED_FIELDS.insurance_loss!).current;
      for (const r of cur) {
        const statusProblem = valueProblem(meta, ev, r, "receipt_or_processing_status", fieldName("insurance_loss", "receipt_or_processing_status", s));
        if (statusProblem) findings.push(statusProblem);
        const obsProblem = valueProblem(meta, ev, r, "observed_at", fieldName("insurance_loss", "observed_at", s));
        if (obsProblem) findings.push(obsProblem);
        const status = strValue(r, "receipt_or_processing_status");
        const subState = fieldState(r, "submission_at");
        if (subState === "ABSENT") {
          findings.push(eventFinding(meta, ev, "MISSING_INPUT", fieldName("insurance_loss", "submission_at", s), "COLUMN_NOT_PROVIDED", [rowEvidence(r)]));
        } else if (subState !== "OK" && (subState !== "EMPTY" || (status !== null && SUBMITTED_OR_LATER.has(status)))) {
          findings.push(
            eventFinding(meta, ev, "INCOMPLETE", fieldName("insurance_loss", "submission_at", s), subState === "EMPTY" ? "EMPTY_WITH_SUBMITTED_STATUS" : subState, [
              observed(r, "submission_at", subState !== "EMPTY"),
              observed(r, "receipt_or_processing_status"),
            ]),
          );
        }
      }
      // Status conflict: different sources, same observation time, different status.
      const byTime = new Map<string, typeof cur>();
      for (const r of cur) {
        const t = strValue(r, "observed_at");
        const st = strValue(r, "receipt_or_processing_status");
        if (!t || !st) continue;
        const k = instantKey(t);
        byTime.set(k, [...(byTime.get(k) ?? []), r]);
      }
      for (const k of [...byTime.keys()].sort()) {
        const group = byTime.get(k)!;
        const distinct = new Set(group.map((r) => strValue(r, "receipt_or_processing_status")));
        if (group.length > 1 && distinct.size > 1) {
          findings.push(
            eventFinding(
              meta,
              ev,
              "DISCREPANCY",
              fieldName("insurance_loss", "receipt_or_processing_status", s),
              "SAME_OBSERVATION_TIME_STATUS_DIFFERS",
              group.map((r) => observed(r, "receipt_or_processing_status")),
            ),
          );
        }
      }
    }
    if (present.length > 0) compared.push(item(meta, ev.key, `scheme_rows_present:${present.join(",")}`));
  }
  return { findings, compared };
};
