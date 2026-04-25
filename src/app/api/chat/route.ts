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
import { verifyCitations } from '@/lib/legal-verify';

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

    let caseContext = '';
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
          faqContext += `\n#${faq.id} [${faq.unified_category || faq.category}] Q: ${faq.question}\nA: ${faq.answer}\n`;
        }
        faqContext +=
          '\n[인용 규칙 — 반드시 준수]\n' +
          '1) 위 DB 내용을 토대로 답변하세요. 그대로 복사 X, 질문 맥락에 맞춰 재구성.\n' +
          '2) DB 매칭이 있는 경우(=위에 항목들이 보일 때) 답변에 최소 1건 이상 `[FAQ#숫자]` 형식 출처를 반드시 포함하세요. 예: "5인 미만 사업장은 부당해고 구제신청 대상이 아닙니다 [FAQ#12345].".\n' +
          '3) 여러 항목을 종합한 경우 `[FAQ#123, FAQ#456]` 콤마로 나열.\n' +
          '4) 출처 표기를 빼면 사용자가 답변을 검증할 수 없으므로 출처 표기는 신뢰 최우선 사항입니다.';
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

      // Phase 2.1: 노동위 판정례 (nlrc) 검색
      if (queryEmbedding) {
        try {
          const caseResult = await db.rpc('search_similar_cases_hybrid', {
            query_text: searchQuery.slice(0, 500),
            query_embedding: queryEmbedding,
            category: '',
            match_count: 3,
            semantic_weight: 0.6,
          });
          if (!caseResult.error && Array.isArray(caseResult.data) && caseResult.data.length > 0) {
            const cases = caseResult.data as Array<{
              id: string;
              title: string;
              decision_result?: string;
              holding_summary?: string;
              key_issue?: string;
              decision_date?: string;
            }>;
            caseContext = '\n\n═══ 관련 노동위 판정례 (3건, 답변 시 [CASE#id] 형식 인용) ═══\n';
            for (const c of cases) {
              const date = c.decision_date ? c.decision_date.slice(0, 10) : '';
              const summary = (c.holding_summary || c.key_issue || '').slice(0, 280);
              caseContext += `\n#${c.id} [${date}${c.decision_result ? ' / ' + c.decision_result : ''}] ${c.title}\n  ${summary}\n`;
            }
            caseContext +=
              '\n[판정례 인용 규칙] 답변에서 위 노동위 판정례 인용 시 `[CASE#id]` 형식 사용. 사용자 케이스와 사실관계가 다르면 차이점 명시.';
          }
        } catch {
          // 판례 검색 실패해도 답변 진행
        }

        // Phase 2.1-C: 법원 판례 (cases) 시맨틱 검색
        try {
          const courtResult = await db.rpc('search_cases_semantic', {
            query_embedding: queryEmbedding,
            max_results: 2,
            min_similarity: 0.4,
          });
          if (!courtResult.error && Array.isArray(courtResult.data) && courtResult.data.length > 0) {
            const courts = courtResult.data as Array<{
              id: string;
              title: string;
              court?: string;
              decision_date?: string;
              verdict_type?: string;
              summary?: string;
            }>;
            caseContext += '\n\n═══ 관련 법원 판례 (최대 2건, 답변 시 [COURT#id] 형식 인용) ═══\n';
            for (const c of courts) {
              const date = c.decision_date && c.decision_date !== '0001-01-01' ? c.decision_date : '';
              const summary = (c.summary || '').slice(0, 280);
              caseContext += `\n#${c.id} [${c.court || ''} ${date}${c.verdict_type ? ' / ' + c.verdict_type : ''}] ${c.title}\n  ${summary}\n`;
            }
            caseContext += '\n[법원 판례 인용 규칙] 답변에서 인용 시 `[COURT#id]` 형식. 대법원·고법 판시는 결정적 근거로 활용.';
          }
        } catch {
          // 법원 판례 실패해도 답변 진행
        }
      }

      db.from('chat_logs').insert({
        question: lastUserMsg.content.slice(0, 500),
        faq_matched: faqMatched,
        faq_count: matchedFaqs.length,
        // legal_citations / hallucinated_citations는 stream 종료 후 update
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
        await upsertSituation(sessionId, prevProfile, delta, 1);
      } catch {
        // 추출/저장 실패해도 답변은 진행
      }
    }

    let systemPrompt = SYSTEM_PROMPT + faqContext + caseContext + situationContext + multiturnHint;

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

    // Phase 1.4-B: 인용 누락 시 자동 footer 첨부용 — top FAQ id 보관
    const topFaqIds = (() => {
      const faqMatch = faqContext.match(/^#(\d+)\s/m);
      const ids: number[] = [];
      const re = /^#(\d+)\s/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(faqContext)) !== null) {
        ids.push(parseInt(m[1], 10));
        if (ids.length >= 3) break;
      }
      return ids;
    })();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';
        let assembledAnswer = '';

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
                  assembledAnswer += content;
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
          // Phase 1.4-B: 인용 누락 자동 보정 — DB 매칭이 있었는데 [FAQ#] 0건이면 footer 첨부
          const hasCitation = /\[FAQ#\d+|\[CASE#[A-Za-z0-9_\-]+|\[COURT#[^\]]+\]/.test(assembledAnswer);
          if (!hasCitation && topFaqIds.length > 0) {
            const footer = `\n\n---\n참고 FAQ: ${topFaqIds.map((id) => `[FAQ#${id}]`).join(', ')}`;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: footer })}\n\n`));
          }

          // Phase 2.3: 법조항 실시간 검증 (캐시 lookup, ~100-200ms)
          try {
            const { hallucinated } = await verifyCitations(assembledAnswer);
            if (hallucinated.length > 0) {
              const warning =
                '\n\n⚠️ **검증 경고**: 답변에 인용된 일부 법조항이 현재 시점에서 확인되지 않았습니다 (' +
                hallucinated.map((h) => `${h.law} 제${h.article}조`).join(', ') +
                '). 정확한 조항은 법제처(law.go.kr)에서 재확인 권장합니다.';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: warning })}\n\n`));
            }
          } catch {
            // 검증 실패해도 답변 자체는 영향 없음
          }

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
