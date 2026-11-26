// A2A(Agent2Agent) 공개 수신구 — POST /api/a2a
//
// 왜 여기인가. 2026-11-25 재홍님 결정.
//   `.well-known/agent-card.json` 은 2026-04-18 부터 「여기 에이전트 있다」고 알리면서
//   정작 뒤에 처리기가 없었다(카드의 url 로 POST → 405). 밖에서 긁는 쪽은 그걸
//   「4개 중 0개 통과」로 읽었다. 집 서버 포트를 여는 대신 **이미 공개인 Vercel** 에 둔다.
//   외부 클라우드 에이전트(인스팅트)는 셸이 없어 SSH 터널을 못 쓰므로 HTTPS 만이 길이다.
//
// 지키는 선.
//   · 읽기만. 조회 외에 아무것도 하지 않는다 — 쓰기·발송·DB 수정 경로가 이 파일에 없다
//   · AI 를 부르지 않는다. DB 전문검색만 쓴다(비용 0, 지연 1초 미만)
//   · 확률·점수·적중률을 내지 않는다
//   · 토큰 없으면 401. **A2A_TOKEN 이 비어 있으면 503 으로 닫는다**(열어 두지 않는다)
//   · 분당 호출 제한. 스캐너가 또 긁는다
//   · 주민번호·계좌·전화 모양은 내보내기 전에 가린다
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractIp, hashIp, incrRateLimit } from '@/lib/rate-limit';
import { maskOut, shape, type A2AItem } from '@/lib/a2a/shape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN = process.env.A2A_TOKEN || '';
// 🔴 창은 **하루**다. `incr_rate_limit` 의 버킷이 `current_date` 라 분 단위가 아니다.
//    처음에 A2A_RATE_PER_MIN=20 으로 적었는데 실측에서 6번째 호출이 막혀 드러났다 —
//    이름이 「분당」인데 실제로는 「하루 20회」였다. 에이전트 연동에는 너무 좁다.
const PER_DAY = parseInt(process.env.A2A_RATE_PER_DAY || '200', 10);
const MAX_BODY = 20_000;
const MAX_RESULTS = 5;

type Kind = 'nlrc' | 'court' | 'admin';
const FN: Record<Kind, string> = {
  nlrc: 'search_nlrc',
  court: 'search_cases',
  admin: 'search_admin',
};

function rpcErr(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status });
}

async function lookup(query: string) {
  const safe = query.replace(/[%_\\'"();]/g, ' ').trim().slice(0, 100);
  if (safe.length < 2) return { kinds: {} as Record<string, A2AItem[]>, safe };
  const kinds: Record<string, A2AItem[]> = {};
  await Promise.all(
    (Object.keys(FN) as Kind[]).map(async (k) => {
      const { data, error } = await supabase.rpc(FN[k], {
        query: safe,
        result_limit: MAX_RESULTS,
        page_offset: 0,
      });
      if (error) return;
      kinds[k] = ((data || []) as Record<string, unknown>[]).map(shape);
    })
  );
  return { kinds, safe };
}

export async function POST(req: Request) {
  // 토큰이 설정돼 있지 않으면 **닫는다.** 빈 문자열 비교로 통과하면 공개 수신구가 무인증이 된다.
  if (!TOKEN) return rpcErr(null, -32060, 'endpoint disabled', 503);
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${TOKEN}`) return rpcErr(null, -32050, 'unauthorized', 401);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return rpcErr(null, -32600, 'too large', 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcErr(null, -32700, 'parse error');
  }
  const id = body.id ?? null;

  // IP 당 **하루** 제한. 카운터가 죽으면 **닫는 쪽**으로 실패한다 — 공개면이라 fail-open 을 쓰지 않는다.
  // 키에 `a2a:` 를 붙여 챗 경로와 칸을 나눈다(표는 chat_rate_limit 를 같이 쓴다).
  const ipKey = hashIp(extractIp(req));
  const rl = await incrRateLimit('ip', `a2a:${ipKey}`, PER_DAY);
  if (rl.failed || !rl.allowed) {
    return rpcErr(id, -32070, rl.failed ? 'rate limiter unavailable' : 'rate limited', 429);
  }

  const method = body.method;
  if (method !== 'message/send' && method !== 'SendMessage') {
    return rpcErr(id, -32601, 'method not found. 이 수신구는 조회만 한다(message/send)');
  }

  const params = (body.params ?? {}) as Record<string, unknown>;
  const msg = (params.message ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(msg.parts) ? (msg.parts as Record<string, unknown>[]) : [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('\n')
    .trim();
  if (!text) return rpcErr(id, -32602, 'message.parts[].text 가 비어 있다');

  const { kinds, safe } = await lookup(text);
  const total = Object.values(kinds).reduce((n, v) => n + v.length, 0);

  const taskId = `task-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const contextId = typeof msg.contextId === 'string' ? msg.contextId : `ctx-${taskId.slice(5)}`;

  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result: {
      task: {
        id: taskId,
        contextId,
        kind: 'task',
        status: { state: 'TASK_STATE_COMPLETED' },
        artifacts: [
          {
            artifactId: `a-${taskId}`,
            parts: [
              {
                kind: 'data',
                data: {
                  query: safe,
                  total,
                  // 이 수신구는 근거 자료만 돌려준다. 판단·점수는 내지 않는다.
                  note:
                    total === 0
                      ? '찾은 자료가 없다. 0건은 「없다」의 증거가 아니다 — 다른 낱말로 다시 물어볼 것'
                      : '사이트 자료에서 찾은 참고용 목록이다. 판단·확률·점수는 내지 않는다',
                  results: kinds,
                },
              },
            ],
          },
        ],
      },
    },
  });
}

export async function GET() {
  // 카드는 /.well-known/agent-card.json 에 있다. 여기로 GET 하면 길을 알려 준다.
  return NextResponse.json(
    { error: 'use POST (JSON-RPC 2.0, method=message/send)', card: '/.well-known/agent-card.json' },
    { status: 405 }
  );
}
