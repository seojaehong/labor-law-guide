import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';

export async function GET(req: Request) {
  if (!supabaseAdmin) {
    return redirect('error', '서버 설정이 미완료되었습니다.');
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token || token.length < 10) {
    return redirect('error', '잘못된 링크입니다.');
  }

  const { data: row } = await supabaseAdmin
    .from('subscribers')
    .select('id, status')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!row) {
    return redirect('error', '만료되었거나 잘못된 링크입니다.');
  }
  if (row.status === 'unsubscribed') {
    return redirect('already');
  }

  await supabaseAdmin
    .from('subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  return redirect('done');
}

export async function POST(req: Request) {
  return GET(req); // 일부 메일 클라이언트는 POST로 보냄
}

function redirect(state: 'done' | 'already' | 'error', message?: string) {
  const url = new URL('/newsletter/unsubscribed', SITE_URL);
  url.searchParams.set('state', state);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url, { status: 303 });
}
