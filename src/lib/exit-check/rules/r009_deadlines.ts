// 원본: ~/dev/exit-check @cab1cce
// R-009 statutory date candidates. Uses only verified:true entries of rules/deadline-rules.json.
// Output is REVIEW_REQUIRED or nothing. No elapsed-date conclusion, no amounts.

import { COMPARED_FIELDS, groupSources, strValue, type EventCtx, type RunContext } from "../core/context";
import {
  daysAfterCandidates,
  endDateAnchors,
  exceptionInputs,
  nextMonthCandidates,
  SCHEME_OF_RULE,
  evaluableRules,
} from "../core/deadlines";
import type { NormRecord } from "../core/normalize";
import type { DeadlineRule, Evidence, Finding } from "../core/types";
import { addDays, kstDate } from "../core/values";
import { approvalFor, endedEvents, eventFinding, fieldName, item, observed, type RuleEval, type RuleMeta } from "./common";

function ruleRef(r: DeadlineRule) {
  return { rule_key: r.rule_key, citation: r.citation, effective_from: r.effective_from, effective_from_basis: r.effective_from_basis ?? null };
}

function currentSchemeRows(ctx: RunContext, ev: EventCtx, scheme: string): NormRecord[] {
  if (approvalFor(ctx, ev, `insurance_loss:${scheme}`)) return [];
  const rows = ev.rows.insurance_loss.filter((r) => r.values.scheme?.normalized === scheme);
  return groupSources(rows, COMPARED_FIELDS.insurance_loss!).current;
}

interface Hit {
  field: string;
  reason: string;
  evidence: Evidence[];
  detail: Record<string, unknown>;
}

export const evalR009: RuleEval = (ctx, meta: RuleMeta) => {
  const findings: Finding[] = [];
  const compared = [];
  // Only rules an R-009 branch evaluates; the rest are listed as not evaluated by the core (LD-1).
  const rules = evaluableRules(ctx.deadlineRules);

  for (const ev of endedEvents(ctx)) {
    if (ev.anchorDiscrepancy) {
      compared.push(item(meta, ev.key, "deadline_candidates_not_computed:employment_end_date_values_differ"));
      continue;
    }
    const end = ev.minEndDate;
    if (!end || !ev.eventDate) {
      // No anchor date: nothing is computed, and the report says so (SPEC-08, docs/04 3.1).
      compared.push(item(meta, ev.key, "deadline_candidates_not_computed:employment_end_date_missing"));
      continue;
    }
    const lastDay = ev.eventDate;
    const hits: Hit[] = [];
    let paymentChecked = false;

    // Payment date candidates (LSA 36, RPBA 9).
    const payRules = rules.filter((r) => r.rule_kind === "payment_deadline" && r.formula?.type === "days_after");
    for (const pr of ev.rows.final_payroll_settlement) {
      const pd = strValue(pr, "payment_date");
      if (!pd || payRules.length === 0) continue;
      paymentChecked = true;
      for (const rule of payRules) {
        const n = (rule.formula as { n: number }).n;
        const candidates = daysAfterCandidates(endDateAnchors(end), n);
        if (pd > candidates[0]!) {
          hits.push({
            field: "payment_date",
            reason: "OBSERVED_DATE_LATER_THAN_EARLIEST_CANDIDATE",
            evidence: [observed(pr, "payment_date")],
            detail: { ...ruleRef(rule), observed_date: pd, candidate_dates: candidates, inputs_not_provided: exceptionInputs(rule) },
          });
        }
      }
    }
    if (paymentChecked && !hits.some((h) => h.field === "payment_date")) {
      compared.push(item(meta, ev.key, "payment_date_outside_boundary_window"));
    }

    // Loss date derived from the end date (NPS 12, NHIS 9, EI 14) vs the recorded loss date.
    for (const rule of rules.filter((r) => r.rule_kind === "loss_date" && r.formula?.type === "days_after")) {
      const scheme = SCHEME_OF_RULE[rule.scheme];
      if (!scheme) continue;
      // Derived from the last day of the relation: the declared basis says which day the end date names (SPEC-04).
      const derived = addDays(lastDay, (rule.formula as { n: number }).n);
      let any = false;
      for (const r of currentSchemeRows(ctx, ev, scheme)) {
        const ld = strValue(r, "insurance_loss_date");
        if (!ld) continue;
        any = true;
        if (ld !== derived) {
          hits.push({
            field: fieldName("insurance_loss", "insurance_loss_date", scheme),
            reason: "RECORDED_DATE_DIFFERS_FROM_DERIVED_CANDIDATE",
            evidence: [observed(r, "insurance_loss_date")],
            detail: { ...ruleRef(rule), observed_date: ld, derived_candidate: derived, end_date: end, end_date_basis: ev.endDateBasis },
          });
        }
      }
      if (any && !hits.some((h) => h.field === fieldName("insurance_loss", "insurance_loss_date", scheme))) {
        compared.push(item(meta, ev.key, `loss_date_equals_derived_candidate:${scheme}`));
      }
    }

    // Report date candidates (NPS rule 6, EI decree 7, IACI collection act 16-10: next month 15; NHIS 9(2): 14 days).
    for (const rule of rules.filter((r) => r.rule_kind === "report_deadline")) {
      const scheme = SCHEME_OF_RULE[rule.scheme];
      if (!scheme) continue;
      const rows = currentSchemeRows(ctx, ev, scheme);
      if (rows.length === 0) continue;
      const field = fieldName("insurance_loss", "submission_at", scheme);
      let anchors: string[];
      if (rule.anchor_field === "insurance_loss_date_ei") {
        anchors = currentSchemeRows(ctx, ev, "EI")
          .map((r) => strValue(r, "insurance_loss_date"))
          .filter((v): v is string => v !== null);
        if (anchors.length === 0) {
          hits.push({
            field,
            reason: "ANCHOR_DATE_NOT_AVAILABLE",
            evidence: rows.map((r) => observed(r, "submission_at")),
            detail: { ...ruleRef(rule), anchor_field: rule.anchor_field },
          });
          continue;
        }
      } else if (rule.anchor_field === "insurance_loss_date") {
        // The reportable event is the loss itself, so the anchor is this scheme's loss date (user decision 2026-10-22).
        // No recorded loss date: the statutory one, the day after the relation ended.
        anchors = rows.map((r) => strValue(r, "insurance_loss_date")).filter((v): v is string => v !== null);
        if (anchors.length === 0) anchors = endDateAnchors(end).map((a) => addDays(a, 1));
      } else {
        anchors = endDateAnchors(end);
        if ((rule.anchor_alternatives ?? []).some((a) => a.startsWith("insurance_loss_date"))) {
          anchors.push(...rows.map((r) => strValue(r, "insurance_loss_date")).filter((v): v is string => v !== null));
        }
      }
      const f = rule.formula!;
      const uniq = [...new Set(anchors)].sort();
      const candidates = f.type === "next_month_day" ? nextMonthCandidates(uniq, f.day) : daysAfterCandidates(uniq, f.n);
      let flagged = false;
      for (const r of rows) {
        const sub = strValue(r, "submission_at");
        if (sub) {
          const od = kstDate(sub);
          if (od > candidates[0]!) {
            flagged = true;
            hits.push({
              field,
              reason: "OBSERVED_DATE_LATER_THAN_EARLIEST_CANDIDATE",
              evidence: [observed(r, "submission_at")],
              detail: { ...ruleRef(rule), observed_date: od, candidate_dates: candidates, inputs_not_provided: exceptionInputs(rule) },
            });
          }
        } else if (ctx.cutoffDate > candidates[0]!) {
          flagged = true;
          hits.push({
            field,
            reason: "NO_SUBMISSION_OBSERVATION_AFTER_EARLIEST_CANDIDATE",
            evidence: [observed(r, "receipt_or_processing_status")],
            detail: { ...ruleRef(rule), cutoff_date: ctx.cutoffDate, candidate_dates: candidates, inputs_not_provided: exceptionInputs(rule) },
          });
        }
      }
      if (!flagged) compared.push(item(meta, ev.key, `submission_not_later_than_earliest_candidate:${scheme}`));
    }

    // One finding per (event, field, reason); details list each observation.
    const byKey = new Map<string, Hit[]>();
    for (const h of hits) {
      const k = `${h.field}|${h.reason}`;
      byKey.set(k, [...(byKey.get(k) ?? []), h]);
    }
    for (const k of [...byKey.keys()].sort()) {
      const hs = byKey.get(k)!;
      findings.push(
        eventFinding(meta, ev, "REVIEW_REQUIRED", hs[0]!.field, hs[0]!.reason, hs.flatMap((h) => h.evidence), {
          candidates: hs.map((h) => h.detail),
        }),
      );
    }
  }
  return { findings, compared };
};
