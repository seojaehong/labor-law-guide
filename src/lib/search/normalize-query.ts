/**
 * 질의 정규화 (Query Normalizer)
 *
 * 자연어 검색 질의를 구조화된 검색 파라미터로 변환.
 * "징계사유 인정 해고 과다" → { primary: disciplinary_severity, intent: severity_check }
 */

export interface NormalizedQuery {
  // 원본 질의
  raw: string;
  // 정규화된 핵심 키워드 (검색용)
  keywords: string[];
  // 추출된 검색 의도
  intent: QueryIntent;
  // 매핑된 primary 후보
  primaryCandidates: string[];
  // 매핑된 employment_stage
  stageCandidates: string[];
  // 매핑된 disposition
  dispositionCandidates: string[];
  // exclusion 힌트
  exclusionHints: string[];
  // 정규화 설명 (디버그용)
  explanation: string;
}

export type QueryIntent =
  | 'severity_check'      // 양정 과다 여부
  | 'validity_check'      // 해고 정당성
  | 'procedure_check'     // 절차 위반
  | 'case_search'         // 판정례 검색
  | 'retaliation_check'   // 보복/불이익
  | 'comparison'          // 비교 (vs)
  | 'general';            // 일반

// 의도 감지 패턴 (우선순위 순)
const INTENT_PATTERNS: [RegExp, QueryIntent, string[]][] = [
  // 양정 과다
  [/과다|과하|과도|너무.*과|수위.*과|양정.*부당|해고.*과|징계.*과/, 'severity_check', ['disciplinary_severity']],
  // 절차 위반
  [/절차.*위반|서면.*통지|서면통지|소명.*기회|인사위원회.*미|통지.*없|통지.*안/, 'procedure_check', ['procedure']],
  // 보복/불이익
  [/보복|불이익.*조치|신고.*후|신고자|2차.*가해/, 'retaliation_check', ['retaliation', 'unfair_treatment']],
  // 비교
  [/vs|비교|차이|구분/, 'comparison', []],
  // 정당성 확인
  [/정당|부당|유효|무효|적법|위법/, 'validity_check', ['dismissal_validity']],
  // 판정례 검색
  [/찾아|검색|사례|판정례|판례/, 'case_search', []],
];

// 주제 키워드 → primary 매핑 (자연어 포함)
const TOPIC_TO_PRIMARY: [RegExp, string][] = [
  // 징계양정
  [/징계.*사유.*인정.*과|사유.*인정.*양정|비위.*인정.*과|사유는.*맞.*과/, 'disciplinary_severity'],
  [/양정|징계.*수위|처분.*과중|비례.*원칙|과잉.*금지/, 'disciplinary_severity'],
  [/해고.*과다|해고.*과하|징계.*과다|징계.*과하|과도.*해고|과도.*징계/, 'disciplinary_severity'],

  // 무단결근
  [/무단결근|무단.*이탈|출근.*불량|결근.*반복|근태.*불량/, 'absence_without_leave'],
  [/결근/, 'absence_without_leave'],

  // 괴롭힘
  [/직장.*내.*괴롭힘|괴롭힘.*성립|괴롭힘.*인정|괴롭힘.*여부/, 'workplace_harassment'],
  [/괴롭힘/, 'workplace_harassment'],

  // 수습
  [/수습.*해고|본채용.*거부|시용.*해고|수습.*거부/, 'dismissal_validity'],
  [/수습|시용|본채용/, 'dismissal_validity'],

  // 업무능력
  [/업무.*능력.*부족|저성과|성과.*부족|성과.*미달|실적.*부진/, 'work_ability'],
  [/업무능력|근무.*불량|업무.*부적격/, 'work_ability'],

  // 전보
  [/전보|대기발령|배치.*전환|인사.*발령|보직.*변경/, 'transfer_validity'],

  // 갱신기대권
  [/갱신.*기대|계약.*만료|기간제.*만료|재계약/, 'renewal_expectation'],

  // 근로자성
  [/근로자성|근로자.*여부|근로자.*해당|당사자.*적격/, 'worker_status'],

  // 비위/misconduct
  [/횡령|배임|착복|공금|유용/, 'misconduct'],
  [/폭행|폭언|욕설|폭력/, 'misconduct'],
  [/성희롱|성추행|성적.*언동/, 'misconduct'],

  // 절차
  [/절차.*위반|서면.*통지|소명.*기회/, 'procedure'],

  // 보복
  [/보복|불이익|신고.*후/, 'retaliation'],

  // 경영해고
  [/경영.*해고|정리해고|구조조정/, 'redundancy'],

  // 차별
  [/차별.*시정|차별적.*처우/, 'discrimination'],
];

// employment_stage 감지
const STAGE_PATTERNS: [RegExp, string][] = [
  [/정규직|상용직|기간.*정함.*없/, 'regular'],
  [/수습|시용|본채용/, 'probation'],
  [/기간제|계약직|계약.*만료/, 'fixed_term'],
  [/채용.*내정|입사.*전/, 'pre_hire'],
];

// disposition 감지
const DISPOSITION_PATTERNS: [RegExp, string][] = [
  [/해고|면직|파면/, 'dismissal'],
  [/징계.*해고/, 'disciplinary_dismissal'],
  [/정직/, 'suspension'],
  [/감봉/, 'pay_cut'],
  [/경고|견책/, 'reprimand'],
  [/강등/, 'demotion'],
  [/전보|전직/, 'transfer'],
  [/본채용.*거부/, 'rejection_of_regular_employment'],
];

// 불용어 제거
const STOPWORDS = new Set([
  '을', '를', '이', '가', '은', '는', '의', '에', '에서', '로', '으로',
  '한', '된', '되는', '하는', '있는', '없는', '대한', '위한', '따른',
  '및', '또는', '그리고', '하지만', '그런데', '때문에',
  '것', '수', '등', '중', '후', '전', '시', '때',
  '좀', '줘', '해줘', '찾아줘', '알려줘', '보여줘',
  '판정례', '판례', '사례', '사건', '경우',
]);

function extractKeywords(text: string): string[] {
  const tokens = text
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const text = raw.trim();
  if (!text) {
    return {
      raw,
      keywords: [],
      intent: 'general',
      primaryCandidates: [],
      stageCandidates: [],
      dispositionCandidates: [],
      exclusionHints: [],
      explanation: '빈 질의',
    };
  }

  // 1. 의도 감지
  let intent: QueryIntent = 'general';
  let intentPrimaries: string[] = [];
  for (const [pattern, detectedIntent, primaries] of INTENT_PATTERNS) {
    if (pattern.test(text)) {
      intent = detectedIntent;
      intentPrimaries = primaries;
      break;
    }
  }

  // 2. 주제 → primary 매핑
  const topicPrimaries = new Set<string>();
  for (const [pattern, primary] of TOPIC_TO_PRIMARY) {
    if (pattern.test(text)) {
      topicPrimaries.add(primary);
    }
  }

  // 의도에서 나온 primary와 주제에서 나온 primary 합치기
  const primaryCandidates = [...new Set([...intentPrimaries, ...topicPrimaries])];

  // 3. stage 감지
  const stageCandidates: string[] = [];
  for (const [pattern, stage] of STAGE_PATTERNS) {
    if (pattern.test(text)) stageCandidates.push(stage);
  }

  // 4. disposition 감지
  const dispositionCandidates: string[] = [];
  for (const [pattern, disp] of DISPOSITION_PATTERNS) {
    if (pattern.test(text)) dispositionCandidates.push(disp);
  }

  // 5. exclusion 힌트
  const exclusionHints: string[] = [];
  if (text.includes('결근') && intent !== 'procedure_check') {
    exclusionHints.push('not_really_absence_case');
  }
  if (text.includes('괴롭힘') && intent !== 'retaliation_check') {
    exclusionHints.push('not_really_harassment_case');
  }
  if (stageCandidates.includes('regular')) {
    exclusionHints.push('unrelated_to_probation');
  }

  // 6. 키워드 추출
  const keywords = extractKeywords(text);

  // 7. 설명 생성
  const parts: string[] = [];
  parts.push(`의도: ${intent}`);
  if (primaryCandidates.length) parts.push(`primary: ${primaryCandidates.join(',')}`);
  if (stageCandidates.length) parts.push(`stage: ${stageCandidates.join(',')}`);
  if (dispositionCandidates.length) parts.push(`disposition: ${dispositionCandidates.join(',')}`);

  return {
    raw,
    keywords,
    intent,
    primaryCandidates,
    stageCandidates,
    dispositionCandidates,
    exclusionHints,
    explanation: parts.join(' | '),
  };
}
