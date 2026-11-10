// 원본: ~/dev/exit-check @cab1cce
// Helpers shared by rule implementations.

import type { EventCtx, RunContext } from "../core/context";
import type { NormRecord } from "../core/normalize";
import type { ComparedItem, Evidence, FileGroup, Finding, ItemStatus, Locator } from "../core/types";

export interface RuleOutput {
  findings: Finding[];
  compared: ComparedItem[];
}

export interface RuleMeta {
  rule_id: string;
  rule_version: string;
}

export type RuleEval = (ctx: RunContext, meta: RuleMeta) => RuleOutput;

/** Columns that exist in more than one file group get a family prefix in `field`. */
const SHARED_COLUMNS = new Set(["company_key", "worker_token", "employment_sequence", "source_as_of"]);

export function fieldName(group: FileGroup, column: string, scheme?: string | null): string {
  const base = SHARED_COLUMNS.has(column) ? `${group}.${column}` : column;
  return scheme ? `${base}:${scheme}` : base;
}

export type FieldState = "ABSENT" | "EMPTY" | "PARSE" | "FORMAT" | "OK";

export function fieldState(r: NormRecord, field: string): FieldState {
  const v = r.values[field];
  if (!v) return "ABSENT";
  return v.parse_status;
}

export function locOf(r: NormRecord, field?: string): Locator | null {
  if (field && r.locators[field] !== undefined) return r.locators[field] ?? null;
  return r.row_locator;
}

export function anchorEvidence(ev: EventCtx): Evidence[] {
  return ev.personnelGroups.current.map((r) => ({
    role: "anchor" as const,
    file_group: r.file_group,
    file_sha256: r.file_sha256,
    source_type: r.source_type,
    locator: r.row_locator,
  }));
}

export function observed(r: NormRecord, field: string, withValue = true): Evidence {
  const v = r.values[field];
  const e: Evidence = {
    role: "observed",
    file_group: r.file_group,
    file_sha256: r.file_sha256,
    source_type: r.source_type,
    locator: locOf(r, field),
    field,
  };
  // Normalized codes and coordinates only: raw cell text never travels into the report (PRIV-4).
  if (withValue && v) e.normalized = v.normalized;
  return e;
}

export function rowEvidence(r: NormRecord): Evidence {
  return {
    role: "observed",
    file_group: r.file_group,
    file_sha256: r.file_sha256,
    source_type: r.source_type,
    locator: r.row_locator,
  };
}

export function pickPrimary(evidence: Evidence[]): Evidence | undefined {
  return (
    evidence.find((e) => e.role === "observed" && e.locator) ??
    evidence.find((e) => e.role === "header" && e.locator) ??
    evidence.find((e) => e.locator) ??
    evidence.find((e) => e.file_sha256)
  );
}

export function mkFinding(
  meta: RuleMeta,
  args: {
    status: ItemStatus | "SCHEMA_BLOCKED";
    key: string;
    company_key?: string | null;
    worker_token?: string | null;
    employment_sequence?: number | null;
    field: string | null;
    reason_code: string;
    evidence: Evidence[];
    details?: Record<string, unknown>;
  },
): Finding {
  const primary = pickPrimary(args.evidence);
  const f: Finding = {
    rule_id: meta.rule_id,
    rule_version: meta.rule_version,
    status: args.status,
    key: args.key,
    company_key: args.company_key ?? null,
    worker_token: args.worker_token ?? null,
    employment_sequence: args.employment_sequence ?? null,
    field: args.field,
    reason_code: args.reason_code,
    file_sha256: primary?.file_sha256 ?? null,
    source_locator: primary?.locator ?? null,
    evidence: args.evidence,
  };
  if (args.details) f.details = args.details;
  return f;
}

export function eventFinding(
  meta: RuleMeta,
  ev: EventCtx,
  status: ItemStatus,
  field: string | null,
  reason_code: string,
  evidence: Evidence[],
  details?: Record<string, unknown>,
): Finding {
  const args: Parameters<typeof mkFinding>[1] = {
    status,
    key: ev.key,
    company_key: ev.company_key,
    worker_token: ev.worker_token,
    employment_sequence: ev.employment_sequence,
    field,
    reason_code,
    evidence: [...evidence, ...anchorEvidence(ev)],
  };
  if (details) args.details = details;
  return mkFinding(meta, args);
}

export function fileEvidence(ctx: RunContext, group: FileGroup): Evidence[] {
  return ctx.blocked[group].map((f) => ({
    role: "file" as const,
    file_group: group,
    file_sha256: f.gate.file_sha256,
    source_type: f.config.source_type,
    locator: null,
  }));
}

/** MISSING_INPUT when a file group was not provided (absent or blocked). */
export function groupMissing(ctx: RunContext, meta: RuleMeta, ev: EventCtx, group: FileGroup): Finding {
  const blocked = ctx.blocked[group].length > 0;
  return eventFinding(meta, ev, "MISSING_INPUT", group, blocked ? "FILE_BLOCKED" : "FILE_GROUP_NOT_PROVIDED", fileEvidence(ctx, group));
}

export function approvalFor(ctx: RunContext, ev: EventCtx, scope: string) {
  return ctx.approvals.find((a) => a.key === ev.key && a.scope === scope && a.status === "NOT_APPLICABLE");
}

export function endedEvents(ctx: RunContext): EventCtx[] {
  return ctx.events.filter((e) => e.state === "ENDED");
}

export function item(meta: RuleMeta, key: string, name: string): ComparedItem {
  return { rule_id: meta.rule_id, key, item: name };
}

/** INCOMPLETE/MISSING_INPUT for a value of one record. Returns null when the value is usable. */
export function valueProblem(
  meta: RuleMeta,
  ev: EventCtx,
  r: NormRecord,
  column: string,
  field: string,
): Finding | null {
  const st = fieldState(r, column);
  if (st === "OK") return null;
  if (st === "ABSENT") {
    return eventFinding(meta, ev, "MISSING_INPUT", field, "COLUMN_NOT_PROVIDED", [rowEvidence(r)]);
  }
  return eventFinding(meta, ev, "INCOMPLETE", field, st === "EMPTY" ? "EMPTY" : st, [observed(r, column, st !== "EMPTY")]);
}
