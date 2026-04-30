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

  await supabaseAdmin
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
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
