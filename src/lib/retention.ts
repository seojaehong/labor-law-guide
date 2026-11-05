import type { SupabaseClient } from '@supabase/supabase-js';
import { RETENTION } from '@/lib/privacy-retention';

// 처리방침 2절 보유기간을 DB 삭제로 옮긴다. 일수는 RETENTION 에서만 읽는다.
type Step = { table: string; column: string; before: string; status?: string };

const days = (table: string) => {
  const r = RETENTION.find((x) => x.table?.split('·').includes(table));
  if (!r) throw new Error(`보유기간 없음: ${table}`);
  return r.days;
};

export function retentionPlan(now: Date): Step[] {
  const cut = (table: string) => new Date(now.getTime() - days(table) * 86_400_000).toISOString();
  return [
    { table: 'chat_logs', column: 'created_at', before: cut('chat_logs') },
    { table: 'user_situation', column: 'updated_at', before: cut('user_situation') },
    { table: 'chat_rate_limit', column: 'last_at', before: cut('chat_rate_limit') },
    // 피드백(work_rules_precise_feedback)은 외래키 ON DELETE CASCADE 로 같이 지워진다.
    { table: 'work_rules_precise_runs', column: 'created_at', before: cut('work_rules_precise_runs') },
    // 구독 중인 사람은 지우지 않는다. 발송 기록(subscriber_sends)은 CASCADE.
    { table: 'subscribers', column: 'unsubscribed_at', before: cut('subscribers'), status: 'unsubscribed' },
    { table: 'subscribers', column: 'created_at', before: cut('subscribers'), status: 'pending' },
    { table: 'subscriber_sends', column: 'sent_at', before: cut('subscriber_sends') },
    { table: 'email_events', column: 'received_at', before: cut('email_events') },
  ];
}

export async function runRetention(db: SupabaseClient, now = new Date()) {
  const out: { table: string; status?: string; deleted: number | null; error?: string }[] = [];
  for (const s of retentionPlan(now)) {
    let q = db.from(s.table).delete({ count: 'exact' }).lt(s.column, s.before);
    if (s.status) q = q.eq('status', s.status);
    const { count, error } = await q;
    out.push({ table: s.table, status: s.status, deleted: count, error: error?.message });
  }
  return out;
}
