// 원본: ~/dev/exit-check @cab1cce
// Resident-registration-number shape detection (docs/03 4.3).
// Only the shape is checked: 6 digits, optional separator, 7 digits whose first digit is 1-8.
// Matches are never returned; callers get coordinates and counts only.
//
// The text is folded first (PRIV-2): NFKC (full-width digits and signs), invisible characters
// removed (soft hyphen, zero-width, word joiner, bidi marks, BOM), every Unicode decimal digit
// mapped to ASCII. Separators (dashes of any kind, minus, dot, slash, underscore, spaces) may sit
// between any two digits of the shape, so "900101-123 4567" and "900101.1234567" are caught.

import { RRN_HEADER_PATTERN, RRN_HEADER_TOKEN_PATTERN } from "./aliases";
import { normalizeToken } from "./values";

const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/gu;
const SEP = "[\\p{Pd}\\u2212\\u2043\\uFE63\\uFF0D.\\s/_]*";
const D = "\\d";
const shape = (tail: string) => `(?<!\\d)${Array(6).fill(D).join(SEP)}${SEP}${tail}`;

const VALUE_PATTERNS: RegExp[] = [
  // 6 digits, 7 digits starting 1-8, and no further digit.
  new RegExp(`${shape(`[1-8]${SEP}${Array(6).fill(D).join(SEP)}`)}(?!\\d)`, "u"),
  // masked back part
  new RegExp(shape(`[1-8]${SEP}[*xX●•]{6}`), "u"),
];

/** Digit value of any Unicode decimal digit (runs of Nd always start at a zero). */
function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let k = 0;
  while (k < 60 && /\p{Nd}/u.test(String.fromCodePoint(cp - k - 1))) k++;
  return String(k % 10);
}

export function foldForRrn(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/\p{Nd}/gu, (c) => (c >= "0" && c <= "9" ? c : asciiDigit(c)));
}

export function hasRrnValue(text: string): boolean {
  if (!text) return false;
  const t = foldForRrn(text);
  return VALUE_PATTERNS.some((re) => re.test(t));
}

export function isRrnHeader(text: string): boolean {
  if (!text) return false;
  const folded = foldForRrn(text);
  return RRN_HEADER_PATTERN.test(folded) || RRN_HEADER_TOKEN_PATTERN.test(normalizeToken(folded));
}

export function countRrnValues(text: string): number {
  if (!text) return 0;
  const t = foldForRrn(text);
  let n = 0;
  for (const re of VALUE_PATTERNS) {
    const g = new RegExp(re.source, "gu");
    n += [...t.matchAll(g)].length;
  }
  return n;
}
