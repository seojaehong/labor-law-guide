import 'server-only';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const RERANK_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface RerankableSearchResult {
  id: string;
  title: string;
  key_issue?: string | null;
  holding_summary?: string | null;
  holding_points?: string | null;
  decision_result?: string | null;
  source?: string | null;
}

export interface RankedResult {
  id: string;
  relevanceScore: number;
  reasoning: string;
}

const rerankCache = new Map<string, { expiresAt: number; results: RankedResult[] }>();

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

function buildCacheKey(userQuery: string, results: RerankableSearchResult[]): string {
  return `${userQuery}::${results.map((item) => item.id).join(',')}`;
}

function formatResults(results: RerankableSearchResult[]): string {
  return results
    .map((result, index) => {
      const summary = [result.key_issue, result.holding_summary, result.holding_points]
        .filter(Boolean)
        .join(' / ')
        .slice(0, 320);
      return `${index + 1}. [${result.id}] ${result.title}\n쟁점: ${summary || '요약 없음'}\n결과: ${result.decision_result || '미상'}\n`;
    })
    .join('\n');
}

function extractJsonArray(text: string): RankedResult[] | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const arrayMatch = candidate.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;

  try {
    const parsed = JSON.parse(arrayMatch[0]) as Array<{
      id?: string;
      score?: number;
      relevanceScore?: number;
      reason?: string;
      reasoning?: string;
    }>;

    return parsed
      .filter((item) => typeof item.id === 'string')
      .map((item) => ({
        id: item.id as string,
        relevanceScore: Math.max(0, Math.min(10, Number(item.score ?? item.relevanceScore ?? 0))),
        reasoning: String(item.reason ?? item.reasoning ?? '').trim(),
      }));
  } catch {
    return null;
  }
}

async function rerankWithAnthropic(userQuery: string, results: RerankableSearchResult[]): Promise<RankedResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }

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
        max_tokens: 800,
        temperature: 0,
        system:
          '당신은 노동법 판정례 검색 결과를 평가하는 전문가입니다. 반드시 JSON 배열만 반환하세요. 각 원소는 id, score, reason만 포함합니다.',
        messages: [
          {
            role: 'user',
            content:
              `사용자 검색 쿼리: "${userQuery}"\n\n` +
              '평가 기준:\n' +
              '- 10점: 쿼리가 정확히 묻는 법적 쟁점을 다루는 사건\n' +
              '- 8-9점: 동일 쟁점이나 세부 맥락이 약간 다른 사건. 같은 reason_category면 최소 8점\n' +
              '- 5-7점: 관련 주제이나 핵심 쟁점이 다른 사건\n' +
              '- 3-4점: 일부 키워드만 겹치는 사건\n' +
              '- 0-2점: 쿼리와 무관한 사건\n' +
              '- 형사사건, 군사법 사건, 종중/교회 내부 분쟁은 0점\n' +
              '중요 원칙: 쟁점이 같으면 세부 사실관계가 달라도 높은 점수. 판정 결과(인용/기각)는 점수에 영향 없음.\n\n' +
              '시나리오별 규칙:\n' +
              "- '보복/불이익/신고 후': 신고 후 전보/해고/징계/직위해제 등 인사조치 사건=9-10점. 공익신고/내부고발 후 보복성 조치=9-10점.\n" +
              "- '괴롭힘/갈등': workplace_bullying 카테고리이고 신고/조사/징계/분리조치 있으면=9-10점. 괴롭힘 불인정/일부인정 사건=9-10점.\n" +
              "- '양정과다/과중': 비위 인정+징계 수위 과다 판정 사건=9-10점.\n" +
              "- '사실상 해고': 계약만료+실질적 해고 다툼=9-10점.\n" +
              "- '여러 비위/복합 비위': reason_category 2개 이상 해고 사건=9-10점.\n" +
              "- '업무능력/저성과 해고': 업무능력 부족이 해고사유에 포함되면=9-10점. incompetence 카테고리=최소 8점.\n" +
              "- '수습/본채용 거부': probation 카테고리 사건=최소 8점. 거부 사유 유형 불문.\n" +
              "- '절차 위반': 징계절차/소송절차/재심절차 적법성 검토 사건=9-10점.\n" +
              "- '대기발령/배치전환': transfer 카테고리=최소 8점. 대기발령/전보 정당성 판단 사건=9-10점.\n" +
              "- '무단결근 해고': absence 카테고리 해고/징계 사건=최소 8점.\n" +
              "- '욕설/직장질서 + 해고': 욕설/폭언이 징계사유에 포함된 해고 사건=9-10점.\n\n" +
              '검색 결과:\n' +
              formatResults(results) +
              '\nJSON 배열 예시: [{"id":"abc","score":9,"reason":"양정 과다 쟁점이 직접적"}]',
          },
        ],
      }),
    }),
    RERANK_TIMEOUT_MS,
    'rerank',
  );

  if (!response.ok) {
    throw new Error(`anthropic rerank failed: ${response.status}`);
  }

  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === 'text')?.text || '';
  return extractJsonArray(text) || [];
}

async function rerankWithOpenAI(userQuery: string, results: RerankableSearchResult[]): Promise<RankedResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

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
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '당신은 노동법 판정례 검색 결과를 평가하는 전문가입니다. 반드시 {"results":[...]} 형태의 JSON만 반환하세요. 각 원소는 id, score, reason만 포함합니다.',
          },
          {
            role: 'user',
            content:
              `사용자 검색 쿼리: "${userQuery}"\n\n` +
              '평가 기준은 0~10점입니다. 형사사건, 군사법 사건, 종중/교회 내부 분쟁은 0점입니다.\n' +
              "'불인정/미해당'는 해당 사유가 인정되지 않은 사건을 높게, 인정된 사건은 낮게 평가하세요.\n" +
              "'여러 비위/복합 비위/정당성 전체'는 복수의 징계사유를 종합 판단한 사건을 높게 평가하세요.\n\n" +
              '검색 결과:\n' +
              formatResults(results),
          },
        ],
      }),
    }),
    RERANK_TIMEOUT_MS,
    'rerank',
  );

  if (!response.ok) {
    throw new Error(`openai rerank failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content || '';

  try {
    const parsed = JSON.parse(text) as {
      results?: Array<{ id?: string; score?: number; reason?: string }>;
    };
    return (parsed.results || [])
      .filter((item) => typeof item.id === 'string')
      .map((item) => ({
        id: item.id as string,
        relevanceScore: Math.max(0, Math.min(10, Number(item.score ?? 0))),
        reasoning: String(item.reason ?? '').trim(),
      }));
  } catch {
    return extractJsonArray(text) || [];
  }
}

export async function rerankResults(
  userQuery: string,
  results: RerankableSearchResult[],
  topK = 5,
): Promise<RankedResult[]> {
  if (results.length === 0) return [];

  const cacheKey = buildCacheKey(userQuery, results);
  const cached = rerankCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results.slice(0, topK);
  }

  // OpenAI 우선 + Anthropic fallback (Anthropic 한도 도달 시 자동 전환).
  // 4/27 Anthropic API usage limit 도달 발견으로 우선순위 변경.
  let reranked: RankedResult[] = [];
  const errors: string[] = [];

  if (process.env.OPENAI_API_KEY) {
    try {
      reranked = await rerankWithOpenAI(userQuery, results);
    } catch (e) {
      errors.push(`openai: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (reranked.length === 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      reranked = await rerankWithAnthropic(userQuery, results);
    } catch (e) {
      errors.push(`anthropic: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (reranked.length === 0) {
    if (errors.length > 0) {
      console.warn('[reranker] 모두 실패:', errors.join(' | '));
    }
    return [];
  }

  rerankCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    results: reranked,
  });

  return reranked
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id))
    .slice(0, topK);
}
