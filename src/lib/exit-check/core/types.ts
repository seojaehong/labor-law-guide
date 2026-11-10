// 원본: ~/dev/exit-check @cab1cce
// Core types. The core is pure: no IO, no Node-only APIs.

export const FILE_GROUPS = [
  "personnel_exit",
  "final_payroll_settlement",
  "insurance_loss",
  "annual_leave_ledger",
] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];

export const SCHEMES = ["NPS", "NHIS", "EI", "IACI"] as const;
export type Scheme = (typeof SCHEMES)[number];

/** Item status (finding status). Never a "match"/"pass" status. */
export type ItemStatus =
  | "MISSING_INPUT"
  | "INCOMPLETE"
  | "STALE"
  | "DISCREPANCY"
  | "REVIEW_REQUIRED"
  | "NOT_APPLICABLE"
  | "ON_HOLD";

/** File gate status. */
export type FileGateStatus = "SCHEMA_BLOCKED" | "ACCEPTED";

/** Run state (PRD 6.7). */
export type RunState =
  | "RECEIVED"
  | "SCHEMA_BLOCKED"
  | "NORMALIZED"
  | "CORE_COMPARED"
  | "EVIDENCE_INCOMPLETE"
  | "REVIEW_REQUIRED"
  | "ON_HOLD"
  | "REVIEW_RECORDED"
  | "CLOSED_NO_LEGAL_CONCLUSION";

export type SourceType = "APPROVED_RECORD" | "SYSTEM_EXPORT" | "DRAFT" | "USER_NOTE" | "UNDECLARED";
export type EndDateBasis = "LAST_DAY" | "DAY_AFTER_LAST_DAY" | "UNDECLARED";

/** One cell as delivered by a parser. `text` is the raw string form. */
export interface Cell {
  text: string;
  kind: "empty" | "string" | "number" | "date" | "datetime" | "bool";
  /** For XLSX date cells: civil date YYYY-MM-DD read from UTC components. */
  date?: string;
  /** For XLSX datetime cells: wall time "YYYY-MM-DD HH:mm:ss" read from UTC components. */
  datetime?: string;
}

export interface TableRow {
  /** 1-based row number in the source sheet. */
  row: number;
  cells: Cell[];
}

export interface SheetTable {
  name: string;
  hidden: boolean;
  rows: TableRow[];
  /** Merge ranges as A1:B2 strings. */
  merges: string[];
  /** Cell notes/comments (scanned for resident-number patterns only). */
  notes: Array<{ row: number; col: number; text: string }>;
}

/** Gate result decided by the parser before a table could be built. */
export interface PreGate {
  reason_code: string;
  /** Coordinate only, never a value. */
  locator?: { sheet: string; row?: number; column?: string; cell?: string };
  match_count?: number;
}

/** Per-file configuration (from manifest or CLI). */
export interface FileConfig {
  file_group: FileGroup;
  source_type: SourceType;
  sheet?: string | null;
  header_row?: number;
  source_as_of?: string | null;
  employment_end_date_basis?: EndDateBasis;
  employment_sequence_default?: number | null;
  schemes_covered?: Scheme[] | null;
  supersedes_file_sha256?: string | null;
  /** header (as written) -> standard column name; user-selected mapping. */
  column_aliases?: Record<string, string>;
}

export interface SourceTable {
  /** Display name. Non-core: never enters the core hash. */
  display_name: string;
  format: "csv" | "xlsx" | "other";
  file_sha256: string; // "sha256:<hex>"
  config: FileConfig;
  pre_gate?: PreGate | null;
  sheets: SheetTable[];
}

/** A manual entry without file evidence (fixture: manifest inputs[].inline_rows). */
export interface InlineEntry {
  file_group: FileGroup;
  source_type: SourceType;
  rows: Array<Record<string, string>>;
}

export interface Approval {
  key: string; // company|worker|sequence
  scope: string; // e.g. insurance_loss:NHIS
  reason_code: string;
  status: "NOT_APPLICABLE";
}

export interface FreshnessPolicy {
  policy_version: string;
  by_file_group: Partial<Record<FileGroup, { max_age_days: number | null; require_as_of_on_or_after_event: boolean }>>;
}

export interface CoreInput {
  cutoff_at: string;
  required_schemes: Scheme[];
  tables: SourceTable[];
  inline_entries: InlineEntry[];
  approvals: Approval[];
  target_events?: Array<{ company_key: string; worker_token: string; employment_sequence: number }> | null;
  freshness_policy?: FreshnessPolicy | null;
  /** Parsed rules/deadline-rules.json. */
  deadline_rules: DeadlineRulesFile;
}

export interface DeadlineRule {
  rule_key: string;
  rule_kind: "payment_deadline" | "loss_date" | "report_deadline";
  scheme: string;
  anchor_field: string;
  anchor_alternatives?: string[];
  anchor_decision?: string;
  formula: { type: "days_after"; n: number } | { type: "next_month_day"; day: number } | null;
  citation: string;
  verified: boolean;
  effective_from: string | null;
  [k: string]: unknown;
}

export interface DeadlineRulesFile {
  schema_version: string;
  rules: DeadlineRule[];
  [k: string]: unknown;
}

export interface Locator {
  file_sha256: string;
  sheet: string;
  row: number;
  column: string | null;
  cell: string | null;
  /** sha256:<hex>#<sheet>!<cell or row> */
  ref: string;
}

export interface Evidence {
  /** observed = the value the item is about; reference = a value it was compared against. */
  role: "anchor" | "observed" | "reference" | "file" | "header";
  file_group: FileGroup | null;
  file_sha256: string | null;
  source_type: SourceType | null;
  locator: Locator | null;
  field?: string;
  /** Normalized value (dates, enum codes). Never names, never blocked-file values. */
  normalized?: string | number | null;
  /** Source value as written (data field, quoted only). */
  source_value?: string | null;
}

export interface Finding {
  rule_id: string; // R-001..R-009 or SCHEMA
  rule_version: string;
  status: ItemStatus | "SCHEMA_BLOCKED";
  key: string;
  company_key: string | null;
  worker_token: string | null;
  employment_sequence: number | null;
  field: string | null;
  reason_code: string;
  file_sha256: string | null;
  source_locator: Locator | null;
  evidence: Evidence[];
  details?: Record<string, unknown>;
}

export interface ComparedItem {
  rule_id: string;
  key: string;
  item: string;
}
