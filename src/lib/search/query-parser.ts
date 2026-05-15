import { getSearchLocalModelAdapter } from '@/lib/search/local-model-adapter';
import { normalizeQuery } from '@/lib/search/normalize-query';
import type { ParsedCandidateQuery, QueryScenario } from '@/lib/search/types';

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function parseCandidateQueryRuleBased(rawQuery: string): ParsedCandidateQuery {
  const normalized = normalizeQuery(rawQuery);
  const lowered = rawQuery.toLowerCase();

  let queryScenario: QueryScenario = 'generic';
  const mustHaveMarkers: string[] = [];
  const penalizedMarkers: string[] = [];

  const hasAbsence = includesAny(lowered, ['무단결근', '결근', '근무태만', '근무지 이탈']);
  const hasProcedure = includesAny(lowered, ['절차', '서면통지', '서면 통지', '소명', '인사위원회']);
  const hasRegular = includesAny(lowered, ['정규직']);
  const hasWorkAbility = includesAny(lowered, ['업무능력', '저성과', '성과 부족', '성과부족']);
  const hasRetaliation = includesAny(lowered, ['보복', '불이익', '신고 이후', '신고자']);
  const hasHarassment = includesAny(lowered, ['직장내괴롭힘', '괴롭힘']);
  const hasSeverity = includesAny(lowered, ['양정', '과하다', '과도', '너무 과', '수위', '과다']);
  const hasDismissal = includesAny(lowered, ['해고']);
  const hasWage = includesAny(lowered, ['임금', '체불', '통상임금', '퇴직금', '수당', '최저임금']);
  const hasContract = includesAny(lowered, ['계약만료', '갱신거절', '갱신기대권', '기간제', '계약직']);
  const hasSafety = includesAny(lowered, ['산재', '산업재해', '안전보건', '중대재해', '업무상 재해']);
  const hasUnion = includesAny(lowered, ['노동조합', '노조', '단체교섭', '쟁의행위', '부당노동행위', '파업']);

  if (hasAbsence && hasProcedure) {
    queryScenario = 'absence_procedure';
    mustHaveMarkers.push('unauthorized_absence', 'written_notice_missing', 'procedural_due_process');
    penalizedMarkers.push('not_really_absence_case');
  } else if (hasRegular && hasWorkAbility) {
    queryScenario = 'regular_work_ability';
    mustHaveMarkers.push(
      'qualitative_evaluation',
      'quantitative_evaluation',
      'warning_given',
      'improvement_opportunity_given',
      'training_provided'
    );
    penalizedMarkers.push('probation', 'rejection_of_regular_employment', 'nonrenewal');
  } else if (hasHarassment && hasRetaliation) {
    queryScenario = 'retaliation';
    mustHaveMarkers.push('harassment_report_filed', 'protection_against_retaliation');
    penalizedMarkers.push('workplace_harassment_only', 'union_activity_general_theory');
  } else if (hasSeverity && hasDismissal) {
    queryScenario = 'severity_excessive';
    mustHaveMarkers.push('proportionality', 'appropriateness_of_discipline');
    penalizedMarkers.push('dismissed', 'settled', 'no_relief_interest');
  } else if (hasWage) {
    queryScenario = 'wage_dispute';
    mustHaveMarkers.push('wage', 'allowance', 'ordinary_wage');
    penalizedMarkers.push('work_rules_only', 'union_general_theory');
  } else if (hasContract) {
    queryScenario = 'contract_termination';
    mustHaveMarkers.push('fixed_term', 'renewal_expectation', 'termination_notice');
    penalizedMarkers.push('voluntary_resignation', 'retirement_only');
  } else if (hasSafety) {
    queryScenario = 'workplace_safety';
    mustHaveMarkers.push('industrial_accident', 'work_relatedness', 'safety_obligation');
    penalizedMarkers.push('traffic_only', 'general_criminal_case');
  } else if (hasUnion) {
    queryScenario = 'union_related';
    mustHaveMarkers.push('union_activity', 'collective_bargaining', 'unfair_labor_practice');
    penalizedMarkers.push('wage_only', 'individual_resignation');
  }

  const normalizedQuery = normalized.keywords.length > 0 ? normalized.keywords.join(' ') : rawQuery.trim();

  return {
    raw_query: rawQuery,
    normalized_query: normalizedQuery,
    keywords: normalized.keywords,
    intended_primary: uniq(normalized.primaryCandidates),
    intended_stage: uniq(normalized.stageCandidates),
    intended_disposition: uniq(normalized.dispositionCandidates),
    must_have_markers: uniq(mustHaveMarkers),
    penalized_markers: uniq([...penalizedMarkers, ...normalized.exclusionHints]),
    query_scenario: queryScenario,
    explanation: [
      normalized.explanation,
      `scenario: ${queryScenario}`,
      mustHaveMarkers.length > 0 ? `must: ${uniq(mustHaveMarkers).join(',')}` : '',
      penalizedMarkers.length > 0 ? `penalty: ${uniq(penalizedMarkers).join(',')}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

export async function parseCandidateQuery(rawQuery: string): Promise<ParsedCandidateQuery> {
  const fallback = parseCandidateQueryRuleBased(rawQuery);
  const adapter = getSearchLocalModelAdapter();

  if (!adapter?.parseQuery) {
    return fallback;
  }

  try {
    const adapted = await adapter.parseQuery({
      rawQuery,
      fallback,
    });

    return adapted ?? fallback;
  } catch {
    return fallback;
  }
}
