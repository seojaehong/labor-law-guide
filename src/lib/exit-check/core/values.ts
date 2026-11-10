// 원본: ~/dev/exit-check @cab1cce
// Value normalization (docs/03 4.1). Civil dates use integer day arithmetic, never Date parsing.

import type { Cell } from "./types";

export const NORMALIZER_VERSION = "norm-0.1.0";

export type ParseStatus = "OK" | "EMPTY" | "PARSE" | "FORMAT";

export interface NormValue {
  raw: string;
  normalized: string | number | null;
  parse_status: ParseStatus;
  precision?: "datetime" | "date";
  tz_assumed?: boolean;
}

export function isBlank(text: string): boolean {
  return text.replace(/[\s​-‍﻿]/g, "") === "";
}

/** Normalization shared by headers and enum values (docs/03 5.1). */
export function normalizeToken(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/[\s​-‍﻿]+/g, "")
    .replace(/[()[\]·_\-.]/g, "")
    .toLowerCase();
}

// ---- civil day arithmetic (proleptic Gregorian) ----

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}

function daysInMonth(y: number, m: number): number {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

function validCivil(y: number, m: number, d: number): boolean {
  return y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

export function formatCivil(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function dateToDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return daysFromCivil(y, m, d);
}

export function daysToDate(z: number): string {
  const [y, m, d] = civilFromDays(z);
  return formatCivil(y, m, d);
}

export function addDays(iso: string, n: number): string {
  return daysToDate(dateToDays(iso) + n);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  const z = dateToDays(iso);
  return (((z + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** The given day of the month after the month containing iso. */
export function nextMonthDay(iso: string, day: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return formatCivil(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

// ---- parsers ----

const DATE_PATTERNS: RegExp[] = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/,
  /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/,
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  /^(\d{4})(\d{2})(\d{2})$/,
  /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/,
];

export function parseDateText(text: string): string | null {
  const t = text.normalize("NFC").trim();
  for (const re of DATE_PATTERNS) {
    const m = re.exec(t);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      return validCivil(y, mo, d) ? formatCivil(y, mo, d) : null;
    }
  }
  return null;
}

export function normalizeDate(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  if (cell.kind === "date" && cell.date) return { raw, normalized: cell.date, parse_status: "OK" };
  if (cell.kind === "datetime" && cell.datetime) return { raw, normalized: cell.datetime.slice(0, 10), parse_status: "OK" };
  if (cell.kind === "number" && !/^\d{8}$/.test(raw.trim())) return { raw, normalized: null, parse_status: "PARSE" };
  const d = parseDateText(raw);
  return d ? { raw, normalized: d, parse_status: "OK" } : { raw, normalized: null, parse_status: "PARSE" };
}

const INSTANT_RE =
  /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/** Wall time + offset minutes -> UTC ISO string with milliseconds. */
function toUtcIso(y: number, mo: number, d: number, hh: number, mm: number, ss: number, ms: number, offsetMin: number): string {
  let total = daysFromCivil(y, mo, d) * 1440 + hh * 60 + mm - offsetMin;
  const day = Math.floor(total / 1440);
  total -= day * 1440;
  const [yy, mmo, dd] = civilFromDays(day);
  return `${formatCivil(yy, mmo, dd)}T${pad(Math.floor(total / 60))}:${pad(total % 60)}:${pad(ss)}.${pad(ms, 3)}Z`;
}

export function parseInstantText(text: string): Omit<NormValue, "raw"> {
  const t = text.normalize("NFC").trim();
  const m = INSTANT_RE.exec(t);
  if (!m) {
    const d = parseDateText(t);
    return d ? { normalized: d, parse_status: "OK", precision: "date" } : { normalized: null, parse_status: "PARSE" };
  }
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (!validCivil(y, mo, d)) return { normalized: null, parse_status: "PARSE" };
  if (m[4] === undefined) {
    if (m[8] !== undefined) return { normalized: null, parse_status: "PARSE" };
    return { normalized: formatCivil(y, mo, d), parse_status: "OK", precision: "date" };
  }
  const hh = Number(m[4]), mi = Number(m[5]), ss = Number(m[6] ?? "0");
  const ms = Number((m[7] ?? "0").padEnd(3, "0"));
  if (hh > 23 || mi > 59 || ss > 59) return { normalized: null, parse_status: "PARSE" };
  let offset = 9 * 60;
  let tzAssumed = true;
  if (m[8] !== undefined) {
    tzAssumed = false;
    if (m[8] === "Z") offset = 0;
    else {
      const sign = m[8].startsWith("-") ? -1 : 1;
      const digits = m[8].slice(1).replace(":", "");
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    }
  }
  const out: Omit<NormValue, "raw"> = {
    normalized: toUtcIso(y, mo, d, hh, mi, ss, ms, offset),
    parse_status: "OK",
    precision: "datetime",
  };
  if (tzAssumed) out.tz_assumed = true;
  return out;
}

export function normalizeInstant(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  if (cell.kind === "date" && cell.date) return { raw, normalized: cell.date, parse_status: "OK", precision: "date" };
  if (cell.kind === "datetime" && cell.datetime) return { raw, ...parseInstantText(cell.datetime) };
  return { raw, ...parseInstantText(raw) };
}

/** KST civil date of a normalized instant (UTC ISO) or of a date-precision value. */
export function kstDate(normalized: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(normalized);
  if (!m) throw new Error("not a normalized instant");
  const minutes = daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3])) * 1440 + Number(m[4]) * 60 + Number(m[5]) + 540;
  return daysToDate(Math.floor(minutes / 1440));
}

/** Comparable key for instants: date-precision values compare at the start of their KST day. */
export function instantSortKey(normalized: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    // KST midnight == previous day 15:00 UTC
    return `${addDays(normalized, -1)}T15:00:00.000Z`;
  }
  return normalized;
}

export function normalizeDecimal(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  const t = raw.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return { raw, normalized: null, parse_status: "PARSE" };
  const intPart = m[2]!.replace(/^0+(?=\d)/, "");
  const frac = (m[3] ?? "").replace(/0+$/, "");
  const body = frac ? `${intPart}.${frac}` : intPart;
  const neg = m[1] === "-" && body !== "0";
  return { raw, normalized: neg ? `-${body}` : body, parse_status: "OK" };
}

export function normalizeInteger(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  const t = raw.trim();
  if (!/^\d{1,9}$/.test(t)) return { raw, normalized: null, parse_status: "FORMAT" };
  const n = Number(t);
  if (n < 1) return { raw, normalized: null, parse_status: "FORMAT" };
  return { raw, normalized: n, parse_status: "OK" };
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function normalizeKey(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  const t = raw.normalize("NFC").trim();
  if (!KEY_RE.test(t) || !/[A-Za-z]/.test(t)) return { raw, normalized: null, parse_status: "FORMAT" };
  return { raw, normalized: t, parse_status: "OK" };
}

export function normalizeString(cell: Cell): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  return { raw, normalized: raw.normalize("NFC").trim(), parse_status: "OK" };
}

export function normalizeEnum(cell: Cell, table: Record<string, string>): NormValue {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) return { raw, normalized: null, parse_status: "EMPTY" };
  const k = normalizeToken(raw);
  const direct = Object.values(table).find((v) => normalizeToken(v) === k);
  const v = table[k] ?? direct;
  return { raw, normalized: v ?? "UNKNOWN", parse_status: "OK" };
}

/** ISO interval "start/end" (fixture leave_period). */
export function normalizePeriod(cell: Cell): { start: NormValue; end: NormValue } {
  const raw = cell.text;
  if (cell.kind === "empty" || isBlank(raw)) {
    const e: NormValue = { raw, normalized: null, parse_status: "EMPTY" };
    return { start: e, end: e };
  }
  const parts = raw.split(/\s*[/~]\s*/);
  if (parts.length !== 2) {
    const p: NormValue = { raw, normalized: null, parse_status: "PARSE" };
    return { start: p, end: p };
  }
  const s = parseDateText(parts[0]!);
  const e = parseDateText(parts[1]!);
  return {
    start: s ? { raw, normalized: s, parse_status: "OK" } : { raw, normalized: null, parse_status: "PARSE" },
    end: e ? { raw, normalized: e, parse_status: "OK" } : { raw, normalized: null, parse_status: "PARSE" },
  };
}

export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
