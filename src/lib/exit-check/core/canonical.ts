// 원본: ~/dev/exit-check @cab1cce
// Canonical JSON (docs/03 6.1): keys sorted by UTF-16 code units, no whitespace, NFC strings.
// Only integers are allowed as numbers; decimals travel as strings.

import { sha256Text } from "./sha256";

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value.normalize("NFC"));
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isInteger(value) || !Number.isFinite(value)) {
        throw new Error(`canonical JSON accepts integers only, got ${value}`);
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .map((k) => k.normalize("NFC"))
        .sort();
      const source = new Map(Object.keys(obj).map((k) => [k.normalize("NFC"), obj[k]]));
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(source.get(k))}`).join(",")}}`;
    }
    default:
      throw new Error(`canonical JSON cannot encode ${typeof value}`);
  }
}

export function canonicalSha256(value: unknown): string {
  return `sha256:${sha256Text(canonicalize(value))}`;
}
