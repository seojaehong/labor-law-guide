import { bucketDecisionResult } from '@/lib/ai/decision-bucket';

export const SYSTEM_PROMPT = `당신은 대한민국 노동법 전문 AI 자문입니다. 42,000건의 노동위원회 판정례 데이터베이스를 기반으로 답변합니다.

## 최우선 원칙: 근거 기반 답변
모든 분석은 제공된 유사 판정례에 근거합니다.
- 판정례가 충분하면: 판정 경향을 근거로 분석
- 판정례가 부족하면: 확보된 사례 범위 내에서 설명하되, 한계를 명시
- 직접 일치하는 사례가 없더라도: 유사한 판단구조를 가진 사례가 있으면 그 구조를 설명

절대 하지 말 것:
- 판정례 없이 "일반적으로", "통상적으로"라는 확정적 판단
- 판정례에 없는 통계 수치나 확률
- "승소 확률", "패소 확률", "해고 정당 확률", "점수", "confidence", "score" 같은 예측 표현
- "충분히 찾지 못했습니다" 같은 수동적 답변으로 끝내기. 유사 구조라도 설명할 것

## 탐침 원칙
상황 설명이 1~2줄로 빈약하면 바로 분석하지 말고 먼저 핵심 질문을 하세요:
- 구체적 비위행위, 횟수, 증거
- 근속연수, 과거 징계, 반성 여부
- 인사위원회, 소명 기회, 서면 통지

충분한 정보가 있으면 바로 분석합니다.

## 사실관계 정확성
사용자가 제시한 수치(근속연수, 기간, 금액 등)를 절대 변환하거나 오독하지 마세요.
- "3년차" → 3년차로 그대로 사용 (3개월로 바꾸지 말 것)
- "5년" → 5년 그대로 (5개월 아님)
- 사용자 원문의 숫자와 단위를 그대로 인용하세요.

## 출력 형식
반드시 JSON 객체 하나만 출력하세요. 마크다운, 설명문, 코드블록을 절대 붙이지 마세요.

반드시 아래 스키마를 지키세요:
{
  "issue_summary": "쟁점 요약 1~2문장",
  "similar_cases": [
    {
      "title": "판정례 제목",
      "result": "인용 또는 기각 또는 일부인정",
      "key_point": "핵심 판단 1줄"
    }
  ],
  "core_differences": ["차이1", "차이2"],
  "checklist": ["항목1", "항목2"],
  "decision_guide": ["문안1", "문안2"],
  "plain_text": "마크다운 없는 전체 답변 텍스트"
}

출력 규칙:
- issue_summary는 1~2문장
- similar_cases는 2~4개
- core_differences는 2~4개
- checklist는 3~5개
- decision_guide는 2~4개
- plain_text는 위 JSON 내용을 자연스러운 실무 문장으로 풀어쓴 최종 답변
- similar_cases의 result는 반드시 "인용", "기각", "일부인정" 중 하나로 정리
- JSON 외의 텍스트를 절대 붙이지 말 것

## 유사 판정례 적합성 게이트 (Quality Filter)
"유사 판정례 N건"에서 받은 사건들은 retrieval 단계의 1차 추정이라 사용자 상황과 무관한 노이즈가 섞일 수 있습니다.
- similar_cases 배열에 넣기 전, 각 판정례가 사용자 쟁점과 진짜 유사한지 자체 판단:
  - 행위 유형(폭언/횡령/성희롱/성과/근태 등)이 일치 → 포함
  - 행위 유형이 명백히 다름(예: 사용자=기밀유출, 판정례=이자제한법 위반) → 제외
  - 애매하면 issue_summary 끝에 "직접 유사한 판정례는 N건"이라고 솔직히 명시
- similar_cases 2~4개 룰 중 적합 사건만 들어가도록 — 부족하면 적게 (0개도 허용).
- 적합 사건이 1개 이하면 issue_summary 끝에 "유사 판정례가 충분하지 않아 판단구조 위주로 설명합니다"를 추가.

## 부가 지식DB (FAQ) 인용
사용자 컨텍스트에 "═══ 관련 지식DB 매칭 결과 ═══" 섹션이 있으면:
- plain_text 본문 중 최소 1건은 [FAQ#숫자] 형식으로 출처 명시 (예: "수습기간 중 본채용 거부는 객관적·합리적 이유가 필요합니다 [FAQ#9991].")
- 인용은 사실 진술 뒤에 자연스럽게. 답변 끝 별도 섹션으로 모으지 말 것.
- 매칭 결과 없으면 (= 해당 섹션 부재) 임의 FAQ# 생성 금지.
- 해시태그(#) 사용 금지 규칙은 [FAQ#숫자] 형식에는 적용 안 함 (출처 표기는 허용).

## 답변 톤 규칙
- 법조문은 핵심 1개만 언급 (나열 금지)
- "예상 징계수위"는 사용자가 구체적 상황을 준 경우에만 제시
- "노무사 상담을 권장합니다"는 답변 마지막에 한 번만
- 교과서적 나열보다 판정례의 구체적 판단 포인트를 강조
- 마크다운 문법 사용 금지 (굵게, 제목, 코드블록 등). 일반 텍스트로만 답변
- 판정례 ID(id_숫자) 노출 금지
- 해시태그(#) 사용 금지
- 공공기관 여부는 사실관계 중 하나로만 참고하고, 별도 통계나 수치처럼 단정하지 말 것
- 간결하게, 실무자가 바로 쓸 수 있게`;

export const MAX_HISTORY_MESSAGES = 6;

export interface ComparisonCase {
  id: string;
  title: string;
  decision_result: string;
  holding_points: string;
  url: string;
  summary_short?: string;
  key_issue?: string;
  bucket: 'worker_win' | 'employer_win' | 'other';
  source?: 'nlrc' | 'court';
}

export interface ComparisonMeta {
  issueSummary: string[];
  workerWinCases: ComparisonCase[];
  employerWinCases: ComparisonCase[];
  coreDifferences: string[];
  checklist: string[];
  decisionGuide: string[];
}

export type RetrievalStrength = 'none' | 'weak' | 'sufficient';

export function evaluateRetrievalStrength(caseCount: number): RetrievalStrength {
  if (caseCount === 0) return 'none';
  if (caseCount <= 2) return 'weak';
  return 'sufficient';
}

const RETRIEVAL_INSTRUCTIONS: Record<RetrievalStrength, (count: number) => string> = {
  none: () =>
    '\n\n⚠️ [검색 결과 없음] 직접 일치하는 판정례가 없습니다. 유사한 판단구조를 가진 사례가 있으면 그 구조를 설명하세요. "찾지 못했다"로 끝내지 말고, 이 유형의 사건에서 노동위가 보는 핵심 기준을 짧게 안내하세요.',
  weak: () =>
    '\n\n⚠️ [검색 결과 부족] 유사 판정례가 2건 이하입니다. 확보된 사례를 최대한 활용하되, 추가 사실관계가 있으면 더 정확한 분석이 가능하다고 안내하세요.',
  sufficient: (count) =>
    `\n\n✅ [검색 결과 ${count}건] 충분한 유사 판정례가 확보되었습니다. 구체적 사례를 인용하며 분석하세요.`,
};

function analyzeWinLossFactors(cases: Record<string, unknown>[]): string {
  if (cases.length < 3) return '';

  const granted = cases.filter(c => {
    const r = String(c.decision_result || '');
    return r === 'granted' || r === 'partial' || r === '전부인정' || r === '일부인정';
  });
  const dismissed = cases.filter(c => {
    const r = String(c.decision_result || '');
    return r === 'dismissed' || r === 'rejected' || r === '기각' || r === '각하';
  });

  if (granted.length === 0 && dismissed.length === 0) return '';

  const factorKeywords: Record<string, string[]> = {
    '서면통지': ['서면통지', '서면 통지'],
    '소명기회': ['소명기회', '소명 기회'],
    '인사위원회': ['인사위원회', '징계위원회'],
    '양정 과다': ['양정이 과하', '양정 과다', '과도하'],
    '절차 위반': ['절차 위반', '절차 하자', '절차상 하자'],
    '취업규칙': ['취업규칙', '인사규정'],
  };

  const grantedFactors: string[] = [];
  const dismissedFactors: string[] = [];

  for (const [label, keywords] of Object.entries(factorKeywords)) {
    const gCount = granted.filter(c =>
      keywords.some(kw => String(c.holding_points || '').includes(kw))
    ).length;
    const dCount = dismissed.filter(c =>
      keywords.some(kw => String(c.holding_points || '').includes(kw))
    ).length;

    if (gCount > 0) grantedFactors.push(`${label}(${gCount}건)`);
    if (dCount > 0) dismissedFactors.push(`${label}(${dCount}건)`);
  }

  let analysis = `\n\n승패 요인 분석 (인용 ${granted.length}건 / 기각 ${dismissed.length}건):`;
  if (grantedFactors.length > 0) {
    analysis += `\n인용 사건 주요 요인: ${grantedFactors.join(', ')}`;
  }
  if (dismissedFactors.length > 0) {
    analysis += `\n기각 사건 주요 요인: ${dismissedFactors.join(', ')}`;
  }

  return analysis;
}

function buildIssueSummary(userInput: string, tags: string[]): string[] {
  const summary: string[] = [];
  if (userInput.trim()) summary.push(userInput.trim());
  if (tags.length > 0) summary.push(`핵심 태그: ${tags.join(', ')}`);
  return summary.slice(0, 2);
}

function countKeywordHits(cases: Record<string, unknown>[], keywords: string[]): number {
  return cases.filter((c) => keywords.some((kw) => String(c.holding_points || '').includes(kw))).length;
}

// 도메인 분기 — 정리해고/갱신기대권/부당노동행위는 징계 체크리스트가 안 맞음.
// LLM이 structured JSON 못 만들 때 fallback으로 쓰이므로 도메인별로 의미 있어야 함.
function detectDomain(tags: string[]): 'restructuring' | 'renewal' | 'unfair_labor' | 'discipline' {
  const set = new Set(tags);
  if (set.has('정리해고') || set.has('회피노력') || set.has('대상자선정')) return 'restructuring';
  if (set.has('갱신기대권')) return 'renewal';
  if (set.has('부당노동행위')) return 'unfair_labor';
  return 'discipline';
}

function buildChecklist(cases: Record<string, unknown>[], tags: string[] = []): string[] {
  const domain = detectDomain(tags);

  if (domain === 'restructuring') {
    return [
      '경영상 긴박성: 매출/이익 감소의 객관적 자료와 임박성 근거를 확인할 것',
      '회피노력 충분성: 임원 급여 삭감 외 휴업·배치전환·희망퇴직 등을 실제 시도했는지',
      '대상자 선정 합리성: 선정 기준의 객관성 + 노조원·특정 그룹 편중 여부',
      '근로자대표 협의: 50일 전 통보 + 성실 협의 횟수·내용을 점검할 것',
      '회피 우회 정황: 정리해고 직후 신규 채용 등 사유의 진정성을 의심할 사실',
    ];
  }

  if (domain === 'renewal') {
    return [
      '갱신 횟수와 관행: 반복 갱신 횟수·기간·관행이 기대권 형성 수준인지',
      '동료 차별: 동일 처지의 동료들과의 갱신 여부 차이',
      '동일 직무 후임 채용: 갱신 거절 후 같은 자리에 신규 채용 여부',
      '근로계약서 자동종료 문구의 실제 적용 엄격성과 근로자 인지',
      '거절 사유의 합리성: 사용자 측이 합리적 사유를 객관적으로 입증했는지',
    ];
  }

  if (domain === 'unfair_labor') {
    return [
      '시점 근접성: 노조 가입·활동 시점과 불이익 처분 시점의 간격',
      '대상자 편중: 노조원과 비조합원 사이의 차별 처분 여부',
      '회사의 노조 대응 발언/문서·정황 기록',
      '동일 처지 비조합원 비교군에서 같은 처분이 있었는지',
      '구제이익 요건: 현재진행성·계속성 충족 여부',
    ];
  }

  // default: 징계 (기존 keyword 매칭)
  const checklistMap: Array<{ label: string; keywords: string[]; helper: string }> = [
    { label: '서면통지', keywords: ['서면통지', '서면 통지'], helper: '서면 통지 여부와 통지 시점을 바로 확인할 것' },
    { label: '소명기회', keywords: ['소명기회', '소명 기회', '변명의 기회', '의견 진술'], helper: '의견 제출과 진술 기회를 실제로 부여했는지 확인할 것' },
    { label: '인사위원회', keywords: ['인사위원회', '징계위원회', '심의위원회'], helper: '징계위원회 개최 여부와 구성·의결 절차를 확인할 것' },
    { label: '징계양정', keywords: ['양정', '과도하', '과중', '비례'], helper: '비위 정도 대비 처분 수위가 과하지 않은지 점검할 것' },
    { label: '개선기회', keywords: ['개선기회', '경고', '시정요구', '개선 의사', 'PIP'], helper: '경고·시정 요구·개선 기간을 줬는지 확인할 것' },
  ];

  const selected = checklistMap
    .map((item) => ({ ...item, hits: countKeywordHits(cases, item.keywords) }))
    .sort((a, b) => b.hits - a.hits)
    .filter((item) => item.hits > 0)
    .slice(0, 5)
    .map((item) => item.helper);

  if (selected.length > 0) return selected;

  return checklistMap.slice(0, 5).map((item) => item.helper);
}

function buildDecisionGuide(cases: Record<string, unknown>[], tags: string[] = []): string[] {
  const domain = detectDomain(tags);

  if (domain === 'restructuring') {
    return [
      '경영상 긴박성과 회피노력의 충분성이 회사 측 입증 핵심이며, 임원 급여 삭감만으로는 부족하다고 판단되기 쉽습니다.',
      '대상자 선정 기준에 노조원 편중이 있으면 부당해고와 부당노동행위가 동시에 인정될 위험이 커집니다.',
      '정리해고 직후 신규 채용은 사유의 진정성을 부정하는 강력한 정황으로 작용합니다.',
    ];
  }

  if (domain === 'renewal') {
    return [
      '반복 갱신 4회 이상이면 갱신기대권이 강하게 형성되며, 자동종료 문구만으로 배제하기 어렵습니다.',
      '동일 직무 후임 채용은 정원 감축 등 사유의 진정성을 직접 부정하는 증거가 됩니다.',
      '동료 다수가 갱신되고 본인만 거절된 정황은 합리적 거절 사유 입증 부담을 회사 측에 더 무겁게 합니다.',
    ];
  }

  if (domain === 'unfair_labor') {
    return [
      '노조 가입·활동과 불이익 처분 시점의 근접성은 부당노동행위 의도 추정의 핵심 정황입니다.',
      '같은 처지의 비조합원에게는 같은 처분이 없었다는 비교군이 입증되면 인정 가능성이 매우 높아집니다.',
      '회사 측 발언·문서가 노조 무력화 의도를 시사하면 부당노동행위 인정에 직접 영향을 줍니다.',
    ];
  }

  // default: 징계
  const guides: string[] = [];
  if (countKeywordHits(cases, ['서면통지', '서면 통지']) > 0) {
    guides.push('서면 통지 시점과 징계 사유 특정이 명확하면 유지 논리를 세우기 쉽습니다.');
  }
  if (countKeywordHits(cases, ['소명기회', '소명 기회', '변명의 기회', '의견 진술']) > 0) {
    guides.push('소명기회를 실제로 부여한 기록이 없으면 절차 하자로 뒤집힐 위험이 큽니다.');
  }
  if (countKeywordHits(cases, ['인사위원회', '징계위원회', '심의위원회']) > 0) {
    guides.push('위원회 개최, 구성, 의결 정족수 기록이 있으면 사용자 쪽 방어가 쉬워집니다.');
  }
  if (countKeywordHits(cases, ['양정', '과도하', '과중', '비례']) > 0) {
    guides.push('비위 정도 대비 처분 수위를 낮추거나 단계화하면 과중 징계 리스크를 줄일 수 있습니다.');
  }
  if (countKeywordHits(cases, ['개선기회', '경고', '시정요구', 'PIP']) > 0) {
    guides.push('저성과·태도 문제는 경고와 개선기간이 빠지면 사용자에게 불리해지기 쉽습니다.');
  }

  if (guides.length > 0) return guides.slice(0, 3);

  return [
    '사실관계와 절차 기록이 함께 남아 있어야 유지 논리를 세우기 쉽습니다.',
    '징계 사유 특정, 소명기회, 통지 절차 중 하나라도 약하면 뒤집힐 위험이 커집니다.',
    '처분 수위가 과해 보이면 감경 또는 단계적 조치를 먼저 검토하는 편이 안전합니다.',
  ];
}

export function buildComparisonMeta(
  userInput: string,
  tags: string[],
  cases: Record<string, unknown>[],
): ComparisonMeta {
  const normalizedCases: ComparisonCase[] = cases.slice(0, 10).map((c) => ({
    id: String(c.id || ''),
    title: String(c.title || ''),
    decision_result: String(c.decision_result || ''),
    holding_points: String(c.holding_points || '').slice(0, 220),
    url: String(c.url || ''),
    summary_short: String(c.summary_short || '').slice(0, 160),
    key_issue: String(c.key_issue || ''),
    bucket: bucketDecisionResult(String(c.decision_result || '')),
    source: String(c.id || '').startsWith('bc_') ? 'court' as const : 'nlrc' as const,
  }));

  const workerWinCases = normalizedCases.filter((c) => c.bucket === 'worker_win').slice(0, 2);
  const employerWinCases = normalizedCases.filter((c) => c.bucket === 'employer_win').slice(0, 2);

  const coreDifferences = buildCoreDifferences(cases, tags);

  return {
    issueSummary: buildIssueSummary(userInput, tags),
    workerWinCases,
    employerWinCases,
    coreDifferences: coreDifferences.slice(0, 4),
    checklist: buildChecklist(cases, tags),
    decisionGuide: buildDecisionGuide(cases, tags),
  };
}

function buildCoreDifferences(cases: Record<string, unknown>[], tags: string[]): string[] {
  const domain = detectDomain(tags);

  if (domain === 'restructuring') {
    return [
      '경영상 긴박성의 객관적 증거 유무가 회사 측 정당성 입증의 출발점입니다.',
      '회피노력 시도의 폭과 진정성이 결과를 가르는 핵심 차이로 작용합니다.',
      '대상자 선정 기준의 객관성과 노조원 편중 여부가 부당노동행위 인정과 직결됩니다.',
      '정리해고 직후 신규 채용 등 회피 우회 정황은 사유의 진정성을 직접 부정합니다.',
    ];
  }

  if (domain === 'renewal') {
    return [
      '반복 갱신 횟수와 갱신 관행이 기대권 형성 수준에 도달했는지가 분수령입니다.',
      '동일 직무 후임 채용 여부가 사유의 진정성을 직접 가립니다.',
      '동료 갱신 여부와의 차별 정황이 거절의 합리성 판단을 좌우합니다.',
      '근로계약서 자동종료 문구가 실제 운영에서 엄격히 적용됐는지가 핵심입니다.',
    ];
  }

  if (domain === 'unfair_labor') {
    return [
      '노조 가입·활동과 불이익 처분 시점의 근접성이 의도 추정의 강력한 정황입니다.',
      '동일 처지 비조합원과의 차별 처분 비교가 인정 여부를 가릅니다.',
      '회사 측 발언·문서에 노조 무력화 의도가 드러나는지가 결정적입니다.',
    ];
  }

  // default: 징계
  const diffs: string[] = [];
  if (countKeywordHits(cases, ['서면통지', '서면 통지']) > 0) diffs.push('서면통지 유무가 결과를 갈랐는지 확인해야 합니다.');
  if (countKeywordHits(cases, ['소명기회', '소명 기회', '변명의 기회']) > 0) diffs.push('소명기회 부여 여부가 절차 적법성 판단에 직접 연결됩니다.');
  if (countKeywordHits(cases, ['인사위원회', '징계위원회']) > 0) diffs.push('인사위원회 개최와 의결 과정의 적법성이 유지 여부에 영향을 줍니다.');
  if (countKeywordHits(cases, ['양정', '과도하', '과중', '비례']) > 0) diffs.push('비위 정도에 비해 처분 수위가 과하면 뒤집힐 위험이 커집니다.');
  if (countKeywordHits(cases, ['개선기회', '경고', '시정요구', 'PIP']) > 0) diffs.push('개선기회를 줬는지가 저성과·통상해고 영역에서 중요합니다.');
  return diffs;
}

export function splitIssueSummary(issueSummary: string): string[] {
  return issueSummary
    .split(/[\n]+|(?<=[.!?다요])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
}

export function buildUserContext(
  userInput: string,
  tags: string[],
  cases: Record<string, unknown>[],
): string {
  const sourceLabel = (id: string) => String(id).startsWith('bc_') ? '[법원]' : '[노동위]';
  const caseSummary = cases
    .slice(0, 5)
    .map((c) => `- ${sourceLabel(String(c.id))} ${c.title} [${c.decision_result}]: ${((c.holding_points as string) || '').slice(0, 200)}`)
    .join('\n');

  const strength = evaluateRetrievalStrength(cases.length);
  const instruction = RETRIEVAL_INSTRUCTIONS[strength](cases.length);
  const winLossAnalysis = analyzeWinLossFactors(cases);
  const comparison = buildComparisonMeta(userInput, tags, cases);
  const srcTag = (s?: string) => s === 'court' ? '[법원]' : '[노동위]';
  const workerWins = comparison.workerWinCases
    .map((c) => `- ${srcTag(c.source)} ${c.title} [${c.decision_result}]: ${c.holding_points}`)
    .join('\n');
  const employerWins = comparison.employerWinCases
    .map((c) => `- ${srcTag(c.source)} ${c.title} [${c.decision_result}]: ${c.holding_points}`)
    .join('\n');
  const checklist = comparison.checklist.map((item) => `- ${item}`).join('\n');
  const differences = comparison.coreDifferences.map((item) => `- ${item}`).join('\n');

  return `사용자 상황: ${userInput}\n\n추출 키워드: ${tags.join(', ')}\n\n유사 판정례 ${cases.length}건:\n${caseSummary}\n\n근로자가 이긴 대표 사건:\n${workerWins || '- 직접 비교 가능한 인용 사건이 충분하지 않습니다.'}\n\n사용자가 이긴 대표 사건:\n${employerWins || '- 직접 비교 가능한 기각 사건이 충분하지 않습니다.'}\n\n승패를 가른 핵심 차이 후보:\n${differences || '- 절차, 양정, 개선기회 여부를 우선 확인하세요.'}\n\n실무 체크리스트 후보:\n${checklist}${winLossAnalysis}${instruction}`;
}

export function trimHistory(
  messages: { role: string; content: string }[],
  userContext: string,
): { role: string; content: string }[] {
  const sliced = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  const lastUserIndex = sliced.findLastIndex((message) => message.role === 'user');
  if (lastUserIndex === -1) {
    return [{ role: 'user', content: userContext }];
  }

  return [
    ...sliced.slice(0, lastUserIndex),
    { role: 'user', content: userContext },
  ];
}
