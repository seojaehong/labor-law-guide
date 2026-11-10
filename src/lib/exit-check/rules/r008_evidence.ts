// 원본: ~/dev/exit-check @cab1cce
// R-008 evidence traceability: every compared record carries a file hash, a cell locator
// and a declared source type. A manual entry alone does not close an item.

import type { Finding } from "../core/types";
import { FILE_GROUPS } from "../core/types";
import { endedEvents, eventFinding, item, mkFinding, type RuleEval } from "./common";

export const evalR008: RuleEval = (ctx, meta) => {
  const findings: Finding[] = [];
  const compared = [];

  for (const f of ctx.files) {
    if (f.gate.status !== "ACCEPTED") continue;
    const cfg = f.config;
    if (!cfg || cfg.source_type === "UNDECLARED") {
      findings.push(
        mkFinding(meta, {
          status: "INCOMPLETE",
          key: `file:${f.gate.file_sha256}`,
          field: `${f.gate.file_group}.source_type`,
          reason_code: "SOURCE_TYPE_UNDECLARED",
          evidence: [{ role: "file", file_group: f.gate.file_group, file_sha256: f.gate.file_sha256, source_type: null, locator: null }],
        }),
      );
    }
  }

  for (const ev of endedEvents(ctx)) {
    let complete = true;
    for (const g of FILE_GROUPS) {
      for (const r of ev.rows[g]) {
        if (r.source_type === "UNDECLARED") complete = false; // reported once per file above
        if (r.file_sha256 && r.row_locator) continue;
        complete = false;
        const scheme = g === "insurance_loss" && typeof r.values.scheme?.normalized === "string" ? r.values.scheme.normalized : null;
        const field = scheme ? `${g}:${scheme}.evidence` : `${g}.evidence`;
        findings.push(
          eventFinding(meta, ev, "INCOMPLETE", field, "NO_FILE_HASH_OR_LOCATOR", [
            { role: "observed", file_group: g, file_sha256: r.file_sha256, source_type: r.source_type, locator: r.row_locator },
          ], { entry: r.inline ? "manual_entry" : "file_row" }),
        );
      }
    }
    if (complete) compared.push(item(meta, ev.key, "file_sha256_and_locator_present"));
  }
  return { findings, compared };
};
