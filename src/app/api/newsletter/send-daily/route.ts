import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { sendDailyNewsletter } from '@/lib/newsletter-mail';

// KST 09:00 (UTC 00:00) cron — 오늘 발행된 daily-{오늘} 글을 모든 confirmed subscribers에게 발송.
// admin auth: ?token=$ADMIN_TOKEN. crontab에서 curl로 호출.
// quick gate: 글자 ≥ 1500, slug=daily-, content not empty.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function htmlPreview(content: string, max = 600): string {
  if (!content) return '';
  // <p>...</p> 첫 2-3개 정도 + ... 잘림 표시
  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  let acc = '';
  for (const p of paragraphs) {
    if ((acc + p).replace(/<[^>]+>/g, '').length >= max) break;
    acc += p;
  }
  if (acc.length === 0) acc = content.slice(0, max);
  return acc + '<p style="margin-top:12px;color:#8b95a1;font-size:14px">...전체 글에서 이어집니다</p>';
}

export async function POST(req: NextRequest) {
  // admin token 검증
  const expected = process.env.ADMIN_TOKEN;
  const got = req.nextUrl.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!expected || !got || got !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_admin_unavailable' }, { status: 500 });
  }

  // 오늘 KST 날짜로 daily slug
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const todayCompact = `${yyyy}${mm}${dd}`;

  // 오늘 daily 글 fetch (1건 가정)
  const { data: articles, error: fetchErr } = await supabaseAdmin
    .from('blog_articles')
    .select('slug, title, summary, content, published_at')
    .like('slug', `daily-${todayCompact}-%`)
    .order('published_at', { ascending: false })
    .limit(1);

  if (fetchErr || !articles || articles.length === 0) {
    return NextResponse.json({
      error: 'no_daily_article',
      detail: fetchErr?.message || `daily-${todayCompact}-* 글 없음`,
      todayCompact,
    }, { status: 404 });
  }

  const article = articles[0];

  // Quick gate
  const contentText = (article.content || '').replace(/<[^>]+>/g, '').trim();
  const gateFails: string[] = [];
  if (!article.slug?.startsWith('daily-')) gateFails.push('slug not daily-');
  if (contentText.length < 1500) gateFails.push(`content < 1500 (${contentText.length})`);
  if (!article.title) gateFails.push('no title');
  if (gateFails.length > 0) {
    return NextResponse.json({
      error: 'quick_gate_fail',
      slug: article.slug,
      gate_fails: gateFails,
    }, { status: 422 });
  }

  // Confirmed subscribers
  const { data: subs, error: subErr } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, unsubscribe_token')
    .eq('status', 'confirmed')
    .is('unsubscribed_at', null);

  if (subErr) {
    return NextResponse.json({ error: 'subscribers_fetch_fail', detail: subErr.message }, { status: 500 });
  }

  const recipients = subs || [];
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, message: 'no confirmed subscribers', slug: article.slug, sent: 0 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      slug: article.slug,
      title: article.title,
      recipient_count: recipients.length,
      preview_chars: contentText.length,
    });
  }

  // 발송 (직렬, rate limit 보호) — Resend 무료 quota 100/day
  const preview = htmlPreview(article.content || '', 600);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    try {
      const res = await sendDailyNewsletter({
        to: r.email,
        unsubscribeToken: r.unsubscribe_token,
        article: {
          slug: article.slug,
          title: article.title,
          summary: article.summary || '',
          content: article.content || '',
          published_at: article.published_at,
        },
      });
      // last_sent_at update
      await supabaseAdmin
        .from('subscribers')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('email', r.email);

      // 🔴 Resend 가 돌려준 메시지 id 를 남긴다 (2026-10-12 신설).
      //
      // 종전에는 이 값을 버렸다. 그래서 「보냈다는데 안 왔다」를 추적할 때
      // **보낸 건과 웹훅을 이을 키가 없었다** — 웹훅(email_events)은 resend_email_id 를
      // 저장하는데 발송 쪽에 대응하는 기록이 없어서 손으로 대조해야 했다.
      // 2026-10-12 에 한 구독자가 두 달간 못 받은 것을 사람이 말해 주기 전까지 몰랐다.
      //
      // `last_sent_at` 은 **우리가 호출한 시각**일 뿐 도착 증거가 아니다. 도착은 웹훅만 안다.
      // 적재가 실패해도 발송은 이미 끝났으므로 throw 하지 않는다 — 기록이 본문보다 중요하지 않다.
      const providerId = (res as { data?: { id?: string } } | undefined)?.data?.id ?? null;
      const { error: logErr } = await supabaseAdmin.from('subscriber_sends').insert({
        subscriber_id: r.id,
        campaign_slug: 'daily',
        article_slug: article.slug,
        sent_at: new Date().toISOString(),
        provider_message_id: providerId,
      });
      if (logErr) console.error('[send-daily] subscriber_sends 적재 실패', r.email, logErr.message);

      sent++;
    } catch (e) {
      failed++;
      errors.push(`${r.email}: ${(e as Error).message}`);
      console.error('[send-daily] fail', r.email, e);
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    slug: article.slug,
    title: article.title,
    recipient_count: recipients.length,
    sent,
    failed,
    errors: errors.slice(0, 5),
  });
}
