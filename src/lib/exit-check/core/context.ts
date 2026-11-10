// 원본: ~/dev/exit-check @cab1cce
// Run context: accepted records, events (one per key triple in personnel_exit),
// source groups and current rows. Pure.

import type { FileGateResult, InlineResult, NormalizedFile, NormRecord } from "./normalize";
import type {
  Approval,
  DeadlineRulesFile,
  EndDateBasis,
  FileGroup,
  FreshnessPolicy,
  Scheme,
} from "./types";
import { FILE_GROUPS } from "./types";
import { addDays, instantSortKey, kstDate } from "./values";

export type EventState =
  | "ENDED"
  | "HOLD"
  | "EMPLOYED"
  | "STATUS_BLANK"
  | "STATUS_CONFLICT"
  | "STATUS_COLUMN_MISSING"
  | "AFTER_CUTOFF";

export interface SourceGroupResult {
  /** Latest record per source group. */
  current: NormRecord[];
  /** Groups holding more than one ordered record (corrections). */
  chains: NormRecord[][];
  /** Records sharing a group and an order key while differing in compared fields. */
  ties: Array<{ records: NormRecord[]; fields: string[] }>;
  /** Groups whose records are identical duplicates. */
  identical: NormRecord[][];
  /** Earlier rows of a multi-row source group (order key below the group's latest): kept, not current. */
  history: NormRecord[];
}

export interface EventCtx {
  key: string;
  company_key: string;
  worker_token: string;
  employment_sequence: number;
  personnel: NormRecord[];
  /** `current` holds the latest row of each source group at the latest source_as_of among them
   *  (snapshots of one time). Rows of other source groups taken earlier are in `olderSnapshots`. */
  personnelGroups: SourceGroupResult;
  /** Current rows of other source groups whose source_as_of is earlier than the latest one (SPEC-02). */
  olderSnapshots: NormRecord[];
  state: EventState;
  holdStatus: string | null;
  endDates: string[];
  anchorDiscrepancy: boolean;
  minEndDate: string | null;
  /** Declared basis of the end date rows (MIXED when the rows differ). */
  endDateBasis: EndDateBasis | "MIXED";
  /** Last day of the employment relation: the end date, or the end date - 1 under DAY_AFTER_LAST_DAY. */
  eventDate: string | null;
  /** Sort key of the latest personnel correction (when a correction chain exists). */
  correctionAsOf: string | null;
  correctionRecord: NormRecord | null;
  rows: Record<FileGroup, NormRecord[]>;
  afterCutoff: Record<FileGroup, NormRecord[]>;
}

export interface SupersedesIssue {
  file_sha256: string;
  file_group: FileGroup;
  reason_code: "SUPERSEDES_SELF" | "SUPERSEDES_OTHER_FILE_GROUP" | "SUPERSEDES_CYCLE" | "SUPERSEDED_FILE_NOT_IN_RUN" | "SUPERSEDED_FILE_BLOCKED";
}

export interface RunContext {
  cutoff_at: string;
  /** supersedes links that did not form a correction chain (RV-SUPERSEDES-SILENT). */
  supersedesIssues: SupersedesIssue[];
  cutoffKey: string;
  cutoffDate: string;
  required_schemes: Scheme[];
  files: NormalizedFile[];
  inline: InlineResult[];
  accepted: Record<FileGroup, NormalizedFile[]>;
  blocked: Record<FileGroup, NormalizedFile[]>;
  inlineByGroup: Record<FileGroup, InlineResult[]>;
  records: Record<FileGroup, NormRecord[]>;
  approvals: Approval[];
  events: EventCtx[];
  freshness: FreshnessPolicy;
  deadlineRules: DeadlineRulesFile;
}

export const COMPARED_FIELDS: Partial<Record<FileGroup, string[]>> = {
  personnel_exit: ["employment_end_date", "last_worked_date", "employment_status"],
  insurance_loss: ["insurance_loss_date", "receipt_or_processing_status", "submission_at", "observed_at", "employment_end_date"],
  // Identity fields (ROW_IDENTITY) are left out: rows that differ there are separate rows, not corrections.
  final_payroll_settlement: ["payment_date", "settlement_status", "settlement_completed_at"],
  annual_leave_ledger: ["granted_days", "used_days", "remaining_days", "carried_over_days", "adjustment_days"],
};

export function keyOK(r: NormRecord): boolean {
  return (
    r.company_key.parse_status === "OK" &&
    r.worker_token.parse_status === "OK" &&
    r.employment_sequence.parse_status === "OK"
  );
}

export function eventKeyOf(r: NormRecord): string {
  return `${r.company_key.normalized}|${r.worker_token.normalized}|${r.employment_sequence.normalized}`;
}

export function partialKeyOf(r: NormRecord): string {
  const c = r.company_key.parse_status === "OK" ? String(r.company_key.normalized) : "";
  const w = r.worker_token.parse_status === "OK" ? String(r.worker_token.normalized) : "";
  const s = r.employment_sequence.parse_status === "OK" ? String(r.employment_sequence.normalized) : "";
  return `${c}|${w}|${s}`;
}

export function asOfField(group: FileGroup): string {
  return group === "annual_leave_ledger" ? "ledger_as_of" : "source_as_of";
}

export function asOfKey(r: NormRecord): string | null {
  const v = r.values[asOfField(r.file_group)];
  return v && v.parse_status === "OK" && typeof v.normalized === "string" ? instantSortKey(v.normalized) : null;
}

export function valueOf(r: NormRecord, field: string): string | number | null {
  const v = r.values[field];
  return v && v.parse_status === "OK" ? v.normalized : null;
}

export function strValue(r: NormRecord, field: string): string | null {
  const v = valueOf(r, field);
  return v === null ? null : String(v);
}

function orderKey(r: NormRecord): string {
  const rev = r.values.record_revision;
  const revPart = rev && rev.parse_status === "OK" ? String(rev.normalized).padStart(9, "0") : "";
  const time =
    r.file_group === "insurance_loss"
      ? [strValue(r, "observed_at"), strValue(r, "source_as_of")].map((t) => (t ? instantSortKey(t) : "")).join("|")
      : (asOfKey(r) ?? "");
  // A declared supersedes link orders files first: the person said which file is newer (SPEC-01).
  const depth = String(r.lineage_depth ?? 0).padStart(4, "0");
  return `${depth}|${revPart}|${time}`;
}

export function sourceGroupId(r: NormRecord): string {
  return `${r.lineage_root ?? r.file_sha256 ?? "inline"}|${r.source_system}`;
}

function recordCompare(a: NormRecord, b: NormRecord): number {
  const ka = `${a.file_sha256 ?? "~"}|${a.sheet}|${String(a.row).padStart(9, "0")}`;
  const kb = `${b.file_sha256 ?? "~"}|${b.sheet}|${String(b.row).padStart(9, "0")}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function sortRecords(rs: NormRecord[]): NormRecord[] {
  return [...rs].sort(recordCompare);
}

export function groupSources(records: NormRecord[], fields: string[]): SourceGroupResult {
  const groups = new Map<string, NormRecord[]>();
  for (const r of sortRecords(records)) {
    const id = sourceGroupId(r);
    const list = groups.get(id) ?? [];
    list.push(r);
    groups.set(id, list);
  }
  const out: SourceGroupResult = { current: [], chains: [], ties: [], identical: [], history: [] };
  for (const id of [...groups.keys()].sort()) {
    const list = groups.get(id)!;
    if (list.length === 1) {
      out.current.push(list[0]!);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const ka = orderKey(a), kb = orderKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : recordCompare(a, b);
    });
    const top = orderKey(sorted[sorted.length - 1]!);
    out.history.push(...sorted.filter((r) => orderKey(r) < top));
    const sig = (r: NormRecord) => fields.map((f) => JSON.stringify(r.values[f]?.normalized ?? null)).join("|");
    if (list.every((r) => sig(r) === sig(list[0]!))) {
      out.identical.push(list);
      out.current.push(sorted[sorted.length - 1]!);
      continue;
    }
    const atTop = sorted.filter((r) => orderKey(r) === top);
    const differingAtTop = atTop.length > 1 && atTop.some((r) => sig(r) !== sig(atTop[0]!));
    if (differingAtTop) {
      const diff = fields.filter((f) =>
        atTop.some((r) => JSON.stringify(r.values[f]?.normalized ?? null) !== JSON.stringify(atTop[0]!.values[f]?.normalized ?? null)),
      );
      out.ties.push({ records: atTop, fields: diff });
    } else {
      out.chains.push(sorted);
    }
    out.current.push(sorted[sorted.length - 1]!);
  }
  return out;
}

/** Rows split by their identity fields, in a fixed order. */
export function partitionByIdentity(records: NormRecord[], idFields: string[]): NormRecord[][] {
  const byId = new Map<string, NormRecord[]>();
  for (const r of records) {
    const k = idFields.map((f) => JSON.stringify(r.values[f]?.normalized ?? null)).join("|");
    byId.set(k, [...(byId.get(k) ?? []), r]);
  }
  return [...byId.keys()].sort().map((k) => byId.get(k)!);
}

/** Earlier rows replaced by a later row of the same source and the same identity fields. */
export function historyRecords(records: NormRecord[], idFields: string[]): Set<NormRecord> {
  const out = new Set<NormRecord>();
  for (const list of partitionByIdentity(records, idFields)) for (const h of groupSources(list, []).history) out.add(h);
  return out;
}

/** Identity of a row within a source for freshness (SPEC-03): only a later row with the same identity
 *  replaces an earlier one. Several payments or leave periods in one file are separate rows. */
export const ROW_IDENTITY: Record<FileGroup, string[]> = {
  personnel_exit: [],
  insurance_loss: ["scheme"],
  final_payroll_settlement: ["payment_round", "pay_period_start", "pay_period_end", "settlement_reference"],
  annual_leave_ledger: ["leave_period_start", "leave_period_end"],
};

/** Rows that carry the current value of their source (history rows removed). */
export function currentRows(ev: EventCtx, g: FileGroup): NormRecord[] {
  if (g === "personnel_exit") return ev.personnelGroups.current;
  const history = historyRecords(ev.rows[g], ROW_IDENTITY[g]);
  return ev.rows[g].filter((r) => !history.has(r));
}

function emptyByGroup<T>(make: () => T): Record<FileGroup, T> {
  return Object.fromEntries(FILE_GROUPS.map((g) => [g, make()])) as Record<FileGroup, T>;
}

export function buildContext(args: {
  cutoff_at: string;
  cutoffKey: string;
  required_schemes: Scheme[];
  files: NormalizedFile[];
  inline: InlineResult[];
  approvals: Approval[];
  target_events: Array<{ company_key: string; worker_token: string; employment_sequence: number }> | null;
  freshness: FreshnessPolicy;
  deadlineRules: DeadlineRulesFile;
}): RunContext {
  const accepted = emptyByGroup<NormalizedFile[]>(() => []);
  const blocked = emptyByGroup<NormalizedFile[]>(() => []);
  const inlineByGroup = emptyByGroup<InlineResult[]>(() => []);
  const records = emptyByGroup<NormRecord[]>(() => []);

  // A supersedes link makes a correction chain (SPEC-01): the superseded file's rows stay as earlier
  // members of one source group and are never dropped (PRD: no deletion or merge by precedence).
  // A link that cannot form a chain is not dropped quietly: R-007 lists it for review (RV-SUPERSEDES-SILENT).
  const supersedesIssues: SupersedesIssue[] = [];
  const issue = (f: NormalizedFile, reason_code: SupersedesIssue["reason_code"]) =>
    supersedesIssues.push({ file_sha256: f.gate.file_sha256, file_group: f.gate.file_group, reason_code });
  const parent = new Map<string, string>();
  for (const f of args.files) {
    const sup = f.config.supersedes_file_sha256;
    if (f.gate.status !== "ACCEPTED" || !sup) continue;
    if (sup === f.gate.file_sha256) {
      issue(f, "SUPERSEDES_SELF");
      continue;
    }
    const targets = args.files.filter((t) => t.gate.file_sha256 === sup);
    const sameGroup = targets.filter((t) => t.gate.file_group === f.gate.file_group);
    if (targets.length === 0) issue(f, "SUPERSEDED_FILE_NOT_IN_RUN");
    else if (sameGroup.length === 0) issue(f, "SUPERSEDES_OTHER_FILE_GROUP");
    else if (!sameGroup.some((t) => t.gate.status === "ACCEPTED")) issue(f, "SUPERSEDED_FILE_BLOCKED");
    else {
      const prev = parent.get(f.gate.file_sha256);
      if (prev === undefined || sup < prev) parent.set(f.gate.file_sha256, sup);
    }
  }
  const lineageOf = (sha: string): { root: string; depth: number } | null => {
    let cur = sha;
    let depth = 0;
    const seen = new Set([sha]);
    while (parent.has(cur)) {
      cur = parent.get(cur)!;
      if (seen.has(cur)) return null; // a cycle is not a chain
      seen.add(cur);
      depth++;
    }
    return depth > 0 ? { root: cur, depth } : null;
  };
  for (const f of args.files) {
    if (f.gate.status === "ACCEPTED") {
      accepted[f.gate.file_group].push(f);
      const lin = lineageOf(f.gate.file_sha256);
      if (lin === null && parent.has(f.gate.file_sha256)) issue(f, "SUPERSEDES_CYCLE");
      records[f.gate.file_group].push(
        ...(lin ? f.records.map((r) => ({ ...r, lineage_root: lin.root, lineage_depth: lin.depth })) : f.records),
      );
    } else {
      blocked[f.gate.file_group].push(f);
    }
  }
  for (const i of args.inline) {
    inlineByGroup[i.file_group].push(i);
    if (!i.blocked) records[i.file_group].push(...i.records);
  }
  for (const g of FILE_GROUPS) records[g] = sortRecords(records[g]);

  // Events: every complete key triple in personnel_exit.
  const byKey = new Map<string, NormRecord[]>();
  for (const r of records.personnel_exit) {
    if (!keyOK(r)) continue;
    const k = eventKeyOf(r);
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }
  const targetSet = args.target_events
    ? new Set(args.target_events.map((t) => `${t.company_key}|${t.worker_token}|${t.employment_sequence}`))
    : null;

  const statusMissing = accepted.personnel_exit.some((f) => f.gate.missing_columns.includes("employment_status"));

  const events: EventCtx[] = [];
  for (const k of [...byKey.keys()].sort()) {
    if (targetSet && !targetSet.has(k)) continue;
    const all = byKey.get(k)!;
    const first = all[0]!;
    const rows = emptyByGroup<NormRecord[]>(() => []);
    const after = emptyByGroup<NormRecord[]>(() => []);
    for (const g of FILE_GROUPS) {
      for (const r of records[g]) {
        if (!keyOK(r) || eventKeyOf(r) !== k) continue;
        const ak = asOfKey(r);
        if (ak !== null && ak > args.cutoffKey) after[g].push(r);
        else rows[g].push(r);
      }
    }
    const personnel = rows.personnel_exit;
    const grouped = groupSources(personnel, COMPARED_FIELDS.personnel_exit!);
    // Snapshots of different times are not compared value by value (SPEC-02, PRD 4.3 「호환되는
    // 유효시점」): the rows at the latest source_as_of are current, earlier ones are older snapshots.
    // A row without a usable source_as_of stays current (its absence is reported by R-004).
    const keys = grouped.current.map((r) => asOfKey(r)).filter((x): x is string => x !== null);
    const latestKey = keys.length > 0 ? keys.reduce((a, b) => (b > a ? b : a)) : null;
    const olderSnapshots = grouped.current.filter((r) => {
      const ak = asOfKey(r);
      return latestKey !== null && ak !== null && ak < latestKey;
    });
    const groups: SourceGroupResult = { ...grouped, current: grouped.current.filter((r) => !olderSnapshots.includes(r)) };
    let state: EventState = "ENDED";
    let holdStatus: string | null = null;
    const statuses = groups.current.map((r) => r.values.employment_status);
    if (personnel.length === 0) state = "AFTER_CUTOFF";
    else if (statusMissing && statuses.every((s) => s === undefined)) state = "STATUS_COLUMN_MISSING";
    else if (statuses.some((s) => !s || s.parse_status !== "OK")) state = "STATUS_BLANK";
    else {
      const distinct = [...new Set(statuses.map((s) => String(s!.normalized)))];
      if (distinct.length > 1) state = "STATUS_CONFLICT";
      else if (distinct[0] === "ENDED") state = "ENDED";
      else if (distinct[0] === "EMPLOYED") state = "EMPLOYED";
      else {
        state = "HOLD";
        holdStatus = distinct[0]!;
      }
    }
    const endDates = [
      ...new Set(groups.current.map((r) => strValue(r, "employment_end_date")).filter((v): v is string => v !== null)),
    ].sort();
    let correctionAsOf: string | null = null;
    let correctionRecord: NormRecord | null = null;
    for (const chain of groups.chains) {
      const last = chain[chain.length - 1]!;
      const key = asOfKey(last);
      if (key && (correctionAsOf === null || key > correctionAsOf)) {
        correctionAsOf = key;
        correctionRecord = last;
      }
    }
    // An older exit snapshot whose values differ from the latest one: the latest is a correction
    // that later snapshots of the other file groups must post-date (SPEC-01 without supersedes).
    const sigOf = (r: NormRecord) => COMPARED_FIELDS.personnel_exit!.map((f) => JSON.stringify(r.values[f]?.normalized ?? null)).join("|");
    const latestRow = sortRecords(groups.current.filter((r) => asOfKey(r) === latestKey))[0];
    if (latestRow && latestKey !== null) {
      const corrected = olderSnapshots.some((r) => r.values.employment_status?.normalized === "ENDED" && sigOf(r) !== sigOf(latestRow));
      if (corrected && (correctionAsOf === null || latestKey > correctionAsOf)) {
        correctionAsOf = latestKey;
        correctionRecord = latestRow;
      }
    }
    const bases = [
      ...new Set(groups.current.filter((r) => strValue(r, "employment_end_date") !== null).map((r) => r.basis)),
    ].sort();
    const endDateBasis: EventCtx["endDateBasis"] = bases.length === 0 ? "UNDECLARED" : bases.length === 1 ? bases[0]! : "MIXED";
    const minEndDate = endDates[0] ?? null;
    // DAY_AFTER_LAST_DAY records the day after the last day (docs/03 3.5): the declaration says which
    // calendar day the value names; it is not an adjustment to make two values agree (SPEC-04).
    const eventDate = minEndDate === null ? null : endDateBasis === "DAY_AFTER_LAST_DAY" ? addDays(minEndDate, -1) : minEndDate;
    events.push({
      key: k,
      company_key: String(first.company_key.normalized),
      worker_token: String(first.worker_token.normalized),
      employment_sequence: Number(first.employment_sequence.normalized),
      personnel,
      personnelGroups: groups,
      olderSnapshots,
      state,
      holdStatus,
      endDates,
      anchorDiscrepancy: endDates.length > 1,
      minEndDate,
      endDateBasis,
      eventDate,
      correctionAsOf,
      correctionRecord,
      rows,
      afterCutoff: after,
    });
  }

  return {
    cutoff_at: args.cutoff_at,
    supersedesIssues: supersedesIssues.sort((a, b) =>
      `${a.file_sha256}|${a.file_group}|${a.reason_code}` < `${b.file_sha256}|${b.file_group}|${b.reason_code}` ? -1 : 1,
    ),
    cutoffKey: args.cutoffKey,
    cutoffDate: kstDate(args.cutoffKey),
    required_schemes: args.required_schemes,
    files: args.files,
    inline: args.inline,
    accepted,
    blocked,
    inlineByGroup,
    records,
    approvals: args.approvals,
    events,
    freshness: args.freshness,
    deadlineRules: args.deadlineRules,
  };
}

export function groupProvided(ctx: RunContext, g: FileGroup): boolean {
  return ctx.accepted[g].length > 0 || ctx.inlineByGroup[g].some((i) => !i.blocked);
}

export function missingColumn(ctx: RunContext, g: FileGroup, col: string): boolean {
  // A column counts as missing only when no accepted file of the group maps it.
  const files = ctx.accepted[g];
  return files.length > 0 && files.every((f) => f.gate.missing_columns.includes(col));
}

export function gateOf(ctx: RunContext, sha: string): FileGateResult | undefined {
  return ctx.files.find((f) => f.gate.file_sha256 === sha)?.gate;
}
