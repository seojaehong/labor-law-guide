import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendWelcomeEmail } from '@/lib/newsletter-mail';
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
    .select('id, email, status, unsubscribe_token')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!row) {
    return redirect('error', '만료되었거나 잘못된 링크입니다.');
  }
  if (row.status === 'confirmed') {
    return redirect('already');
  }

  // ★ 2026-09-17 — unsubscribed_at 을 반드시 함께 비운다.
  //
  // 전에는 status 만 confirmed 로 바꾸고 unsubscribed_at 은 남겨 뒀다. 그런데 발송 쿼리가
  // 「confirmed 이면서 unsubscribed_at 이 비어 있을 것」이라, 둘이 어긋난 행은
  // **겉보기엔 정상 구독자인데 실제로는 한 통도 못 받는** 상태가 된다.
  // 실측: mingyu.so@samsung.com 이 48일 동안 그 상태였고 반송도 안 잡혀 아무도 몰랐다.
  // (원인은 메일 보안 스캐너가 해지 링크를 먼저 열어본 것 — unsubscribe 라우트 머리말 참고)
  //
  // 확인을 마쳤다는 것은 구독 의사가 확정됐다는 뜻이므로 해지 표시는 남아 있을 이유가 없다.
  await supabaseAdmin
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
    })
    .eq('id', row.id);

  if (row.unsubscribe_token) {
    try {
      await sendWelcomeEmail({ to: row.email, unsubscribeToken: row.unsubscribe_token });
    } catch (err) {
      console.error('[subscribers/confirm] welcome email send failed:', err);
    }
  }

  return redirect('confirmed');
}

function redirect(state: 'confirmed' | 'already' | 'error', message?: string) {
  const url = new URL('/newsletter/confirmed', SITE_URL);
  url.searchParams.set('state', state);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url, { status: 303 });
}
