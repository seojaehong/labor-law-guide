import type { ReasonCategory } from '@/lib/types';
import { normalizeQuery } from '@/lib/search/normalize-query';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const QUERY_REWRITE_TIMEOUT_MS = 3000;

const rewriteCache = new Map<string, RewrittenQuery>();

const EXTENDED_CATEGORIES = new Set([
  'absence',
  'sexual_harassment',
  'workplace_bullying',
  'transfer',
  'probation',
  'contract_expiry',
  'no_dismissal',
  'worker_status',
  'discrimination',
  'redundancy',
  'misconduct',
  'violence',
  'embezzlement',
  'incompetence',
  'dismissal',
  'discipline',
  'disciplinary_severity',
  'wage',
  'industrial_accident',
  'union_activity',
  'other',
]);

const REASON_CATEGORIES = new Set<ReasonCategory>([
  'absence',
  'sexual_harassment',
  'workplace_bullying',
  'transfer',
  'probation',
  'contract_expiry',
  'no_dismissal',
  'worker_status',
  'discrimination',
  'redundancy',
  'misconduct',
  'violence',
  'embezzlement',
  'incompetence',
  'union_activity',
  'other',
]);

export interface RewrittenQuery {
  searchQuery: string;
  category: string;
  intent: string;
  keywords: string[];
}

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

function normalizeCategory(value: string | null | undefined): string {
  const normalized = (value || '').trim();
  return EXTENDED_CATEGORIES.has(normalized) ? normalized : '';
}

export function asReasonCategory(value: string | null | undefined): ReasonCategory | '' {
  const normalized = normalizeCategory(value);
  return REASON_CATEGORIES.has(normalized as ReasonCategory) ? (normalized as ReasonCategory) : '';
}

function fallbackRewriteQuery(userQuery: string): RewrittenQuery {
  const normalized = normalizeQuery(userQuery);
  const lowered = userQuery.toLowerCase();
  const keywords = (normalized.keywords.length > 0 ? normalized.keywords : userQuery.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 5);

  let category = '';
  let intent = 'generic';

  if (/(무단결근|결근|지각|조퇴)/.test(lowered)) {
    category = 'absence';
    intent = 'validity_check';
  } else if (/(괴롭힘|직장내괴롭힘)/.test(lowered)) {
    category = 'workplace_bullying';
    intent = /(보복|불이익|신고)/.test(lowered) ? 'retaliation_check' : 'validity_check';
  } else if (/(성희롱|성추행|성적 언동)/.test(lowered)) {
    category = 'sexual_harassment';
    intent = 'validity_check';
  } else if (/(폭행|폭언|욕설|폭력)/.test(lowered)) {
    category = 'violence';
    intent = /(과하|양정|수위)/.test(lowered) ? 'severity_check' : 'validity_check';
  } else if (/(수습|시용|본채용)/.test(lowered)) {
    category = 'probation';
    intent = 'procedure_check';
  } else if (/(업무능력|저성과|성과 부족)/.test(lowered)) {
    category = 'incompetence';
    intent = 'validity_check';
  } else if (/(갱신기대권|계약만료|기간제|계약직)/.test(lowered)) {
    category = 'contract_expiry';
    intent = 'termination_check';
  } else if (/(전보|인사이동|인사발령|배치전환)/.test(lowered)) {
    category = 'transfer';
    intent = 'validity_check';
  } else if (/(근로자성|도급|파견|원청)/.test(lowered)) {
    category = 'worker_status';
    intent = 'status_check';
  } else if (/(노조|노동조합|단체교섭|부당노동행위|쟁의행위|파업)/.test(lowered)) {
    category = 'union_activity';
    intent = 'labor_relation_check';
  }

  return {
    searchQuery: normalized.keywords.length > 0 ? normalized.keywords.join(' ') : userQuery.trim(),
    category,
    intent,
    keywords,
  };
}

function extractJsonObject(payload: string): Partial<RewrittenQuery> | null {
  const trimmed = payload.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    return JSON.parse(objectMatch[0]) as Partial<RewrittenQuery>;
  } catch {
    return null;
  }
}

function sanitizeRewriteResult(userQuery: string, parsed: Partial<RewrittenQuery> | null): RewrittenQuery {
  const fallback = fallbackRewriteQuery(userQuery);
  return {
    searchQuery: (parsed?.searchQuery || fallback.searchQuery).trim().slice(0, 50) || fallback.searchQuery,
    category: normalizeCategory(parsed?.category) || fallback.category,
    intent: (parsed?.intent || fallback.intent || 'generic').trim() || 'generic',
    keywords: Array.isArray(parsed?.keywords)
      ? parsed.keywords
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 5)
      : fallback.keywords,
  };
}

async function rewriteWithAnthropic(userQuery: string, apiKey: string): Promise<RewrittenQuery> {
  const response = await withTimeout(
    fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 260,
        temperature: 0,
        system:
          '당신은 한국 노동위원회 판정례 검색용 쿼리 최적화 엔진입니다. 반드시 JSON 객체만 반환하세요. 키는 searchQuery, category, intent, keywords만 사용합니다.',
        messages: [
          {
            role: 'user',
            content:
              `사용자 입력: ${userQuery}\n` +
              '목표: 일상어를 노동법 검색용 핵심 키워드로 변환하고, category와 intent를 추론하세요.\n' +
              'category 후보: absence, workplace_bullying, probation, incompetence, contract_expiry, transfer, violence, worker_status, sexual_harassment, embezzlement, misconduct, redundancy, no_dismissal, discrimination, union_activity, other, dismissal, discipline, disciplinary_severity, wage, industrial_accident\n' +
              "규칙: '불인정/미해당/부인'은 searchQuery에 그대로 포함하세요. '여러 비위/복합 비위/정당성 전체'는 '징계사유가 모두 인정', '양정이 적정', '절차상 하자 없음' 같은 표현을 포함하세요.\n" +
              '예시: {"searchQuery":"업무능력 부족 개선 기회 경고 시정 교육 후 해고","category":"incompetence","intent":"validity_check","keywords":["개선 기회","경고","시정","업무능력 부족","해고"]}',
          },
        ],
      }),
    }),
    QUERY_REWRITE_TIMEOUT_MS,
    'query rewrite',
  );

  if (!response.ok) {
    throw new Error(`anthropic rewrite failed: ${response.status}`);
  }

  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === 'text')?.text || '';
  return sanitizeRewriteResult(userQuery, extractJsonObject(text));
}

async function rewriteWithOpenAI(userQuery: string, apiKey: string): Promise<RewrittenQuery> {
  const response = await withTimeout(
    fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              '당신은 한국 노동위원회 판정례 검색용 쿼리 최적화 엔진입니다. 반드시 JSON 객체만 반환하세요. 키는 searchQuery, category, intent, keywords만 사용합니다.',
          },
          {
            role: 'user',
            content:
              `사용자 입력: ${userQuery}\n` +
              '일상어를 노동법 검색용 키워드로 변환하고 category와 intent를 추론하세요.\n' +
              'category 후보: absence, workplace_bullying, probation, incompetence, contract_expiry, transfer, violence, worker_status, sexual_harassment, embezzlement, misconduct, redundancy, no_dismissal, discrimination, union_activity, other, dismissal, discipline, disciplinary_severity, wage, industrial_accident\n' +
              "규칙: '불인정/미해당/부인'은 searchQuery에 그대로 포함하세요. '여러 비위/복합 비위/정당성 전체'는 '징계사유가 모두 인정', '양정이 적정', '절차상 하자 없음' 같은 표현을 포함하세요.\n" +
              'JSON 예시: {"searchQuery":"폭행 비위 징계해고 양정 과다 우발적","category":"violence","intent":"severity_check","keywords":["폭행","비위","징계해고","양정 과다","우발적"]}',
          },
        ],
        response_format: { type: 'json_object' },
      }),
    }),
    QUERY_REWRITE_TIMEOUT_MS,
    'query rewrite',
  );

  if (!response.ok) {
    throw new Error(`openai rewrite failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content || '';
  return sanitizeRewriteResult(userQuery, extractJsonObject(text));
}

export async function rewriteQuery(userQuery: string): Promise<RewrittenQuery> {
  const trimmed = userQuery.trim();
  if (!trimmed) {
    return { searchQuery: '', category: '', intent: 'generic', keywords: [] };
  }

  const cached = rewriteCache.get(trimmed);
  if (cached) return cached;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    const result = anthropicKey
      ? await rewriteWithAnthropic(trimmed, anthropicKey)
      : openaiKey
      ? await rewriteWithOpenAI(trimmed, openaiKey)
      : fallbackRewriteQuery(trimmed);
    rewriteCache.set(trimmed, result);
    return result;
  } catch {
    const fallback = fallbackRewriteQuery(trimmed);
    rewriteCache.set(trimmed, fallback);
    return fallback;
  }
}
