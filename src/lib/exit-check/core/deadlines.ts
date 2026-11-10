// 원본: ~/dev/exit-check @cab1cce
// Date candidates for R-009 (docs/04 section 0-1, section 3). Pure civil-date arithmetic.
// The core never says a date limit has passed. It only finds the earliest candidate date
// and reports REVIEW_REQUIRED when an observed date lies later than that earliest candidate.

import type { DeadlineRule, DeadlineRulesFile } from "./types";
import { addDays, nextMonthDay, weekday } from "./values";

export const SCHEME_OF_RULE: Record<string, string> = {
  national_pension: "NPS",
  health_insurance: "NHIS",
  employment_insurance: "EI",
  industrial_accident: "IACI",
};

/** Inputs an exception would need; none of them exist in the MVP input contract. */
export function exceptionInputs(rule: DeadlineRule): string[] {
  if (rule.rule_kind === "payment_deadline") return ["agreement_extension"];
  if (rule.rule_kind === "report_deadline" && rule.scheme === "employment_insurance") {
    return ["worker_request_early_report", "daily_worker_work_record_report"];
  }
  if (rule.rule_kind === "report_deadline" && rule.scheme === "industrial_accident") {
    return ["employment_insurance_report_substitution", "construction_business_type"];
  }
  return [];
}

export function verifiedRules(file: DeadlineRulesFile): DeadlineRule[] {
  return file.rules.filter((r) => r.verified === true && r.formula !== null).sort((a, b) => (a.rule_key < b.rule_key ? -1 : 1));
}

export function unverifiedRules(file: DeadlineRulesFile): DeadlineRule[] {
  return file.rules.filter((r) => r.verified !== true || r.formula === null).sort((a, b) => (a.rule_key < b.rule_key ? -1 : 1));
}

/** Why R-009 cannot evaluate a verified rule, or null when one of its branches handles it (LD-1).
 *  R-009 has three branches: payment_deadline/days_after, loss_date/days_after and
 *  report_deadline/next_month_day or days_after, each with a fixed set of anchor fields. */
export function unsupportedReason(rule: DeadlineRule): "RULE_FORMULA_NOT_SUPPORTED" | "RULE_SCHEME_NOT_SUPPORTED" | "RULE_ANCHOR_NOT_SUPPORTED" | null {
  const type = rule.formula?.type;
  const kindOk =
    (rule.rule_kind === "payment_deadline" && type === "days_after") ||
    (rule.rule_kind === "loss_date" && type === "days_after") ||
    (rule.rule_kind === "report_deadline" && (type === "next_month_day" || type === "days_after"));
  if (!kindOk) return "RULE_FORMULA_NOT_SUPPORTED";
  if (rule.rule_kind !== "payment_deadline" && !SCHEME_OF_RULE[rule.scheme]) return "RULE_SCHEME_NOT_SUPPORTED";
  const anchors = rule.rule_kind === "report_deadline" ? ["employment_end_date", "insurance_loss_date", "insurance_loss_date_ei"] : ["employment_end_date"];
  if (!anchors.includes(rule.anchor_field)) return "RULE_ANCHOR_NOT_SUPPORTED";
  return null;
}

/** Verified rules that an R-009 branch evaluates. */
export function evaluableRules(file: DeadlineRulesFile): DeadlineRule[] {
  return verifiedRules(file).filter((r) => unsupportedReason(r) === null);
}

/** Every rule R-009 does not evaluate, with the reason: the complement of evaluableRules. */
export function notEvaluatedRules(file: DeadlineRulesFile): Array<{ rule_key: string; citation: string; reason_code: string }> {
  const out = [
    ...unverifiedRules(file).map((r) => ({ rule_key: r.rule_key, citation: r.citation, reason_code: "RULE_NOT_VERIFIED_FORMULA_NULL" })),
    ...verifiedRules(file).flatMap((r) => {
      const reason = unsupportedReason(r);
      return reason ? [{ rule_key: r.rule_key, citation: r.citation, reason_code: reason }] : [];
    }),
  ];
  return out.sort((a, b) => (a.rule_key < b.rule_key ? -1 : a.rule_key > b.rule_key ? 1 : 0));
}

function withWeekendCarry(dates: string[]): string[] {
  const out = new Set(dates);
  for (const d of dates) {
    const w = weekday(d);
    if (w === 6) out.add(addDays(d, 2));
    if (w === 0) out.add(addDays(d, 1));
  }
  return [...out].sort();
}

/** Anchor candidates: the recorded end date and one day either side (docs/04: definition open). */
export function endDateAnchors(endDate: string): string[] {
  return [addDays(endDate, -1), endDate, addDays(endDate, 1)];
}

/** days_after n: first day excluded (anchor + n) and the zero-hour reading (anchor + n - 1). */
export function daysAfterCandidates(anchors: string[], n: number): string[] {
  return withWeekendCarry([...new Set(anchors.flatMap((a) => [addDays(a, n), addDays(a, n - 1)]))]);
}

export function nextMonthCandidates(anchors: string[], day: number): string[] {
  return withWeekendCarry([...new Set(anchors.map((a) => nextMonthDay(a, day)))]);
}
