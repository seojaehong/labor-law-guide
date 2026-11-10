// 원본: ~/dev/exit-check @cab1cce
// XLSX reader (exceljs). Formulas are never executed: only stored results are read.
// Date cells are read from UTC components to avoid the one-day shift (docs/03 4.1).

import ExcelJS from "exceljs";
import type { Cell, PreGate, SheetTable } from "../core/types";
import { MAX_FILE_BYTES } from "./csv";
import { checkXlsxContainer } from "./zipcheck";

export type XlsxResult = { ok: true; sheets: SheetTable[] } | { ok: false; gate: PreGate };

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function fromDate(d: Date): Cell {
  const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
  if (!hasTime) return { text: date, kind: "date", date };
  const datetime = `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return { text: datetime, kind: "datetime", datetime };
}

function numberText(v: number): string {
  if (Number.isInteger(v)) return BigInt(v).toString();
  return String(v);
}

function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return { text: "", kind: "empty" };
  if (typeof value === "string") return { text: value, kind: value.trim() === "" ? "empty" : "string" };
  if (typeof value === "number") return { text: numberText(value), kind: "number" };
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE", kind: "bool" };
  if (value instanceof Date) return fromDate(value);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("formula" in v || "sharedFormula" in v) {
      const result = v.result as ExcelJS.CellValue | undefined;
      if (result === undefined || (typeof result === "object" && result !== null && "error" in (result as object))) {
        return { text: "", kind: "empty" };
      }
      return toCell(result);
    }
    if ("richText" in v && Array.isArray(v.richText)) {
      const text = (v.richText as Array<{ text: string }>).map((t) => t.text).join("");
      return { text, kind: text.trim() === "" ? "empty" : "string" };
    }
    if ("text" in v && typeof v.text === "string") return { text: v.text, kind: "string" };
    if ("error" in v) return { text: "", kind: "empty" };
  }
  return { text: String(value), kind: "string" };
}

function noteText(note: unknown): string {
  if (!note) return "";
  if (typeof note === "string") return note;
  const texts = (note as { texts?: Array<{ text?: string }> }).texts;
  return Array.isArray(texts) ? texts.map((t) => t.text ?? "").join("") : "";
}

export async function parseXlsx(bytes: Uint8Array): Promise<XlsxResult> {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, gate: { reason_code: "FILE_SIZE_LIMIT" } };
  const zip = checkXlsxContainer(bytes);
  if (!zip.ok) return { ok: false, gate: { reason_code: zip.reason_code ?? "FORMAT_NOT_ACCEPTED" } };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    return { ok: false, gate: { reason_code: "XLSX_NOT_READABLE" } };
  }
  const sheets: SheetTable[] = [];
  for (const ws of wb.worksheets) {
    const rows: SheetTable["rows"] = [];
    const notes: SheetTable["notes"] = [];
    const width = ws.columnCount;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        cells.push(toCell(cell.value));
        const n = noteText((cell as unknown as { note?: unknown }).note);
        if (n) notes.push({ row: rowNumber, col: c - 1, text: n });
      }
      rows.push({ row: rowNumber, cells });
    });
    const merges = ((ws.model as unknown as { merges?: string[] }).merges ?? []).slice();
    sheets.push({ name: ws.name, hidden: ws.state !== "visible", rows, merges, notes });
  }
  return { ok: true, sheets };
}
