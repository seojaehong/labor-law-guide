import type { DecisionResult, ReasonCategory } from '@/lib/types';

export type SearchMode = 'baseline' | 'candidate' | 'compare';

export interface SearchCard {
  id: string;
  title: string;
  case_number?: string | null;
  department: string | null;
  decision_date: string | null;
  decision_result: string;
  key_issue: string | null;
  holding_summary?: string | null;
  holding_points?: string | null;
  summary_short?: string | null;
  url: string | null;
  reason_category: string[];
  source_provider?: 'nlrc' | 'bigcase' | 'lawgo' | null;
  duplicate_group_id?: string | null;
  // BigCase 태깅 필드
  legal_focus?: string[] | null;
  disposition_type?: string[] | null;
  fact_markers?: string[] | null;
  confidence_level?: 'high' | 'medium' | 'low' | null;
  tier?: 'high_demand' | 'standard' | 'low_priority' | null;
  tier_subcategory?: string | null;
}

export interface SearchBucket {
  items: SearchCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MolabInterpretation {
  id: string;
  title: string;
  case_number: string | null;
  decision_date: string | null;
  inquiry_summary: string | null;
  answer_summary: string | null;
  keywords_matched: string[];
}

export interface SearchResponsePayload {
  mode: SearchMode;
  query: string;
  reason: ReasonCategory | '';
  result: DecisionResult | '';
  baseline?: SearchBucket;
  candidate?: SearchBucket;
  molab?: MolabInterpretation[];
  baselineError?: string;
  candidateError?: string;
  debug?: SearchDebugPayload;
}

export interface SearchRequestOptions {
  query: string;
  reason?: ReasonCategory | '';
  result?: DecisionResult | '';
  page?: number;
  pageSize?: number;
  mode: SearchMode;
}

export type QueryScenario =
  | 'generic'
  | 'absence_procedure'
  | 'regular_work_ability'
  | 'retaliation'
  | 'severity_excessive'
  | 'wage_dispute'
  | 'contract_termination'
  | 'workplace_safety'
  | 'union_related';

export interface ParsedCandidateQuery {
  raw_query: string;
  normalized_query: string;
  keywords: string[];
  intended_primary: string[];
  intended_stage: string[];
  intended_disposition: string[];
  must_have_markers: string[];
  penalized_markers: string[];
  query_scenario: QueryScenario;
  explanation: string;
}

export interface SearchDebugBucket {
  top_ids: string[];
}

export interface SearchDebugCandidateBucket extends SearchDebugBucket {
  normalized_query: string;
  scenario: QueryScenario;
  intended_primary: string[];
  intended_stage: string[];
  intended_disposition: string[];
  top_score_reasons: string[];
}

export interface SearchDebugPayload {
  baseline?: SearchDebugBucket;
  candidate?: SearchDebugCandidateBucket;
}
