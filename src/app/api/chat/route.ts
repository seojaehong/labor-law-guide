import { NextRequest } from 'next/server';
import { SYSTEM_PROMPT, searchQA } from '@/content/ai-knowledge';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  getSituation,
  upsertSituation,
  formatSituationForPrompt,
  extractDelta,
  type UserSituation,
} from '@/lib/user-situation';

export const maxDuration = 60;

const db = supabaseAdmin || supabase;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages;
    const rawSessionId: string | undefined = typeof body?.sessionId === 'string' ? body.sessionId : undefined;
    // session id 검증 (UUID 또는 s_타임스탬프 형식만 허용, 길이 12-64)
    const sessionId = rawSessionId && /^[a-z0-9_-]{12,64}$/i.test(rawSessionId) ? rawSessionId : null;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return new Response(JSON.stringify({ error: '올바른 메시지 형식이 아닙니다.' }), { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI 서비스가 준비되지 않았습니다.' }), { status: 503 });
    }

    const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user');

    // 멀티턴 컨텍스트 보강: 직전 user 메시지가 짧은 follow-up일 가능성 → 이전 user 메시지 키워드 합쳐 FAQ 검색
    let searchQuery = lastUserMsg?.content || '';
    if (lastUserMsg && messages.length > 1) {
      const isShortFollowup = lastUserMsg.content.length < 30 ||
        /^(그럼|그러면|그건|이건|그건|왜|어떻게|네\?|뭐|아|그|이)\s/.test(lastUserMsg.content);
      if (isShortFollowup) {
        // 직전 user 메시지 (현재 제외) 찾기
        const prevUsers = messages
          .slice(0, -1)
          .filter((m: { role: string; content: string }) => m.role === 'user')
          .slice(-1);
        if (prevUsers.length > 0) {
          searchQuery = `${prevUsers[0].content} ${lastUserMsg.content}`.slice(0, 300);
        }
      }
    }

    // FAQ DB 매칭 — 3-layer: semantic(embedding) + hybrid(tsvector+trigram+ILIKE) + legacy
    let faqContext = '';
    if (lastUserMsg) {
      let dbFaq: Array<{ id: number; unified_category?: string; category?: string; question: string; answer: string }> | null = null;
      let dbErr: { message: string } | null = null;

      // 1) OpenAI 임베딩 생성 시도 (OPENAI_API_KEY 있을 때만)
      let queryEmbedding: number[] | null = null;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          const embResp = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: searchQuery, model: 'text-embedding-3-small' }),
            signal: AbortSignal.timeout(5000),
          });
          if (embResp.ok) {
            const j = await embResp.json();
            queryEmbedding = j.data?.[0]?.embedding ?? null;
          }
        } catch {
          // embedding 실패 시 hybrid only로 fallback
        }
      }

      // 2) search_faq_combined (임베딩 있으면 hybrid + semantic, 없으면 hybrid only)
      const combined = await db.rpc('search_faq_combined', {
        query_text: searchQuery,
        query_embedding: queryEmbedding,
        max_results: 8,
        canonical_only: false,
      });
      if (!combined.error && combined.data && combined.data.length > 0) {
        dbFaq = combined.data;
      } else if (combined.error) {
        // 3) combined RPC 에러 시 hybrid 단독 시도
        const hybrid = await db.rpc('search_faq_hybrid', {
          query_text: searchQuery,
          max_results: 8,
        });
        if (!hybrid.error && hybrid.data && hybrid.data.length > 0) {
          dbFaq = hybrid.data;
        } else {
          // 4) 최종 레거시 search_faq
          const legacy = await db.rpc('search_faq', {
            query: searchQuery,
            result_limit: 8,
          });
          dbFaq = legacy.data;
          dbErr = legacy.error;
        }
      }
      const faqMatched = !dbErr && dbFaq !== null && dbFaq.length > 0;
      const matchedFaqs = faqMatched && dbFaq ? dbFaq : [];
      const faqCategories = [...new Set(matchedFaqs.map((f) => f.unified_category || f.category || ''))].filter(Boolean);

      if (faqMatched) {
        faqContext = '\n\n═══ 관련 지식DB 매칭 결과 (참고하여 답변) ═══\n';
        for (const faq of matchedFaqs) {
          faqContext += `\n[${faq.unified_category || faq.category}] Q: ${faq.question}\nA: ${faq.answer}\n`;
        }
        faqContext += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
      } else {
        const inlineFaq = searchQA(lastUserMsg.content);
        if (inlineFaq.length > 0) {
          faqContext = '\n\n═══ 관련 예상질문 DB 매칭 결과 (참고하여 답변) ═══\n';
          for (const faq of inlineFaq.slice(0, 3)) {
            faqContext += `\nQ: ${faq.question}\nA: ${faq.answer}\n${faq.relatedArticle ? `관련조문: ${faq.relatedArticle}` : ''}\n`;
          }
          faqContext += '\n위 DB 내용을 참고하되, 질문에 맞게 자연스럽게 재구성하여 답변하세요.';
        }
      }

      db.from('chat_logs').insert({
        question: lastUserMsg.content.slice(0, 500),
        faq_matched: faqMatched,
        faq_count: matchedFaqs.length,
        faq_categories: faqCategories,
        session_id: sessionId,
      }).then(null, () => {});
    }

    // 멀티턴 안내 — 후속 질문에서 이전 대화 참조하도록
    const multiturnHint = messages.length > 2
      ? '\n\n═══ 멀티턴 대화 안내 ═══\n사용자의 직전 질문과 답변을 반드시 참조하여 후속 질문을 해석하세요. "그럼", "이건", "그건" 같은 지시어가 무엇을 가리키는지 이전 맥락에서 추론. 사용자 상황(회사 규모·근속기간·임금 등)이 이전 턴에 나왔다면 이를 토대로 맞춤 답변.'
      : '';

    // Phase 1.2: 사용자 상황 조회 + 현재 메시지 동기 추출 (sessionId 유효할 때만)
    let situationContext = '';
    let prevProfile: UserSituation = {};
    let mergedProfile: UserSituation = {};
    if (sessionId && lastUserMsg) {
      try {
        prevProfile = await getSituation(sessionId);
        const delta = await extractDelta(lastUserMsg.content, prevProfile, apiKey);
        mergedProfile = { ...prevProfile, ...delta };
        situationContext = formatSituationForPrompt(mergedProfile);
        // 응답과 병행해서 upsert (블로킹 X)
        upsertSituation(sessionId, prevProfile, delta, 1).catch(() => {});
      } catch {
        // 추출 실패해도 답변은 진행
      }
    }

    let systemPrompt = SYSTEM_PROMPT + faqContext + situationContext + multiturnHint;

    // 관련 뉴스 검색 (최신 5건)
    if (lastUserMsg) {
      const q = lastUserMsg.content.slice(0, 50).replace(/[%_\\,().]/g, '');
      const pattern = `%${q}%`;
      const { data: newsData } = await supabase
        .from('news')
        .select('title, source, published_at, summary')
        .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
        .order('published_at', { ascending: false })
        .limit(5);

      if (newsData && newsData.length > 0) {
        systemPrompt += '\n\n═══ 관련 최신 뉴스 (참고용, 출처 명시하여 답변) ═══\n';
        for (const n of newsData) {
          systemPrompt += `\n[${n.published_at?.slice(0, 10)}] ${n.title} (${n.source || '뉴스'})\n${n.summary?.slice(0, 150) || ''}\n`;
        }
      }
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_completion_tokens: 4096,
        temperature: 0.3,
        stream: true,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    // SSE streaming: pipe through to client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '스트리밍 중 오류가 발생했습니다.' })}\n\n`)
          );
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
