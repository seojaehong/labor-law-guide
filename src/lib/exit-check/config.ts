// 원본: ~/dev/exit-check @cab1cce
// Run manifest (fixture format, fixtures/scenarios.md section 5) -> core input. No IO here:
// the caller supplies file bytes keyed by the manifest path.

import { SOURCE_TYPE_VALUES } from "./core/aliases";
import type { Approval, CoreInput, DeadlineRulesFile, EndDateBasis, FileConfig, FileGroup, InlineEntry, Scheme, SourceType } from "./core/types";
import { FILE_GROUPS, SCHEMES } from "./core/types";
import { CoreInputError, normalizeCutoff } from "./core/run";
import { normalizeInstant, normalizeToken } from "./core/values";
import { loadTable, type RawFile } from "./parse/input";
import { RULE_REGISTRY_VERSION } from "./rules/registry";

export class ConfigError extends Error {
  constructor(public readonly code: string, public readonly detail = "") {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface ManifestInput {
  family: string;
  path: string | null;
  source_type?: string;
  sheet?: string;
  header_row?: number;
  source_as_of?: string;
  employment_end_date_basis?: string;
  employment_sequence_default?: number;
  schemes_covered?: string[];
  supersedes?: string;
  inline_rows?: Array<Record<string, string>>;
}

export interface RunManifest {
  synthetic?: boolean;
  cutoff_at?: string;
  rule_version?: string;
  required_schemes?: string[];
  inputs: ManifestInput[];
  column_aliases?: Record<string, Record<string, string>>;
  approvals?: Array<{
    key: string;
    scheme?: string;
    scope?: string;
    status: string;
    reason_code: string;
    approved_by?: string;
    approved_at?: string;
  }>;
  target_events?: Array<{ company_key: string; worker_token: string; employment_sequence: number }>;
}

export const DEFAULT_REQUIRED_SCHEMES: Scheme[] = ["NPS", "NHIS", "EI"];

function asGroup(v: string): FileGroup {
  if ((FILE_GROUPS as readonly string[]).includes(v)) return v as FileGroup;
  throw new ConfigError("UNKNOWN_FILE_GROUP", v);
}

function asScheme(v: string): Scheme {
  if ((SCHEMES as readonly string[]).includes(v)) return v as Scheme;
  throw new ConfigError("UNKNOWN_SCHEME", v);
}

export function asSourceType(v: string | undefined): SourceType {
  if (!v) return "UNDECLARED";
  const t = SOURCE_TYPE_VALUES[normalizeToken(v)];
  if (!t) throw new ConfigError("UNKNOWN_SOURCE_TYPE", v);
  return t;
}

function asBasis(v: string | undefined): EndDateBasis {
  if (!v) return "UNDECLARED";
  if (v === "LAST_DAY" || v === "DAY_AFTER_LAST_DAY" || v === "UNDECLARED") return v;
  throw new ConfigError("UNKNOWN_END_DATE_BASIS", v);
}

/** Infer a file group from a file name such as personnel_exit.csv or insurance_loss_2026.xlsx. */
export function inferGroup(fileName: string): FileGroup | null {
  const base = fileName.replace(/^.*[\\/]/, "").toLowerCase();
  return FILE_GROUPS.find((g) => base.startsWith(g)) ?? null;
}

export interface PreparedRun {
  core: CoreInput;
  display_names: Record<string, string>;
  approval_audit: Array<{ key: string; scope: string; approved_by: string | null; approved_at: string | null }>;
  synthetic: boolean;
}

export async function prepareFromManifest(args: {
  manifest: RunManifest;
  cutoff_at: string;
  files: Map<string, Uint8Array>;
  deadline_rules: DeadlineRulesFile;
}): Promise<PreparedRun> {
  const m = args.manifest;
  // Details carry only the user's own value; product wording lives in CLI_TEXT (W-2).
  if (m.rule_version !== undefined && m.rule_version !== RULE_REGISTRY_VERSION) {
    throw new ConfigError("RULE_VERSION_MISMATCH", String(m.rule_version));
  }
  if (m.cutoff_at !== undefined) {
    // Compared as instants, not spellings (DET-4). An unreadable manifest value is a mismatch.
    let same = false;
    try {
      same = normalizeCutoff(m.cutoff_at) === normalizeCutoff(args.cutoff_at);
    } catch (e) {
      if (!(e instanceof CoreInputError)) throw e;
      if (m.cutoff_at === args.cutoff_at) throw e;
    }
    if (!same) throw new ConfigError("CUTOFF_MISMATCH");
  }
  const raw: RawFile[] = [];
  const inline: InlineEntry[] = [];
  const pathToConfig = new Map<string, FileConfig>();
  for (const inp of m.inputs) {
    const group = asGroup(inp.family);
    const source_type = asSourceType(inp.source_type);
    if (inp.inline_rows) {
      inline.push({ file_group: group, source_type, rows: inp.inline_rows });
      continue;
    }
    if (!inp.path) throw new ConfigError("INPUT_PATH_MISSING", inp.family);
    const bytes = args.files.get(inp.path);
    if (!bytes) throw new ConfigError("INPUT_FILE_NOT_FOUND", inp.path);
    if (inp.source_as_of !== undefined && normalizeInstant({ text: inp.source_as_of, kind: "string" }).parse_status !== "OK") {
      throw new ConfigError("SOURCE_AS_OF_NOT_READABLE", inp.source_as_of);
    }
    const cfg: FileConfig = {
      file_group: group,
      source_type,
      sheet: inp.sheet ?? null,
      header_row: inp.header_row ?? 1,
      source_as_of: inp.source_as_of ?? null,
      employment_end_date_basis: asBasis(inp.employment_end_date_basis),
      employment_sequence_default: inp.employment_sequence_default ?? null,
      schemes_covered: inp.schemes_covered ? inp.schemes_covered.map(asScheme) : null,
      supersedes_file_sha256: null,
      column_aliases: m.column_aliases?.[group] ?? {},
    };
    pathToConfig.set(inp.path, cfg);
    raw.push({ display_name: inp.path.replace(/^.*[\\/]/, ""), bytes, config: cfg });
  }
  const tables = await Promise.all(raw.map(loadTable));
  const shaOfPath = new Map<string, string>();
  m.inputs.forEach((inp) => {
    if (!inp.path || inp.inline_rows) return;
    const t = tables[raw.findIndex((r) => r.config === pathToConfig.get(inp.path!))];
    if (t) shaOfPath.set(inp.path, t.file_sha256);
  });
  // A supersedes link that cannot form a correction chain is a setting error, not something to drop
  // quietly (RV-SUPERSEDES-SILENT): self-reference, another file group, or a cycle.
  const supersedesOf = new Map<string, string>();
  for (const inp of m.inputs) if (inp.supersedes && inp.path && !inp.inline_rows) supersedesOf.set(inp.path, inp.supersedes);
  for (const inp of m.inputs) {
    if (inp.supersedes && inp.path) {
      const cfg = pathToConfig.get(inp.path)!;
      const sup = shaOfPath.get(inp.supersedes);
      if (!sup) throw new ConfigError("SUPERSEDED_FILE_NOT_IN_RUN", inp.supersedes);
      if (inp.supersedes === inp.path || sup === shaOfPath.get(inp.path)) throw new ConfigError("SUPERSEDES_SELF", inp.supersedes);
      if (pathToConfig.get(inp.supersedes)!.file_group !== cfg.file_group) throw new ConfigError("SUPERSEDES_OTHER_FILE_GROUP", inp.supersedes);
      const seen = new Set([inp.path]);
      for (let cur = supersedesOf.get(inp.path); cur !== undefined; cur = supersedesOf.get(cur)) {
        if (seen.has(cur)) throw new ConfigError("SUPERSEDES_CYCLE", inp.supersedes);
        seen.add(cur);
      }
      cfg.supersedes_file_sha256 = sup;
    }
  }

  const approvals: Approval[] = [];
  const audit: PreparedRun["approval_audit"] = [];
  for (const a of m.approvals ?? []) {
    if (a.status !== "NOT_APPLICABLE") throw new ConfigError("APPROVAL_STATUS_NOT_SUPPORTED", a.status);
    const scope = a.scope ?? (a.scheme ? `insurance_loss:${asScheme(a.scheme)}` : null);
    if (!scope) throw new ConfigError("APPROVAL_SCOPE_MISSING", a.key);
    approvals.push({ key: a.key, scope, reason_code: a.reason_code, status: "NOT_APPLICABLE" });
    audit.push({ key: a.key, scope, approved_by: a.approved_by ?? null, approved_at: a.approved_at ?? null });
  }

  return {
    core: {
      cutoff_at: args.cutoff_at,
      required_schemes: (m.required_schemes ?? DEFAULT_REQUIRED_SCHEMES).map(asScheme),
      tables,
      inline_entries: inline,
      approvals,
      target_events: m.target_events ?? null,
      freshness_policy: null,
      deadline_rules: args.deadline_rules,
    },
    // Inputs with identical bytes share a hash; every name declared for it is kept (outside the hash).
    display_names: Object.fromEntries(
      [...new Set(tables.map((t) => t.file_sha256))].map((sha) => [
        sha,
        [...new Set(tables.filter((t) => t.file_sha256 === sha).map((t) => t.display_name))].sort().join(" / "),
      ]),
    ),
    approval_audit: audit,
    synthetic: m.synthetic === true,
  };
}

/** Plain file list (no manifest): group from file name, source type undeclared. */
export function manifestFromPaths(paths: string[]): RunManifest {
  return {
    inputs: paths.map((p) => {
      const eq = /^([a-z_]+)=(.+)$/.exec(p);
      if (eq && (FILE_GROUPS as readonly string[]).includes(eq[1]!)) return { family: eq[1]!, path: eq[2]! };
      const g = inferGroup(p);
      if (!g) throw new ConfigError("FILE_GROUP_NOT_INFERRED", p.replace(/^.*[\\/]/, ""));
      return { family: g, path: p };
    }),
  };
}
