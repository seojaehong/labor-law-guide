import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';

/**
 * 수신 해지.
 *
 * ★ 2026-09-17 — GET 으로는 해지되지 않게 바꿨다.
 *
 * 그전에는 GET 한 번으로 즉시 해지였다. 그래서 **회사 메일 보안 스캐너가 링크를
 * 미리 열어보는 것만으로 해지가 됐다.** 실측: mingyu.so@samsung.com 이
 * 구독 폼 제출 8초 뒤 해지, 3초 뒤 확인 — 11초 안에 셋이 일어났다. 사람이 아니다.
 * 그 결과 48일 동안 한 통도 못 받았고 반송도 안 잡혀 아무도 몰랐다.
 * 회사 메일일수록 스캐너가 세고, 회사계정이 더 값진 구독자라 하필 그쪽이 걸린다.
 *
 * 이제 두 갈래다.
 *   GET  → 확인 페이지로 보낸다. 스캐너는 버튼을 누르지 못한다
 *   POST → 실제로 해지한다. 사람이 버튼을 누른 경우와,
 *          RFC 8058 원클릭 해지(메일 클라이언트가 `List-Unsubscribe=One-Click` 를 POST)
 *
 * **POST 는 종전처럼 유지해야 한다.** 지메일·아웃룩의 「수신거부」 버튼이 이 경로를 쓴다.
 * 그걸 막으면 사용자가 해지를 못 하고 스팸 신고로 간다 — 그게 더 나쁘다.
 */
export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return redirect('error', '서버 설정이 미완료되었습니다.');
  }

  const url = new URL(req.url);
  let token = url.searchParams.get('token');

  // 폼으로 눌렀을 때는 본문에 실려 온다
  if (!token) {
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('form')) {
        const form = await req.formData();
        token = String(form.get('token') || '') || null;
      }
    } catch {}
  }

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

/** 여기서는 해지하지 않는다. 확인 페이지로 보낸다. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const url = new URL('/newsletter/unsubscribe', SITE_URL);
  if (token) url.searchParams.set('token', token);
  return NextResponse.redirect(url, { status: 303 });
}

function redirect(state: 'done' | 'already' | 'error', message?: string) {
  const url = new URL('/newsletter/unsubscribed', SITE_URL);
  url.searchParams.set('state', state);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url, { status: 303 });
}
