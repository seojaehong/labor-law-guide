import { NextRequest, NextResponse } from 'next/server';
import { getSituation, upsertSituation, formatSituationForPrompt } from '@/lib/user-situation';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SESSION_RX = /^[a-z0-9_-]{12,64}$/i;
const db = supabaseAdmin || supabase;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
  if (!SESSION_RX.test(sessionId)) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
  }
  const profile = await getSituation(sessionId);
  return NextResponse.json({
    profile,
    summary: formatSituationForPrompt(profile).trim(),
    has_profile: Object.keys(profile).length > 0,
  });
}

// 사용자가 직접 정정할 때 — UI 토글로 잘못 추출된 키 제거 가능
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string = body?.sessionId || '';
  if (!SESSION_RX.test(sessionId)) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
  }
  const op: string = body?.op || 'merge';
  const updates = body?.updates;

  const prev = await getSituation(sessionId);

  if (op === 'clear') {
    await db.from('user_situation').delete().eq('session_id', sessionId);
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (op === 'remove' && Array.isArray(updates)) {
    const next = { ...prev };
    for (const k of updates) delete (next as Record<string, unknown>)[k];
    await db.from('user_situation').upsert(
      { session_id: sessionId, profile: next },
      { onConflict: 'session_id' }
    );
    return NextResponse.json({ ok: true, profile: next });
  }

  if (op === 'merge' && updates && typeof updates === 'object') {
    await upsertSituation(sessionId, prev, updates, 0);
    const after = await getSituation(sessionId);
    return NextResponse.json({ ok: true, profile: after });
  }

  return NextResponse.json({ error: 'invalid_op' }, { status: 400 });
}
