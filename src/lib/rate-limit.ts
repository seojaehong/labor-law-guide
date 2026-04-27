import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

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

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'yh-bok-default-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  if (first) return first;
  return req.headers.get('x-real-ip') || 'unknown';
}

async function incr(scope: 'ip' | 'session' | 'global', key: string, max: number): Promise<RateLimitResult> {
  try {
    const { data, error } = await db.rpc('incr_rate_limit', {
      p_scope: scope,
      p_key: key,
      p_max: max,
    });
    if (error || !data) {
      return { allowed: true, scope, count: 0, max, remaining: max };
    }
    const d = data as { count: number; allowed: boolean; max: number; remaining: number };
    return { allowed: d.allowed, scope, count: d.count, max: d.max, remaining: d.remaining };
  } catch {
    // RPC 실패 시 fail-open (베타: 가용성 우선, 비용 캡은 spend monitor가 잡음)
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
