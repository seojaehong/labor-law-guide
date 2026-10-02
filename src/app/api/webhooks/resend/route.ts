import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Resend 웹훅 수신.
 *
 * 왜 필요했나 (2026-10-02)
 *   재홍님 질문: "발송 말고 실제로 보고 있는지 확인되니?"
 *   답은 **아니오** 였다. 우리가 아는 건 「발송 API 를 불렀다」뿐이고
 *   도착·열람·반송은 전혀 몰랐다. 그 셋은 이 웹훅으로만 온다.
 *
 *   게다가 그 「불렀다」마저 못 믿을 숫자였다. Resend SDK(6.9.3)는 API 가 4xx/5xx 를
 *   줘도 던지지 않고 `{ data: null, error }` 를 돌려주는데, 발송 코드가 try/catch 만
 *   두고 있어 거절된 메일도 성공으로 셌다. 같은 날 `newsletter-mail.ts` 를 고쳤다.
 *
 * 서명 검증
 *   Resend 는 Svix 를 쓴다. 헤더 셋(`svix-id`·`svix-timestamp`·`svix-signature`)이 오고,
 *   서명 대상은 `${id}.${timestamp}.${raw body}` 다. 비밀키는 `whsec_` 를 떼고 base64 디코드한다.
 *   `svix-signature` 는 `v1,<base64>` 가 공백으로 여러 개 올 수 있다(키 회전 중).
 *   **본문을 파싱하기 전에 원문 그대로 검증한다** — JSON.parse 후 재직렬화하면 바이트가 달라진다.
 *
 * 멱등성
 *   Svix 는 2xx 를 못 받으면 재전송한다. `svix_id` 에 유니크를 걸고 중복은 조용히 넘긴다.
 *
 * 실패 시 응답 규칙
 *   서명이 틀리면 401. 그 외 우리 쪽 문제(DB 등)는 500 을 돌려 **재전송을 받는다.**
 *   200 을 돌려 버리면 그 이벤트는 영영 사라진다.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOLERANCE_SEC = 5 * 60;

function verify(raw: string, headers: Headers, secret: string): string | null {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return '서명 헤더 누락';

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > TOLERANCE_SEC) return `타임스탬프 범위 밖 (${Math.round(age)}초)`;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();

  // 키 회전 중에는 서명이 여러 개 온다. 하나라도 맞으면 통과.
  for (const part of sigHeader.split(' ')) {
    const [, b64] = part.split(',');
    if (!b64) continue;
    const got = Buffer.from(b64, 'base64');
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) return null;
  }
  return '서명 불일치';
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET 미설정');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  if (!supabaseAdmin) {
    // 서비스 키가 없으면 적재를 못 한다. 200 을 돌리면 이벤트가 사라지므로 500 이다.
    console.error('[resend-webhook] supabaseAdmin 없음 (SERVICE_ROLE_KEY 미설정)');
    return NextResponse.json({ error: 'db not configured' }, { status: 500 });
  }

  const raw = await req.text();
  const bad = verify(raw, req.headers, secret);
  if (bad) {
    console.warn('[resend-webhook] 거부:', bad);
    return NextResponse.json({ error: bad }, { status: 401 });
  }

  let body: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    // 서명은 맞는데 JSON 이 아니다. 재전송해도 같을 테니 200 으로 닫는다.
    console.error('[resend-webhook] JSON 파싱 실패');
    return NextResponse.json({ ok: true, skipped: 'not json' });
  }

  const d = body.data || {};
  // to 는 배열로 온다. 우리는 수신자 1명씩 보내므로 첫 칸을 쓴다.
  const to = Array.isArray(d.to) ? String(d.to[0] ?? '') : String(d.to ?? '');
  const email = to.toLowerCase() || null;

  let subscriberId: number | null = null;
  if (email) {
    const { data: sub } = await supabaseAdmin
      .from('subscribers')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    subscriberId = sub?.id ?? null;
  }

  const { error } = await supabaseAdmin.from('email_events').insert({
    svix_id: req.headers.get('svix-id'),
    event_type: body.type || 'unknown',
    email,
    subscriber_id: subscriberId,
    resend_email_id: (d.email_id as string) || null,
    subject: (d.subject as string) || null,
    occurred_at: body.created_at || new Date().toISOString(),
    payload: body,
  });

  if (error) {
    // 23505 = 유니크 위반 = 이미 받은 이벤트. 재전송이므로 정상 종료한다.
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    console.error('[resend-webhook] 적재 실패', error);
    // 500 을 돌려 Svix 가 재전송하게 둔다. 200 이면 이 이벤트는 영영 사라진다.
    return NextResponse.json({ error: 'insert failed' }, { status: 500 });
  }

  // ── 영구 반송이면 발송에서 뺀다 ────────────────────────────────
  // 2026-10-02 재홍님 승인. 죽은 주소에 계속 보내면 발신 도메인 평판이 깎인다 —
  // Resend 가 반송 페이로드에 그렇게 적어 보낸다("can have a negative impact").
  //
  // **Permanent 만 끊는다.** Transient(일시적 거부, 메일함 꽉 참 등)는 다음에 들어갈 수 있으므로
  // 건드리지 않는다. 사람을 구독에서 빼는 일이라 보수적으로 간다.
  if (body.type === 'email.bounced' && subscriberId) {
    const bounce = (d.bounce || {}) as { type?: string; message?: string };
    const permanent = bounce.type === 'Permanent';

    // bounce_count 는 종전까지 아무도 갱신하지 않아 전 건 0 인 죽은 컬럼이었다. 여기서 살린다.
    // PostgREST 는 col = col + 1 을 못 하므로 읽고 쓴다. 구독자당 반송이 동시에 여러 건
    // 들어올 일이 없는 규모라 경합은 무시한다.
    const { data: cur } = await supabaseAdmin
      .from('subscribers')
      .select('bounce_count, status')
      .eq('id', subscriberId)
      .maybeSingle();

    const patch: Record<string, unknown> = { bounce_count: (cur?.bounce_count ?? 0) + 1 };
    // 이미 해지한 사람을 bounced 로 덮지 않는다 — 해지 기록이 정통망법 증빙이다.
    if (permanent && cur?.status === 'confirmed') patch.status = 'bounced';

    const { error: upErr } = await supabaseAdmin
      .from('subscribers')
      .update(patch)
      .eq('id', subscriberId);

    if (upErr) {
      // 이벤트 적재는 이미 끝났다. 여기서 500 을 돌리면 Svix 가 재전송해 중복 집계가 된다.
      // 그래서 200 으로 닫고 로그만 남긴다 — 사람이 보고 고치는 쪽이 낫다.
      console.error('[resend-webhook] 구독자 갱신 실패', subscriberId, upErr);
    } else if (patch.status) {
      console.warn(`[resend-webhook] 영구 반송으로 발송 제외: ${email} (${bounce.message || ''})`);
    }
  }

  // ── 스팸 신고는 해지로 본다 ──────────────────────────────────
  // 2026-10-02 재홍님 승인. 반송보다 강한 신호다 — 사람이 직접 「이건 스팸」이라고 누른 것이고,
  // 계속 보내면 발신 도메인 평판이 반송보다 더 빨리 깎인다.
  // 정통망법 쪽으로도 수신거부 의사표시로 보는 게 안전하다. 그래서 bounced 가 아니라
  // **unsubscribed** 로 둔다 — 「받을 수 없는 주소」가 아니라 「받기 싫다고 한 사람」이다.
  if (body.type === 'email.complained' && subscriberId) {
    const { data: cur } = await supabaseAdmin
      .from('subscribers')
      .select('status')
      .eq('id', subscriberId)
      .maybeSingle();

    // 이미 해지했거나 반송으로 끊긴 사람은 그대로 둔다. 먼저 찍힌 사유를 덮지 않는다.
    if (cur?.status === 'confirmed' || cur?.status === 'pending') {
      const { error: upErr } = await supabaseAdmin
        .from('subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', subscriberId);
      if (upErr) console.error('[resend-webhook] 신고 해지 처리 실패', subscriberId, upErr);
      else console.warn(`[resend-webhook] 스팸 신고로 해지 처리: ${email}`);
    }
  }

  // email.delivery_delayed 는 적재만 한다. 지연은 아직 실패가 아니고, 대개 뒤이어
  // delivered 나 bounced 가 온다. 여기서 손대면 멀쩡한 구독자를 끊게 된다.

  return NextResponse.json({ ok: true, type: body.type });
}
