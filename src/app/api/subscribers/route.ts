import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { extractIp, hashIp } from '@/lib/rate-limit';
import { sendConfirmEmail } from '@/lib/newsletter-mail';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: '서버 설정이 미완료되었습니다.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { email, source, source_slug, consent_text } = (body || {}) as {
    email?: string;
    source?: string;
    source_slug?: string | null;
    consent_text?: string;
  };

  if (typeof email !== 'string' || !EMAIL_RX.test(email)) {
    return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (typeof consent_text !== 'string' || consent_text.length < 20) {
    return NextResponse.json({ error: '수신 동의 정보가 누락되었습니다.' }, { status: 400 });
  }
  if (!['article-footer', 'home-bottom', 'sidebar', 'contact'].includes(source || '')) {
    return NextResponse.json({ error: '잘못된 source 값입니다.' }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  const ip = extractIp(req);
  const ipHashed = hashIp(ip);
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // upsert: 이미 unsubscribed인 사용자도 재구독 가능 (status=pending으로 재설정)
  const { data: existing } = await supabaseAdmin
    .from('subscribers')
    .select('id, status, confirm_token')
    .eq('email', normalized)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'confirmed') {
      return NextResponse.json({
        success: true,
        already_subscribed: true,
        message: '이미 구독 중인 이메일입니다.',
      });
    }
    // pending or unsubscribed → pending으로 갱신
    const { data: updated } = await supabaseAdmin
      .from('subscribers')
      .update({
        status: 'pending',
        source: source!,
        source_slug: source_slug ?? null,
        ip_hash: ipHashed,
        user_agent: userAgent,
        consent_at: new Date().toISOString(),
        consent_text,
      })
      .eq('id', existing.id)
      .select('confirm_token')
      .maybeSingle();

    const token = updated?.confirm_token || existing.confirm_token;
    if (token) {
      try {
        await sendConfirmEmail({ to: normalized, confirmToken: token });
      } catch (err) {
        console.error('[subscribers] confirm email send failed:', err);
      }
    }
    return NextResponse.json({
      success: true,
      message: '확인 메일을 보냈어요. 받은편지함에서 링크를 눌러주세요.',
    });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('subscribers')
    .insert({
      email: normalized,
      status: 'pending',
      source,
      source_slug: source_slug ?? null,
      ip_hash: ipHashed,
      user_agent: userAgent,
      consent_at: new Date().toISOString(),
      consent_text,
    })
    .select('confirm_token')
    .maybeSingle();

  if (error || !inserted) {
    return NextResponse.json({ error: '신청 저장에 실패했습니다.' }, { status: 500 });
  }

  if (inserted.confirm_token) {
    try {
      await sendConfirmEmail({ to: normalized, confirmToken: inserted.confirm_token });
    } catch (err) {
      console.error('[subscribers] confirm email send failed:', err);
    }
  }

  return NextResponse.json({
    success: true,
    message: '확인 메일을 보냈어요. 받은편지함에서 링크를 눌러주세요.',
  });
}
