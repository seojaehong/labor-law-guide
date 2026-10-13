import { NextRequest, NextResponse } from 'next/server';
import { extractTags, searchCases, _retrievalTiming } from '@/lib/ai/retrieval';
import { buildComparisonMeta, buildUserContext, trimHistory, type ComparisonMeta } from '@/lib/ai/prompt';
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

/**
 * 혹시 모델이 옛 형식대로 JSON 을 뱉으면 본문만 건져낸다.
 *
 * 2026-09-19 이전에는 JSON 스키마(issue_summary/similar_cases/…/plain_text)로 받았다.
 * 지금은 산문만 받지만, 캐시된 프롬프트나 모델 변덕으로 JSON 이 올 수 있어 안전망을 남긴다.
 * 잘린 JSON 에서도 plain_text 값만 정규식으로 살린다.
 */
function unwrapLegacyJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return text;
  const m = trimmed.match(/"plain_text"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!m) return text;
  return m[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * 비교 결과는 전부 DB 에서 만든다. LLM 은 본문 설명(plain_text)만 쓴다.
 *
 * ★ 2026-09-19. 두 단계로 여기까지 왔다.
 *
 * 1단계 — 종전에는 LLM 이 낸 similar_cases 를 텍스트 유사도로 DB 행에 되맞춰 카드를 만들었다.
 *   임계가 `단어겹침 + (승패 일치 시 0.15) >= 0.3` 이라 승패만 맞으면 실질 15% 였고,
 *   실측 사고: 「징계사유의 정당성을 인정하지 않았고…」가 「정당성을·사용자의·여부가」
 *   세 단어로 id_26697(식자재 무단취식)에 붙어 기밀유출 질문의 답으로 나갔다.
 *   되맞춤 풀(60행)이 LLM 이 본 사건(5건)보다 넓어 본 적 없는 행에도 붙을 수 있었다.
 *
 * 2단계 — 쟁점 요약·핵심 차이·체크리스트까지 판정문 원문에서 집계하도록 바꿨다(lib/ai/issues.ts).
 *   그러면 LLM 이 덮어쓸 자리가 없다. 그래서 이 함수는 사라지고, comparison 을 그대로 쓴다.
 *
 * 남은 LLM 의 몫은 본문 산문뿐이고, 거기서도 개별 사건 언급과
 * "유사 사건에서는 대체로…" 식 집합 판단은 SYSTEM_PROMPT 에서 금지한다.
 */

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
    interface FaqRef { id: number; category: string; question: string; answer: string; source: string }
    const _t = { start: Date.now(), tags: 0, search: 0, compMeta: 0, ctx: 0, totalPreLLM: 0 };
    let faqEntries: FaqRef[] = [];

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

    // UI 노출용 — 매칭된 FAQ 본문 fetch (id로 5건)
    if (topFaqIds.length > 0) {
      try {
        const { data: faqRows } = await db
          .from('faq')
          .select('id, question, answer, source, unified_category')
          .in('id', topFaqIds)
          .limit(5);
        if (Array.isArray(faqRows)) {
          // topFaqIds 순서 유지
          const byId = new Map(faqRows.map((f) => [f.id, f]));
          faqEntries = topFaqIds
            .map((id) => byId.get(id))
            .filter((f): f is { id: number; question: string; answer: string; source: string; unified_category: string } => !!f)
            .map((f) => ({
              id: f.id,
              category: f.unified_category || '',
              question: f.question || '',
              answer: f.answer || '',
              source: f.source || '',
            }));
        }
      } catch { /* skip — meta event는 ids만 노출 */ }
    }

    const t_compMeta = Date.now();
    const comparison = buildComparisonMeta(
      lastUserMsg.content,
      tags,
      retrieval.cases as unknown as Record<string, unknown>[],
      // 쟁점 추출은 자르기 전 원문으로 — cases 의 holding_points 는 150자로 잘려 있다.
      retrieval.allCases,
    );
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', tags: retrieval.tags, cases: retrieval.cases, comparison, diagTiming, faqs: faqEntries, degraded: retrieval.degraded })}\n\n`));

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

            const analysis = sanitizeAnalysis(unwrapLegacyJson(fullText));
            // 카드·쟁점·차이·체크리스트는 모두 DB 산출물이다. LLM 이 바꾸지 않는다.
            const finalComparison = comparison;
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
    const analysis = sanitizeAnalysis(unwrapLegacyJson(rawAnalysis));
    // 카드·쟁점·차이·체크리스트는 모두 DB 산출물이다. LLM 이 바꾸지 않는다.
    const finalComparison = comparison;

    return NextResponse.json({
      content: analysis,
      tags: retrieval.tags,
      cases: retrieval.cases,
      comparison: finalComparison,
      provider,
      degraded: retrieval.degraded,
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
