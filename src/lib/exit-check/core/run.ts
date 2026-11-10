// 원본: ~/dev/exit-check @cab1cce
// Deterministic core: tables + configuration -> core report + hash. Pure.

import { ALIAS_REGISTRY_VERSION } from "./aliases";
import { canonicalize, canonicalSha256 } from "./canonical";
import { buildContext } from "./context";
import { notEvaluatedRules } from "./deadlines";
import { normalizeInline, normalizeTable, type FileGateResult, type InlineResult, type NormalizedFile } from "./normalize";
import type {
  Approval,
  ComparedItem,
  CoreInput,
  Evidence,
  FileConfig,
  FileGroup,
  Finding,
  FreshnessPolicy,
  RunState,
  Scheme,
} from "./types";
import { FILE_GROUPS, SCHEMES } from "./types";
import { NORMALIZER_VERSION, normalizeInstant, parseInstantText } from "./values";
import { RULE_REGISTRY_VERSION, RULES, ruleVersions } from "../rules/registry";
import { mkFinding, pickPrimary } from "../rules/common";

export const MANIFEST_VERSION = "1";
export const COMPARISON_SETTINGS_VERSION = "cmp-0.1.0";

export function defaultFreshnessPolicy(): FreshnessPolicy {
  return {
    policy_version: "fresh-0.1.0",
    by_file_group: Object.fromEntries(
      FILE_GROUPS.map((g) => [g, { max_age_days: null, require_as_of_on_or_after_event: true }]),
    ) as FreshnessPolicy["by_file_group"],
  };
}

export class CoreInputError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function normalizeCutoff(cutoff: string): string {
  const p = parseInstantText(cutoff);
  if (p.parse_status !== "OK" || p.precision !== "datetime" || p.tz_assumed) {
    throw new CoreInputError("CUTOFF_NEEDS_ISO_WITH_OFFSET");
  }
  return String(p.normalized);
}

function sortSchemes(s: Scheme[]): Scheme[] {
  return [...new Set(s)].sort((a, b) => SCHEMES.indexOf(a) - SCHEMES.indexOf(b));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** File-level source_as_of as its normalized instant (docs/03 6.1 item 1), never the raw spelling (DET-2). */
function manifestAsOf(text: string | null | undefined) {
  if (text === null || text === undefined) return null;
  const v = normalizeInstant({ text, kind: "string" });
  if (v.parse_status === "OK") return { normalized: v.normalized, precision: v.precision ?? null, tz_assumed: v.tz_assumed === true };
  return { normalized: null, parse_status: v.parse_status, raw: text.normalize("NFC").trim() };
}

function manifestFile(f: NormalizedFile, cfg: FileConfig) {
  return {
    file_group: f.gate.file_group,
    file_sha256: f.gate.file_sha256,
    format: f.gate.format,
    sheet: cfg.sheet ?? null,
    header_row: cfg.header_row ?? 1,
    source_type: cfg.source_type,
    source_as_of: manifestAsOf(cfg.source_as_of),
    employment_end_date_basis: cfg.employment_end_date_basis ?? "UNDECLARED",
    employment_sequence_default: cfg.employment_sequence_default ?? null,
    schemes_covered: cfg.schemes_covered ? sortSchemes(cfg.schemes_covered) : null,
    supersedes_file_sha256: cfg.supersedes_file_sha256 ?? null,
    column_aliases: Object.fromEntries(
      Object.entries(cfg.column_aliases ?? {})
        .map(([k, v]) => [k.normalize("NFC"), v] as const)
        .sort((a, b) => cmp(a[0], b[0])),
    ),
    column_mapping: [...f.gate.column_mapping].sort((a, b) => cmp(a.source_column.padStart(4, " "), b.source_column.padStart(4, " "))),
    ignored_columns: [...f.gate.ignored_columns].sort((a, b) => cmp(a.source_column.padStart(4, " "), b.source_column.padStart(4, " "))),
  };
}

function gateSummary(g: FileGateResult) {
  return {
    file_sha256: g.file_sha256,
    file_group: g.file_group,
    format: g.format,
    status: g.status,
    reason_code: g.reason_code,
    locator: g.locator,
    match_count: g.match_count,
    sheet: g.sheet,
    header_row: g.header_row,
    missing_columns: g.missing_columns,
    missing_key_columns: g.missing_key_columns,
    ignored_columns: g.ignored_columns.map((c) => ({ source_column: c.source_column, source_header: c.source_header, kind: c.kind })),
  };
}

function evidenceKey(e: Evidence): string {
  return `${e.role}|${e.file_sha256 ?? ""}|${e.locator?.ref ?? ""}|${e.field ?? ""}`;
}

const ROLE_ORDER: Record<Evidence["role"], number> = { observed: 0, reference: 1, header: 2, file: 3, anchor: 4 };

function mergeFindings(all: Finding[]): Finding[] {
  const byKey = new Map<string, Finding[]>();
  for (const f of all) {
    const k = [f.rule_id, f.key, f.status, f.field ?? "", f.reason_code].join("\u0000");
    byKey.set(k, [...(byKey.get(k) ?? []), f]);
  }
  const out: Finding[] = [];
  for (const group of byKey.values()) {
    const base = group[0]!;
    const ev = new Map<string, Evidence>();
    for (const f of group) for (const e of f.evidence) ev.set(evidenceKey(e), e);
    const evidence = [...ev.values()].sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || cmp(a.locator?.ref ?? a.file_sha256 ?? "", b.locator?.ref ?? b.file_sha256 ?? "") || cmp(a.field ?? "", b.field ?? ""),
    );
    const details = group.map((f) => f.details).filter((d): d is Record<string, unknown> => d !== undefined);
    const distinct = [...new Map(details.map((d) => [canonicalize(d), d])).entries()].sort((a, b) => cmp(a[0], b[0]));
    const primary = pickPrimary(evidence);
    const merged: Finding = {
      ...base,
      evidence,
      file_sha256: primary?.file_sha256 ?? null,
      source_locator: primary?.locator ?? null,
    };
    delete merged.details;
    if (distinct.length === 1) merged.details = distinct[0]![1];
    else if (distinct.length > 1) merged.details = { merged: distinct.map((d) => d[1]) };
    out.push(merged);
  }
  return out.sort((a, b) =>
    cmp(a.rule_id, b.rule_id) ||
    cmp(a.company_key ?? "", b.company_key ?? "") ||
    cmp(a.worker_token ?? "", b.worker_token ?? "") ||
    (a.employment_sequence ?? -1) - (b.employment_sequence ?? -1) ||
    cmp(a.field ?? "", b.field ?? "") ||
    cmp(a.status, b.status) ||
    cmp(a.key, b.key) ||
    cmp(a.source_locator?.ref ?? "", b.source_locator?.ref ?? "") ||
    cmp(a.reason_code, b.reason_code),
  );
}

function sortCompared(items: ComparedItem[]): ComparedItem[] {
  const uniq = new Map(items.map((i) => [`${i.rule_id}|${i.key}|${i.item}`, i]));
  return [...uniq.values()].sort((a, b) => cmp(a.rule_id, b.rule_id) || cmp(a.key, b.key) || cmp(a.item, b.item));
}

export interface CoreRun {
  manifest_core: Record<string, unknown>;
  manifest_core_sha256: string;
  core_report: CoreReport;
  core_report_sha256: string;
}

export interface CoreReport {
  report_kind: "exit-check.core";
  manifest_core_sha256: string;
  normalizer_version: string;
  alias_registry_version: string;
  rule_registry_version: string;
  rule_versions: ReturnType<typeof ruleVersions>;
  cutoff_at: string;
  run_state: RunState;
  run_state_trail: RunState[];
  file_gate_results: ReturnType<typeof gateSummary>[];
  inline_entry_results: Array<{ index: number; file_group: FileGroup; status: "ACCEPTED" | "SCHEMA_BLOCKED"; row_count: number }>;
  findings: Finding[];
  compared_items: ComparedItem[];
  deadline_rules_not_evaluated: Array<{ rule_key: string; citation: string; reason_code: string }>;
}

export function runCore(input: CoreInput): CoreRun {
  const cutoffKey = normalizeCutoff(input.cutoff_at);
  const required = sortSchemes(input.required_schemes);
  const freshness = input.freshness_policy ?? defaultFreshnessPolicy();

  // Files: order-independent (sorted by hash, then group).
  // The canonical config breaks ties between inputs with identical bytes (DET-1).
  const tables = [...input.tables].sort(
    (a, b) => cmp(a.file_sha256, b.file_sha256) || cmp(a.config.file_group, b.config.file_group) || cmp(canonicalize(a.config), canonicalize(b.config)),
  );
  const files = tables.map(normalizeTable);

  // Inline entries: order-independent (sorted by canonical content).
  const inlineSorted = input.inline_entries
    .map((e) => ({
      file_group: e.file_group,
      source_type: e.source_type,
      rows: e.rows
        .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").normalize("NFC")])))
        .sort((a, b) => cmp(canonicalize(a), canonicalize(b))),
    }))
    .sort((a, b) => cmp(canonicalize(a), canonicalize(b)));
  const inline: InlineResult[] = inlineSorted.map((e, i) => normalizeInline(e, i));

  const approvals: Approval[] = [...input.approvals]
    .map((a) => ({ key: a.key, scope: a.scope, reason_code: a.reason_code, status: a.status }))
    .sort((a, b) => cmp(canonicalize(a), canonicalize(b)));
  const targets = input.target_events
    ? [...input.target_events].sort((a, b) => cmp(canonicalize(a), canonicalize(b)))
    : null;

  const manifest_core: Record<string, unknown> = {
    manifest_version: MANIFEST_VERSION,
    normalizer_version: NORMALIZER_VERSION,
    alias_registry_version: ALIAS_REGISTRY_VERSION,
    rule_registry_version: RULE_REGISTRY_VERSION,
    rules: ruleVersions(),
    deadline_rules_sha256: canonicalSha256(input.deadline_rules),
    cutoff_at: cutoffKey,
    timezone_policy: "Asia/Seoul",
    target_events: targets,
    files: files.map((f) => manifestFile(f, f.config)),
    // Inline entries are input data without file evidence; withheld when they carry a blocked pattern.
    inline_entries: inlineSorted.map((e, i) =>
      inline[i]!.blocked ? { file_group: e.file_group, source_type: e.source_type, rows: null, blocked: true } : e,
    ),
    applicability_approvals: approvals,
    freshness_policy: freshness,
    comparison_settings: { settings_version: COMPARISON_SETTINGS_VERSION, required_schemes: required },
  };
  const manifest_core_sha256 = canonicalSha256(manifest_core);

  const ctx = buildContext({
    cutoff_at: input.cutoff_at,
    cutoffKey,
    required_schemes: required,
    files,
    inline,
    approvals,
    target_events: targets,
    freshness,
    deadlineRules: input.deadline_rules,
  });

  const raw: Finding[] = [];
  const compared: ComparedItem[] = [];
  const schemaMeta = { rule_id: "SCHEMA", rule_version: RULE_REGISTRY_VERSION };
  for (const f of files) {
    if (f.gate.status !== "SCHEMA_BLOCKED") continue;
    raw.push(
      mkFinding(schemaMeta, {
        status: "SCHEMA_BLOCKED",
        key: `file:${f.gate.file_sha256}`,
        field: null,
        reason_code: f.gate.reason_code ?? "BLOCKED",
        evidence: [
          {
            role: "file",
            file_group: f.gate.file_group,
            file_sha256: f.gate.file_sha256,
            source_type: f.config.source_type,
            locator: f.gate.locator
              ? {
                  file_sha256: f.gate.file_sha256,
                  sheet: f.gate.locator.sheet,
                  row: f.gate.locator.row ?? 0,
                  column: f.gate.locator.column ?? null,
                  cell: f.gate.locator.cell ?? null,
                  ref: `${f.gate.file_sha256}#${f.gate.locator.sheet}!${f.gate.locator.cell ?? f.gate.locator.row ?? ""}`,
                }
              : null,
          },
        ],
        details: { match_count: f.gate.match_count },
      }),
    );
  }
  for (const i of inline) {
    if (!i.blocked) continue;
    raw.push(
      mkFinding(schemaMeta, {
        status: "SCHEMA_BLOCKED",
        key: `inline:${i.file_group}:${i.index}`,
        field: null,
        reason_code: "RRN_PATTERN",
        evidence: [],
      }),
    );
  }
  for (const rule of RULES) {
    const out = rule.evaluate(ctx, { rule_id: rule.rule_id, rule_version: rule.rule_version });
    raw.push(...out.findings);
    compared.push(...out.compared);
  }
  const findings = mergeFindings(raw);

  const accepted = files.some((f) => f.gate.status === "ACCEPTED") || inline.some((i) => !i.blocked);
  const trail: RunState[] = ["RECEIVED"];
  let run_state: RunState;
  if (!accepted) {
    trail.push("SCHEMA_BLOCKED");
    run_state = "SCHEMA_BLOCKED";
  } else {
    trail.push("NORMALIZED", "CORE_COMPARED");
    const itemFindings = findings.filter((f) => f.rule_id !== "SCHEMA");
    const evidenceGap =
      findings.some((f) => f.rule_id === "R-008" && f.status === "INCOMPLETE") ||
      itemFindings.some((f) => f.source_locator === null && f.file_sha256 === null);
    if (evidenceGap) run_state = "EVIDENCE_INCOMPLETE";
    else if (findings.some((f) => f.status !== "NOT_APPLICABLE")) run_state = "REVIEW_REQUIRED";
    else run_state = "CORE_COMPARED";
    if (run_state !== "CORE_COMPARED") trail.push(run_state);
  }

  const core_report: CoreReport = {
    report_kind: "exit-check.core",
    manifest_core_sha256,
    normalizer_version: NORMALIZER_VERSION,
    alias_registry_version: ALIAS_REGISTRY_VERSION,
    rule_registry_version: RULE_REGISTRY_VERSION,
    rule_versions: ruleVersions(),
    cutoff_at: cutoffKey,
    run_state,
    run_state_trail: trail,
    file_gate_results: files.map((f) => gateSummary(f.gate)),
    inline_entry_results: inline.map((i) => ({
      index: i.index,
      file_group: i.file_group,
      status: i.blocked ? ("SCHEMA_BLOCKED" as const) : ("ACCEPTED" as const),
      row_count: i.records.length,
    })),
    findings,
    compared_items: sortCompared(compared),
    deadline_rules_not_evaluated: notEvaluatedRules(input.deadline_rules),
  };
  return { manifest_core, manifest_core_sha256, core_report, core_report_sha256: canonicalSha256(core_report) };
}
