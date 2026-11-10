// 원본: ~/dev/exit-check @cab1cce
// R-004 freshness. `source_as_of < cutoff_at` alone never yields STALE.
// STALE needs: a snapshot taken before the exit event, a later personnel correction the snapshot
// predates, a record dated after the cutoff, or an approved max age (null by default).

import { asOfField, asOfKey, COMPARED_FIELDS, currentRows, sortRecords } from "../core/context";
import type { NormRecord } from "../core/normalize";
import type { FileGroup, Finding } from "../core/types";
import { FILE_GROUPS } from "../core/types";
import { dateToDays, kstDate } from "../core/values";
import { endedEvents, eventFinding, fieldName, fieldState, item, observed, rowEvidence, type RuleEval } from "./common";

export const DEFAULT_FRESHNESS_POLICY_VERSION = "fresh-0.1.0";

function asOfLabel(g: FileGroup): string {
  return g === "annual_leave_ledger" ? "ledger_as_of" : fieldName(g, "source_as_of");
}

export const evalR004: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  for (const ev of ctx.events) {
    // Records dated after the cutoff are not compared in this run.
    for (const g of FILE_GROUPS) {
      const after = ev.afterCutoff[g];
      if (after.length > 0) {
        findings.push(
          eventFinding(meta, ev, "STALE", asOfLabel(g), "RECORD_AFTER_CUTOFF", after.map((r) => observed(r, asOfField(g)))),
        );
      }
    }
  }

  for (const ev of endedEvents(ctx)) {
    const eventDate = ev.eventDate;
    let stale = false;
    let checked = 0;

    // Older personnel snapshots (SPEC-02): not current; each is marked STALE against the latest one.
    const latest = ev.personnelGroups.current.filter((r) => fieldState(r, "source_as_of") === "OK");
    const sigOf = (r: NormRecord) => COMPARED_FIELDS.personnel_exit!.map((f) => JSON.stringify(r.values[f]?.normalized ?? null)).join("|");
    for (const r of sortRecords(ev.olderSnapshots)) {
      const label = asOfLabel("personnel_exit");
      const refs = latest.map((l) => ({ ...observed(l, "source_as_of"), role: "reference" as const }));
      if (eventDate && kstDate(String(r.values.source_as_of!.normalized)) < eventDate) {
        stale = true;
        findings.push(eventFinding(meta, ev, "STALE", label, "SNAPSHOT_BEFORE_EVENT", [observed(r, "source_as_of")], { event_date: eventDate }));
      } else if (latest.some((l) => sigOf(l) !== sigOf(r))) {
        stale = true;
        findings.push(eventFinding(meta, ev, "STALE", label, "LATER_CORRECTION_NOT_REFLECTED", [observed(r, "source_as_of"), ...refs]));
      }
    }

    for (const g of FILE_GROUPS) {
      // History rows replaced by a later row of the same source are kept by R-007, not checked here (SPEC-03).
      const rows = currentRows(ev, g);
      if (rows.length === 0) continue;
      const field = asOfField(g);
      const label = asOfLabel(g);
      const policy = ctx.freshness.by_file_group[g] ?? { max_age_days: null, require_as_of_on_or_after_event: true };
      const usable: NormRecord[] = [];
      for (const r of rows) {
        const st = fieldState(r, field);
        if (g === "annual_leave_ledger") {
          // Blank or missing ledger_as_of is reported by R-006 (PRD 6.6).
          if (st === "OK") usable.push(r);
          continue;
        }
        if (st === "ABSENT") findings.push(eventFinding(meta, ev, "MISSING_INPUT", label, "COLUMN_NOT_PROVIDED", [rowEvidence(r)]));
        else if (st !== "OK") findings.push(eventFinding(meta, ev, "INCOMPLETE", label, st === "EMPTY" ? "EMPTY" : st, [observed(r, field, st !== "EMPTY")]));
        else usable.push(r);
      }
      if (usable.length === 0) continue;
      // snapshot_after_event is claimed only when the before-event comparison ran (SPEC-08).
      if (eventDate && policy.require_as_of_on_or_after_event) checked++;

      if (eventDate && policy.require_as_of_on_or_after_event) {
        const before = usable.filter((r) => kstDate(String(r.values[field]!.normalized)) < eventDate);
        if (before.length > 0) {
          stale = true;
          findings.push(
            eventFinding(meta, ev, "STALE", label, "SNAPSHOT_BEFORE_EVENT", before.map((r) => observed(r, field)), { event_date: eventDate }),
          );
        }
      }
      if (g !== "personnel_exit" && ev.correctionAsOf && ev.correctionRecord) {
        const older = usable.filter((r) => asOfKey(r)! < ev.correctionAsOf!);
        if (older.length > 0) {
          stale = true;
          findings.push(
            eventFinding(meta, ev, "STALE", label, "LATER_CORRECTION_NOT_REFLECTED", [
              ...older.map((r) => observed(r, field)),
              { ...observed(ev.correctionRecord, "source_as_of"), role: "reference" as const },
            ]),
          );
        }
      }
      if (policy.max_age_days !== null && policy.max_age_days !== undefined) {
        const tooOld = usable.filter(
          (r) => dateToDays(ctx.cutoffDate) - dateToDays(kstDate(String(r.values[field]!.normalized))) > policy.max_age_days!,
        );
        if (tooOld.length > 0) {
          stale = true;
          findings.push(
            eventFinding(meta, ev, "STALE", label, "OLDER_THAN_APPROVED_MAX_AGE", tooOld.map((r) => observed(r, field)), {
              max_age_days: policy.max_age_days,
            }),
          );
        }
      }
    }
    if (!stale && checked > 0) compared.push(item(meta, ev.key, "snapshot_after_event"));
  }
  return { findings, compared };
};
