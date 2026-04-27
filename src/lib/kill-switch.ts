import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;

export type KillSwitchState = {
  disabled: boolean;
  reason?: string;
  until?: string; // ISO date
};

let cache: { state: KillSwitchState; expiresAt: number } | null = null;
const TTL_MS = 30_000; // 30초 캐시 (스파이크 시 DB 폭증 방지)

export async function getChatKillSwitch(): Promise<KillSwitchState> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.state;

  try {
    const { data, error } = await db.rpc('get_system_flag', { p_key: 'chat_kill_switch' });
    if (error || !data) {
      const empty: KillSwitchState = { disabled: false };
      cache = { state: empty, expiresAt: now + TTL_MS };
      return empty;
    }
    const raw = data as Partial<KillSwitchState>;
    const state: KillSwitchState = {
      disabled: !!raw.disabled,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      until: typeof raw.until === 'string' ? raw.until : undefined,
    };
    // until 만료 시 자동 해제
    if (state.disabled && state.until && Date.parse(state.until) < now) {
      state.disabled = false;
    }
    cache = { state, expiresAt: now + TTL_MS };
    return state;
  } catch {
    return { disabled: false };
  }
}

export function clearKillSwitchCache() {
  cache = null;
}
