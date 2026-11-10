// 원본: ~/dev/exit-check @cab1cce
// Bytes -> SourceTable. Format is decided by extension and container signature.

import { fileHashRef } from "../core/sha256";
import type { FileConfig, SourceTable } from "../core/types";
import { parseCsv } from "./csv";
import { parseXlsx } from "./xlsx";

export interface RawFile {
  display_name: string;
  bytes: Uint8Array;
  config: FileConfig;
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

export async function loadTable(file: RawFile): Promise<SourceTable> {
  const base = {
    display_name: file.display_name,
    file_sha256: fileHashRef(file.bytes),
    config: file.config,
  };
  const ext = extensionOf(file.display_name);
  if (ext === "csv") {
    const r = parseCsv(file.bytes);
    return r.ok
      ? { ...base, format: "csv", pre_gate: null, sheets: [r.sheet] }
      : { ...base, format: "csv", pre_gate: r.gate, sheets: [] };
  }
  if (ext === "xlsx") {
    const r = await parseXlsx(file.bytes);
    return r.ok
      ? { ...base, format: "xlsx", pre_gate: null, sheets: r.sheets }
      : { ...base, format: "xlsx", pre_gate: r.gate, sheets: [] };
  }
  return { ...base, format: "other", pre_gate: { reason_code: "FORMAT_NOT_ACCEPTED" }, sheets: [] };
}
