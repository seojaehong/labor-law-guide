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
import {
  checkMinWage,
  calcOrdinaryWage,
  calcOvertime,
  calcSeverance,
  lookupLawArticle,
} from '@/lib/labor-calc';

// Phase 3.1-B: 노무 계산 도구 정의 (OpenAI tools format)
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'calc_severance',
      description:
        '퇴직금 계산. 사용자가 입사일·퇴사일·직전 3개월 임금을 알려준 경우 호출. 추측 X.',
      parameters: {
        type: 'object',
        properties: {
          hire_date: { type: 'string', description: 'YYYY-MM-DD 입사일' },
          last_work_date: { type: 'string', description: 'YYYY-MM-DD 마지막 근무일' },
          wages_3months: {
            type: 'array',
            items: { type: 'integer' },
            description: '[전3개월급, 전2개월급, 전1개월급] 세전 원',
          },
          annual_bonus: { type: 'integer', description: '연간 상여금 총액 (원)' },
          unused_annual_leave_days: { type: 'integer' },
          annual_leave_daily_wage: { type: 'integer' },
        },
        required: ['hire_date', 'last_work_date', 'wages_3months'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calc_ordinary_wage',
      description: '통상임금(시급/일급) 산정. 정기·일률·고정 임금 월액을 받아 시급/일급 환산.',
      parameters: {
        type: 'object',
        properties: {
          monthly_fixed_pay: { type: 'integer', description: '매월 정기·일률 임금 합계 (원)' },
          monthly_hours: { type: 'integer', description: '월 소정근로시간 (기본 209)' },
        },
        required: ['monthly_fixed_pay'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calc_overtime',
      description: '연장·야간·휴일근로 가산수당 계산.',
      parameters: {
        type: 'object',
        properties: {
          ordinary_hourly: { type: 'integer', description: '통상시급 (원)' },
          overtime_hours: { type: 'number', description: '연장근로 시간' },
          night_hours: { type: 'number', description: '야간근로 시간 (22:00~06:00)' },
          holiday_hours_within_8: { type: 'number', description: '휴일 8h 이내' },
          holiday_hours_over_8: { type: 'number', description: '휴일 8h 초과' },
        },
        required: ['ordinary_hourly'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_min_wage',
      description: '최저임금 위반 여부 검증. 기본급 + 고정수당 합계가 월 최저임금 이상인지.',
      parameters: {
        type: 'object',
        properties: {
          base_pay: { type: 'integer', description: '기본급 (원)' },
          fixed_allowances: { type: 'integer', description: '매월 고정 지급 수당 합계' },
          year: { type: 'integer', description: '연도 (기본 2026)' },
          monthly_hours: { type: 'integer', description: '월 소정근로시간 (기본 209)' },
        },
        required: ['base_pay'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_law_article',
      description: '법조항 존재 여부와 제목 조회 (법제처 캐시).',
      parameters: {
        type: 'object',
        properties: {
          law: { type: 'string', description: '예: 근로기준법, 노동조합 및 노동관계조정법' },
          article: { type: 'integer', description: '조항 번호' },
        },
        required: ['law', 'article'],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'calc_severance':
      return calcSeverance(args as Parameters<typeof calcSeverance>[0]);
    case 'calc_ordinary_wage':
      return calcOrdinaryWage(args as Parameters<typeof calcOrdinaryWage>[0]);
    case 'calc_overtime':
      return calcOvertime(args as Parameters<typeof calcOvertime>[0]);
    case 'check_min_wage':
      return checkMinWage(args as Parameters<typeof checkMinWage>[0]);
    case 'lookup_law_article':
      return await lookupLawArticle(args as Parameters<typeof lookupLawArticle>[0]);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

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

        // Phase 2.2: 행정해석 시맨틱 검색 (molab_interpretations)
        try {
          const interpResult = await db.rpc('search_interpretation_semantic', {
            query_embedding: queryEmbedding,
            max_results: 3,
            min_similarity: 0.35,
          });
          if (!interpResult.error && Array.isArray(interpResult.data) && interpResult.data.length > 0) {
            const interps = interpResult.data as Array<{
              id: string;
              case_number?: string;
              title: string;
              inquiry_summary?: string;
              answer_summary?: string;
              decision_date?: string;
              url?: string;
            }>;
            caseContext += '\n\n═══ 관련 행정해석 (3건, 답변 시 [INTERP#id] 인용) ═══\n';
            for (const it of interps) {
              const date = it.decision_date || '';
              const summary = (it.answer_summary || it.inquiry_summary || '').slice(0, 280);
              caseContext += `\n#${it.id} [${it.case_number || ''} ${date}] ${it.title}\n  ${summary}\n`;
            }
            caseContext +=
              '\n[행정해석 인용 규칙] 답변 시 위 회신을 인용할 때 `[INTERP#id]` 형식 (id는 위 #뒤 ml_xxxx 그대로). 행정해석은 노동부 공식 입장.';
          }
        } catch {
          // 행정해석 검색 실패해도 답변 진행
        }

        // Phase 2.1-C: 법원 판례 (cases) 시맨틱 검색
        try {
          const courtResult = await db.rpc('search_cases_semantic', {
            query_embedding: queryEmbedding,
            max_results: 5,
            min_similarity: 0.35,
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
            caseContext += '\n\n═══ 관련 법원 판례 (최대 5건) ═══\n';
            for (const c of courts) {
              const date = c.decision_date && c.decision_date !== '0001-01-01' ? c.decision_date : '';
              const summary = (c.summary || '').slice(0, 280);
              caseContext += `\n#${c.id} [${c.court || ''} ${date}${c.verdict_type ? ' / ' + c.verdict_type : ''}] ${c.title}\n  ${summary}\n`;
            }
            caseContext +=
              '\n[법원 판례 인용 규칙 — 반드시 준수]\n' +
              '1) 답변에서 위 판례 중 관련된 것을 인용할 때 반드시 `[COURT#id]` 형식 사용 (id는 위 #뒤 문자열 그대로). 예: "대법원은 정기상여금이 통상임금 요건을 충족하면 인정한다고 판시 [COURT#대법원_2023다302838].".\n' +
              '2) 일반적인 "대법원은 ... 라고 판시" 식으로 답변하지 말고 위 DB의 구체적 판례 id를 사용하세요.\n' +
              '3) 학습 데이터에 있는 판례번호("2020다247190" 등)를 임의로 인용하지 말고, 반드시 위 DB에 있는 id만 인용하세요.';
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

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Phase 3.1-B: 멀티라운드 LLM 호출 (tool_calls 지원)
    // 도구 사용을 유도하는 키워드가 있으면 1라운드에서 tools 활성화
    const toolHint = /퇴직금|통상임금|연장수당|야간수당|휴일수당|최저임금|시급.*환산|월급.*환산|얼마.*받|계산해/.test(
      lastUserMsg?.content || ''
    );
    const callLLM = async (msgs: unknown[], withTools: boolean) => {
      const reqBody: Record<string, unknown> = {
        model: 'gemini-2.5-flash',
        messages: msgs,
        max_completion_tokens: 4096,
        temperature: 0.3,
        stream: true,
      };
      if (withTools) {
        reqBody.tools = TOOLS;
        reqBody.tool_choice = 'auto';
      }
      return fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(50000),
      });
    };

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

    type ToolCallAcc = { id: string; name: string; arguments: string };
    const streamRound = async (
      controller: ReadableStreamDefaultController<Uint8Array>,
      msgs: unknown[],
      withTools: boolean
    ): Promise<{ content: string; toolCalls: ToolCallAcc[] }> => {
      const resp = await callLLM(msgs, withTools);
      if (!resp.ok) throw new Error(await resp.text());
      const reader = resp.body?.getReader();
      if (!reader) return { content: '', toolCalls: [] };
      let buffer = '';
      let content = '';
      const toolCallsMap: Record<number, ToolCallAcc> = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || !t.startsWith('data: ')) continue;
          const d = t.slice(6);
          if (d === '[DONE]') continue;
          try {
            const p = JSON.parse(d);
            const delta = p.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              content += delta.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`));
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: tc.id || `call_${idx}`, name: '', arguments: '' };
                if (tc.id) toolCallsMap[idx].id = tc.id;
                if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
              }
            }
          } catch {
            // skip malformed
          }
        }
      }
      return { content, toolCalls: Object.values(toolCallsMap) };
    };

    const stream = new ReadableStream({
      async start(controller) {
        let assembledAnswer = '';
        const baseMsgs: unknown[] = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ];

        try {
          // Round 1 — tools enabled if hint
          const r1 = await streamRound(controller, baseMsgs, toolHint);
          assembledAnswer += r1.content;

          // 도구 호출이 있으면 실행 + 라운드 2 (tools 없이)
          if (r1.toolCalls.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: '\n\n💡 노무 계산 중...' })}\n\n`)
            );
            const round2Msgs: unknown[] = [...baseMsgs];
            // assistant tool_calls message
            round2Msgs.push({
              role: 'assistant',
              content: r1.content || null,
              tool_calls: r1.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });
            // tool result messages
            for (const tc of r1.toolCalls) {
              let parsedArgs: Record<string, unknown> = {};
              try { parsedArgs = JSON.parse(tc.arguments || '{}'); } catch {}
              const result = await executeTool(tc.name, parsedArgs);
              round2Msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: ' 완료\n\n' })}\n\n`)
            );
            const r2 = await streamRound(controller, round2Msgs, false);
            assembledAnswer += r2.content;
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '스트리밍 중 오류가 발생했습니다.' })}\n\n`)
          );
        } finally {
          // Phase 1.4-B: 인용 누락 자동 보정 — DB 매칭이 있었는데 [FAQ#] 0건이면 footer 첨부
          const hasCitation = /\[FAQ#\d+|\[CASE#[A-Za-z0-9_\-]+|\[COURT#[^\]]+\]|\[INTERP#[^\]]+\]/.test(assembledAnswer);
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
