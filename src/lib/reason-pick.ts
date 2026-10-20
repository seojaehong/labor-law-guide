import type { ReasonCategory } from "@/lib/types";

/** Select one display badge from already stored categories.
 * Prefer an explicit, known primary category present in the row, then a stable
 * display priority. This heuristic does not verify or reclassify legal issues.
 */
const PRIMARY_TO_REASON: Record<string, ReasonCategory> = {
  misconduct: "misconduct",
  transfer_validity: "transfer",
  renewal_expectation: "contract_expiry",
  contract_expiry: "contract_expiry",
  redundancy: "redundancy",
  workplace_harassment: "workplace_bullying",
  harassment_investigation: "workplace_bullying",
  harassment_report: "workplace_bullying",
  absence_without_leave: "absence",
  attendance: "absence",
  union_activity: "union_activity",
  work_ability: "incompetence",
  performance: "incompetence",
  low_sales: "incompetence",
  discrimination: "discrimination",
  no_dismissal: "no_dismissal",
};

const BROAD: ReadonlySet<string> = new Set(["worker_status", "other"]);

const SPECIFICITY: ReasonCategory[] = [
  "sexual_harassment",
  "workplace_bullying",
  "violence",
  "embezzlement",
  "absence",
  "incompetence",
  "misconduct",
  "probation",
  "redundancy",
  "contract_expiry",
  "no_dismissal",
  "transfer",
  "discrimination",
  "union_activity",
  "worker_status",
  "other",
];

export function pickReason(
  cats: readonly string[] | null | undefined,
  primary?: string | null,
): ReasonCategory | null {
  if (!cats || cats.length === 0) return null;
  const set = new Set(cats);
  // A generic dismissal-validity issue is not a finding that dismissal did not exist.
  const mapped = primary ? PRIMARY_TO_REASON[primary] ?? SPECIFICITY.find(c=>c===primary) : undefined;
  if (mapped && set.has(mapped) && !BROAD.has(mapped)) return mapped;
  for (const c of SPECIFICITY) if (set.has(c)) return c;
  return null;
}
