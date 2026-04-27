import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { extractIp, hashIp } from '@/lib/rate-limit';

const db = supabaseAdmin || supabase;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;

type Body = {
  contact?: string;
  message?: string;
  source?: string;
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const contactRaw = (body.contact || '').trim();
    const message = (body.message || '').trim().slice(0, 500);
    const sourceRaw = (body.source || 'banner').toString();
    const source = ['banner', 'rate_limit', 'modal'].includes(sourceRaw) ? sourceRaw : 'banner';
    const sessionId =
      typeof body.sessionId === 'string' && /^[a-z0-9_-]{12,64}$/i.test(body.sessionId)
        ? body.sessionId
        : null;

    let contactType: 'email' | 'phone' | null = null;
    if (EMAIL_RE.test(contactRaw)) contactType = 'email';
    else if (PHONE_RE.test(contactRaw)) contactType = 'phone';

    if (!contactType || contactRaw.length > 100) {
      return new Response(
        JSON.stringify({ error: '이메일 또는 휴대폰 번호 형식을 확인해주세요.' }),
        { status: 400 }
      );
    }

    const ip = extractIp(req);
    const ipHashed = hashIp(ip);
    const ua = req.headers.get('user-agent')?.slice(0, 200) || null;

    // 24h 내 같은 contact 중복 차단
    const { data: existing } = await db
      .from('payment_intent')
      .select('id, created_at')
      .eq('contact', contactRaw)
      .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ ok: true, duplicate: true, message: '이미 알림 신청해주셨습니다. 정식 출시 시 연락드릴게요.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { error } = await db.from('payment_intent').insert({
      session_id: sessionId,
      ip_hash: ipHashed,
      contact: contactRaw,
      contact_type: contactType,
      message: message || null,
      source,
      user_agent: ua,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: '신청 완료! 정식 출시 시 알림 드릴게요. 베타 기간 우선 혜택도 함께.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : '알 수 없는 오류' }),
      { status: 500 }
    );
  }
}
