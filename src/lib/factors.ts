type FactorDefinition = {
  name: string;
  keywords: string[];
};

type BucketKey = 'granted' | 'dismissed' | 'partial';

export type AnalyzeCase = {
  id: string;
  case_number: string | null;
  title: string | null;
  decision_date: string | null;
  holding_summary: string | null;
  holding_points: string | null;
  decision_result?: string | null;
};

export type FactorComparisonEntry = {
  grantedCount: number;
  grantedTotal: number;
  dismissedCount: number;
  dismissedTotal: number;
  grantedRate: number;
  dismissedRate: number;
  gap: number;
};

export type ChecklistEntry = {
  factor: string;
  priority: '필수' | '권장' | '참고';
  grantedRate: string;
  description: string;
};

const COMMON_FACTORS: FactorDefinition[] = [
  { name: '서면통지', keywords: ['서면', '통지', '통보', '고지'] },
  { name: '소명기회', keywords: ['소명', '의견진술', '변명', '청문', '진술기회'] },
  { name: '절차하자', keywords: ['절차', '하자', '위반', '미이행'] },
  { name: '입증/증거', keywords: ['입증', '증거', '증명', '소명자료', '객관적'] },
];

const DISCIPLINE_FACTORS: FactorDefinition[] = [
  { name: '징계위원회', keywords: ['징계위원회', '인사위원회', '심의위원회'] },
  { name: '양정비례성', keywords: ['비례', '양정', '과중', '과도', '균형'] },
  { name: '취업규칙근거', keywords: ['취업규칙', '인사규정', '복무규정', '사규'] },
  { name: '사전경고', keywords: ['경고', '시정요구', '개선요구', '시말서', '경위서'] },
  { name: '근속연수', keywords: ['근속', '근무기간', '재직', '장기근속'] },
  { name: '반성/개선', keywords: ['반성', '개선', '시정', '재발방지', '개전'] },
  { name: '형평성', keywords: ['형평', '다른 직원', '동일', '차별적', '선례'] },
];

const UNION_FACTORS: FactorDefinition[] = [
  { name: '노조활동', keywords: ['노조', '노동조합', '단체', '쟁의'] },
  { name: '불이익', keywords: ['불이익', '차별', '보복', '불리한'] },
  { name: '사용자의도', keywords: ['의도', '인과관계', '목적', '동기'] },
  { name: '시기', keywords: ['시기적', '직후', '무렵', '근접'] },
];

const HARASSMENT_FACTORS: FactorDefinition[] = [
  { name: '행위의 심각성', keywords: ['심각', '중대', '반복', '지속'] },
  { name: '피해자 의사', keywords: ['피해자', '의사', '동의', '거부'] },
  { name: '조치의 적절성', keywords: ['적절', '조치', '대응', '시정조치'] },
];

const DISCIPLINE_CATEGORY_ALIASES = new Set([
  '부당해고',
  '해고',
  'dismissal',
  '부당징계',
  '징계',
  'discipline',
  '무단결근',
  '결근',
  'absence',
  '수습',
  '시용',
  'probation',
  '갱신기대권',
  '계약만료',
  'contract_expiry',
  '해고부존재',
  '사직',
  'no_dismissal',
  '경영상해고',
  '정리해고',
  'redundancy',
  '비위행위',
  'misconduct',
  '폭행',
  '폭언',
  'violence',
  '횡령',
  '배임',
  'embezzlement',
  '업무능력부족',
  '저성과',
  'incompetence',
  '전보',
  '인사이동',
  'transfer',
  '근로자성',
  'worker_status',
  '차별',
  '차별시정',
  'discrimination',
]);

const UNION_CATEGORY_ALIASES = new Set([
  '부당노동행위',
  '노동조합',
  '노조',
  'union_activity',
]);

const HARASSMENT_CATEGORY_ALIASES = new Set([
  '성희롱',
  'sexual_harassment',
  '직장내괴롭힘',
  '괴롭힘',
  'workplace_bullying',
]);

function normalizeCategory(category?: string | null) {
  return category?.replace(/\s+/g, '').toLowerCase() ?? '';
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLowerCase();
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function withSubjectParticle(word: string) {
  const lastChar = word.charCodeAt(word.length - 1);
  const hasBatchim = (lastChar - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? '이' : '가'}`;
}

export function getFactorsForCategory(category?: string | null): FactorDefinition[] {
  const normalized = normalizeCategory(category);

  if (!normalized || DISCIPLINE_CATEGORY_ALIASES.has(normalized)) {
    return [...COMMON_FACTORS, ...DISCIPLINE_FACTORS];
  }

  if (UNION_CATEGORY_ALIASES.has(normalized)) {
    return [...COMMON_FACTORS, ...UNION_FACTORS];
  }

  if (HARASSMENT_CATEGORY_ALIASES.has(normalized)) {
    return [...COMMON_FACTORS, ...HARASSMENT_FACTORS];
  }

  return [...COMMON_FACTORS, ...DISCIPLINE_FACTORS];
}

export function groupCasesByBucket<T extends { decision_result?: string | null }>(cases: T[]) {
  return cases.reduce<Record<BucketKey, T[]>>(
    (acc, item) => {
      const bucket = toBucket(item.decision_result);
      if (bucket) {
        acc[bucket].push(item);
      }
      return acc;
    },
    { granted: [], dismissed: [], partial: [] }
  );
}

function toBucket(decisionResult?: string | null): BucketKey | null {
  if (!decisionResult) {
    return null;
  }

  if (['granted', '전부인정', '인정', 'overturned'].includes(decisionResult)) {
    return 'granted';
  }

  if (['partial', '일부인정'].includes(decisionResult)) {
    return 'partial';
  }

  if (['dismissed', 'rejected', 'upheld', '기각', '각하', '초심유지'].includes(decisionResult)) {
    return 'dismissed';
  }

  return null;
}

export function buildFactorComparison(groupedCases: Record<BucketKey, AnalyzeCase[]>, category?: string | null) {
  const factors = getFactorsForCategory(category);
  const grantedTotal = groupedCases.granted.length;
  const dismissedTotal = groupedCases.dismissed.length;

  return factors.reduce<Record<string, FactorComparisonEntry>>((acc, factor) => {
    const grantedCount = countMatches(groupedCases.granted, factor.keywords);
    const dismissedCount = countMatches(groupedCases.dismissed, factor.keywords);
    const grantedRate = grantedTotal > 0 ? grantedCount / grantedTotal : 0;
    const dismissedRate = dismissedTotal > 0 ? dismissedCount / dismissedTotal : 0;

    acc[factor.name] = {
      grantedCount,
      grantedTotal,
      dismissedCount,
      dismissedTotal,
      grantedRate,
      dismissedRate,
      gap: grantedRate - dismissedRate,
    };

    return acc;
  }, {});
}

function countMatches(cases: AnalyzeCase[], keywords: string[]) {
  return cases.filter((item) => matchesAnyKeyword(item, keywords)).length;
}

function matchesAnyKeyword(item: AnalyzeCase, keywords: string[]) {
  const text = normalizeText(`${item.holding_summary ?? ''} ${item.holding_points ?? ''}`);
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

export function buildChecklist(factorComparison: Record<string, FactorComparisonEntry>): ChecklistEntry[] {
  return Object.entries(factorComparison)
    .map(([factor, metrics]) => {
      const priority = getPriority(metrics.gap);
      if (!priority) {
        return null;
      }

      return {
        factor,
        priority,
        grantedRate: percent(metrics.grantedRate),
        description: `인용 사건 중 ${percent(metrics.grantedRate)}에서 ${factor}가 확인됨. 미이행 시 기각 위험이 높습니다.`,
      } satisfies ChecklistEntry;
    })
    .filter((item): item is ChecklistEntry => item !== null)
    .sort((a, b) => {
      const gapA = factorComparison[a.factor]?.gap ?? 0;
      const gapB = factorComparison[b.factor]?.gap ?? 0;
      return gapB - gapA;
    });
}

function getPriority(gap: number): ChecklistEntry['priority'] | null {
  if (gap >= 0.5) {
    return '필수';
  }

  if (gap >= 0.3) {
    return '권장';
  }

  if (gap >= 0.15) {
    return '참고';
  }

  return null;
}

export function buildSummaryText(params: {
  totalMatched: number;
  granted: number;
  dismissed: number;
  partial: number;
  factorComparison: Record<string, FactorComparisonEntry>;
}) {
  const { totalMatched, granted, dismissed, partial, factorComparison } = params;
  const sorted = Object.entries(factorComparison).sort(([, a], [, b]) => b.gap - a.gap);
  const topOne = sorted[0];
  const topTwo = sorted[1];
  const riskFactor = sorted.find(([, metrics]) => metrics.gap > 0);

  if (!topOne || !riskFactor) {
    return `유사 사례 ${totalMatched}건 중 인용 ${granted}건, 기각 ${dismissed}건, 일부인용 ${partial}건입니다. 비교 가능한 승패 요인은 아직 충분히 식별되지 않았습니다.`;
  }

  const riskMissingRate = Math.max(0, 1 - riskFactor[1].dismissedRate);

  if (!topTwo) {
    return `유사 사례 ${totalMatched}건 중 인용 ${granted}건, 기각 ${dismissed}건, 일부인용 ${partial}건. ${topOne[0]}(${percent(topOne[1].grantedRate)})이 인용의 핵심 요인입니다. ${withSubjectParticle(riskFactor[0])} 없는 경우 기각 위험이 높습니다(${percent(riskMissingRate)}).`;
  }

  return `유사 사례 ${totalMatched}건 중 인용 ${granted}건, 기각 ${dismissed}건, 일부인용 ${partial}건. ${topOne[0]}(${percent(topOne[1].grantedRate)})과 ${topTwo[0]}(${percent(topTwo[1].grantedRate)})이 인용의 핵심 요인입니다. ${withSubjectParticle(riskFactor[0])} 없는 경우 기각 위험이 높습니다(${percent(riskMissingRate)}).`;
}
