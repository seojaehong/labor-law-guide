// 보유기간이 지난 개인정보를 지운다(처리방침 2절). Vercel 크론이 매일 부른다(vercel.json).
// Vercel 은 CRON_SECRET 이 있으면 Authorization: Bearer <값> 을 붙여 부른다.
import { NextResponse } from 'next/server';
import { runRetention } from '@/lib/retention';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'retention disabled' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // supabase-server 는 불러오는 순간 클라이언트를 만든다 — 인증을 통과한 뒤에만 부른다.
  const { supabaseAdmin } = await import('@/lib/supabase-server');
  if (!supabaseAdmin) return NextResponse.json({ error: 'retention disabled' }, { status: 503 });
  const result = await runRetention(supabaseAdmin);
  const failed = result.filter((r) => r.error);
  return NextResponse.json({ ok: failed.length === 0, result }, { status: failed.length ? 500 : 200 });
}
