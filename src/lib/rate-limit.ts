import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { extractIp, hashIp } from '@/lib/client-ip';

// 기존 호출부(api/chat·payment-intent·subscribers)가 여기서 가져다 쓰고 있어 그대로 재수출한다.
export { extractIp, hashIp };

const db = supabaseAdmin || supabase;

const IP_DAILY_LIMIT = parseInt(process.env.CHAT_IP_DAILY_LIMIT || '50', 10);
const SESSION_DAILY_LIMIT = parseInt(process.env.CHAT_SESSION_DAILY_LIMIT || '30', 10);
// 글로벌 일일 cap — 비용 폭주 1차 방어선. 50,000원 임계 환산 ~1500req (gemini-2.5-flash 기준)
const GLOBAL_DAILY_LIMIT = parseInt(process.env.CHAT_GLOBAL_DAILY_LIMIT || '1500', 10);

export type RateLimitResult = {
  allowed: boolean;
  scope: 'ip' | 'session' | 'global';
  count: number;
  max: number;
  remaining: number;
};

async function incr(scope: 'ip' | 'session' | 'global', key: string, max: number): Promise<RateLimitResult> {
  try {
    const { data, error } = await db.rpc('incr_rate_limit', {
      p_scope: scope,
      p_key: key,
      p_max: max,
    });
    if (error || !data) {
      console.error('[rate-limit] fail-open', scope, error?.message ?? 'no data');
      return { allowed: true, scope, count: 0, max, remaining: max };
    }
    // RETURNS TABLE/SETOF면 PostgREST가 배열로 준다 → d.allowed가 undefined가 되고
    // 호출부의 `!result.allowed`가 항상 true여서 **전부 차단**되거나(챗), 반대 방향의
    // 비교를 쓰는 곳에서는 **전부 통과**한다. 어느 쪽이든 조용히 틀린다.
    const d = (Array.isArray(data) ? data[0] : data) as
      | { count?: number; allowed?: boolean; max?: number; remaining?: number }
      | undefined;
    if (!d || typeof d.allowed !== 'boolean') {
      console.error('[rate-limit] shape mismatch', scope, JSON.stringify(data).slice(0, 200));
      return { allowed: true, scope, count: 0, max, remaining: max };
    }
    return {
      allowed: d.allowed,
      scope,
      count: d.count ?? 0,
      max: d.max ?? max,
      remaining: d.remaining ?? Math.max(max - (d.count ?? 0), 0),
    };
  } catch (err) {
    // RPC 실패 시 fail-open (베타: 가용성 우선). 단 조용히 넘기지 않는다 —
    // 로그가 없으면 "리밋이 도는 중"과 "리밋이 죽어 무제한"을 구분할 수 없다.
    console.error('[rate-limit] exception', scope, err instanceof Error ? err.message : 'unknown');
    return { allowed: true, scope, count: 0, max, remaining: max };
  }
}

export async function checkChatRateLimit(opts: {
  ip: string;
  sessionId: string | null;
}): Promise<{ allowed: true } | { allowed: false; reason: RateLimitResult }> {
  // 1) 글로벌 cap 우선 — 비용 폭주 방어 (가장 먼저 차단되어야 다른 카운터 증가 안 함)
  const globalResult = await incr('global', 'all', GLOBAL_DAILY_LIMIT);
  if (!globalResult.allowed) return { allowed: false, reason: globalResult };

  // 2) IP cap
  const ipHash = opts.ip; // 이미 호출자가 hashIp 처리한 값을 받음
  const ipResult = await incr('ip', ipHash, IP_DAILY_LIMIT);
  if (!ipResult.allowed) return { allowed: false, reason: ipResult };

  // 3) 세션 cap
  if (opts.sessionId) {
    const sessionResult = await incr('session', opts.sessionId, SESSION_DAILY_LIMIT);
    if (!sessionResult.allowed) return { allowed: false, reason: sessionResult };
  }

  return { allowed: true };
}
