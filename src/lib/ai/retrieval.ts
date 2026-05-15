import 'server-only'
import { createClient } from '@supabase/supabase-js';
import { bucketDecisionResult } from '@/lib/ai/decision-bucket';
import { rerankResults } from '@/lib/ai/reranker';
import { rewriteQuery } from '@/lib/search/ai-query-rewriter';
import { ALL_TAGS } from '@/lib/tags';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_TIMEOUT_MS = 5000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 42k 판정례 분류에서 검증된 키워드 패턴
const KEYWORD_PATTERNS: [RegExp, string][] = [
  // 비위행위 (구체적→일반 순)
  [/횡령|배임|공금|유용|착복|사금고/, '징계해고'],
  [/횡령|배임|공금|유용|착복/, '해고사유'],
  [/폭언|폭행|욕설|폭력|가혹행위|모욕/, '직장내괴롭힘'],
  [/폭언|폭행|욕설|폭력|가혹/, '징계양정'],
  [/성희롱|성추행|성적.*언동|성폭력/, '성희롱'],
  [/무단결근|결근|지각|조퇴|태만|근무태만|직무유기/, '해고사유'],
  [/무단결근|결근|지각|태만/, '징계양정'],
  [/업무능력|성과.*부족|업무.*부적격|근무.*불량|업무.*미숙/, '해고사유'],
  [/기밀|유출|정보.*유출|영업비밀|보안/, '징계해고'],
  [/음주|음주운전|만취/, '징계해고'],
  [/허위|위조|변조|사문서/, '해고사유'],
  [/반말|고객.*민원|불친절|고객.*불만/, '징계양정'],
  [/개인.*용도|사적.*사용|사적.*이용|회사.*차량/, '해고사유'],
  [/겸직|이중.*취업|부업/, '해고사유'],
  [/지시.*불이행|명령.*불복|업무.*거부|업무.*지시/, '해고사유'],
  [/금품.*수수|뇌물|리베이트/, '징계해고'],

  // 사건유형 — 정리해고/경영상해고 (구체→일반 순으로 우선순위 보장)
  [/정리해고|경영상.*해고|경영상.*필요|매출.*감소|적자.*심화|긴박.*경영|구조조정/, '정리해고'],
  [/회피노력|희망퇴직|배치.*전환|전환배치|임원.*급여.*삭감|급여.*삭감|휴업/, '회피노력'],
  [/공정.*선정|성과평가.*하위|선정.*기준|대상자.*선정/, '대상자선정'],
  [/근로자대표.*협의|성실.*협의|협의.*기간|50일/, '근로자대표협의'],

  // 사건유형 — 갱신기대권 (구체→일반)
  [/4회.*갱신|반복.*갱신|동일.*직무.*채용|후임.*채용|동료.*갱신/, '갱신기대권'],
  [/갱신.*기대|계약.*갱신|기간제|기간.*만료|자동.*종료|계약기간/, '갱신기대권'],

  // 사건유형 — 부당노동행위
  [/부당노동행위|불이익.*취급|지배.*개입|단체.*교섭.*거부|황색계약/, '부당노동행위'],
  [/노조.*가입|노조원.*편중|노조.*활동|노조.*탈퇴|노조.*무력화/, '부당노동행위'],

  // 사건유형 — 일반 (위에 안 잡힌 경우 fallback)
  [/해고|면직|파면|퇴직.*처리/, '부당해고'],
  [/징계|견책|경고|감봉|정직/, '부당징계'],
  [/전보|전직|배치.*전환|발령/, '전보'],
  [/정직/, '정직'],
  [/감봉/, '감봉'],
  [/수습|시용|수습.*해고/, '수습'],
  [/사직|퇴직|퇴사|합의.*퇴직|권고.*사직/, '사직'],

  // 쟁점
  [/절차.*위반|서면.*통지|해고.*통지|통보.*없이/, '절차위반'],
  [/소명.*기회|의견.*진술|변명.*기회|인사위원회/, '소명기회'],
  [/양정|징계.*수위|과중|비례/, '징계양정'],
  [/근로자.*지위|근로자.*여부|근로자성/, '근로자성'],

  // 산업
  [/공공기관|공단|공사|재단|진흥원|공기업|지방자치/, '공공기관'],
  [/병원|의료기관|간호|보건|의료법인/, '의료'],
  [/제조|공장|생산.*라인|생산직/, '제조업'],
  [/금융|은행|보험|증권|캐피탈/, '금융'],
  [/학교|대학|교육|학원|교사|교수/, '교육'],
  [/건설|시공|건축|토목/, '건설업'],
  [/운수|버스|택시|화물|운송/, '운수업'],
  [/호텔|음식|유통|마트|서비스/, '서비스업'],
  [/IT|소프트웨어|정보통신|시스템/, 'IT'],
];

export interface CaseCard {
  id: string;
  title: string;
  decision_result: string;
  holding_points: string;
  url: string;
  similarity?: number;
  summary_short?: string;
  key_issue?: string;
  bucket?: 'worker_win' | 'employer_win' | 'other';
  source?: 'nlrc' | 'court';
}

export interface RetrievalResult {
  tags: string[];
  cases: CaseCard[];
  allCases: Record<string, unknown>[];
  reranked: boolean;
}

interface HybridSearchRow {
  id: string;
  title: string;
  decision_result: string | null;
  holding_summary: string | null;
  summary_short: string | null;
  key_issue: string | null;
  url: string | null;
  reason_category: string[] | null;
  sanction_type: string | null;
  decision_date: string | null;
  relevance: number | null;
}

interface QueryRewriteLike {
  searchQuery: string;
  category: string;
  intent: string;
  keywords: string[];
}

interface CandidateQueryProfile {
  scenario:
    | 'generic'
    | 'absence_procedure'
    | 'regular_work_ability'
    | 'retaliation'
    | 'severity_excessive'
    | 'compound_misconduct'
    | 'wage_dispute'
    | 'contract_termination'
    | 'constructive_dismissal'
    | 'bullying_conflict'
    | 'workplace_safety'
    | 'union_related';
  primaryPool: string[];
  primaryBoosts: Record<string, number>;
  preferredStages: string[];
  penalizedStages: string[];
  preferredSecondary: string[];
  preferredDispositions: string[];
  preferredFactMarkers: string[];
  preferredLegalFocus: string[];
  preferredQueryHints: string[];
  penalizedQueryHints: string[];
  boostedDecisionResults: string[];
  excludedDecisionResults: string[];
  penalizedKeywords: string[];
}

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const [pattern, tag] of KEYWORD_PATTERNS) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }
  if (tags.size < 2) {
    tags.add('부당해고');
    tags.add('징계양정');
  }
  return [...tags].filter((t) => (ALL_TAGS as readonly string[]).includes(t));
}

// 키워드 → 신규 8축 태그 매핑
const KEYWORD_TO_PRIMARY: [RegExp, string][] = [
  [/횡령|배임|공금|유용|착복/, 'misconduct'],
  [/폭언|폭행|욕설|폭력|가혹|모욕/, 'disciplinary_severity'],
  [/성희롱|성추행|성적.*언동/, 'misconduct'],
  [/무단결근|결근|지각|조퇴|태만|근무태만|직무유기/, 'absence_without_leave'],
  [/업무능력|성과.*부족|업무.*부적격|근무.*불량/, 'work_ability'],
  [/직장.*내.*괴롭힘|따돌림/, 'workplace_harassment'],
  [/경영.*해고|정리해고|구조조정|경영.*악화/, 'redundancy'],
  [/수습|시용/, 'dismissal_validity'],
  [/전보|전직|배치.*전환|인사.*발령/, 'transfer_validity'],
  [/갱신.*기대|계약.*만료|기간제/, 'renewal_expectation'],
  [/사직|권고.*사직|합의.*퇴직/, 'dismissal_validity'],
  [/부당노동행위|노조|지배.*개입/, 'unfair_treatment'],
  [/근로자.*지위|근로자성/, 'worker_status'],
  [/차별.*시정|차별적.*처우/, 'discrimination'],
  [/겸직|허위|위조|음주|기밀|유출|지시.*불이행|금품/, 'misconduct'],
  [/징계.*양정|양정.*과다|처분.*과중|비례|해고.*과다|해고.*과하|징계.*과다|징계.*과하|과도.*해고|과도.*징계/, 'disciplinary_severity'],
  [/절차.*위반|서면.*통지|소명.*기회/, 'procedure'],
  [/괴롭힘.*신고.*불이익|보복/, 'retaliation'],
];

const KEYWORD_TO_STAGE: [RegExp, string][] = [
  [/정규직|상용직|기간의\s*정함이\s*없는/, 'regular'],
  [/수습|시용|본채용/, 'probation'],
  [/기간제|계약직|계약기간\s*만료|갱신/, 'fixed_term'],
  [/채용내정|채용\s*전|입사\s*전/, 'pre_hire'],
];

// 키워드 → reason_category (fallback용)
const KEYWORD_TO_REASON: [RegExp, string][] = [
  [/횡령|배임|공금|유용|착복/, 'embezzlement'],
  [/폭언|폭행|욕설|폭력|가혹|모욕/, 'violence'],
  [/성희롱|성추행|성적.*언동/, 'sexual_harassment'],
  [/무단결근|결근|지각|조퇴|태만|근무태만|직무유기/, 'absence'],
  [/업무능력|성과.*부족|업무.*부적격|근무.*불량/, 'incompetence'],
  [/직장.*내.*괴롭힘|따돌림/, 'workplace_bullying'],
  [/경영.*해고|정리해고|구조조정|경영.*악화/, 'redundancy'],
  [/수습|시용/, 'probation'],
  [/전보|전직|배치.*전환|인사.*발령/, 'transfer'],
  [/갱신.*기대|계약.*만료|기간제/, 'contract_expiry'],
  [/사직|권고.*사직|합의.*퇴직/, 'no_dismissal'],
  [/부당노동행위|노조|지배.*개입/, 'union_activity'],
  [/근로자.*지위|근로자성/, 'worker_status'],
  [/차별.*시정|차별적.*처우/, 'discrimination'],
  [/겸직|허위|위조|음주|기밀|유출|지시.*불이행|금품|소명.*기회|절차.*위반/, 'misconduct'],
];

function extractPrimaryTypes(text: string): string[] {
  const types = new Set<string>();
  for (const [pattern, primary] of KEYWORD_TO_PRIMARY) {
    if (pattern.test(text)) types.add(primary);
  }
  return [...types];
}

function extractReasonCategories(text: string): string[] {
  const reasons = new Set<string>();
  for (const [pattern, reason] of KEYWORD_TO_REASON) {
    if (pattern.test(text)) reasons.add(reason);
  }
  return [...reasons];
}

function extractEmploymentStages(text: string): string[] {
  const stages = new Set<string>();
  for (const [pattern, stage] of KEYWORD_TO_STAGE) {
    if (pattern.test(text)) stages.add(stage);
  }
  return [...stages];
}

const DB_CANDIDATE_LIMIT = 60;
const CANDIDATE_LIMIT = 20;
const RESULT_LIMIT = 5;

function detectSource(id: string): 'nlrc' | 'court' {
  return id.startsWith('bc_') ? 'court' : 'nlrc';
}

function isCourt(candidate: Record<string, unknown>): boolean {
  return String(candidate.id || '').startsWith('bc_');
}

const NON_LABOR_CASE_TYPES = ['헌법', '특허', '신청', '형사'];

function selectRepresentativeCases(candidates: Record<string, unknown>[], limit: number): Record<string, unknown>[] {
  if (candidates.length <= limit) return candidates;

  const workerWins = candidates.filter((c) => bucketDecisionResult(String(c.decision_result || '')) === 'worker_win');
  const employerWins = candidates.filter((c) => bucketDecisionResult(String(c.decision_result || '')) === 'employer_win');
  const picked: Record<string, unknown>[] = [];
  const pushUnique = (candidate: Record<string, unknown>) => {
    if (picked.some((item) => item.id === candidate.id)) return;
    picked.push(candidate);
  };

  // source 균형: 노동위 + 법원 혼합 (각 버킷에서 court 우선 1 + nlrc 1)
  const workerCourt = workerWins.find((c) => isCourt(c));
  const workerNlrc = workerWins.find((c) => !isCourt(c));
  if (workerCourt) pushUnique(workerCourt);
  if (workerNlrc) pushUnique(workerNlrc);
  if (picked.length < 2) workerWins.slice(0, 2).forEach(pushUnique);

  const employerCourt = employerWins.find((c) => isCourt(c));
  const employerNlrc = employerWins.find((c) => !isCourt(c));
  if (employerCourt) pushUnique(employerCourt);
  if (employerNlrc) pushUnique(employerNlrc);
  if (picked.length < 4) employerWins.slice(0, 2).forEach(pushUnique);

  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    pushUnique(candidate);
  }

  return picked.slice(0, limit);
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

const embeddingCache = new Map<string, number[]>();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toString()).join(',')}]`;
}

async function createQueryEmbedding(query: string): Promise<number[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cached = embeddingCache.get(trimmed);
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await withTimeout(
      fetch(OPENAI_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_EMBEDDING_MODEL,
          input: trimmed,
        }),
      }),
      EMBEDDING_TIMEOUT_MS,
      'embedding',
    );

    if (!response.ok) {
      throw new Error(`embedding failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) return null;

    embeddingCache.set(trimmed, embedding);
    return embedding;
  } catch {
    return null;
  }
}

function computeKeywordReRankBoost(candidate: Record<string, unknown>, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  const haystack = [
    String(candidate.title || ''),
    String(candidate.holding_summary || ''),
    String(candidate.holding_points || ''),
    String(candidate.summary_short || ''),
    String(candidate.key_issue || ''),
  ]
    .join(' ')
    .toLowerCase();

  const hits = keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  if (hits >= 4) return 0.1;
  if (hits >= 2) return 0.05;
  return 0;
}

function addUniqueTerms(base: string, extraTerms: string[]): string {
  const existing = new Set(
    base
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
  const additions = extraTerms.filter((term) => term && !existing.has(term));
  return [base, ...additions].filter(Boolean).join(' ').trim();
}

function buildIntentAwareQuery(query: string, rewrite: QueryRewriteLike | null): string {
  if (!rewrite) return query;

  const extraTerms = new Set<string>();
  const lowered = query.toLowerCase();
  const intent = rewrite.intent || 'generic';
  const category = rewrite.category || '';

  if (intent === 'retaliation_check') {
    extraTerms.add('불이익');
    extraTerms.add('보복');
    extraTerms.add('신고');
  }

  if (category === 'workplace_bullying' && /(불인정|미인정|미해당|부인)/.test(lowered)) {
    extraTerms.add('괴롭힘 불인정');
    extraTerms.add('괴롭힘 미해당');
  }

  if (category === 'workplace_bullying' && /(갈등|불이익|보복|신고|요구|문제제기)/.test(lowered)) {
    extraTerms.add('신고 후');
    extraTerms.add('갈등');
    extraTerms.add('불이익 취급');
    extraTerms.add('괴롭힘이 아니라는 조사 결과');
    extraTerms.add('분리조치');
    extraTerms.add('접촉금지');
    extraTerms.add('근무장소 변경');
    extraTerms.add('직위해제');
    extraTerms.add('전보');
    extraTerms.add('보직해임');
    extraTerms.add('대기발령');
  }

  if (category === 'contract_expiry' && /(사실상 해고|해고처럼|실질적 해고|갱신거절)/.test(lowered)) {
    extraTerms.add('사실상 해고');
    extraTerms.add('실질적 해고');
    extraTerms.add('갱신거절');
    extraTerms.add('갱신기대권 인정');
    extraTerms.add('부당해고 인정');
    extraTerms.add('부당해고');
  }

  if (intent === 'severity_check') {
    extraTerms.add('양정과다');
    extraTerms.add('과중');
  }

  if (category === 'violence' && intent === 'severity_check') {
    extraTerms.add('징계 과도');
    extraTerms.add('해고 과중');
  }

  if (category === 'incompetence' && /(개선|경고|시정|교육|기회|주고도|부여)/.test(lowered)) {
    extraTerms.add('개선 기회');
    extraTerms.add('경고');
    extraTerms.add('시정');
    extraTerms.add('교육');
    extraTerms.add('개선기회 부여');
  }

  // Q04: 괴롭힘 성립 여부
  if (category === 'workplace_bullying' && /(성립|해당하는지|인정되는지|다툼)/.test(lowered)) {
    extraTerms.add('괴롭힘 성립');
    extraTerms.add('괴롭힘 인정');
    extraTerms.add('괴롭힘 해당');
  }

  // Q12: 징계사유 인정 + 해고 과다
  if (/(사유.{0,5}인정|비위.{0,5}인정|징계사유는)/.test(lowered) && /(과하|과다|과도|과중)/.test(lowered)) {
    extraTerms.add('양정과다');
    extraTerms.add('비례원칙');
    extraTerms.add('해고 과중');
  }

  // Q24: 여러 비위 + 전체 정당성
  if (/(여러|복합|복수|함께).*(비위|사유)/.test(lowered) || /(정당성 전체|전체를 본)/.test(lowered)) {
    extraTerms.add('징계사유');
    extraTerms.add('해고 정당성');
    extraTerms.add('복합 비위');
    extraTerms.add('징계사유가 모두 인정');
    extraTerms.add('양정이 적정');
    extraTerms.add('절차상 하자 없음');
    extraTerms.add('사유 양정 절차');
  }

  if (category === 'incompetence' && /(정규직|무기계약|상용직)/.test(lowered)) {
    extraTerms.add('정규직');
    extraTerms.add('무기계약');
    extraTerms.add('통상해고');
  }

  if (extraTerms.size === 0) return query;
  return addUniqueTerms(query, [...extraTerms]);
}

async function searchCasesViaRpc(query: string, category: string, limit: number): Promise<Record<string, unknown>[]> {
  const embedding = await createQueryEmbedding(query);

  const { data, error } = await supabase.rpc('search_similar_cases_hybrid', {
    query,
    query_embedding: embedding ? toVectorLiteral(embedding) : null,
    category,
    limit,
    semantic_weight: 0.6,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data as Record<string, unknown>[];
}

function buildCandidateQueryProfile(query: string): CandidateQueryProfile {
  const lowered = query.toLowerCase();
  const primaryPool = extractPrimaryTypes(query);
  const stageHints = extractEmploymentStages(query);
  const base: CandidateQueryProfile = {
    scenario: 'generic',
    primaryPool: uniq(primaryPool),
    primaryBoosts: Object.fromEntries(primaryPool.map((primary) => [primary, 10])),
    preferredStages: stageHints,
    penalizedStages: [],
    preferredSecondary: [],
    preferredDispositions: [],
    preferredFactMarkers: [],
    preferredLegalFocus: [],
    preferredQueryHints: [],
    penalizedQueryHints: [],
    boostedDecisionResults: [],
    excludedDecisionResults: [],
    penalizedKeywords: [],
  };

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
    return {
      ...base,
      scenario: 'absence_procedure',
      primaryPool: uniq(['procedure', 'dismissal_validity', 'absence_without_leave']),
      primaryBoosts: {
        procedure: 16,
        dismissal_validity: 10,
        absence_without_leave: 4,
      },
      preferredSecondary: ['procedure', 'absence_without_leave'],
      preferredFactMarkers: ['unauthorized_absence', 'written_notice_missing'],
      preferredLegalFocus: ['procedural_due_process'],
      excludedDecisionResults: ['dismissed', 'settled'],
      penalizedKeywords: ['구제이익', '복직명령', '상시근로자 수', '채용내정'],
    };
  }

  // Q11: 개선기회 부여 후 업무능력 부족 해고
  const hasImprovement = includesAny(lowered, ['개선', '개선기회', '경고', '교육', '시정', '기회를 주고', '주고도']);
  if (hasWorkAbility && hasImprovement) {
    return {
      ...base,
      scenario: 'generic',
      primaryPool: uniq(['work_ability', 'dismissal_validity']),
      primaryBoosts: {
        work_ability: 16,
        dismissal_validity: 8,
      },
      preferredStages: stageHints.length > 0 ? stageHints : ['regular'],
      preferredFactMarkers: ['improvement_opportunity_given', 'warning_given', 'training_provided', 'qualitative_evaluation'],
      preferredLegalFocus: ['just_cause', 'social_norm_reasonableness'],
      preferredDispositions: ['dismissal', 'disciplinary_dismissal'],
      preferredQueryHints: ['개선기회 부여', '개선 기회를 주고', '경고 후 해고', '업무능력 부족 해고', 'PIP'],
      penalizedKeywords: ['수습', '본채용', '시용', '갱신기대권', '계약기간 만료'],
    };
  }

  if (hasRegular && hasWorkAbility) {
    return {
      ...base,
      scenario: 'regular_work_ability',
      primaryPool: uniq(['work_ability', 'dismissal_validity']),
      primaryBoosts: {
        work_ability: 15,
        dismissal_validity: 7,
      },
      preferredStages: ['regular'],
      penalizedStages: stageHints.includes('regular') ? ['probation'] : [],
      preferredFactMarkers: ['qualitative_evaluation', 'quantitative_evaluation', 'warning_given', 'improvement_opportunity_given', 'training_provided'],
      preferredLegalFocus: ['just_cause', 'social_norm_reasonableness'],
      preferredDispositions: ['dismissal', 'disciplinary_dismissal'],
      preferredQueryHints: ['업무능력 부족', '업무능력 부족 해고 부당', '저성과 해고', '저성과자 해고 부당', '통상해고', 'PIP', '개선기회 미부여'],
      penalizedQueryHints: ['본채용 거부', '수습평가', '수습'],
      penalizedKeywords: ['수습', '본채용', '본채용 거부', '시용', '갱신기대권', '갱신 거절', '계약기간 만료', '해고가 존재하지', '사직서를 제출', '복직명령', '근로관계가 종료'],
    };
  }

  // Q04: 괴롭힘 성립 여부 자체가 핵심인 사건
  const hasBullyingNotRecognized = includesAny(lowered, ['인정되지 않', '불인정', '미해당', '인정 안']);
  const hasConflictEscalation = includesAny(lowered, ['갈등', '갈등이 커', '문제제기', '요구']);
  const hasBullyingValidity = includesAny(lowered, ['성립', '해당하는지', '인정되는지', '다툼', '핵심']);
  if (hasHarassment && hasBullyingValidity && !hasRetaliation && !hasSeverity && !hasBullyingNotRecognized && !hasConflictEscalation) {
    return {
      ...base,
      scenario: 'generic',
      primaryPool: uniq(['workplace_harassment']),
      primaryBoosts: {
        workplace_harassment: 16,
      },
      preferredDispositions: ['dismissal', 'disciplinary_dismissal', 'suspension'],
      preferredLegalFocus: ['workplace_harassment_recognition', 'just_cause'],
      preferredSecondary: ['misconduct'],
      preferredQueryHints: ['직장 내 괴롭힘 성립', '괴롭힘 인정', '괴롭힘 해당', '괴롭힘 여부'],
      penalizedQueryHints: ['괴롭힘 신고 보복', '보복 징계'],
      penalizedKeywords: ['보복', '불이익 취급', '노동조합', '근로자성'],
    };
  }

  // Q23: 괴롭힘 불인정이지만 신고/요구로 갈등이 커진 사건
  if (hasHarassment && (hasBullyingNotRecognized || hasConflictEscalation) && !hasRetaliation) {
    return {
      ...base,
      scenario: 'bullying_conflict',
      primaryPool: uniq(['workplace_harassment', 'retaliation', 'unfair_treatment', 'transfer_validity']),
      primaryBoosts: {
        workplace_harassment: 10,
        retaliation: 16,
        unfair_treatment: 14,
        transfer_validity: 8,
      },
      preferredDispositions: ['transfer', 'dismissal', 'disciplinary_dismissal', 'suspension'],
      preferredFactMarkers: ['harassment_report_filed', 'harassment_not_recognized', 'conflict_after_report'],
      preferredLegalFocus: ['protection_against_retaliation', 'procedural_due_process'],
      preferredSecondary: ['workplace_harassment', 'retaliation', 'unfair_treatment'],
      preferredQueryHints: [
        '괴롭힘 불인정',
        '괴롭힘 미해당',
        '괴롭힘 신고 후 전보',
        '괴롭힘 신고 후 갈등',
        '괴롭힘 신고 불이익',
        '신고 후 인사조치',
        '괴롭힘 조사 결과 불인정',
      ],
      penalizedQueryHints: ['괴롭힘 성립', '괴롭힘 인정', '순수 괴롭힘'],
      penalizedKeywords: ['성희롱', '노동조합', '조합원', '경영상 해고'],
    };
  }

  if (hasHarassment && hasRetaliation) {
    return {
      ...base,
      scenario: 'retaliation',
      primaryPool: uniq(['retaliation', 'unfair_treatment', 'workplace_harassment']),
      primaryBoosts: {
        retaliation: 16,
        unfair_treatment: 13,
        workplace_harassment: 3,
      },
      preferredDispositions: ['dismissal', 'disciplinary_dismissal', 'transfer', 'suspension', 'pay_cut', 'reprimand'],
      preferredFactMarkers: ['harassment_report_filed'],
      preferredLegalFocus: ['protection_against_retaliation'],
      preferredSecondary: ['workplace_harassment', 'unfair_treatment'],
      preferredQueryHints: ['괴롭힘 신고 보복', '괴롭힘 신고 후 보복 징계', '괴롭힘 신고 후 불이익', '괴롭힘 관련 전보', '괴롭힘 신고 불이익 해고'],
      preferredStages: stageHints,
      penalizedStages: stageHints.includes('regular') ? ['probation'] : [],
      penalizedQueryHints: ['직장 내 괴롭힘 성립', '직장 내 괴롭힘 성립 요건', '순수 직장내 괴롭힘 성립 사건'],
      penalizedKeywords: ['2차 가해', '성희롱', '쟁의행위', '노동조합', '조합원', '전보의 업무상 필요성', '징계양정이 적정', '징계절차에도 하자가 없어', '감수할 수 있는 정도', '협의절차를 거쳐'],
    };
  }

  // Q12: 징계사유 인정 + 해고 과다 (범용 양정과다, violence 외 포함)
  const hasDisciplineRecognized = includesAny(lowered, ['사유는 인정', '사유 인정', '비위는 인정', '징계사유는']);
  if (hasSeverity && hasDismissal && hasDisciplineRecognized) {
    return {
      ...base,
      scenario: 'severity_excessive',
      primaryPool: uniq(['disciplinary_severity', 'misconduct', 'work_ability']),
      primaryBoosts: {
        disciplinary_severity: 16,
        misconduct: 8,
        work_ability: 4,
      },
      preferredDispositions: ['dismissal', 'disciplinary_dismissal'],
      preferredLegalFocus: ['proportionality', 'appropriateness_of_discipline', 'social_norm_reasonableness'],
      preferredSecondary: ['misconduct'],
      boostedDecisionResults: ['granted', 'partial', 'overturned'],
      excludedDecisionResults: [],
      preferredQueryHints: ['양정과다', '해고 과중', '징계 과다', '비례원칙', '징계사유 인정 해고 부당'],
      penalizedKeywords: ['구제이익', '채용내정', '상시근로자 수', '복직명령', '계약기간 만료'],
    };
  }

  const hasCompoundMisconduct =
    includesAny(lowered, ['여러 비위', '복합 비위', '복수 비위', '여러 사유', '복수 사유']) ||
    includesAny(lowered, ['정당성 전체', '전체를 본', '종합 판단', '종합적으로']) ||
    (includesAny(lowered, ['징계사유']) && includesAny(lowered, ['양정', '절차', '정당성']));
  if (hasCompoundMisconduct && hasDismissal) {
    return {
      ...base,
      scenario: 'compound_misconduct',
      primaryPool: uniq(['misconduct', 'disciplinary_severity', 'dismissal_validity']),
      primaryBoosts: {
        misconduct: 14,
        disciplinary_severity: 9,
        dismissal_validity: 8,
      },
      preferredDispositions: ['dismissal', 'disciplinary_dismissal'],
      preferredLegalFocus: ['just_cause', 'appropriateness_of_discipline', 'procedural_due_process'],
      preferredSecondary: ['misconduct', 'disciplinary_severity'],
      preferredFactMarkers: ['multiple_misconduct_counts', 'discipline_hearing_held'],
      preferredQueryHints: [
        '징계사유가 모두 인정',
        '해고 정당성',
        '사유 양정 절차',
        '양정이 적정',
        '절차에도 하자가 없어',
      ],
      boostedDecisionResults: ['dismissed', 'upheld'],
      excludedDecisionResults: [],
      penalizedKeywords: ['양정과다', '과중', '비례원칙', '해고가 과도'],
    };
  }

  if (hasSeverity && hasDismissal) {
    return {
      ...base,
      scenario: 'severity_excessive',
      primaryPool: uniq(['disciplinary_severity', 'misconduct']),
      primaryBoosts: {
        disciplinary_severity: 16,
        misconduct: 5,
      },
      preferredDispositions: ['dismissal', 'disciplinary_dismissal', 'suspension', 'pay_cut'],
      preferredLegalFocus: ['proportionality', 'appropriateness_of_discipline'],
      preferredSecondary: ['misconduct'],
      boostedDecisionResults: ['granted', 'partial', 'overturned'],
      excludedDecisionResults: ['dismissed', 'settled'],
      penalizedKeywords: ['구제이익', '채용내정', '상시근로자 수', '복직명령', '계약기간 만료'],
    };
  }

  if (hasWage) {
    return {
      ...base,
      scenario: 'wage_dispute',
      preferredQueryHints: ['임금', '체불', '퇴직금', '통상임금', '수당', '최저임금'],
      preferredLegalFocus: ['wage_payment', 'ordinary_wage'],
      penalizedKeywords: ['노동조합 일반론', '직장 내 괴롭힘'],
    };
  }

  // Q16: 계약만료인데 사실상 해고처럼 다퉈진 사건
  const hasDefactoDismissal = includesAny(lowered, ['사실상 해고', '해고처럼', '실질적 해고', '해고로 다', '해고로 봐']);
  if (hasContract && hasDefactoDismissal) {
    return {
      ...base,
      scenario: 'constructive_dismissal',
      primaryPool: uniq(['renewal_expectation', 'dismissal_validity']),
      primaryBoosts: {
        renewal_expectation: 16,
        dismissal_validity: 10,
      },
      preferredStages: uniq([...stageHints, 'fixed_term']),
      preferredLegalFocus: ['renewal_expectation', 'just_cause', 'termination_notice'],
      preferredDispositions: ['nonrenewal', 'dismissal'],
      preferredFactMarkers: ['renewal_expectation_recognized', 'repeated_renewal'],
      preferredQueryHints: ['갱신기대권 인정', '사실상 해고', '갱신거절 부당', '부당해고 인정', '계약기간 만료 부당해고'],
      boostedDecisionResults: ['granted', 'partial'],
      excludedDecisionResults: [],
      penalizedKeywords: ['권고사직', '자진퇴사', '근로자성'],
      penalizedQueryHints: ['갱신기대권 부정', '계약기간 만료 정당'],
    };
  }

  if (hasContract) {
    return {
      ...base,
      scenario: 'contract_termination',
      preferredQueryHints: ['계약만료', '갱신거절', '갱신기대권', '기간제', '계약직'],
      preferredLegalFocus: ['renewal_expectation', 'termination_notice'],
      preferredStages: uniq([...stageHints, 'fixed_term']),
      penalizedKeywords: ['권고사직', '자진퇴사'],
    };
  }

  if (hasSafety) {
    return {
      ...base,
      scenario: 'workplace_safety',
      preferredQueryHints: ['산재', '산업재해', '업무상 재해', '안전보건'],
      preferredLegalFocus: ['industrial_accident', 'work_relatedness', 'safety_obligation'],
      penalizedKeywords: ['단순 교통사고', '형사처벌 일반론'],
    };
  }

  if (hasUnion) {
    return {
      ...base,
      scenario: 'union_related',
      preferredQueryHints: ['노동조합', '노조', '단체교섭', '쟁의행위', '부당노동행위', '파업'],
      preferredLegalFocus: ['union_activity', 'collective_bargaining', 'unfair_labor_practice'],
      penalizedKeywords: ['임금체불', '개인 사직'],
    };
  }

  return base;
}

function scoreTaggedCandidate(candidate: Record<string, unknown>, query: string, profile: CandidateQueryProfile): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const primary = (candidate.issue_type_primary as string) || '';
  const secondary = asStringArray(candidate.issue_type_secondary);
  const dispositions = asStringArray(candidate.disposition_type);
  const factMarkers = asStringArray(candidate.fact_markers);
  const legalFocus = asStringArray(candidate.legal_focus);
  const exclusions = asStringArray(candidate.exclusion_flags);
  const includeQueries = asStringArray(candidate.include_for_queries);
  const excludeQueries = asStringArray(candidate.exclude_for_queries);
  const stage = (candidate.employment_stage as string) || '';
  const decisionResult = (candidate.decision_result as string) || '';
  const haystack = [
    candidate.title,
    candidate.summary_short,
    candidate.holding_points,
    candidate.retrieval_note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const queryHintsText = [...includeQueries, ...excludeQueries].join(' ').toLowerCase();

  const primaryBoost = profile.primaryBoosts[primary];
  if (primaryBoost) {
    score += primaryBoost;
    reasons.push(`primary:${primary}`);
  }

  const secondaryHits = profile.preferredSecondary.filter((item) => secondary.includes(item));
  if (secondaryHits.length > 0) {
    score += secondaryHits.length * 4;
    reasons.push(`secondary:${secondaryHits.join(',')}`);
  }

  const dispositionHits = profile.preferredDispositions.filter((item) => dispositions.includes(item));
  if (dispositionHits.length > 0) {
    score += dispositionHits.length * 4;
    reasons.push(`disposition:${dispositionHits.join(',')}`);
  }

  const factHits = profile.preferredFactMarkers.filter((item) => factMarkers.includes(item));
  if (factHits.length > 0) {
    score += factHits.length * 5;
    reasons.push(`fact:${factHits.join(',')}`);
  }

  const focusHits = profile.preferredLegalFocus.filter((item) => legalFocus.includes(item));
  if (focusHits.length > 0) {
    score += focusHits.length * 6;
    reasons.push(`focus:${focusHits.join(',')}`);
  }

  const hintHits = profile.preferredQueryHints.filter((item) => queryHintsText.includes(item.toLowerCase()));
  if (hintHits.length > 0) {
    score += hintHits.length * 6;
    reasons.push(`hint:${hintHits.join(',')}`);
  }

  const hintPenalties = profile.penalizedQueryHints.filter((item) => queryHintsText.includes(item.toLowerCase()));
  if (hintPenalties.length > 0) {
    score -= hintPenalties.length * 6;
    reasons.push(`hint_penalty:${hintPenalties.join(',')}`);
  }

  // 후보 판례의 exclude_for_queries가 사용자 쿼리와 매칭되면 큰 감점
  const excludeHits = excludeQueries.filter((item) => query.toLowerCase().includes(item.toLowerCase()));
  if (excludeHits.length > 0) {
    score -= excludeHits.length * 15;
    reasons.push(`exclude_query:${excludeHits.join(',')}`);
  }

  if (profile.preferredStages.includes(stage)) {
    score += 7;
    reasons.push(`stage:${stage}`);
  }

  if (profile.penalizedStages.includes(stage)) {
    score -= 9;
    reasons.push(`stage_penalty:${stage}`);
  }

  if (profile.boostedDecisionResults.includes(decisionResult)) {
    score += 4;
    reasons.push(`result_boost:${decisionResult}`);
  }

  if (query.includes('결근') && exclusions.includes('not_really_absence_case')) {
    score -= 10;
    reasons.push('exclude:not_really_absence_case');
  }
  if (query.includes('괴롭힘') && exclusions.includes('not_really_harassment_case')) {
    score -= 10;
    reasons.push('exclude:not_really_harassment_case');
  }

  for (const keyword of profile.penalizedKeywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score -= 6;
      reasons.push(`keyword_penalty:${keyword}`);
    }
  }

  const queryTokens = query.split(/\s+/).filter((token) => token.length >= 2);
  const textHits = queryTokens.filter((token) => haystack.includes(token.toLowerCase())).length;
  if (textHits > 0) {
    score += Math.min(textHits, 4);
    reasons.push(`text:${textHits}`);
  }

  // 핵심 키워드 직접 매칭 보너스 — 동일 판례 반복 출현 방지
  // query의 핵심 명사가 holding_points에 직접 포함되면 큰 보너스
  const CORE_KEYWORDS: [RegExp, number][] = [
    [/횡령|배임|공금|착복|유용/, 12],
    [/성희롱|성추행|성적\s*언동/, 12],
    [/폭언|폭행|욕설|폭력|가혹/, 12],
    [/무단결근|결근|근무태만/, 10],
    [/수습|시용|본채용/, 10],
    [/저성과|업무능력\s*부족|업무\s*부적격/, 10],
    [/괴롭힘|따돌림/, 10],
    [/경영.*해고|정리해고|구조조정/, 10],
    [/전보|배치.*전환|인사.*발령/, 8],
    [/갱신.*기대|계약.*만료/, 8],
  ];
  for (const [pattern, bonus] of CORE_KEYWORDS) {
    if (pattern.test(query) && pattern.test(String(candidate.holding_points || ''))) {
      score += bonus;
      reasons.push(`core_keyword:+${bonus}`);
      break; // 첫 매칭만
    }
  }

  // reason_category 일치 보너스
  const candidateReasons = asStringArray(candidate.reason_category);
  const queryReasons = extractReasonCategories(query);
  const reasonHits = queryReasons.filter(r => candidateReasons.includes(r)).length;
  if (reasonHits > 0) {
    score += reasonHits * 8;
    reasons.push(`reason_match:${reasonHits}`);
  }

  if (profile.scenario === 'absence_procedure') {
    const hasProcedureEvidence = primary === 'procedure' || secondary.includes('procedure') || legalFocus.includes('procedural_due_process');
    const hasAbsenceEvidence = primary === 'absence_without_leave' || secondary.includes('absence_without_leave') || factMarkers.includes('unauthorized_absence');
    if (hasProcedureEvidence && hasAbsenceEvidence) {
      score += 7;
      reasons.push('cross:absence+procedure');
    } else if (primary === 'absence_without_leave') {
      score -= 6;
      reasons.push('cross_penalty:absence_only');
    }
  }

  if (profile.scenario === 'regular_work_ability') {
    if (primary === 'work_ability' && stage === 'regular') {
      score += 7;
      reasons.push('cross:regular_work_ability');
    }
    if (legalFocus.includes('just_cause') && factMarkers.includes('improvement_opportunity_given')) {
      score += 5;
      reasons.push('cross:improvement_path');
    }
    if (!dispositions.includes('dismissal') && !dispositions.includes('disciplinary_dismissal')) {
      score -= 8;
      reasons.push('cross_penalty:not_dismissal');
    }
    if (dispositions.includes('rejection_of_regular_employment') || dispositions.includes('nonrenewal')) {
      score -= 12;
      reasons.push('cross_penalty:probation_or_nonrenewal');
    }
    if (stage === 'probation') {
      score -= 12;
      reasons.push('cross_penalty:probation_mix');
    }
    if (haystack.includes('해고가 존재하지') || haystack.includes('사직서를 제출') || haystack.includes('복직명령')) {
      score -= 10;
      reasons.push('cross_penalty:no_dismissal_noise');
    }
  }

  if (profile.scenario === 'retaliation') {
    const hasRetaliationStructure =
      primary === 'retaliation' ||
      primary === 'unfair_treatment' ||
      legalFocus.includes('protection_against_retaliation') ||
      factMarkers.includes('harassment_report_filed');
    if (hasRetaliationStructure) {
      score += 7;
      reasons.push('cross:retaliation_structure');
    }
    if (primary === 'workplace_harassment' && !hasRetaliationStructure) {
      score -= 7;
      reasons.push('cross_penalty:harassment_only');
    }
    if (primary === 'transfer_validity' && !factMarkers.includes('harassment_report_filed')) {
      score -= 9;
      reasons.push('cross_penalty:transfer_general_theory');
    }
    if (primary === 'misconduct' && !hasRetaliationStructure) {
      score -= 8;
      reasons.push('cross_penalty:misconduct_general_theory');
    }
    if (decisionResult === 'dismissed' && primary !== 'workplace_harassment') {
      score -= 8;
      reasons.push('cross_penalty:dismissed_general_theory');
    }
  }

  if (profile.scenario === 'severity_excessive') {
    const hasSeverityStructure =
      primary === 'disciplinary_severity' &&
      (legalFocus.includes('proportionality') || legalFocus.includes('appropriateness_of_discipline'));
    if (hasSeverityStructure) {
      score += 8;
      reasons.push('cross:severity_proportionality');
    }
    if (decisionResult === 'dismissed' || decisionResult === 'rejected') {
      score -= 4;
      reasons.push('cross_penalty:non_excessive_outcome');
    }
  }

  if (profile.scenario === 'wage_dispute') {
    if (includesAny(haystack, ['임금', '체불', '퇴직금', '통상임금', '수당', '최저임금'])) {
      score += 6;
      reasons.push('cross:wage_terms');
    }
  }

  if (profile.scenario === 'contract_termination') {
    if (includesAny(haystack, ['계약만료', '갱신거절', '갱신기대권', '기간제', '계약직'])) {
      score += 6;
      reasons.push('cross:contract_terms');
    }
  }

  if (profile.scenario === 'compound_misconduct') {
    const hasMultipleReasons = candidateReasons.length >= 3 || factMarkers.includes('multiple_misconduct_counts');
    const hasOverallValidityStructure =
      includesAny(haystack, ['징계사유가 모두 인정', '징계사유가 존재하고', '복수의 징계사유']) &&
      includesAny(haystack, ['양정이 적정', '양정이 과하지 않', '양정이 과도하지 않']) &&
      includesAny(haystack, ['절차에도 하자가 없', '징계절차도 적법', '절차상 하자도 없']);

    if (hasMultipleReasons) {
      score += 10;
      reasons.push('cross:compound_multiple_reasons');
    }
    if (hasOverallValidityStructure) {
      score += 12;
      reasons.push('cross:compound_overall_validity');
    }
    if (decisionResult === 'dismissed' || decisionResult === 'upheld') {
      score += 6;
      reasons.push('cross:compound_employer_win');
    }
    if (includesAny(haystack, ['양정과다', '과중', '비례원칙']) && !hasOverallValidityStructure) {
      score -= 10;
      reasons.push('cross_penalty:severity_only_case');
    }
  }

  // Q16: 사실상 해고 — 갱신기대권 인정 + granted 사건 우선
  if (profile.scenario === 'constructive_dismissal') {
    const hasRenewalRecognized = includesAny(haystack, ['갱신기대권이 인정', '갱신기대권은 인정', '갱신기대권 인정']);
    const hasRenewalDenied = includesAny(haystack, ['갱신기대권이 인정되지', '갱신기대권이 인정되지 않', '갱신기대권은 인정되지 않', '갱신기대권이 부정', '갱신기대권이 부인']);
    const hasDefacto = includesAny(haystack, ['사실상 해고', '부당해고', '실질적 해고', '갱신거절이 부당']);

    if (hasRenewalRecognized && !hasRenewalDenied) {
      score += 12;
      reasons.push('cross:renewal_recognized');
    }
    if (hasRenewalDenied && !hasRenewalRecognized) {
      score -= 8;
      reasons.push('cross_penalty:renewal_denied');
    }
    if (hasDefacto) {
      score += 6;
      reasons.push('cross:defacto_dismissal');
    }
    if (decisionResult === 'granted' || decisionResult === 'partial') {
      score += 10;
      reasons.push('cross:worker_win_renewal');
    }
    if (decisionResult === 'dismissed') {
      score -= 4;
      reasons.push('cross_penalty:dismissed_renewal');
    }
  }

  // Q23: 괴롭힘 불인정 + 갈등/불이익 사건
  if (profile.scenario === 'bullying_conflict') {
    const hasBullyingNotRecognized = includesAny(haystack, ['괴롭힘이 아니', '괴롭힘 불인정', '괴롭힘에 해당하지', '괴롭힘으로 인정되지', '괴롭힘으로 볼 수 없']);
    const hasReportFiled = includesAny(haystack, ['괴롭힘 신고', '신고에 따', '신고를 한', '신고하였']);
    const hasConflict = includesAny(haystack, ['갈등', '분쟁', '대립', '불이익', '전보', '직위해제', '보직해임', '접촉금지', '분리조치']);
    const hasPostReportAction = hasReportFiled && hasConflict;
    const hasNegativeInvestigation = includesAny(haystack, ['괴롭힘이 아니라는 조사 결과', '괴롭힘이 아니라는', '조사 결과 괴롭힘이 아니', '괴롭힘에 해당하지 않는다는 조사 결과']);

    if (hasBullyingNotRecognized && hasPostReportAction) {
      score += 15;
      reasons.push('cross:bullying_denied_conflict');
    } else if (hasBullyingNotRecognized) {
      score += 8;
      reasons.push('cross:bullying_denied');
    } else if (hasPostReportAction) {
      score += 6;
      reasons.push('cross:post_report_conflict');
    }
    if (hasNegativeInvestigation) {
      score += 8;
      reasons.push('cross:negative_investigation_result');
    }

    // 괴롭힘이 인정된 사건은 Q23 취지와 다름
    const hasBullyingRecognized = includesAny(haystack, ['괴롭힘이 인정', '괴롭힘 행위가 인정', '괴롭힘에 해당']);
    if (hasBullyingRecognized && !hasBullyingNotRecognized) {
      score -= 14;
      reasons.push('cross_penalty:bullying_recognized');
    }
    if (decisionResult === 'dismissed' && hasPostReportAction) {
      score += 4;
      reasons.push('cross:dismissed_post_report');
    }
  }

  if (profile.scenario === 'workplace_safety') {
    if (includesAny(haystack, ['산재', '산업재해', '업무상 재해', '안전보건'])) {
      score += 6;
      reasons.push('cross:safety_terms');
    }
  }

  if (profile.scenario === 'union_related') {
    if (includesAny(haystack, ['노동조합', '노조', '단체교섭', '쟁의행위', '부당노동행위', '파업'])) {
      score += 6;
      reasons.push('cross:union_terms');
    }
  }

  return { score, reasons };
}

function rankTaggedCandidates(query: string, taggedCases: Record<string, unknown>[]): Record<string, unknown>[] {
  const profile = buildCandidateQueryProfile(query);

  const filtered = taggedCases.filter((candidate) => {
    const exclusions = asStringArray(candidate.exclusion_flags);
    const decisionResult = (candidate.decision_result as string) || '';
    if (query.includes('결근') && exclusions.includes('not_really_absence_case')) return false;
    if (query.includes('괴롭힘') && exclusions.includes('not_really_harassment_case') && profile.scenario !== 'retaliation') return false;
    if (query.includes('수습') && exclusions.includes('unrelated_to_probation')) return false;
    if (profile.excludedDecisionResults.includes(decisionResult)) return false;
    return true;
  });

  const scored = filtered.map((candidate) => {
    const { score, reasons } = scoreTaggedCandidate(candidate, query, profile);
    return { ...candidate, _score: score, _score_reasons: reasons };
  });

  scored.sort((a, b) => {
    const scoreDiff = ((b as Record<string, unknown>)._score as number || 0) - ((a as Record<string, unknown>)._score as number || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aDecision = ((a as Record<string, unknown>).decision_result as string) || '';
    const bDecision = ((b as Record<string, unknown>).decision_result as string) || '';
    if (aDecision !== bDecision) return aDecision.localeCompare(bDecision);
    return (((a as Record<string, unknown>).id as string) || '').localeCompare(((b as Record<string, unknown>).id as string) || '');
  });

  return scored;
}

export async function searchCases(tags: string[], query?: string): Promise<RetrievalResult> {
  let candidates: Record<string, unknown>[] = [];
  let reranked = false;

  const rewrite = query ? await rewriteQuery(query) : null;
  const effectiveQuery = buildIntentAwareQuery(rewrite?.searchQuery || query || tags.join(' '), rewrite);
  const reasons = effectiveQuery ? extractReasonCategories(effectiveQuery) : [];
  const rpcCategory = rewrite?.category || (reasons.length > 0 ? reasons[0] : '');

  if (effectiveQuery) {
    const rpcRows = await searchCasesViaRpc(effectiveQuery, rpcCategory, RESULT_LIMIT * 4);
    if (rpcRows.length > 0) {
      const rpcCandidates = rpcRows.map((row) => {
        const record = row as unknown as HybridSearchRow;
        return {
          id: record.id,
          title: record.title,
          decision_result: record.decision_result || '',
          holding_points: record.holding_summary || record.summary_short || record.key_issue || '',
          holding_summary: record.holding_summary || '',
          summary_short: record.summary_short || '',
          key_issue: record.key_issue || '',
          url: record.url || '',
          reason_category: record.reason_category || [],
          sanction_type: record.sanction_type || '',
          decision_date: record.decision_date || '',
          relevance: Number(record.relevance || 0),
          _score: Number(record.relevance || 0),
        } satisfies Record<string, unknown>;
      });

      const keywordBoostedRpc: Record<string, unknown>[] = rankTaggedCandidates(effectiveQuery, rpcCandidates).map((candidate) => ({
        ...candidate,
        _score: Number(candidate._score || 0) + computeKeywordReRankBoost(candidate, rewrite?.keywords || []),
      }));

      keywordBoostedRpc.sort((a, b) => {
        const scoreDiff = Number(b._score || 0) - Number(a._score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return String(b.decision_date || '').localeCompare(String(a.decision_date || ''));
      });

      const aiReranked = await rerankResults(
        query || effectiveQuery,
        keywordBoostedRpc.slice(0, RESULT_LIMIT * 4).map((candidate) => ({
          id: String(candidate.id || ''),
          title: String(candidate.title || ''),
          key_issue: String(candidate.key_issue || ''),
          holding_summary: String(candidate.holding_summary || ''),
          holding_points: String(candidate.holding_points || ''),
          decision_result: String(candidate.decision_result || ''),
          source: detectSource(String(candidate.id || '')),
        })),
        RESULT_LIMIT,
      );

      if (aiReranked.length > 0) {
        const rankById = new Map(aiReranked.map((item) => [item.id, item]));
        const aiCandidateRows: Record<string, unknown>[] = keywordBoostedRpc.map((candidate) => ({
            ...candidate,
            _ai_score: rankById.get(String(candidate.id || ''))?.relevanceScore ?? -1,
            _ai_reason: rankById.get(String(candidate.id || ''))?.reasoning ?? '',
          }));
        aiCandidateRows.sort((a, b) => {
          const aiDiff = Number(b._ai_score || -1) - Number(a._ai_score || -1);
          if (aiDiff !== 0) return aiDiff;
          const scoreDiff = Number(b._score || 0) - Number(a._score || 0);
          if (scoreDiff !== 0) return scoreDiff;
          return String(b.decision_date || '').localeCompare(String(a.decision_date || ''));
        });
        const aiSortedCandidates: Record<string, unknown>[] = aiCandidateRows;
        candidates = aiSortedCandidates;
        reranked = true;
      } else {
        candidates = keywordBoostedRpc;
        reranked = true;
      }
    }
  }

  const profile = effectiveQuery ? buildCandidateQueryProfile(effectiveQuery) : null;
  const primaryTypes = profile?.primaryPool || [];
  const TAGGED_SELECT = 'id, title, decision_result, holding_points, summary_short, key_issue, retrieval_note, tags, url, employment_stage, issue_type_primary, issue_type_secondary, disposition_type, fact_markers, legal_focus, industry_context, exclusion_flags, include_for_queries, exclude_for_queries, reason_category';

  if (candidates.length < 3 && primaryTypes.length > 0 && reasons.length > 0) {
    const { data: precisionCases } = await supabase
      .from('nlrc_decisions')
      .select(TAGGED_SELECT)
      .in('issue_type_primary', primaryTypes)
      .overlaps('reason_category', reasons)
      .not('holding_points', 'is', null)
      .limit(DB_CANDIDATE_LIMIT);

    if (precisionCases && precisionCases.length > 0) {
      candidates = effectiveQuery ? rankTaggedCandidates(effectiveQuery, precisionCases) : precisionCases;
    }
  }

  if (candidates.length < 3 && primaryTypes.length > 0) {
    const existingIds = new Set(candidates.map((c) => c.id));
    const { data: taggedCases } = await supabase
      .from('nlrc_decisions')
      .select(TAGGED_SELECT)
      .in('issue_type_primary', primaryTypes)
      .not('holding_points', 'is', null)
      .limit(DB_CANDIDATE_LIMIT);

    if (taggedCases && taggedCases.length > 0) {
      const newCases = taggedCases.filter((c) => !existingIds.has(c.id));
      const allCases = [...candidates, ...newCases];
      candidates = effectiveQuery ? rankTaggedCandidates(effectiveQuery, allCases) : allCases;
    }
  }

  if (candidates.length < 3 && reasons.length > 0) {
    const { data: reasonCases } = await supabase
      .from('nlrc_decisions')
      .select('id, title, decision_result, holding_points, summary_short, key_issue, tags, url, reason_category')
      .overlaps('reason_category', reasons)
      .not('holding_points', 'is', null)
      .limit(CANDIDATE_LIMIT);
    candidates = reasonCases || [];
  }

  if (candidates.length < 3) {
    const { data: tagCases } = await supabase
      .from('nlrc_decisions')
      .select('id, title, decision_result, holding_points, summary_short, key_issue, tags, url')
      .overlaps('tags', tags)
      .not('holding_points', 'is', null)
      .limit(CANDIDATE_LIMIT);

    if (tagCases && tagCases.length > 0) {
      const existingIds = new Set(candidates.map((c) => c.id));
      const fallbackCases = tagCases.filter((c) => !existingIds.has(c.id));
      candidates = [...candidates, ...fallbackCases];
    }
  }

  candidates = candidates.filter((c) => {
    const caseType = (c.case_type as string) || '';
    return !NON_LABOR_CASE_TYPES.includes(caseType);
  });

  const results = reranked ? candidates.slice(0, RESULT_LIMIT * 3) : selectRepresentativeCases(candidates, RESULT_LIMIT);

  return {
    tags,
    cases: results.map((c) => ({
      id: c.id as string,
      title: c.title as string,
      decision_result: c.decision_result as string,
      holding_points: ((c.holding_points as string) || (c.holding_summary as string) || '').slice(0, 150),
      url: (c.url as string) || '',
      similarity: (c._score as number | undefined) ?? (c.relevance as number | undefined),
      summary_short: ((c.summary_short as string) || (c.holding_summary as string) || '').slice(0, 180),
      key_issue: (c.key_issue as string) || '',
      bucket: bucketDecisionResult(c.decision_result as string),
      source: detectSource(c.id as string),
    })),
    allCases: candidates,
    reranked,
  };
}
