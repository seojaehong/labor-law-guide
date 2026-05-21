import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendConfirmEmail } from '@/lib/newsletter-mail';

// pending 상태로 3~10일 경과 + 리마인드 미발송 구독자에게 확인 메일 1회 재발송.
// admin auth: ?token=$ADMIN_TOKEN. crontab에서 curl로 호출.
// 한 사람당 리마인드는 최대 1회 (reminder_sent_at 마킹).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.nextUrl.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!expected || !got || got !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_admin_unavailable' }, { status: 500 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
  const now = Date.now();
  const minAge = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();  // 3일 이상 경과
  const maxAge = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10일 넘으면 포기

  const { data: targets, error } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, confirm_token, created_at')
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .lte('created_at', minAge)
    .gte('created_at', maxAge);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = targets ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, message: 'no pending targets' });
  }

  let sent = 0;
  const failures: string[] = [];
  for (const sub of rows) {
    if (!sub.confirm_token) continue;
    if (dryRun) {
      sent += 1;
      continue;
    }
    try {
      await sendConfirmEmail({ to: sub.email, confirmToken: sub.confirm_token });
      await supabaseAdmin
        .from('subscribers')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', sub.id);
      sent += 1;
    } catch (e) {
      failures.push(`${sub.id}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    candidates: rows.length,
    reminded: sent,
    failures,
  });
}
