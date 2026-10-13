// Client-safe metadata contract. No catalog, document text or private provenance.
export interface CaptureContext {
  run_id: string;
  period_from: string;
  period_to: string;
  matcher_version: string;
  rule_version: string;
}
export interface Observation extends CaptureContext {
  id: string;
  rule_id: string;
  standard_article_id: string;
  candidate_clause_ids: string[];
  selected_clause_ids: string[];
  verdict: string;
  reason: 'period_check_output';
  missing_count: number;
  stale_count: number;
  user_false_positive: boolean;
}
export const observationFields = [
  'id', 'run_id', 'period_from', 'period_to', 'matcher_version', 'rule_version',
  'rule_id', 'standard_article_id', 'candidate_clause_ids', 'selected_clause_ids', 'verdict', 'reason',
  'missing_count', 'stale_count', 'user_false_positive',
] as const;
export function captureIdentity(context: CaptureContext): string {
  return JSON.stringify([context.run_id, context.period_from, context.period_to,
    context.matcher_version, context.rule_version]);
}
export function sameObservation(expected: Observation, actual: unknown): boolean {
  if (!actual || typeof actual !== 'object') return false;
  const row = actual as Record<string, unknown>;
  return observationFields.every(field =>
    JSON.stringify(expected[field]) === JSON.stringify(row[field]));
}
export function safeClauseId(value: string | null): string | null {
  return value?.replace(/\s/g, '').match(/^제\d{1,5}조(?:의\d{1,5})?(?=$|[([【])/u)?.[0] ?? null;
}

// UUIDv8: SHA-256 of non-sensitive run/context + standard/rule IDs. Stable across remounts.
export async function observationId(context: CaptureContext, standardId: string, ruleId: string): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify([captureIdentity(context), standardId, ruleId]));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function safeClauseIds(value: string | null): string[] {
  // where can join multiple titled locations. Remove titles before splitting,
  // so a comma/reference inside an employer-authored title never becomes evidence.
  const withoutTitles = value?.replace(/\([^)]*\)|【[^】]*】|\[[^\]]*\]/g, '') ?? '';
  return [...new Set(withoutTitles.split(',').map(safeClauseId).filter((id): id is string => !!id))].sort();
}
