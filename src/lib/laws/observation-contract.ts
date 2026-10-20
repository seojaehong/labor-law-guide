import { MATCHER_VERSION, RULE_VERSION } from './observation-version';
import { observationFields, type Observation } from './observation-payload';
import standard from '../../../public/data/laws/standard.json';
import catalog from '../../../scripts/laws/work_rules_map.json';
export type { Observation } from './observation-payload';
export const observationRuleId = (r: { lawId: string; article: string; effective: string }) => `${r.lawId}:${r.article}:${r.effective}`;
export const knownRuleIds = new Set(catalog.rules.map(observationRuleId));
export const reviewStates = ['unreviewed', 'confirmed_false_positive', 'expected', 'needs_more_evidence'] as const;
export type ReviewState = typeof reviewStates[number];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const standardIds = new Set(standard.articles.map(article => article.id));
const clause = /^제\d{1,5}조(?:의\d{1,5})?$/;
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return false;
  const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === iso;
}
export function validObservation(x: unknown): x is Observation {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  return Object.keys(r).length === observationFields.length && observationFields.every(k => k in r)
    && typeof r.id === 'string' && uuid.test(r.id)
    && typeof r.run_id === 'string' && uuid.test(r.run_id)
    && validDay(r.period_from) && validDay(r.period_to) && r.period_from < r.period_to
    && typeof r.rule_id === 'string' && knownRuleIds.has(r.rule_id)
    && typeof r.standard_article_id === 'string' && standardIds.has(r.standard_article_id)
    && Array.isArray(r.candidate_clause_ids) && r.candidate_clause_ids.length <= 100
    && new Set(r.candidate_clause_ids).size === r.candidate_clause_ids.length
    && r.candidate_clause_ids.every(v => typeof v === 'string' && clause.test(v))
    && Array.isArray(r.selected_clause_ids) && r.selected_clause_ids.length <= 100
    && new Set(r.selected_clause_ids).size === r.selected_clause_ids.length
    && r.selected_clause_ids.every(v => typeof v === 'string' && clause.test(v))
    && ['누락','미반영','반영됨'].includes(String(r.verdict)) && r.reason === 'period_check_output'
    && [r.missing_count,r.stale_count].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100)
    && typeof r.user_false_positive === 'boolean' && r.matcher_version === MATCHER_VERSION && r.rule_version === RULE_VERSION;
}
export function validReview(x: unknown): x is {id: string; review_state: ReviewState} {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string,unknown>;
  return Object.keys(r).length === 2 && typeof r.id === 'string' && uuid.test(r.id)
    && reviewStates.includes(r.review_state as ReviewState);
}
