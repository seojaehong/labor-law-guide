import { createClient } from '@supabase/supabase-js';
import { extractTags, searchCases } from '@/lib/ai/retrieval';
import { asReasonCategory, rewriteQuery } from '@/lib/search/ai-query-rewriter';
import { normalizeQuery } from '@/lib/search/normalize-query';
import { parseCandidateQuery } from '@/lib/search/query-parser';
import type {
  MolabInterpretation,
  SearchBucket,
  SearchCard,
  SearchDebugBucket,
  SearchDebugCandidateBucket,
  SearchRequestOptions,
  SearchResponsePayload,
} from '@/lib/search/types';
import type { ReasonCategory } from '@/lib/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type CandidateMetaRow = Record<string, unknown>;
const IS_DEV = process.env.NODE_ENV === 'development';

const COMPARE_BUCKET_SIZE = 5;
const BASELINE_PAGE_SIZE = 20;
const CANDIDATE_PAGE_SIZE = 5;
const COMBINED_QUERY_FETCH_SIZE = 80;

const REASON_TO_QUERY: Record<string, string> = {
  sexual_harassment: '성희롱',
  workplace_bullying: '직장내괴롭힘',
  violence: '폭행 폭언',
  absence: '무단결근',
  embezzlement: '횡령 배임',
  incompetence: '업무능력 부족',
  misconduct: '비위행위',
  redundancy: '경영상 해고',
  probation: '수습 본채용',
  transfer: '전보 인사발령',
  contract_expiry: '갱신기대권 계약만료',
  no_dismissal: '해고부존재 사직',
  union_activity: '부당노동행위',
  worker_status: '근로자성',
  discrimination: '차별시정',
};

const REASON_TO_LAWGO_KEYWORDS: Record<string, string[]> = {
  absence: ['부당해고', '취업규칙', '해고부존재'],
  workplace_bullying: ['직장내괴롭힘', '성희롱', '폭언/폭행'],
  sexual_harassment: ['성희롱', '직장내괴롭힘'],
  violence: ['폭언/폭행', '비위행위'],
  embezzlement: ['횡령/배임', '비위행위'],
  incompetence: ['부당해고', '전보/인사이동'],
  misconduct: ['비위행위', '부당해고', '취업규칙'],
  redundancy: ['경영상해고', '부당해고'],
  probation: ['수습', '본채용거부', '부당해고'],
  transfer: ['전보/인사이동', '취업규칙'],
  contract_expiry: ['갱신기대권', '기간제', '부당해고'],
  no_dismissal: ['해고부존재', '부당해고'],
  union_activity: ['노동조합', '부당노동행위', '단체교섭', '단체협약', '조합활동', '쟁의행위'],
  worker_status: ['근로자성', '파견', '도급'],
  discrimination: ['남녀고용평등', '근로조건'],
};

const REASON_TEXT_GUARDS: Partial<Record<ReasonCategory, string[]>> = {
  absence: [
    '무단결근',
    '무단 이탈',
    '연락 두절',
    '근태 불량',
    '지각',
    '결근',
    '출근하지',
  ],
  workplace_bullying: [
    '직장내괴롭힘',
    '괴롭힘',
    '괴롭힘 행위',
    '따돌림',
    '신고 후',
    '분리조치',
    '접촉금지',
  ],
  sexual_harassment: [
    '성희롱',
    '성추행',
    '성적 언동',
    '성폭력',
  ],
  violence: [
    '폭행',
    '폭언',
    '욕설',
    '협박',
    '모욕',
    '가혹행위',
  ],
  embezzlement: [
    '횡령',
    '배임',
    '공금 유용',
    '착복',
    '부정 수령',
    '금전 비위',
  ],
  incompetence: [
    '업무능력 부족',
    '저성과',
    '근무성적 불량',
    '부적격',
    '실적 최하위',
    '개선 기회',
    '개선기회',
    '경고',
    '시정',
    '교육',
    '본채용 거부',
    '능력 부족',
    '업무수행 능력',
  ],
  // browse/list guard is intentionally narrower than payload v3:
  // keep only core probation markers, and leave contract_expiry/no_dismissal conflicts to payload review.
  probation: [
    '수습',
    '시용',
    '시용근로자',
    '수습근로자',
    '본채용 거부',
    '수습기간',
    '수습 평가',
    '시용 평가',
    '업무 적격성',
  ],
  redundancy: [
    '경영상 해고',
    '정리해고',
    '구조조정',
    '경영 악화',
    '인원 감축',
    '사업 폐지',
  ],
  transfer: [
    '전보',
    '인사발령',
    '배치전환',
    '대기발령',
    '전직명령',
    '보직 변경',
  ],
  // browse/list guard is intentionally narrower than payload v3:
  // special misconducts like violence/embezzlement/harassment are filtered in payload scoring, not broadened here.
  misconduct: [
    '비위행위',
    '복무규정 위반',
    '취업규칙 위반',
    '인사규정 위반',
    '복종의무 위반',
    '업무 지시 불이행',
    '허위 보고',
    '허위 기재',
    '허위 작성',
    '무단결근',
    '무단외출',
    '겸직',
    // v4: plain '징계사유' is too broad for browse/list and leaked harassment/violence cases.
  ],
  contract_expiry: [
    '갱신기대권',
    '계약만료',
    '기간제',
    '계약 갱신',
    '재계약',
    '근로계약 기간',
  ],
  no_dismissal: [
    '해고가 존재하지',
    '해고부존재',
    '권고사직',
    '사직서',
    '자발적 사직',
    '합의 퇴직',
    '합의해지',
    '해고로 볼 수 없',
    '당연퇴직',
    '사직의 의사',
    '근로관계 종료',
  ],
  union_activity: [
    '부당노동행위',
    '노동조합',
    '지배개입',
    '불이익취급',
    '조합활동',
    '단체교섭',
    '단체협약',
  ],
  worker_status: [
    '근로자성',
    '근로자에 해당',
    '근로기준법상 근로자',
    '당사자적격',
    '종속적 관계',
    '종속관계',
    '사용종속관계',
    '계약의 형식',
    '도급계약인지',
    '고용계약인지',
    '실질에 있어',
    '임금을 목적으로',
    '지휘감독',
    '출퇴근',
    '사업소득세',
    '4대보험',
    '독자적 사업',
    '업무수행 과정',
  ],
  discrimination: [
    '차별시정',
    '차별적 처우',
    '비교 대상 근로자',
    '동일가치노동',
    '남녀고용평등',
  ],
};

function getReasonTextGuards(reason: ReasonCategory | ''): string[] | null {
  if (!reason) return null;
  return REASON_TEXT_GUARDS[reason] || null;
}

function matchesReason(reasonCategory: string[] | null | undefined, reason: ReasonCategory | ''): boolean {
  if (!reason) return true;
  return (reasonCategory || []).includes(reason);
}

function buildReasonGuardOr(reason: ReasonCategory | ''): string | null {
  const markers = getReasonTextGuards(reason);
  if (!markers || markers.length === 0) return null;

  const clauses: string[] = [];
  for (const marker of markers) {
    const escaped = escapeIlike(marker);
    clauses.push(`title.ilike.%${escaped}%`);
    clauses.push(`key_issue.ilike.%${escaped}%`);
    clauses.push(`holding_summary.ilike.%${escaped}%`);
    clauses.push(`holding_points.ilike.%${escaped}%`);
  }

  return Array.from(new Set(clauses)).join(',');
}

function matchesReasonTextGuard(
  item: Pick<SearchCard, 'title' | 'key_issue' | 'holding_summary' | 'holding_points'>,
  reason: ReasonCategory | ''
): boolean {
  const markers = getReasonTextGuards(reason);
  if (!markers || markers.length === 0) return true;

  const haystack = [item.title, item.key_issue, item.holding_summary, item.holding_points]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return markers.some((marker: string) => haystack.includes(marker.toLowerCase()));
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, ' ').trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  const baseTokens = normalized.keywords.length > 0 ? normalized.keywords : query.split(/\s+/);
  return Array.from(new Set(baseTokens.map((token) => token.trim()).filter((token) => token.length > 0)));
}

function normalizeDateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return 0;
  const numeric = Number(digits);
  return Number.isFinite(numeric) ? numeric : 0;
}

function computeFieldScore(field: string | null | undefined, tokens: string[], weight: number): number {
  const haystack = String(field || '').toLowerCase();
  if (!haystack) return 0;
  let score = 0;
  for (const token of tokens) {
    const needle = token.toLowerCase();
    if (!needle) continue;
    if (haystack.includes(needle)) {
      score += weight;
    }
  }
  return score;
}

function computeKeywordArrayScore(keywords: string[] | null | undefined, query: string): number {
  if (!keywords || keywords.length === 0) return 0;
  const tokens = tokenizeQuery(query).map((token) => token.toLowerCase());
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  let score = 0;

  for (const token of tokens) {
    if (normalizedKeywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
      score += 4;
    }
  }

  return score;
}

function deriveReasonKeywordHints(query: string): string[] {
  const lowered = query.toLowerCase();
  return Array.from(
    new Set(
      Object.entries(REASON_TO_LAWGO_KEYWORDS)
        .filter(([reason, keywords]) => lowered.includes(reason) || keywords.some((keyword) => lowered.includes(keyword.toLowerCase())))
        .flatMap(([, keywords]) => keywords)
    )
  );
}

function scoreSearchCard(item: SearchCard, tokens: string[], keywordHints: string[]): number {
  const query = tokens.join(' ');
  return (
    computeFieldScore(item.title, tokens, 5) +
    computeFieldScore(item.holding_summary, tokens, 3) +
    computeFieldScore(item.key_issue, tokens, 3) +
    computeFieldScore(item.holding_points, tokens, 2) +
    computeKeywordArrayScore(item.reason_category, query) +
    computeKeywordArrayScore(item.reason_category, keywordHints.join(' '))
  );
}

function mergeAndRankSearchCards(items: SearchCard[], query: string, page: number, pageSize: number): SearchBucket {
  const tokens = tokenizeQuery(query);
  const keywordHints = deriveReasonKeywordHints(query);
  const ranked = items
    .map((item) => ({
      item,
      relevance: scoreSearchCard(item, tokens, keywordHints),
      dateValue: normalizeDateValue(item.decision_date),
    }))
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
      return a.item.id.localeCompare(b.item.id);
    });

  const deduped: SearchCard[] = [];
  const seen = new Set<string>();
  const seenDuplicateGroups = new Set<string>();
  for (const entry of ranked) {
    if (seen.has(entry.item.id)) continue;
    if (entry.item.duplicate_group_id && seenDuplicateGroups.has(entry.item.duplicate_group_id)) {
      continue;
    }
    seen.add(entry.item.id);
    if (entry.item.duplicate_group_id) {
      seenDuplicateGroups.add(entry.item.duplicate_group_id);
    }
    deduped.push(entry.item);
  }

  return {
    items: deduped.slice(page * pageSize, (page + 1) * pageSize),
    total: deduped.length,
    page,
    pageSize,
  };
}

function buildBaselineSelect(page: number, pageSize: number) {
  return supabase
    .from('nlrc_decisions')
    .select(
      'id, title, case_number, department, decision_date, decision_result, key_issue, holding_summary, holding_points, summary_short, url, reason_category, legal_focus, disposition_type, fact_markers, confidence_level, tier, tier_subcategory',
      { count: 'planned' }
    )
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .order('decision_date', { ascending: false });
}

function buildLawgoSelect(limit: number) {
  return supabase
    .from('lawgo_precedents')
    .select(
      'id, api_id, title, reference_number, decision_date, court, judgment_type, issue_text, summary_text, reference_statutes, reference_cases, source_url, keywords_matched, bigcase_case_id',
      { count: 'planned' }
    )
    .limit(limit)
    .order('decision_date', { ascending: false, nullsFirst: false });
}

function buildBigcaseSelect(limit: number) {
  return supabase
    .from('cases')
    .select(
      'id, title, case_number, court, decision_date, verdict_type, summary, holding_points, keywords_matched, url',
      { count: 'planned' }
    )
    .limit(limit)
    .order('decision_date', { ascending: false, nullsFirst: false });
}

async function runLawgoSearch(query: string, limit = 8, reason: string = ''): Promise<SearchBucket> {
  let q = buildLawgoSelect(limit);

  if (reason && REASON_TO_LAWGO_KEYWORDS[reason]) {
    q = q.overlaps('keywords_matched', REASON_TO_LAWGO_KEYWORDS[reason]);
  }

  if (query) {
    const escaped = escapeIlike(query);
    q = q.or(
      [
        `title.ilike.%${escaped}%`,
        `issue_text.ilike.%${escaped}%`,
        `summary_text.ilike.%${escaped}%`,
        `reference_statutes.ilike.%${escaped}%`,
        `reference_cases.ilike.%${escaped}%`,
        `reference_number.ilike.%${escaped}%`,
      ].join(',')
    );
  }

  const { data, count, error } = await q;
  if (error) throw error;

  const items: SearchCard[] = (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    case_number: row.reference_number || '',
    department: row.court || null,
    decision_date: row.decision_date || null,
      decision_result: row.judgment_type || '판례',
      key_issue: row.issue_text || null,
      holding_summary: row.summary_text || null,
      holding_points: row.summary_text || null,
      url: row.source_url || null,
      reason_category: row.keywords_matched || [],
      source_provider: 'lawgo',
      duplicate_group_id: row.bigcase_case_id || null,
    }));

  return {
    items,
    total: count || 0,
    page: 0,
    pageSize: limit,
  };
}

async function runBigcaseSearch(query: string, limit = 8): Promise<SearchBucket> {
  let q = buildBigcaseSelect(limit);
  if (query) {
    const escaped = escapeIlike(query);
    q = q.or(
      [
        `title.ilike.%${escaped}%`,
        `summary.ilike.%${escaped}%`,
        `holding_points.ilike.%${escaped}%`,
        `case_number.ilike.%${escaped}%`,
      ].join(',')
    );
  }

  const { data, count, error } = await q;
  if (error) throw error;

  const items: SearchCard[] = (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    case_number: row.case_number || '',
    department: row.court || null,
    decision_date: row.decision_date || null,
    decision_result: row.verdict_type || '판결',
    key_issue: row.summary || null,
    holding_summary: row.summary || null,
    holding_points: row.holding_points || null,
    url: row.url || null,
    reason_category: row.keywords_matched || [],
    source_provider: 'bigcase',
    duplicate_group_id: row.id,
  }));

  return {
    items,
    total: count || 0,
    page: 0,
    pageSize: limit,
  };
}

async function runMolabSearch(
  query: string,
  limit = 5,
  reason: string = ''
): Promise<MolabInterpretation[]> {
  const escaped = escapeIlike(query);

  // 1순위: reason_category → keywords_matched 매칭
  if (reason && REASON_TO_LAWGO_KEYWORDS[reason]) {
    const keywords = REASON_TO_LAWGO_KEYWORDS[reason];
    const { data } = await supabase
      .from('molab_interpretations')
      .select('id, title, case_number, decision_date, inquiry_summary, answer_summary, keywords_matched')
      .overlaps('keywords_matched', keywords)
      .order('decision_date', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (data && data.length > 0) return data as MolabInterpretation[];
  }

  // 2순위: 텍스트 검색
  if (escaped) {
    const { data } = await supabase
      .from('molab_interpretations')
      .select('id, title, case_number, decision_date, inquiry_summary, answer_summary, keywords_matched')
      .or(`title.ilike.%${escaped}%,inquiry_summary.ilike.%${escaped}%,answer_summary.ilike.%${escaped}%`)
      .order('decision_date', { ascending: false, nullsFirst: false })
      .limit(limit);

    return (data || []) as MolabInterpretation[];
  }

  return [];
}

async function runBaselineSearch({
  query,
  reason = '',
  result = '',
  page = 0,
  pageSize = BASELINE_PAGE_SIZE,
}: SearchRequestOptions): Promise<SearchBucket> {
  const rewritten = query ? await rewriteQuery(query) : null;
  const effectiveQuery = rewritten?.searchQuery || query;
  const effectiveReason = reason || asReasonCategory(rewritten?.category);

  if (effectiveQuery && !effectiveReason && !result) {
    const escaped = escapeIlike(effectiveQuery);
    const normalized = normalizeQuery(effectiveQuery);
    const searchTerms =
      normalized.keywords.length > 0 ? normalized.keywords.slice(0, 4).join(' & ') : effectiveQuery.split(' ').join(' & ');

    let nlrcQuery = supabase
      .from('nlrc_decisions')
      .select(
        'id, title, case_number, department, decision_date, decision_result, key_issue, holding_summary, holding_points, summary_short, url, reason_category, legal_focus, disposition_type, fact_markers, confidence_level, tier, tier_subcategory',
        { count: 'planned' }
      )
      .limit(COMBINED_QUERY_FETCH_SIZE)
      .order('decision_date', { ascending: false });

    nlrcQuery = nlrcQuery.textSearch('search_tsv', searchTerms);

    // ⚡ 병렬화 (#43): nlrc / bigcase / lawgo 동시 실행 → 11.5s → ~4s
    const [nlrcRespInitial, bigcaseBucket, lawgoBucket] = await Promise.all([
      nlrcQuery,
      runBigcaseSearch(effectiveQuery, COMBINED_QUERY_FETCH_SIZE),
      runLawgoSearch(effectiveQuery, COMBINED_QUERY_FETCH_SIZE),
    ]);

    let nlrcResp = nlrcRespInitial;
    if (nlrcResp.error || (nlrcResp.count || 0) === 0) {
      // FTS 0건 fallback — count는 'planned' (지연 적은 estimate)
      nlrcResp = await supabase
        .from('nlrc_decisions')
        .select(
          'id, title, case_number, department, decision_date, decision_result, key_issue, holding_summary, holding_points, summary_short, url, reason_category, legal_focus, disposition_type, fact_markers, confidence_level, tier, tier_subcategory',
          { count: 'planned' }
        )
        .or(`title.ilike.%${escaped}%,key_issue.ilike.%${escaped}%,holding_points.ilike.%${escaped}%,holding_summary.ilike.%${escaped}%`)
        .limit(COMBINED_QUERY_FETCH_SIZE)
        .order('decision_date', { ascending: false });
    }

    if (nlrcResp.error) throw nlrcResp.error;

    const nlrcItems: SearchCard[] = (nlrcResp.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      case_number: row.case_number || '',
      department: row.department,
      decision_date: row.decision_date,
      decision_result: row.decision_result,
      key_issue: row.key_issue,
      holding_summary: row.holding_summary || null,
      holding_points: row.holding_points || null,
      summary_short: row.summary_short || null,
      url: row.url,
      reason_category: row.reason_category || [],
      source_provider: 'nlrc',
      legal_focus: row.legal_focus || null,
      disposition_type: row.disposition_type || null,
      fact_markers: row.fact_markers || null,
      confidence_level: row.confidence_level || null,
      tier: row.tier || null,
      tier_subcategory: row.tier_subcategory || null,
    }));

    const merged = mergeAndRankSearchCards([...nlrcItems, ...bigcaseBucket.items, ...lawgoBucket.items], effectiveQuery, page, pageSize);

    return {
      ...merged,
      total: Math.max(merged.total, (nlrcResp.count || 0) + (bigcaseBucket.total || 0) + (lawgoBucket.total || 0)),
    };
  }

  let q = buildBaselineSelect(page, pageSize);
  if (effectiveReason) q = q.contains('reason_category', [effectiveReason]);
  if (result) q = q.eq('decision_result', result);
  if (!effectiveQuery && effectiveReason) {
    const guard = buildReasonGuardOr(effectiveReason);
    if (guard) {
      q = q.or(guard);
    }
  }
  if (effectiveQuery) {
    const normalized = normalizeQuery(effectiveQuery);
    const searchTerms =
      normalized.keywords.length > 0 ? normalized.keywords.slice(0, 4).join(' & ') : effectiveQuery.split(' ').join(' & ');
    q = q.textSearch('search_tsv', searchTerms);
  }

  let { data, count, error } = await q;

  if (error || (effectiveQuery && (count || 0) === 0)) {
    let fallback = buildBaselineSelect(page, pageSize);
    if (effectiveReason) fallback = fallback.contains('reason_category', [effectiveReason]);
    if (result) fallback = fallback.eq('decision_result', result);
    if (!effectiveQuery && effectiveReason) {
      const guard = buildReasonGuardOr(effectiveReason);
      if (guard) {
        fallback = fallback.or(guard);
      }
    }
    if (effectiveQuery) {
      fallback = fallback.or(`title.ilike.%${effectiveQuery}%,key_issue.ilike.%${effectiveQuery}%,holding_points.ilike.%${effectiveQuery}%`);
    }
    const fallbackResp = await fallback;
    data = fallbackResp.data;
    count = fallbackResp.count;
    error = fallbackResp.error;
  }

  // 2차 fallback — reason 필터가 너무 strict해서 0건이면 reason 없이 텍스트만 매칭
  if (!error && effectiveQuery && (count || 0) === 0 && effectiveReason) {
    let textOnly = buildBaselineSelect(page, pageSize);
    if (result) textOnly = textOnly.eq('decision_result', result);
    textOnly = textOnly.or(`title.ilike.%${effectiveQuery}%,key_issue.ilike.%${effectiveQuery}%,holding_points.ilike.%${effectiveQuery}%`);
    const textResp = await textOnly;
    if (!textResp.error && (textResp.data?.length || 0) > 0) {
      data = textResp.data;
      count = textResp.count;
    }
  }

  if (error) throw error;

  const items: SearchCard[] = (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    case_number: row.case_number || '',
    department: row.department,
    decision_date: row.decision_date,
    decision_result: row.decision_result,
    key_issue: row.key_issue,
    holding_summary: row.holding_summary || null,
    holding_points: row.holding_points || null,
    summary_short: row.summary_short || null,
    url: row.url,
    reason_category: row.reason_category || [],
    source_provider: 'nlrc' as const,
  })).filter((item) => matchesReasonTextGuard(item, effectiveReason));

  return {
    items,
    total: count || 0,
    page,
    pageSize,
  };
}

async function hydrateCandidateRows(rows: CandidateMetaRow[]): Promise<SearchCard[]> {
  const ids = rows.map((row) => String(row.id));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('nlrc_decisions')
    .select('id, title, case_number, department, decision_date, decision_result, key_issue, holding_summary, holding_points, summary_short, url, reason_category')
    .in('id', ids);

  if (error) throw error;

  const baseById = new Map((data || []).map((row) => [row.id, row]));

  return rows.map((row) => {
    const base = baseById.get(String(row.id));
    return {
      id: String(row.id),
      title: base?.title || String(row.title || ''),
      case_number: base?.case_number || '',
      department: base?.department || null,
      decision_date: base?.decision_date || null,
      decision_result: base?.decision_result || String(row.decision_result || ''),
      key_issue: base?.key_issue || null,
      holding_summary: base?.holding_summary || null,
      holding_points: base?.holding_points || null,
      summary_short: base?.summary_short || null,
      url: base?.url || null,
      reason_category: base?.reason_category || [],
    };
  });
}

async function runCandidateRecall(query: string, reason: ReasonCategory | ''): Promise<CandidateMetaRow[]> {
  const effectiveQuery = query.trim() || (reason ? REASON_TO_QUERY[reason] || reason : '');
  const parsed = await parseCandidateQuery(effectiveQuery);
  const tags = extractTags(parsed.normalized_query || effectiveQuery);
  const retrieval = await searchCases(tags, effectiveQuery);
  return retrieval.allCases;
}

function toDebugBucket(items: SearchCard[]): SearchDebugBucket {
  return {
    top_ids: items.slice(0, 5).map((item) => item.id),
  };
}

function toCandidateDebugBucket(
  items: SearchCard[],
  parsed: Awaited<ReturnType<typeof parseCandidateQuery>>,
  rows: CandidateMetaRow[]
): SearchDebugCandidateBucket {
  return {
    ...toDebugBucket(items),
    normalized_query: parsed.normalized_query,
    scenario: parsed.query_scenario,
    intended_primary: parsed.intended_primary,
    intended_stage: parsed.intended_stage,
    intended_disposition: parsed.intended_disposition,
    top_score_reasons: rows
      .slice(0, 3)
      .flatMap((row) => (Array.isArray(row._score_reasons) ? row._score_reasons.slice(0, 2) : []))
      .map((value) => String(value)),
  };
}

function runCandidatePrecision(
  rows: SearchCard[],
  {
    result = '',
    reason = '',
    page = 0,
    pageSize = CANDIDATE_PAGE_SIZE,
  }: Pick<SearchRequestOptions, 'reason' | 'result' | 'page' | 'pageSize'>
): SearchBucket {
  const filtered = rows.filter((item) => {
    if (result && item.decision_result !== result) return false;
    if (!matchesReason(item.reason_category, reason)) return false;
    return true;
  });

  const total = filtered.length;
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return {
    items: paged,
    total,
    page,
    pageSize,
  };
}

async function runCandidateSearch({
  query,
  reason = '',
  result = '',
  page = 0,
  pageSize = CANDIDATE_PAGE_SIZE,
}: SearchRequestOptions): Promise<SearchBucket> {
  if (!query.trim() && !reason && !result) {
    return { items: [], total: 0, page, pageSize };
  }

  const recalled = await runCandidateRecall(query, reason);
  const hydrated = await hydrateCandidateRows(recalled);
  return runCandidatePrecision(hydrated, { reason, result, page, pageSize });
}

async function runCandidateSearchWithDebug(
  options: SearchRequestOptions,
  parsedCandidateQuery: Awaited<ReturnType<typeof parseCandidateQuery>> | null
): Promise<{ bucket: SearchBucket; debug?: SearchDebugCandidateBucket }> {
  const recalled = await runCandidateRecall(options.query, options.reason || '');
  const hydrated = await hydrateCandidateRows(recalled);
  const bucket = runCandidatePrecision(hydrated, {
    reason: options.reason || '',
    result: options.result || '',
    page: options.page ?? 0,
    pageSize: options.pageSize ?? CANDIDATE_PAGE_SIZE,
  });

  if (!IS_DEV || !parsedCandidateQuery) {
    return { bucket };
  }

  return {
    bucket,
    debug: toCandidateDebugBucket(bucket.items, parsedCandidateQuery, recalled),
  };
}

async function runCompareSearch(options: SearchRequestOptions): Promise<Pick<SearchResponsePayload, 'baseline' | 'candidate' | 'baselineError' | 'candidateError'>> {
  const compareState: Pick<SearchResponsePayload, 'baseline' | 'candidate' | 'baselineError' | 'candidateError'> = {};

  try {
    compareState.baseline = await runBaselineSearch({ ...options, page: options.page ?? 0, pageSize: COMPARE_BUCKET_SIZE });
  } catch (error) {
    compareState.baseline = { items: [], total: 0, page: options.page ?? 0, pageSize: COMPARE_BUCKET_SIZE };
    compareState.baselineError = error instanceof Error ? error.message : 'baseline search failed';
  }

  try {
    compareState.candidate = await runCandidateSearch({ ...options, page: 0, pageSize: COMPARE_BUCKET_SIZE });
  } catch (error) {
    compareState.candidate = { items: [], total: 0, page: 0, pageSize: COMPARE_BUCKET_SIZE };
    compareState.candidateError = error instanceof Error ? error.message : 'candidate search failed';
  }

  return compareState;
}

export async function runSearch(options: SearchRequestOptions): Promise<SearchResponsePayload> {
  const page = options.page ?? 0;
  const rewritten = options.query.trim() ? await rewriteQuery(options.query) : null;
  const effectiveReason = options.reason || asReasonCategory(rewritten?.category);
  const effectiveQuery = rewritten?.searchQuery || options.query.trim() || (effectiveReason ? REASON_TO_QUERY[effectiveReason] || effectiveReason : '');
  const parsedCandidateQuery = options.mode !== 'baseline' && effectiveQuery
    ? await parseCandidateQuery(effectiveQuery)
    : null;

  const payload: SearchResponsePayload = {
    mode: options.mode,
    query: options.query,
    reason: options.reason || '',
    result: options.result || '',
    baseline: options.mode === 'candidate' ? undefined : { items: [], total: 0, page, pageSize: options.mode === 'compare' ? COMPARE_BUCKET_SIZE : BASELINE_PAGE_SIZE },
    candidate: options.mode === 'baseline' ? undefined : { items: [], total: 0, page: 0, pageSize: CANDIDATE_PAGE_SIZE },
  };

  if (options.mode === 'baseline') {
    try {
      payload.baseline = await runBaselineSearch({ ...options, page, pageSize: BASELINE_PAGE_SIZE });
      if (IS_DEV && payload.baseline) {
        payload.debug = {
          baseline: toDebugBucket(payload.baseline.items),
        };
      }
    } catch (error) {
      payload.baselineError = error instanceof Error ? error.message : 'baseline search failed';
    }
    try {
      payload.molab = await runMolabSearch(effectiveQuery, 5, options.reason || '');
      if (!options.reason && effectiveReason && payload.baseline) {
        payload.reason = effectiveReason;
      }
    } catch {
      // 행정해석 검색 실패 시 무시 (핵심 기능 아님)
    }
    return payload;
  }

  if (options.mode === 'candidate') {
    try {
      const candidateState = await runCandidateSearchWithDebug(
        { ...options, page: 0, pageSize: CANDIDATE_PAGE_SIZE },
        parsedCandidateQuery
      );
      payload.candidate = candidateState.bucket;
      if (IS_DEV && payload.candidate && parsedCandidateQuery) {
        payload.debug = {
          candidate: candidateState.debug,
        };
      }
    } catch (error) {
      payload.candidateError = error instanceof Error ? error.message : 'candidate search failed';
    }
    try {
      payload.molab = await runMolabSearch(effectiveQuery, 5, effectiveReason || '');
    } catch {
      // 행정해석 검색 실패 시 무시
    }
    return payload;
  }

  const compareState = await runCompareSearch(options);
  const compareCandidateDebug =
    IS_DEV && parsedCandidateQuery && compareState.candidate
      ? toCandidateDebugBucket(compareState.candidate.items, parsedCandidateQuery, await runCandidateRecall(options.query, options.reason || ''))
      : undefined;
  const debug = IS_DEV
    ? {
        baseline: compareState.baseline ? toDebugBucket(compareState.baseline.items) : undefined,
        candidate: compareCandidateDebug,
      }
    : undefined;
  let molab: MolabInterpretation[] | undefined;
  try {
    molab = await runMolabSearch(effectiveQuery, 5, effectiveReason || '');
  } catch {
    // 행정해석 검색 실패 시 무시
  }
  return {
    ...payload,
    ...compareState,
    molab,
    debug,
  };
}
