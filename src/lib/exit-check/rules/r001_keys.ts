// 원본: ~/dev/exit-check @cab1cce
// R-001 key completeness: the three keys exist and have a valid form in every file group.

import { eventKeyOf, groupProvided, keyOK, partialKeyOf } from "../core/context";
import type { NormRecord } from "../core/normalize";
import type { Finding } from "../core/types";
import { FILE_GROUPS } from "../core/types";
import { endedEvents, fieldName, item, mkFinding, type RuleEval } from "./common";

const KEY_FIELDS = ["company_key", "worker_token", "employment_sequence"] as const;

function keyParts(r: NormRecord) {
  return {
    company_key: r.company_key.parse_status === "OK" ? String(r.company_key.normalized) : null,
    worker_token: r.worker_token.parse_status === "OK" ? String(r.worker_token.normalized) : null,
    employment_sequence: r.employment_sequence.parse_status === "OK" ? Number(r.employment_sequence.normalized) : null,
  };
}

export const evalR001: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  // Key column absent: the file is blocked at the gate; comparisons relying on it become MISSING_INPUT.
  for (const f of ctx.files) {
    if (f.gate.reason_code !== "MISSING_KEY_COLUMN") continue;
    for (const col of f.gate.missing_key_columns) {
      findings.push(
        mkFinding(meta, {
          status: "MISSING_INPUT",
          key: `file:${f.gate.file_sha256}`,
          field: col,
          reason_code: "KEY_COLUMN_NOT_PROVIDED",
          evidence: [
            {
              role: "header",
              file_group: f.gate.file_group,
              file_sha256: f.gate.file_sha256,
              source_type: f.config.source_type,
              locator: f.gate.header_row
                ? {
                    file_sha256: f.gate.file_sha256,
                    sheet: f.gate.sheet ?? "",
                    row: f.gate.header_row,
                    column: null,
                    cell: null,
                    ref: `${f.gate.file_sha256}#${f.gate.sheet ?? ""}!${f.gate.header_row}`,
                  }
                : null,
            },
          ],
        }),
      );
    }
  }

  if (!groupProvided(ctx, "personnel_exit")) {
    findings.push(
      mkFinding(meta, {
        status: "MISSING_INPUT",
        key: "group:personnel_exit",
        field: "personnel_exit",
        reason_code: ctx.blocked.personnel_exit.length > 0 ? "FILE_BLOCKED" : "FILE_GROUP_NOT_PROVIDED",
        evidence: ctx.blocked.personnel_exit.map((f) => ({
          role: "file" as const,
          file_group: "personnel_exit" as const,
          file_sha256: f.gate.file_sha256,
          source_type: null,
          locator: null,
        })),
      }),
    );
  }

  const personnelKeys = new Set(ctx.records.personnel_exit.filter(keyOK).map(eventKeyOf));

  for (const g of FILE_GROUPS) {
    for (const r of ctx.records[g]) {
      for (const k of KEY_FIELDS) {
        const v = r[k];
        if (v.parse_status === "OK") continue;
        findings.push(
          mkFinding(meta, {
            status: "INCOMPLETE",
            key: partialKeyOf(r),
            ...keyParts(r),
            field: fieldName(g, k),
            reason_code: v.parse_status === "EMPTY" ? "EMPTY" : "FORMAT",
            // The value is never echoed: a name pasted into a key cell must not reach the report.
            evidence: [
              {
                role: "observed",
                file_group: g,
                file_sha256: r.file_sha256,
                source_type: r.source_type,
                locator: r.locators[k] ?? r.row_locator,
                field: k,
              },
            ],
          }),
        );
      }
      if (g !== "personnel_exit" && keyOK(r) && groupProvided(ctx, "personnel_exit") && !personnelKeys.has(eventKeyOf(r))) {
        findings.push(
          mkFinding(meta, {
            status: "INCOMPLETE",
            key: eventKeyOf(r),
            ...keyParts(r),
            field: "personnel_exit.row",
            reason_code: "NO_PERSONNEL_ROW_FOR_KEY",
            evidence: [
              {
                role: "observed",
                file_group: g,
                file_sha256: r.file_sha256,
                source_type: r.source_type,
                locator: r.row_locator,
              },
            ],
          }),
        );
      }
    }
  }

  for (const ev of endedEvents(ctx)) {
    const present = FILE_GROUPS.filter((g) => ev.rows[g].length > 0);
    compared.push(
      item(
        meta,
        ev.key,
        present.length === FILE_GROUPS.length
          ? "identifier_triplet_present_in_4_families"
          : `identifier_triplet_present_in:${present.join(",")}`,
      ),
    );
  }
  return { findings, compared };
};
