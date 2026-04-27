import { NextRequest } from 'next/server';
import { SYSTEM_PROMPT } from '@/content/ai-knowledge';
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
import { checkChatRateLimit, extractIp, hashIp } from '@/lib/rate-limit';
import { getChatKillSwitch } from '@/lib/kill-switch';
import { verifyTurnstile, isTurnstileEnabled } from '@/lib/turnstile';
import { executeTool } from '@/lib/chat/tools/execute';
import { streamRound, type ToolCallAcc } from '@/lib/chat/stream-round';
import { buildFaqContext } from '@/lib/chat/context/faq';
import { buildNlrcCasesContext, buildCourtCasesContext } from '@/lib/chat/context/cases';
import { buildInterpretationsContext } from '@/lib/chat/context/interpretations';
import { buildNewsContext } from '@/lib/chat/context/news';

// Next.js segment config: literal value 필수 (import const 불가)
export const maxDuration = 60;

const db = supabaseAdmin || supabase;

function buildSearchQuery(messages: Array<{ role: string; content: string }>): {
  searchQuery: string;
  lastUserMsg: { role: string; content: string } | undefined;
} {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  let searchQuery = lastUserMsg?.content || '';

  if (lastUserMsg && messages.length > 1) {
    const isShortFollowup =
      lastUserMsg.content.length < 30 ||
      /^(그럼|그러면|그건|이건|왜|어떻게|네\?|뭐|아|그|이)\s/.test(lastUserMsg.content);
    if (isShortFollowup) {
      const prevUsers = messages
        .slice(0, -1)
        .filter((m) => m.role === 'user')
        .slice(-1);
      if (prevUsers.length > 0) {
        searchQuery = `${prevUsers[0].content} ${lastUserMsg.content}`.slice(0, 300);
      }
    }
  }
  return { searchQuery, lastUserMsg };
}

async function getQueryEmbedding(text: string): Promise<number[] | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;
  try {
    const embResp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
      signal: AbortSignal.timeout(5000),
    });
    if (embResp.ok) {
      const j = await embResp.json();
      return j.data?.[0]?.embedding ?? null;
    }
  } catch {
    // embedding 실패 시 hybrid only로 fallback
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // === Phase 0.1 비용 방어 게이트 ===
    // 1) 킬 스위치 (cost monitor가 임계 도달 시 자동 ON)
    const kill = await getChatKillSwitch();
    if (kill.disabled) {
      return new Response(
        JSON.stringify({
          error:
            '현재 AI 챗 서비스가 일시 중단되었습니다. 잠시 후 다시 시도해주세요. (베타 일일 한도 도달)',
          reason: kill.reason || 'kill_switch',
        }),
        { status: 503, headers: { 'Retry-After': '3600' } }
      );
    }

    const body = await req.json();
    const messages = body?.messages;
    const rawSessionId: string | undefined =
      typeof body?.sessionId === 'string' ? body.sessionId : undefined;
    const sessionId =
      rawSessionId && /^[a-z0-9_-]{12,64}$/i.test(rawSessionId) ? rawSessionId : null;

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return new Response(JSON.stringify({ error: '올바른 메시지 형식이 아닙니다.' }), {
        status: 400,
      });
    }

    const ip = extractIp(req);
    const ipHashed = hashIp(ip);

    // 2) Turnstile (env 미설정 시 자동 패스)
    if (isTurnstileEnabled()) {
      const tsToken: string | null =
        typeof body?.turnstileToken === 'string' ? body.turnstileToken : null;
      const tsResult = await verifyTurnstile(tsToken, ip);
      if (!tsResult.skipped && !tsResult.success) {
        return new Response(
          JSON.stringify({
            error: '봇 검증에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.',
            reason: tsResult.reason,
          }),
          { status: 403 }
        );
      }
    }

    // 3) 일일 rate limit (Global → IP → Session)
    const rl = await checkChatRateLimit({ ip: ipHashed, sessionId });
    if (!rl.allowed) {
      const msgByScope: Record<string, string> = {
        global:
          '오늘 베타 전체 무료 사용 한도를 모두 사용했습니다. 내일 다시 이용해주세요. 정식 출시 시 알림을 받으시려면 결제의향 폼을 이용해주세요.',
        ip: `오늘 IP 기준 무료 베타 한도(${rl.reason.max}건)를 모두 사용했습니다. 내일 다시 이용해주세요.`,
        session: `오늘 세션 기준 무료 베타 한도(${rl.reason.max}건)를 모두 사용했습니다. 정식 출시 시 알림을 받으시려면 결제의향 폼을 이용해주세요.`,
      };
      return new Response(
        JSON.stringify({
          error: msgByScope[rl.reason.scope] || '오늘 베타 한도를 초과했습니다.',
          scope: rl.reason.scope,
          count: rl.reason.count,
          max: rl.reason.max,
        }),
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }
    // === 게이트 끝 ===

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI 서비스가 준비되지 않았습니다.' }), {
        status: 503,
      });
    }

    const { searchQuery, lastUserMsg } = buildSearchQuery(messages);

    let faqContext = '';
    let caseContext = '';
    let topFaqIds: number[] = [];

    if (lastUserMsg) {
      const queryEmbedding = await getQueryEmbedding(searchQuery);

      const faq = await buildFaqContext(db, searchQuery, queryEmbedding);
      faqContext = faq.context;
      topFaqIds = faq.topIds;

      let nlrcLen = 0, interpLen = 0, courtLen = 0;
      if (queryEmbedding) {
        const [nlrc, interp, court] = await Promise.all([
          buildNlrcCasesContext(db, searchQuery, queryEmbedding),
          buildInterpretationsContext(db, queryEmbedding),
          buildCourtCasesContext(db, queryEmbedding),
        ]);
        nlrcLen = nlrc.length;
        interpLen = interp.length;
        courtLen = court.length;
        caseContext = nlrc + interp + court;
      }

      // 디버그: cases/interp/court 컨텍스트 길이를 categories 끝에 임시 marker로 저장 (silent fail 추적)
      const debugMarkers = [
        `_nlrc_len=${nlrcLen}`,
        `_interp_len=${interpLen}`,
        `_court_len=${courtLen}`,
        `_emb=${queryEmbedding ? 1 : 0}`,
      ];

      db.from('chat_logs')
        .insert({
          question: lastUserMsg.content.slice(0, 500),
          faq_matched: faq.matched,
          faq_count: faq.count,
          faq_categories: [...faq.categories, ...debugMarkers],
          session_id: sessionId,
          ip_hash: ipHashed,
        })
        .then(null, () => {});
    }

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

    const multiturnHint =
      messages.length > 2
        ? '\n\n═══ 멀티턴 대화 안내 ═══\n사용자의 직전 질문과 답변을 반드시 참조하여 후속 질문을 해석하세요. "그럼", "이건", "그건" 같은 지시어가 무엇을 가리키는지 이전 맥락에서 추론. 사용자 상황(회사 규모·근속기간·임금 등)이 이전 턴에 나왔다면 이를 토대로 맞춤 답변.'
        : '';

    let systemPrompt = SYSTEM_PROMPT + faqContext + caseContext + situationContext + multiturnHint;

    if (lastUserMsg) {
      systemPrompt += await buildNewsContext(supabase, lastUserMsg.content);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const toolHint =
      /퇴직금|통상임금|연장수당|야간수당|휴일수당|최저임금|시급.*환산|월급.*환산|얼마.*받|계산해/.test(
        lastUserMsg?.content || ''
      );

    const stream = new ReadableStream({
      async start(controller) {
        let assembledAnswer = '';
        let lastSeveranceArgs: Record<string, unknown> | null = null;
        const baseMsgs: unknown[] = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ];

        try {
          const r1 = await streamRound(apiKey, controller, baseMsgs, toolHint, encoder, decoder);
          assembledAnswer += r1.content;
          for (const tc of r1.toolCalls) {
            if (tc.name === 'calc_severance') {
              try {
                lastSeveranceArgs = JSON.parse(tc.arguments || '{}');
              } catch {}
            }
          }

          if (r1.toolCalls.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: '\n\n💡 노무 계산 중...' })}\n\n`)
            );
            const round2Msgs: unknown[] = [...baseMsgs];
            round2Msgs.push({
              role: 'assistant',
              content: r1.content || null,
              tool_calls: r1.toolCalls.map((tc: ToolCallAcc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });
            for (const tc of r1.toolCalls) {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.arguments || '{}');
              } catch {}
              const result = await executeTool(tc.name, parsedArgs);
              round2Msgs.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: ' 완료\n\n' })}\n\n`)
            );
            const r2 = await streamRound(apiKey, controller, round2Msgs, false, encoder, decoder);
            assembledAnswer += r2.content;
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: '스트리밍 중 오류가 발생했습니다.' })}\n\n`
            )
          );
        } finally {
          // 인용 누락 자동 footer
          const hasCitation =
            /\[FAQ#\d+|\[CASE#[A-Za-z0-9_\-]+|\[COURT#[^\]]+\]|\[INTERP#[^\]]+\]/.test(
              assembledAnswer
            );
          if (!hasCitation && topFaqIds.length > 0) {
            const footer = `\n\n---\n참고 FAQ: ${topFaqIds.map((id) => `[FAQ#${id}]`).join(', ')}`;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: footer })}\n\n`));
          }

          // 계산기 페이지 링크 자동 첨부
          if (lastSeveranceArgs) {
            const a = lastSeveranceArgs as Record<string, unknown>;
            const params = new URLSearchParams();
            if (typeof a.hire_date === 'string') params.set('start', a.hire_date);
            if (typeof a.last_work_date === 'string') params.set('end', a.last_work_date);
            const wages = Array.isArray(a.wages_3months) ? a.wages_3months : null;
            if (wages) {
              if (wages[0] != null) params.set('w1', String(wages[0]));
              if (wages[1] != null) params.set('w2', String(wages[1]));
              if (wages[2] != null) params.set('w3', String(wages[2]));
            }
            if (typeof a.annual_bonus === 'number' && a.annual_bonus > 0)
              params.set('bonusTotal', String(a.annual_bonus));
            params.set('run', '1');
            const link = `\n\n👉 [퇴직금 계산기에서 직접 확인 (퇴직소득세 포함)](https://노란봉투법.com/tools/severance.html?${params.toString()})`;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: link })}\n\n`));
          }

          // 법조항 실시간 검증
          try {
            const { hallucinated } = await verifyCitations(assembledAnswer);
            if (hallucinated.length > 0) {
              const warning =
                '\n\n⚠️ **검증 경고**: 답변에 인용된 일부 법조항이 현재 시점에서 확인되지 않았습니다 (' +
                hallucinated.map((h) => `${h.law} 제${h.article}조`).join(', ') +
                '). 정확한 조항은 법제처(law.go.kr)에서 재확인 권장합니다.';
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: warning })}\n\n`)
              );
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
      JSON.stringify({
        error: `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
