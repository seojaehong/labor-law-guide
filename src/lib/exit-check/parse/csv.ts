// 원본: ~/dev/exit-check @cab1cce
// RFC 4180 CSV parser. UTF-8 only (BOM allowed). Pure.

import type { Cell, PreGate, SheetTable } from "../core/types";
import { countRrnValues, hasRrnValue } from "../core/rrn";
import { columnLetter } from "../core/values";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // provisional (docs/03 4.2)

export type CsvResult = { ok: true; sheet: SheetTable } | { ok: false; gate: PreGate };

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function parseCsv(bytes: Uint8Array): CsvResult {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, gate: { reason_code: "FILE_SIZE_LIMIT" } };
  const text = decodeUtf8(bytes);
  if (text === null) return { ok: false, gate: { reason_code: "CSV_NOT_UTF8" } };

  const parsed = parseRows(text);

  // First scan: whole text, before mapping (fail-closed; the core scans the cells again).
  if (hasRrnValue(text)) {
    let locator: PreGate["locator"] = { sheet: "csv" };
    if (parsed.ok) {
      outer: for (let r = 0; r < parsed.rows.length; r++) {
        const cells = parsed.rows[r]!;
        for (let c = 0; c < cells.length; c++) {
          if (hasRrnValue(cells[c]!)) {
            locator = { sheet: "csv", row: r + 1, column: columnLetter(c), cell: `${columnLetter(c)}${r + 1}` };
            break outer;
          }
        }
      }
    } else {
      const line = text.split(/\r\n|\n|\r/).findIndex((l) => hasRrnValue(l));
      locator = { sheet: "csv", row: line + 1 };
    }
    return { ok: false, gate: { reason_code: "RRN_PATTERN", locator, match_count: Math.max(1, countRrnValues(text)) } };
  }
  if (!parsed.ok) return { ok: false, gate: { reason_code: "CSV_SYNTAX", locator: { sheet: "csv", row: parsed.line } } };
  const rows = parsed.rows;
  // Strip a leading BOM from the first header cell.
  if (rows[0]?.[0] !== undefined) rows[0][0] = rows[0][0].replace(/^﻿/, "");

  const toCell = (t: string): Cell => ({ text: t, kind: t === "" ? "empty" : "string" });
  return {
    ok: true,
    sheet: {
      name: "csv",
      hidden: false,
      rows: rows.map((cells, idx) => ({ row: idx + 1, cells: cells.map(toCell) })),
      merges: [],
      notes: [],
    },
  };
}

function parseRows(text: string): { ok: true; rows: string[][] } | { ok: false; line: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  let wasQuoted = false;
  let i = 0;
  let lineNo = 1;
  const pushField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
    wasQuoted = false;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") lineNo++;
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (fieldStarted || wasQuoted) return { ok: false, line: lineNo };
      inQuotes = true;
      wasQuoted = true;
      fieldStarted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      pushField();
      rows.push(row);
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i++;
      i++;
      lineNo++;
      continue;
    }
    if (wasQuoted) return { ok: false, line: lineNo };
    field += ch;
    fieldStarted = true;
    i++;
  }
  if (inQuotes) return { ok: false, line: lineNo };
  if (fieldStarted || wasQuoted || row.length > 0) {
    pushField();
    rows.push(row);
  }
  return { ok: true, rows };
}
