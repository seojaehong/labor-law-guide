// 원본: ~/dev/exit-check @cab1cce
// File gate (docs/03 4.2-4.3) and normalization (docs/03 5, 7).

import { COLUMN_SPECS, isNameContactHeader, type ColumnSpec } from "./aliases";
import {
  EMPLOYMENT_STATUS_VALUES,
  RECEIPT_STATUS_VALUES,
  SCHEME_VALUES,
  SETTLEMENT_STATUS_VALUES,
} from "./aliases";
import { countRrnValues, hasRrnValue, isRrnHeader } from "./rrn";
import { sha256Text } from "./sha256";
import type {
  Cell,
  EndDateBasis,
  FileConfig,
  FileGroup,
  InlineEntry,
  Locator,
  SheetTable,
  SourceTable,
  SourceType,
} from "./types";
import {
  columnLetter,
  isBlank,
  normalizeDate,
  normalizeDecimal,
  normalizeEnum,
  normalizeInstant,
  normalizeInteger,
  normalizeKey,
  normalizePeriod,
  normalizeString,
  normalizeToken,
  type NormValue,
} from "./values";

export const MAX_ROWS = 100_000; // provisional (docs/03 4.2)

export interface ColumnMappingEntry {
  source_column: string;
  source_header: string | null;
  target: string;
  basis: "user_selected" | "standard_name" | "auto_alias";
}

export interface IgnoredColumn {
  source_column: string;
  source_header: string | null;
  kind: "name_contact" | "unmapped";
}

export interface FileGateResult {
  file_sha256: string;
  file_group: FileGroup;
  format: string;
  status: "ACCEPTED" | "SCHEMA_BLOCKED";
  reason_code: string | null;
  locator: { sheet: string; row?: number; column?: string; cell?: string } | null;
  match_count: number | null;
  sheet: string | null;
  header_row: number | null;
  column_mapping: ColumnMappingEntry[];
  ignored_columns: IgnoredColumn[];
  missing_key_columns: string[];
  missing_columns: string[];
}

export interface NormRecord {
  record_id: string;
  file_group: FileGroup;
  file_sha256: string | null;
  source_type: SourceType;
  inline: boolean;
  sheet: string;
  row: number;
  basis: EndDateBasis;
  source_system: string;
  company_key: NormValue;
  worker_token: NormValue;
  employment_sequence: NormValue & { defaulted?: boolean };
  values: Record<string, NormValue>;
  locators: Record<string, Locator | null>;
  row_locator: Locator | null;
  /** Set by the run context when a manifest supersedes link ties this file to an earlier one. */
  lineage_root?: string;
  lineage_depth?: number;
}

export interface NormalizedFile {
  gate: FileGateResult;
  records: NormRecord[];
  /** The configuration this file was read with (DET-1: never looked up by hash). */
  config: FileConfig;
}

function specFor(group: FileGroup, name: string): ColumnSpec | undefined {
  return COLUMN_SPECS[group].find((s) => s.name === name);
}

function locatorFor(fileSha: string, sheet: string, row: number, colIndex: number | null): Locator {
  if (colIndex === null) {
    return { file_sha256: fileSha, sheet, row, column: null, cell: null, ref: `${fileSha}#${sheet}!${row}` };
  }
  const col = columnLetter(colIndex);
  const cell = `${col}${row}`;
  return { file_sha256: fileSha, sheet, row, column: col, cell, ref: `${fileSha}#${sheet}!${cell}` };
}

function cellAt(cells: Cell[], i: number): Cell {
  return cells[i] ?? { text: "", kind: "empty" };
}

/** A blocked file's header row may be a data row (wrong header_row): keep the column letter and the
 *  classification only, never the cell text (PRIV-5). */
function redactHeaders(extra: Partial<FileGateResult>): Partial<FileGateResult> {
  const out = { ...extra };
  if (out.column_mapping) out.column_mapping = out.column_mapping.map((m) => ({ ...m, source_header: null }));
  if (out.ignored_columns) out.ignored_columns = out.ignored_columns.map((c) => ({ ...c, source_header: null }));
  return out;
}

/** Header text kept for an accepted file's unread columns; digit runs that look like values are not kept. */
function keptHeaderText(text: string): string | null {
  return /\p{Nd}{4,}|\p{Nd}+[-.\s/]\p{Nd}+[-.\s/]\p{Nd}+/u.test(text) || hasRrnValue(text) ? null : text;
}

/** XLSX numbers lose leading zeros: a resident number of someone born 2000-2009 is stored as a
 *  10-12 digit integer (PRIV-1). Such cells are also scanned zero-padded to 13 digits. */
function rrnScanTexts(c: Cell): string[] {
  if (c.kind === "number" && /^\d{10,12}$/.test(c.text)) return [c.text, c.text.padStart(13, "0")];
  // A CSV saved from a spreadsheet carries the same loss as text: a whole cell of exactly 12 digits is
  // scanned with the zero put back (RV-PRIV1-CSV-TEXT). 13 digits are already scanned as they are.
  const t = c.text.trim();
  if (/^\d{12}$/.test(t)) return [c.text, `0${t}`];
  return [c.text];
}

function blocked(table: SourceTable, reason: string, extraIn: Partial<FileGateResult> = {}): NormalizedFile {
  const extra = redactHeaders(extraIn);
  return {
    config: table.config,
    gate: {
      file_sha256: table.file_sha256,
      file_group: table.config.file_group,
      format: table.format,
      status: "SCHEMA_BLOCKED",
      reason_code: reason,
      locator: null,
      match_count: null,
      sheet: null,
      header_row: null,
      column_mapping: [],
      ignored_columns: [],
      missing_key_columns: [],
      missing_columns: [],
      ...extra,
    },
    records: [],
  };
}

/** Scan every sheet (hidden too), every cell, every note, sheet names and the file name. */
function scanRrn(table: SourceTable): { locator: FileGateResult["locator"]; count: number } | null {
  let first: FileGateResult["locator"] = null;
  let count = 0;
  if (hasRrnValue(table.display_name) || isRrnHeader(table.display_name)) {
    count += Math.max(1, countRrnValues(table.display_name));
    first = { sheet: "(file name)" };
  }
  // Scan in a fixed order (sheet name, row, column) so the first-match coordinate does not
  // depend on the order rows were handed to the core.
  const sheets = [...table.sheets].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const sheet of sheets) {
    if (hasRrnValue(sheet.name) || isRrnHeader(sheet.name)) {
      count += 1;
      first ??= { sheet: "(sheet name)" };
    }
    for (const r of [...sheet.rows].sort((a, b) => a.row - b.row)) {
      r.cells.forEach((c, i) => {
        const texts = rrnScanTexts(c);
        const hit = texts.some((t) => hasRrnValue(t)) || isRrnHeader(c.text);
        if (hit) {
          count += Math.max(1, ...texts.map((t) => countRrnValues(t)));
          first ??= { sheet: sheet.name, row: r.row, column: columnLetter(i), cell: `${columnLetter(i)}${r.row}` };
        }
      });
    }
    for (const n of [...sheet.notes].sort((a, b) => a.row - b.row || a.col - b.col)) {
      if (hasRrnValue(n.text) || isRrnHeader(n.text)) {
        count += 1;
        first ??= { sheet: sheet.name, row: n.row, column: columnLetter(n.col), cell: `${columnLetter(n.col)}${n.row}` };
      }
    }
  }
  return count > 0 ? { locator: first, count } : null;
}

function rangeTouchesRow(range: string, row: number): boolean {
  const m = /^[A-Z]+(\d+)(?::[A-Z]+(\d+))?$/.exec(range.replace(/\$/g, ""));
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return row >= Math.min(a, b) && row <= Math.max(a, b);
}

function selectSheet(table: SourceTable): SheetTable | "UNSPECIFIED" | "NOT_FOUND" {
  if (table.config.sheet) {
    return table.sheets.find((s) => s.name === table.config.sheet) ?? "NOT_FOUND";
  }
  const withData = table.sheets.filter((s) => !s.hidden && s.rows.some((r) => r.cells.some((c) => !isBlank(c.text))));
  if (withData.length === 1) return withData[0]!;
  return "UNSPECIFIED";
}

function normalizeAliasMap(aliases: Record<string, string> | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const [h, t] of Object.entries(aliases ?? {})) m.set(normalizeToken(h), t);
  return m;
}

function normalizeCell(spec: ColumnSpec, cell: Cell, group: FileGroup): NormValue {
  switch (spec.type) {
    case "key":
      return normalizeKey(cell);
    case "integer":
      return normalizeInteger(cell);
    case "date":
      return normalizeDate(cell);
    case "instant":
      return normalizeInstant(cell);
    case "decimal":
      return normalizeDecimal(cell);
    case "string":
      return normalizeString(cell);
    case "enum": {
      const table =
        spec.name === "employment_status"
          ? EMPLOYMENT_STATUS_VALUES
          : spec.name === "settlement_status"
            ? SETTLEMENT_STATUS_VALUES
            : spec.name === "scheme"
              ? (SCHEME_VALUES as Record<string, string>)
              : RECEIPT_STATUS_VALUES;
      void group;
      return normalizeEnum(cell, table);
    }
    case "period":
      throw new Error("period handled separately");
  }
}

function recordId(fileSha: string, sheet: string, row: number): string {
  return sha256Text(`${fileSha}${sheet}${row}`).slice(0, 16);
}

export function normalizeTable(table: SourceTable): NormalizedFile {
  const group = table.config.file_group;
  if (table.pre_gate) {
    return blocked(table, table.pre_gate.reason_code, {
      locator: table.pre_gate.locator ?? null,
      match_count: table.pre_gate.match_count ?? null,
    });
  }
  if (table.format !== "csv" && table.format !== "xlsx") return blocked(table, "FORMAT_NOT_ACCEPTED");

  const rrn = scanRrn(table);
  if (rrn) return blocked(table, "RRN_PATTERN", { locator: rrn.locator, match_count: rrn.count });

  const sheet = selectSheet(table);
  if (sheet === "UNSPECIFIED") return blocked(table, "SHEET_NOT_SPECIFIED");
  if (sheet === "NOT_FOUND") return blocked(table, "SHEET_NOT_FOUND");
  if (sheet.rows.length > MAX_ROWS) return blocked(table, "ROW_LIMIT", { sheet: sheet.name });

  const headerRow = table.config.header_row ?? 1;
  if (sheet.merges.some((r) => rangeTouchesRow(r, headerRow))) {
    return blocked(table, "MERGED_HEADER", { sheet: sheet.name, header_row: headerRow });
  }
  const header = sheet.rows.find((r) => r.row === headerRow);
  if (!header) return blocked(table, "HEADER_ROW_EMPTY", { sheet: sheet.name, header_row: headerRow });

  const aliasMap = normalizeAliasMap(table.config.column_aliases);
  const specs = COLUMN_SPECS[group];
  const mapping: ColumnMappingEntry[] = [];
  const ignored: IgnoredColumn[] = [];
  const targetByCol = new Map<number, string>();
  let nameAlias = false;
  header.cells.forEach((c, i) => {
    const text = c.text.normalize("NFC").trim();
    if (text === "") return;
    const norm = normalizeToken(text);
    const nameContact = isNameContactHeader(text);
    let target: string | undefined;
    let basis: ColumnMappingEntry["basis"] | undefined;
    const userTarget = aliasMap.get(norm);
    // A name or contact column is never read, so it cannot be mapped into a standard column (PRIV-3).
    if (userTarget !== undefined && nameContact) nameAlias = true;
    if (userTarget !== undefined) {
      target = userTarget;
      basis = "user_selected";
    } else {
      const std = specs.find((s) => normalizeToken(s.name) === norm);
      if (std) {
        target = std.name;
        basis = "standard_name";
      } else {
        const auto = specs.find((s) => s.auto.some((a) => normalizeToken(a) === norm));
        if (auto) {
          target = auto.name;
          basis = "auto_alias";
        }
      }
    }
    const col = columnLetter(i);
    if (target === undefined || basis === undefined) {
      ignored.push({ source_column: col, source_header: keptHeaderText(text), kind: nameContact ? "name_contact" : "unmapped" });
      return;
    }
    mapping.push({ source_column: col, source_header: text, target, basis });
    targetByCol.set(i, target);
  });

  const base: Partial<FileGateResult> = {
    sheet: sheet.name,
    header_row: headerRow,
    column_mapping: mapping,
    ignored_columns: ignored,
  };

  if (nameAlias) return blocked(table, "NAME_COLUMN_ALIAS", base);
  const unknownTarget = mapping.find((m) => !specFor(group, m.target));
  if (unknownTarget) return blocked(table, "ALIAS_TARGET_UNKNOWN", base);
  const targets = mapping.map((m) => m.target);
  const hasDup = targets.some((t, i) => targets.indexOf(t) !== i);
  const periodConflict =
    targets.includes("leave_period") && (targets.includes("leave_period_start") || targets.includes("leave_period_end"));
  if (hasDup || periodConflict) return blocked(table, "DUPLICATE_MAPPING", base);

  const missingKeys = ["company_key", "worker_token", "employment_sequence"].filter((k) => !targets.includes(k));
  if (missingKeys.length > 0) {
    return blocked(table, "MISSING_KEY_COLUMN", { ...base, missing_key_columns: missingKeys });
  }

  const present = new Set(targets);
  if (present.has("leave_period")) {
    present.add("leave_period_start");
    present.add("leave_period_end");
  }
  if (table.config.source_as_of) present.add(group === "annual_leave_ledger" ? "ledger_as_of" : "source_as_of");
  const missingColumns = specs
    .filter((s) => s.required && s.type !== "key" && s.name !== "employment_sequence" && !present.has(s.name))
    .map((s) => s.name);
  if (group === "annual_leave_ledger" && !present.has("leave_period_start")) missingColumns.push("leave_period_start");
  if (group === "annual_leave_ledger" && !present.has("leave_period_end")) missingColumns.push("leave_period_end");

  const gate: FileGateResult = {
    file_sha256: table.file_sha256,
    file_group: group,
    format: table.format,
    status: "ACCEPTED",
    reason_code: null,
    locator: null,
    match_count: null,
    sheet: sheet.name,
    header_row: headerRow,
    column_mapping: mapping,
    ignored_columns: ignored,
    missing_key_columns: [],
    missing_columns: missingColumns.sort(),
  };

  const records: NormRecord[] = [];
  const asOfField = group === "annual_leave_ledger" ? "ledger_as_of" : "source_as_of";
  const configAsOf = table.config.source_as_of ? normalizeInstant({ text: table.config.source_as_of, kind: "string" }) : null;

  for (const r of sheet.rows) {
    if (r.row <= headerRow) continue;
    if (r.cells.every((c) => isBlank(c.text))) continue;
    const values: Record<string, NormValue> = {};
    const locators: Record<string, Locator | null> = {};
    for (const [i, target] of targetByCol) {
      const spec = specFor(group, target)!;
      const cell = cellAt(r.cells, i);
      const loc = locatorFor(table.file_sha256, sheet.name, r.row, i);
      if (spec.type === "period") {
        const p = normalizePeriod(cell);
        values.leave_period_start = p.start;
        values.leave_period_end = p.end;
        locators.leave_period_start = loc;
        locators.leave_period_end = loc;
      } else {
        values[target] = normalizeCell(spec, cell, group);
        locators[target] = loc;
      }
    }
    if (configAsOf && values[asOfField] === undefined) {
      values[asOfField] = configAsOf;
      locators[asOfField] = null;
    }
    const seq = values.employment_sequence!;
    const seqOut: NormRecord["employment_sequence"] =
      seq.parse_status === "EMPTY" && table.config.employment_sequence_default
        ? { ...seq, normalized: table.config.employment_sequence_default, parse_status: "OK", defaulted: true }
        : seq;
    records.push({
      record_id: recordId(table.file_sha256, sheet.name, r.row),
      file_group: group,
      file_sha256: table.file_sha256,
      source_type: table.config.source_type,
      inline: false,
      sheet: sheet.name,
      row: r.row,
      basis: table.config.employment_end_date_basis ?? "UNDECLARED",
      source_system: typeof values.source_system?.normalized === "string" ? values.source_system.normalized : "",
      company_key: values.company_key!,
      worker_token: values.worker_token!,
      employment_sequence: seqOut,
      values,
      locators,
      row_locator: locatorFor(table.file_sha256, sheet.name, r.row, null),
    });
  }
  return { gate, records, config: table.config };
}

export interface InlineResult {
  index: number;
  file_group: FileGroup;
  blocked: boolean;
  records: NormRecord[];
}

/** Manual entries: same value normalization, no file hash, no locator. */
export function normalizeInline(entry: InlineEntry, index: number): InlineResult {
  const group = entry.file_group;
  const anyRrn = entry.rows.some((row) => Object.entries(row).some(([k, v]) => hasRrnValue(v) || isRrnHeader(k)));
  if (anyRrn) return { index, file_group: group, blocked: true, records: [] };
  const records: NormRecord[] = entry.rows.map((row, i) => {
    const values: Record<string, NormValue> = {};
    const locators: Record<string, Locator | null> = {};
    for (const [k, v] of Object.entries(row)) {
      const spec = specFor(group, k);
      if (!spec) continue;
      const cell: Cell = { text: v ?? "", kind: isBlank(v ?? "") ? "empty" : "string" };
      if (spec.type === "period") {
        const p = normalizePeriod(cell);
        values.leave_period_start = p.start;
        values.leave_period_end = p.end;
        locators.leave_period_start = null;
        locators.leave_period_end = null;
      } else {
        values[k] = normalizeCell(spec, cell, group);
        locators[k] = null;
      }
    }
    const empty: NormValue = { raw: "", normalized: null, parse_status: "EMPTY" };
    return {
      record_id: sha256Text(`inline:${index}:${i}`).slice(0, 16),
      file_group: group,
      file_sha256: null,
      source_type: entry.source_type,
      inline: true,
      sheet: "inline",
      row: i + 1,
      basis: "UNDECLARED",
      source_system: `inline:${index}`,
      company_key: values.company_key ?? empty,
      worker_token: values.worker_token ?? empty,
      employment_sequence: values.employment_sequence ?? empty,
      values,
      locators,
      row_locator: null,
    };
  });
  return { index, file_group: group, blocked: false, records };
}
