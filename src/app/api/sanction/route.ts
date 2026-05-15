import { NextRequest, NextResponse } from 'next/server';
import { bucketDecisionResult } from '@/lib/ai/decision-bucket';
import { extractTags, searchCases, _retrievalTiming } from '@/lib/ai/retrieval';
import { buildComparisonMeta, buildUserContext, splitIssueSummary, trimHistory, type ComparisonCase, type ComparisonMeta } from '@/lib/ai/prompt';
import { SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { buildFaqContext } from '@/lib/chat/context/faq';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOTAL_CHARS = 16000;

type LLMProvider = 'gemini' | 'openai' | 'anthropic';

// 우선순위: OpenAI gpt-4o-mini → Gemini 2.5 Flash → Anthropic (한도 회복 후)
// 변경 사유 (2026-05-15): Gemini 2.5 Flash TTFT 12.5s 측정 → OpenAI gpt-4o-mini TTFT 1-2s 기대 → 사용자 첫 토큰까지 10s 단축
// provider를 명시 반환 (detectProvider via resp.url은 Vercel runtime에서 신뢰 X)
async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  options: { stream?: boolean; signal?: AbortSignal } = {}
): Promise<{ resp: Response; provider: LLMProvider }> {
  const tryOpenAICompat = async (url: string, key: string, model: string, label: string) => {
    const resp = await fetch(url, {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: 8192,
        temperature: 0.3,
        stream: options.stream === true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      throw new Error(`${label} ${resp.status}: ${errText.slice(0, 300)}`);
    }
    return resp;
  };

  const tryGemini = () => {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 없음');
    return tryOpenAICompat(GEMINI_URL, GEMINI_API_KEY, GEMINI_MODEL, 'Gemini');
  };
  const tryOpenAI = () => {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 없음');
    return tryOpenAICompat(OPENAI_URL, OPENAI_API_KEY, OPENAI_MODEL, 'OpenAI');
  };
  const tryAnthropic = async () => {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 없음');
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages,
        temperature: 0.3,
        stream: options.stream === true,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 300)}`);
    }
    return resp;
  };

  const errors: string[] = [];
  const providerMap: Array<[LLMProvider, () => Promise<Response>]> = [
    ['openai', tryOpenAI],
    ['gemini', tryGemini],
    ['anthropic', tryAnthropic],
  ];
  for (const [provider, attempt] of providerMap) {
    try {
      const resp = await attempt();
      return { resp, provider };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${msg}`);
    }
  }
  throw new Error(`모든 LLM 실패: ${errors.join(' | ')}`);
}

interface StructuredAiCase {
  title: string
  result: string
  key_point: string
}

interface StructuredAiResponse {
  issue_summary: string
  similar_cases: StructuredAiCase[]
  core_differences: string[]
  checklist: string[]
  decision_guide: string[]
  plain_text: string
}

function sanitizeAnalysis(text: string): string {
  const cleaned = text
    .replace(/([0-9]+(\.[0-9]+)?%\s*)(확률|가능성|점수)/gi, '$3')
    .replace(/(승소|패소|인용|기각|정당).{0,12}(확률|가능성 점수)/gi, '$1 판단')
    .replace(/\b(confidence|score)\b/gi, '')
    .replace(/적중률/gi, '판단 근거')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned || text.trim();
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function extractPlainTextFromJsonLike(text: string): string | null {
  // truncated JSON에서도 "plain_text" 값만 정규식으로 살리기
  const match = text.match(/"plain_text"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return null;
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function parseStructuredAiResponse(text: string): StructuredAiResponse | null {
  try {
    const payload = JSON.parse(extractJsonPayload(text)) as Partial<StructuredAiResponse>;
    if (
      typeof payload.issue_summary !== 'string' ||
      !Array.isArray(payload.similar_cases) ||
      !Array.isArray(payload.core_differences) ||
      !Array.isArray(payload.checklist) ||
      !Array.isArray(payload.decision_guide) ||
      typeof payload.plain_text !== 'string'
    ) {
      return null;
    }

    return {
      issue_summary: payload.issue_summary.trim(),
      similar_cases: payload.similar_cases
        .filter((item): item is StructuredAiCase => !!item && typeof item.title === 'string' && typeof item.result === 'string' && typeof item.key_point === 'string')
        .map((item) => ({
          title: item.title.trim(),
          result: item.result.trim(),
          key_point: item.key_point.trim(),
        })),
      core_differences: payload.core_differences.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
      checklist: payload.checklist.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
      decision_guide: payload.decision_guide.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean),
      plain_text: payload.plain_text.trim(),
    };
  } catch {
    return null;
  }
}

function normalizeStructuredResult(result: string): string {
  const map: Record<string, string> = {
    '인용': 'granted',
    '기각': 'dismissed',
    '일부인정': 'partial',
    '전부인정': 'granted',
    '각하': 'rejected',
  };
  return map[result.trim()] || result;
}

function textOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = a.replace(/[○\s]+/g, ' ').trim().split(/\s+/).filter(w => w.length >= 2);
  const wordsB = new Set(b.replace(/[○\s]+/g, ' ').trim().split(/\s+/).filter(w => w.length >= 2));
  if (wordsA.length === 0) return 0;
  const hits = wordsA.filter(w => wordsB.has(w)).length;
  return hits / wordsA.length;
}

function matchSimilarCase(aiCase: StructuredAiCase, pool: Array<Record<string, unknown>>) {
  // 1차: key_point 텍스트로 holding_points와 매칭 (가장 정확)
  const keyPoint = aiCase.key_point || '';
  const resultNorm = normalizeStructuredResult(aiCase.result);

  let bestMatch: Record<string, unknown> | undefined;
  let bestScore = 0;

  for (const candidate of pool) {
    const holding = String(candidate.holding_points || '');
    const summary = String(candidate.summary_short || '');
    const haystack = `${holding} ${summary}`;

    // key_point의 핵심 단어가 holding_points에 포함되는지
    const overlap = textOverlap(keyPoint, haystack);

    // 승패 결과 일치 시 보너스
    const resultMatch = String(candidate.decision_result || '') === resultNorm ? 0.15 : 0;
    const score = overlap + resultMatch;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // 최소 30% 이상 겹쳐야 매칭 인정
  return bestScore >= 0.3 ? bestMatch : undefined;
}

function buildComparisonFromStructured(
  structured: StructuredAiResponse,
  pool: Array<Record<string, unknown>>,
  dbComparison: ComparisonMeta,
): ComparisonMeta {
  const usedIds = new Set<string>();
  const normalizedCases: ComparisonCase[] = structured.similar_cases.map((item, index) => {
    // 이미 사용된 DB 케이스 제외하고 매칭
    const availablePool = pool.filter(c => !usedIds.has(String(c.id || '')));
    const matched = matchSimilarCase(item, availablePool);

    if (matched) usedIds.add(String(matched.id || ''));

    const decisionResult = matched ? String(matched.decision_result || normalizeStructuredResult(item.result)) : normalizeStructuredResult(item.result);

    const caseId = matched ? String(matched.id || `ai_case_${index}`) : `ai_case_${index}`;
    return {
      id: caseId,
      title: matched ? String(matched.title || item.title) : item.title,
      decision_result: decisionResult,
      holding_points: item.key_point,
      url: matched ? String(matched.url || '') : '',
      summary_short: matched ? String(matched.summary_short || '').slice(0, 160) : item.key_point,
      key_issue: matched ? String(matched.key_issue || '') : '',
      bucket: bucketDecisionResult(decisionResult),
      source: caseId.startsWith('bc_') ? 'court' as const : 'nlrc' as const,
    };
  });

  // 매칭된 real case가 하나도 없으면 DB comparison을 사용
  const hasRealCases = normalizedCases.some(c => !c.id.startsWith('ai_case_'));
  if (!hasRealCases) {
    return {
      ...dbComparison,
      issueSummary: splitIssueSummary(structured.issue_summary),
      coreDifferences: structured.core_differences.length > 0 ? structured.core_differences.slice(0, 4) : dbComparison.coreDifferences,
      checklist: structured.checklist.length > 0 ? structured.checklist.slice(0, 5) : dbComparison.checklist,
      decisionGuide: structured.decision_guide.length > 0 ? structured.decision_guide.slice(0, 4) : dbComparison.decisionGuide,
    };
  }

  return {
    issueSummary: splitIssueSummary(structured.issue_summary),
    workerWinCases: normalizedCases.filter((item) => item.bucket === 'worker_win').slice(0, 2),
    employerWinCases: normalizedCases.filter((item) => item.bucket === 'employer_win').slice(0, 2),
    coreDifferences: structured.core_differences.slice(0, 4),
    checklist: structured.checklist.slice(0, 5),
    decisionGuide: structured.decision_guide.slice(0, 4),
  };
}

function validateMessages(messages: unknown): { valid: true; messages: { role: string; content: string }[] } | { valid: false; error: string } {
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'messages 배열 형식이 올바르지 않습니다.' };
  }

  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    return { valid: false, error: `messages는 1개 이상 ${MAX_MESSAGES}개 이하만 허용됩니다.` };
  }

  const normalized = messages.map((message) => ({
    role: typeof message?.role === 'string' ? message.role : '',
    content: typeof message?.content === 'string' ? message.content.trim() : '',
  }));

  if (normalized.some((message) => !message.role || !message.content || message.content.length > MAX_MESSAGE_LENGTH)) {
    return { valid: false, error: `각 메시지는 role/content를 가져야 하며, content는 ${MAX_MESSAGE_LENGTH}자 이하여야 합니다.` };
  }

  const totalChars = normalized.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return { valid: false, error: `총 입력 길이는 ${MAX_TOTAL_CHARS}자를 넘길 수 없습니다.` };
  }

  return { valid: true, messages: normalized };
}

export async function POST(req: NextRequest) {
  // LLM 실패 시 catch에서 raw 검색 결과 보존용 (UX 안전장치)
  let retrievalCache: { tags: string[]; cases: unknown[]; comparison: ComparisonMeta | null } | null = null;

  try {
    if (!GEMINI_API_KEY && !OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
      return NextResponse.json({ content: 'AI 서비스가 준비되지 않았습니다 (LLM 키 부재).', tags: [], cases: [] });
    }

    const body = await req.json();

    // body 형식 호환 — 외부 호출자(챗봇/MCP/구버전 클라이언트)가
    // {messages:[...]} 외의 형식으로 보내면 자동 정규화.
    // 지원 형식: {query|prompt|message|text|content: "..."} → 단일 user 메시지로 변환.
    let candidateMessages: unknown = body?.messages;
    if (!Array.isArray(candidateMessages)) {
      const singleText =
        (typeof body?.query === 'string' && body.query) ||
        (typeof body?.prompt === 'string' && body.prompt) ||
        (typeof body?.message === 'string' && body.message) ||
        (typeof body?.text === 'string' && body.text) ||
        (typeof body?.content === 'string' && body.content) ||
        '';
      if (singleText.trim()) {
        candidateMessages = [{ role: 'user', content: singleText.trim() }];
      }
    }

    const validation = validateMessages(candidateMessages);
    if (!validation.valid) {
      return NextResponse.json({ content: validation.error, tags: [], cases: [], comparison: null }, { status: 400 });
    }

    const { messages } = validation;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) {
      return NextResponse.json({ content: '질문을 입력해주세요.', tags: [], cases: [], comparison: null }, { status: 400 });
    }

    // === Timing 진단 (Step 3e) ===
    const _t = { start: Date.now(), tags: 0, search: 0, compMeta: 0, ctx: 0, totalPreLLM: 0 };

    // Step 1: 키워드 추출 (~1ms)
    const t_tags = Date.now();
    const tags = extractTags(lastUserMsg.content);
    _t.tags = Date.now() - t_tags;

    // Step 2: DB 검색 + 부가 지식DB 동시 — 직렬 await로 retrieval 뒤에 FAQ 13s 추가되던 것 병렬화.
    const t_search = Date.now();
    const t_faq = Date.now();
    // FAQ 호출에 6s timeout (Supabase pooler 10s 컷 회피).
    const faqWithTimeout = Promise.race<{ context: string; topIds: number[] }>([
      buildFaqContext(db, lastUserMsg.content, null).then((r) => ({ context: r.context, topIds: r.topIds })).catch(() => ({ context: '', topIds: [] })),
      new Promise<{ context: string; topIds: number[] }>((resolve) => setTimeout(() => resolve({ context: '', topIds: [] }), 6000)),
    ]);
    const [retrieval, faqResult] = await Promise.all([
      searchCases(tags, lastUserMsg.content),
      faqWithTimeout,
    ]);
    _t.search = Date.now() - t_search;
    const faqContext = faqResult.context;
    const topFaqIds = faqResult.topIds;
    const faqMs = Date.now() - t_faq;

    const t_compMeta = Date.now();
    const comparison = buildComparisonMeta(lastUserMsg.content, tags, retrieval.cases as unknown as Record<string, unknown>[]);
    _t.compMeta = Date.now() - t_compMeta;
    // LLM 실패 시 사용자에게 보여줄 검색 결과 보존
    retrievalCache = { tags: retrieval.tags, cases: retrieval.cases as unknown[], comparison };

    // Step 3: 프롬프트 조립 + 히스토리 트리밍
    const t_ctx = Date.now();
    const baseContext = buildUserContext(lastUserMsg.content, tags, retrieval.cases as unknown as Record<string, unknown>[]);
    const userContext = baseContext + faqContext;
    const trimmedMessages = trimHistory(messages, userContext);
    _t.ctx = Date.now() - t_ctx;
    _t.totalPreLLM = Date.now() - _t.start;

    // diagnostic payload — retrievalTiming은 retrieval.ts global state에서 가져옴
    const diagTiming = {
      tags: _t.tags,
      search: _t.search,
      embedding: _retrievalTiming.embedding,
      rpc: _retrievalTiming.rpc,
      rpcRows: _retrievalTiming.rpcRows,
      compMeta: _t.compMeta,
      ctx: _t.ctx,
      faq: faqMs,
      faqIds: topFaqIds,
      totalPreLLM: _t.totalPreLLM,
    };

    // Step 4: 스트리밍 여부 확인
    const wantsStream = body?.stream === true;

    if (wantsStream) {
      // SSE 스트리밍: DB 결과 즉시 전송 + AI 텍스트 점진적 전송
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // 즉시 DB 결과 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', tags: retrieval.tags, cases: retrieval.cases, comparison, diagTiming })}\n\n`));

          try {
            const { resp, provider } = await callLLM(SYSTEM_PROMPT, trimmedMessages, {
              stream: true,
              signal: AbortSignal.timeout(45_000),
            });

            if (!resp.body) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: '응답 생성에 실패했습니다.' })}\n\n`));
              controller.close();
              return;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              // newline 기준으로 split하되 마지막 incomplete line은 buffer에 남김
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const delta = provider === 'anthropic'
                    ? parsed.delta?.text
                    : parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullText += delta;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`));
                  }
                } catch { /* skip malformed */ }
              }
            }

            const structured = parseStructuredAiResponse(fullText);
            const fallbackPlain = extractPlainTextFromJsonLike(fullText) || fullText;
            const analysis = sanitizeAnalysis(structured?.plain_text || fallbackPlain);
            const finalComparison = structured
              ? buildComparisonFromStructured(structured, retrieval.allCases, comparison)
              : comparison;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: analysis, comparison: finalComparison, provider })}\n\n`));
          } catch {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: '응답 생성이 지연되고 있습니다.' })}\n\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // 기존 블로킹 모드 (하위 호환) — Gemini 우선 + OpenAI/Anthropic fallback
    const { resp, provider } = await callLLM(SYSTEM_PROMPT, trimmedMessages, {
      stream: false,
      signal: AbortSignal.timeout(45_000),
    });
    const data = await resp.json();
    // OpenAI-compat (Gemini, OpenAI): choices[0].message.content
    // Anthropic: content[0].text
    const rawAnalysis = provider === 'anthropic'
      ? (data.content?.[0]?.text || '분석 결과를 생성할 수 없습니다.')
      : (data.choices?.[0]?.message?.content || '분석 결과를 생성할 수 없습니다.');
    const structured = parseStructuredAiResponse(rawAnalysis);
    const fallbackPlain = extractPlainTextFromJsonLike(rawAnalysis) || rawAnalysis;
    const analysis = sanitizeAnalysis(structured?.plain_text || fallbackPlain);
    const finalComparison = structured
      ? buildComparisonFromStructured(structured, retrieval.allCases, comparison)
      : comparison;

    return NextResponse.json({
      content: analysis,
      tags: retrieval.tags,
      cases: retrieval.cases,
      comparison: finalComparison,
      provider,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    const llmFailedButHasResults = retrievalCache && (retrievalCache.cases?.length ?? 0) > 0;

    // LLM 실패해도 검색 결과 있으면 사용자에게 노출 (UX 안전장치)
    const message = llmFailedButHasResults
      ? 'AI 분석은 일시적으로 제공되지 않습니다. 아래 검색된 판정례를 직접 확인해 주세요.'
      : isTimeout
      ? '응답 생성이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
      : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

    console.error('[sanction] POST error:', error instanceof Error ? error.message : String(error));

    return NextResponse.json({
      content: message,
      tags: retrievalCache?.tags || [],
      cases: retrievalCache?.cases || [],
      comparison: retrievalCache?.comparison || null,
    });
  }
}
