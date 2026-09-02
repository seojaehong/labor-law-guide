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
import { streamRound, lastRoundInfo, type ToolCallAcc } from '@/lib/chat/stream-round';
import { withTimeout, withTimeoutTagged, RETRIEVAL_TIMEOUT_MS, FAQ_TIMEOUT_MS } from '@/lib/chat/context/with-timeout';
import { type Retrieval, EMPTY_RETRIEVAL } from '@/lib/chat/context/result';
import { isAnthropicConfigured } from '@/lib/chat/anthropic-fallback';
import { getVertexClient } from '@/lib/vertex/client';
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

    // Vertex 자격증명 확인. 단, Vertex 가 죽어도 Anthropic 폴백이 있으면 계속 진행한다.
    // (2026-08-18: 이 게이트가 streamRound 앞에 있어서, 폴백을 붙여도 Vertex 설정 오류
    //  단계에서 503 으로 끊겨 폴백까지 도달하지 못하는 문제가 로컬 검증에서 드러남)
    try {
      getVertexClient();
    } catch (err) {
      if (!isAnthropicConfigured()) {
        return new Response(JSON.stringify({ error: 'AI 서비스가 준비되지 않았습니다.' }), {
          status: 503,
        });
      }
      console.warn('[chat] Vertex 클라이언트 생성 실패 — Anthropic 폴백으로 진행', {
        msg: (err as Error)?.message?.slice(0, 200),
      });
    }

    // 구간별 소요시간을 남긴다.
    // 2026-09-01: '첫 글자까지 29초' 장애를 진단할 때 서버에서 어느 구간이 느린지
    // 알 방법이 없어서, 밖에서 RPC 를 하나씩 때려보며 추정해야 했다. 같은 일을
    // 두 번 하지 않도록 계측을 코드에 박는다.
    const t0 = Date.now();
    const mark: Record<string, number> = {};

    const { searchQuery, lastUserMsg } = buildSearchQuery(messages);

    // 답변 첫 글자까지 걸리는 시간이 24~29초였다(2026-09-01 실측).
    // 원인은 두 가지였고 여기서 두 번째를 고친다 — 사전작업이 직렬이었다.
    //   임베딩 → FAQ → (검색3 병렬) → 상황조회 → 상황추출(LLM) → 상황저장 → 뉴스 → 생성
    // 상황추출과 뉴스는 임베딩 결과가 필요 없는데도 뒤에서 순서를 기다리고 있었다.
    // 임베딩을 기다리지 않아도 되는 것부터 먼저 띄워 전체를 max() 로 만든다.
    // 그리고 모든 검색에 상한을 건다 — 하나가 늦으면 그것만 버리고 답한다.

    let faqContext = '';
    let caseContext = '';
    let topFaqIds: number[] = [];
    let situationContext = '';
    let prevProfile: UserSituation = {};
    let mergedProfile: UserSituation = {};

    // (1) 임베딩과 무관한 작업을 먼저 시작한다
    const newsPromise = lastUserMsg
      ? withTimeout(buildNewsContext(supabase, lastUserMsg.content), RETRIEVAL_TIMEOUT_MS, '뉴스 컨텍스트', '')
      : Promise.resolve('');

    const situationPromise =
      sessionId && lastUserMsg
        ? withTimeout(
            (async () => {
              const prev = await getSituation(sessionId);
              const delta = await extractDelta(lastUserMsg.content, prev);
              return { prev, delta };
            })(),
            RETRIEVAL_TIMEOUT_MS,
            '상황 추출',
            null as { prev: UserSituation; delta: UserSituation } | null
          )
        : Promise.resolve(null);

    // (2) 임베딩이 필요한 검색들
    if (lastUserMsg) {
      const queryEmbedding = await withTimeout(
        getQueryEmbedding(searchQuery), RETRIEVAL_TIMEOUT_MS, '임베딩', null
      );
      mark.emb = Date.now() - t0;

      const emptyFaq = {
        context: '',
        topIds: [] as number[],
        matched: false,
        count: 0,
        categories: [] as string[],
      };
      const noEmbed: Retrieval = { ...EMPTY_RETRIEVAL, status: 'noembed' };

      const [faq, nlrc, interp, court] = await Promise.all([
        withTimeout(
          buildFaqContext(db, searchQuery, queryEmbedding),
          FAQ_TIMEOUT_MS,
          'FAQ 검색',
          emptyFaq
        ),
        queryEmbedding
          ? withTimeoutTagged(
              buildNlrcCasesContext(db, searchQuery, queryEmbedding),
              RETRIEVAL_TIMEOUT_MS,
              '판정례 검색',
              EMPTY_RETRIEVAL
            )
          : Promise.resolve({ value: noEmbed, timedOut: false, ms: 0 }),
        queryEmbedding
          ? withTimeoutTagged(
              buildInterpretationsContext(db, queryEmbedding),
              RETRIEVAL_TIMEOUT_MS,
              '행정해석 검색',
              EMPTY_RETRIEVAL
            )
          : Promise.resolve({ value: noEmbed, timedOut: false, ms: 0 }),
        queryEmbedding
          ? withTimeoutTagged(
              buildCourtCasesContext(db, queryEmbedding),
              RETRIEVAL_TIMEOUT_MS,
              '법원판례 검색',
              EMPTY_RETRIEVAL
            )
          : Promise.resolve({ value: noEmbed, timedOut: false, ms: 0 }),
      ]);

      mark.search = Date.now() - t0;
      faqContext = faq.context;
      topFaqIds = faq.topIds;
      caseContext = nlrc.value.ctx + interp.value.ctx + court.value.ctx;

      // 왜 비었는지까지 남긴다.
      //
      // _nlrc_len 계열은 이름을 유지한다 — 8일치 과거 로그와 비교할 수 있어야 한다.
      // 거기에 상태를 덧붙인다: ok / 0rows / error / noembed / timeout.
      // 2026-09-01 행정해석이 요청마다 사라졌을 때, 잘린 것과 0건이 마커에 똑같이 0 으로
      // 찍혀 원인을 좁힐 수 없었다. 같은 실수를 두 번 하지 않는다.
      const statusOf = (r: { value: Retrieval; timedOut: boolean; ms: number }) =>
        r.timedOut ? 'timeout' : r.value.status;

      const debugMarkers = [
        `_nlrc_len=${nlrc.value.ctx.length}`,
        `_interp_len=${interp.value.ctx.length}`,
        `_court_len=${court.value.ctx.length}`,
        `_emb=${queryEmbedding ? 1 : 0}`,
        `_nlrc=${statusOf(nlrc)}/${nlrc.value.via}/${nlrc.ms}ms`,
        `_interp=${statusOf(interp)}/${interp.ms}ms`,
        `_court=${statusOf(court)}/${court.ms}ms`,
      ];

      console.log('[chat] retrieval', {
        nlrc: { status: statusOf(nlrc), via: nlrc.value.via, rows: nlrc.value.rows, ms: nlrc.ms },
        interp: { status: statusOf(interp), rows: interp.value.rows, ms: interp.ms },
        court: { status: statusOf(court), rows: court.value.rows, ms: court.ms },
      });

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

    // (3) 병렬로 돌던 것을 회수한다
    const situation = await situationPromise;
    if (situation && sessionId) {
      prevProfile = situation.prev;
      mergedProfile = { ...situation.prev, ...situation.delta };
      situationContext = formatSituationForPrompt(mergedProfile);
      // 저장은 답변에 필요 없다. 기다리지 않는다.
      upsertSituation(sessionId, situation.prev, situation.delta, 1).catch(() => {});
    }

    const multiturnHint =
      messages.length > 2
        ? '\n\n═══ 멀티턴 대화 안내 ═══\n사용자의 직전 질문과 답변을 반드시 참조하여 후속 질문을 해석하세요. "그럼", "이건", "그건" 같은 지시어가 무엇을 가리키는지 이전 맥락에서 추론. 사용자 상황(회사 규모·근속기간·임금 등)이 이전 턴에 나왔다면 이를 토대로 맞춤 답변.'
        : '';

    const newsContext = await newsPromise;
    mark.ctxReady = Date.now() - t0;
    const systemPrompt =
      SYSTEM_PROMPT + faqContext + caseContext + situationContext + multiturnHint + newsContext;

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

        let r1ContentLen = 0;
        let r1ToolCalls = 0;
        let r2ContentLen = 0;
        let r2ToolCalls = 0;
        let r2Ran = false;
        // 생성 구간을 라운드별로 쪼개 잰다.
        // 2026-09-02 실측: ctxReady 3.04초 / done 12.88초 → 생성만 9.85초였다.
        // provider=vertex, vertexFailMs=0 이므로 폴백 대기가 아니다. 그렇다면 남은
        // 후보는 (a) 모델 자체가 느림 (b) 도구호출로 2라운드를 도는 것 둘이다.
        // 둘은 대응이 완전히 달라서(모델·프롬프트 vs 도구 정책) 먼저 갈라야 한다.
        const genStart = Date.now();
        let r1Ms = 0;
        try {
          const r1 = await streamRound(controller, baseMsgs, toolHint, encoder, decoder);
          r1Ms = Date.now() - genStart;
          assembledAnswer += r1.content;
          r1ContentLen = r1.content.length;
          r1ToolCalls = r1.toolCalls.length;
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
            const r2 = await streamRound(controller, round2Msgs, false, encoder, decoder);
            assembledAnswer += r2.content;
            r2ContentLen = r2.content.length;
            r2ToolCalls = r2.toolCalls.length;
            r2Ran = true;
          }
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: '스트리밍 중 오류가 발생했습니다.' })}\n\n`
            )
          );
          console.warn('[chat] stream error', { msg: (e as Error)?.message });
        } finally {
          // 본문 검증: 빈 답변이면 footer 대신 fallback. 진단용 round-level 로깅도 함께.
          const trimmedLen = assembledAnswer.trim().length;
          const hasContent = trimmedLen >= 50;
          const hasCitation =
            /\[FAQ#\d+|\[CASE#[A-Za-z0-9_\-]+|\[COURT#[^\]]+\]|\[INTERP#[^\]]+\]/.test(
              assembledAnswer
            );
          if (!hasContent) {
            // 본문 비어있음 — empty completion / round 2 silent fail / round 2 tool_call 미처리
            console.warn('[chat] empty answer body', {
              r1: { len: r1ContentLen, tcs: r1ToolCalls },
              r2: { ran: r2Ran, len: r2ContentLen, tcs: r2ToolCalls },
              question: lastUserMsg?.content?.slice(0, 80),
              assembledLen: trimmedLen,
              topFaqCount: topFaqIds.length,
            });
            const fallback =
              '⚠️ 답변 생성에 실패했습니다. 질문을 더 구체적으로 작성해주시거나 잠시 후 다시 시도해주세요. 빠른 답변이 필요하시면 우측 하단 채팅으로 문의해주세요.';
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`)
            );
            // footer는 보내지 않음 — 본문 없는데 출처만 보이는 46자 버그 차단
          } else if (!hasCitation && topFaqIds.length > 0) {
            const footer = `\n\n---\n참고 FAQ: ${topFaqIds.map((id) => `[FAQ#${id}]`).join(', ')}`;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: footer })}\n\n`));
          }
          // round-level 로그 (정상 케이스도 기록 — 추후 패턴 분석용)
          // 어느 구간이 시간을 먹는지 한 줄로 남긴다. 단위는 ms, 요청 시작 기준 누적이다.
          //   emb      임베딩까지
          //   search   검색 4종(병렬)까지
          //   ctxReady 시스템 프롬프트 완성까지 = 답변 생성 직전
          //   done     응답 종료까지
          // ctxReady 와 done 의 차이가 곧 모델 생성 시간이다.
          // 계측을 응답 스트림에도 싣는다.
          // vercel logs 스트리밍이 두 번 다 잡히지 않아 서버 밖에서 구간을 볼 방법이 없었다.
          // 클라이언트는 parsed.content 만 읽으므로 이 프레임은 화면에 나타나지 않는다.
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  debug: {
                    ...mark,
                    done: Date.now() - t0,
                    provider: lastRoundInfo.provider,
                    vertexFailMs: lastRoundInfo.vertexFailMs,
                    r1Ms,
                    r2Ran,
                    toolCalls: r1ToolCalls,
                    promptChars: systemPrompt.length,
                    answerChars: trimmedLen,
                  },
                })}\n\n`
              )
            );
          } catch {
            // 스트림이 이미 닫혔으면 무시한다. 계측 때문에 답변이 깨지면 안 된다.
          }
          console.log('[chat] timing_ms', {
            ...mark,
            done: Date.now() - t0,
            promptChars: systemPrompt.length,
            answerChars: trimmedLen,
          });
          console.log('[chat] round_summary', {
            r1: { len: r1ContentLen, tcs: r1ToolCalls },
            r2: { ran: r2Ran, len: r2ContentLen, tcs: r2ToolCalls },
            assembled: trimmedLen,
            hasContent,
            hasCitation,
          });

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
            const link = `\n\n👉 [퇴직금 계산기에서 직접 확인 (퇴직소득세 포함)](https://yellowenvelope.kr/tools/severance.html?${params.toString()})`;
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
