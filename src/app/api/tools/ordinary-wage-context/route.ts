import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { toLexQuery } from '@/lib/chat/context/lex-query';

/**
 * 통상임금 — 확인할 점 · 근거 · 다음 단계 (2026-10-05 신설).
 *
 * 퇴직금(severance-context)과 같은 틀이다. 다른 점 둘을 먼저 적는다.
 *
 * ① **「고정성」은 조문에 없는 말이다.** 통상임금의 정의는 근로기준법 본문이 아니라
 *    시행령 제6조① 에 있고 거기엔 「정기적이고 일률적으로 … 지급하기로 정한」까지만 있다.
 *    고정성·재직자조건·근무일수조건·복리후생비 제외·소급분은 전부 2013.12.18. 대법원
 *    전원합의체 이후의 해석론이다. 그래서 **「확인할 점」에 넣지 않고 「근거 자료」로만** 보낸다.
 *    조문에 없는 기준을 조문 근거처럼 보이게 하면 안 된다.
 *
 * ② **우리 행정해석의 4분의 3이 그 판결 이전이다.** 실측(2026-10-05):
 *    「통상임금」이 든 해석 841건 중 626건(74.4%)이 2013-12-18 이전.
 *    날짜로 걸러 보니 두 쟁점(근무일수 조건·소급분)은 쓸 만한 것이 전부 사라지고
 *    0.50 을 겨우 넘는 엉뚱한 것만 남았다. 그래서 **거르지 않고 표시한다** —
 *    회신일과 함께 「전원합의체 이전 해석」임을 항목마다 붙여 보낸다.
 */

const db = supabaseAdmin || supabase;

/** 통상임금 기준이 바뀐 날 — 대법원 2013.12.18. 전원합의체. */
const TURNING_POINT = '2013-12-18';

const EMB_CACHE = new Map<string, number[]>();
const EMB_CACHE_MAX = 64;
const HITS = new Map<string, { n: number; reset: number }>();
const LIMIT = 30;
const WINDOW_MS = 60_000;

function overLimit(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || now > cur.reset) {
    if (HITS.size > 5_000) HITS.clear();
    HITS.set(ip, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > LIMIT;
}

type Allowance = { name?: string; amount?: number };
type Body = {
  payType?: 'monthly' | 'hourly';
  weeklyHours?: number;          // 1주 소정근로시간
  paidRestHours?: number;        // 1주 중 유급으로 처리되는 시간(주휴시간 등)
  allowances?: Allowance[];      // 기본급 외 고정수당
  purpose?: 'overtime' | 'night' | 'holiday' | 'dismissal' | 'annual' | 'shutdown' | 'unknown';
};
type Check = { level: 'block' | 'warn' | 'info'; title: string; body: string; basis: string };

/**
 * 확인할 점은 **조문으로 말할 수 있는 것만** 넣는다.
 * 조문은 2026-10-05 법제처 원문 대조:
 *   시행령 제6조①② · 법 제26조 · 제46조① · 제56조①③ · 제60조⑥
 */
function buildChecks(b: Body): Check[] {
  const out: Check[] = [];

  // ① 가장 흔한 계산 오류 — 조문에 명시돼 있다
  if (typeof b.weeklyHours === 'number' && b.payType !== 'hourly') {
    const paid = b.paidRestHours ?? 0;
    if (paid <= 0) {
      out.push({
        level: 'warn',
        title: '시간급으로 바꿀 때 유급으로 처리되는 시간을 더하셨나요',
        body: `시행령은 월급을 시간급으로 바꿀 때 「1주의 소정근로시간」이 아니라 「1주의 통상임금 산정 기준시간 수」로 나누라고 합니다. 그 기준시간은 소정근로시간에 **소정근로시간 외에 유급으로 처리되는 시간**을 더한 것입니다. 주휴시간이 대표적입니다. 소정근로시간 ${b.weeklyHours}시간만으로 나누면 시간급이 실제보다 높게 나옵니다.`,
        basis: '근로기준법 시행령 제6조 제2항 제3호·제4호',
      });
    } else {
      out.push({
        level: 'info',
        title: '기준시간을 바르게 잡으셨습니다',
        body: `소정근로 ${b.weeklyHours}시간에 유급처리 ${paid}시간을 더한 ${b.weeklyHours + paid}시간이 1주의 통상임금 산정 기준시간입니다. 월 기준시간은 여기에 1년 평균 주 수를 곱해 12로 나눕니다.`,
        basis: '근로기준법 시행령 제6조 제2항 제3호·제4호',
      });
    }
  }

  // ② 조문 문언만 쓴다. 「고정성 때문에 빠진다」는 판단은 하지 않는다.
  if ((b.allowances ?? []).some((a) => a.name)) {
    out.push({
      level: 'info',
      title: '그 수당이 「지급하기로 정한」 것인지 보세요',
      body: '시행령은 통상임금을 「정기적이고 일률적으로 소정근로 또는 총 근로에 대하여 지급하기로 정한」 금액이라고 합니다. 미리 지급하기로 정해 둔 것인지, 그때그때 사정을 보아 주는 것인지가 먼저입니다. 다만 어떤 수당이 실제로 통상임금에 들어가는지는 지급 조건에 따라 갈리고, 그 기준은 조문이 아니라 판례가 만들었습니다. 아래 근거 자료를 함께 보세요.',
      basis: '근로기준법 시행령 제6조 제1항',
    });
  }

  // ③ 용도마다 기준 조문이 다르다 — 「전부 통상임금」이라는 통념과 다른 것이 둘 있다
  const P = b.purpose ?? 'unknown';
  if (P === 'overtime' || P === 'night') {
    out.push({
      level: 'info',
      title: '연장·야간근로는 통상임금의 50% 이상을 가산합니다',
      body: '연장근로와 야간근로(오후 10시~다음 날 오전 6시)는 각각 통상임금의 100분의 50 이상을 더해 지급합니다. 둘이 겹치면 각각 더합니다.',
      basis: '근로기준법 제56조 제1항·제3항',
    });
  } else if (P === 'holiday') {
    out.push({
      level: 'info',
      title: '휴일근로는 시간에 따라 가산율이 다릅니다',
      body: '휴일근로의 가산은 8시간 이내와 8시간을 넘는 부분의 기준이 조문에 따로 정해져 있습니다. 연장근로와 같은 50%로 일괄 계산하지 마세요.',
      basis: '근로기준법 제56조 제2항',
    });
  } else if (P === 'dismissal') {
    out.push({
      level: 'info',
      title: '해고예고수당은 30일분 이상의 통상임금입니다',
      body: '30일 전에 예고하지 않고 해고하면 30일분 이상의 통상임금을 지급해야 합니다. 평균임금이 아닙니다.',
      basis: '근로기준법 제26조',
    });
  } else if (P === 'annual') {
    out.push({
      level: 'warn',
      title: '연차수당은 통상임금으로 정해져 있지 않습니다 — 취업규칙을 보세요',
      body: '조문은 연차 기간에 대해 「취업규칙 등에서 정하는 통상임금 또는 평균임금」을 지급하라고 합니다. 둘 중 무엇으로 줄지는 취업규칙·단체협약이 정합니다. 통상임금으로 단정하지 말고 그 규정을 먼저 확인하세요.',
      basis: '근로기준법 제60조 제6항',
    });
  } else if (P === 'shutdown') {
    out.push({
      level: 'warn',
      title: '휴업수당은 평균임금이 원칙입니다 — 통상임금은 상한입니다',
      body: '휴업수당은 평균임금의 100분의 70 이상입니다. 다만 그 70%가 통상임금을 넘으면 통상임금을 줄 수 있습니다. 즉 통상임금은 기준이 아니라 상한 역할입니다. 통상임금만 계산해 그대로 쓰면 적게 지급될 수 있습니다.',
      basis: '근로기준법 제46조 제1항',
    });
  } else {
    out.push({
      level: 'info',
      title: '무엇에 쓸지에 따라 기준 조문이 다릅니다',
      body: '통상임금이 그대로 기준인 것(연장·야간근로 가산, 해고예고수당)이 있고, 그렇지 않은 것도 있습니다. 연차수당은 취업규칙이 통상임금과 평균임금 중에서 정하고, 휴업수당은 평균임금의 70%가 원칙이며 통상임금은 상한입니다. 위에서 용도를 고르면 해당 조문으로 안내합니다.',
      basis: '근로기준법 제26조 · 제46조 · 제56조 · 제60조',
    });
  }
  return out;
}

/**
 * 검색 질의.
 *
 * 🔴 **추상형으로 묻지 않는다.** 「통상임금 고정성 정기성 일률성 요건」은 최고 0.484 로
 * 전부 0.50 을 못 넘겼다(2026-10-05 실측). 이 행정해석 KB 는 추상적 법리 설명이 아니라
 * 사례별 질의회신이라 「요건이 무엇인가」가 비어 있다.
 * 대신 **사용자가 적어 낸 수당 이름을 그대로 넣어** 구체형으로 묻는다.
 *
 * 문장형·키워드형 중 어느 쪽이 이기는지는 쟁점마다 다르다. 아래는 실측으로 고른 것이다.
 */
function buildQueries(b: Body): string[] {
  const qs: string[] = [];
  const names = (b.allowances ?? []).map((a) => (a.name || '').trim()).filter(Boolean).slice(0, 2);
  // 받침에 따라 조사를 고른다. 「식대이」처럼 나가면 검색어가 어색해지고 유사도도 떨어진다.
  const subjectParticle = (w: string): string => {
    const last = w.charCodeAt(w.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return '가';     // 한글이 아니면 기본값
    return (last - 0xac00) % 28 === 0 ? '가' : '이';      // 받침 없으면 '가', 있으면 '이'
  };
  for (const n of names) qs.push(`${n}${subjectParticle(n)} 통상임금에 포함되나요`);
  if (!names.length) qs.push('매월 1일 이상 근무해야 지급되는 상여금도 통상임금에 포함되나요');  // 0.637
  if (typeof b.weeklyHours === 'number') qs.push('통상임금 산정 기준시간 계산 방법');              // 0.621
  return qs.slice(0, 2);
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limited = overLimit(ip);
  const checks = buildChecks(body);
  const queries = buildQueries(body);

  type Src = { id: string; title: string; date?: string; url: string; beforeTurningPoint: boolean };
  const sources: { interpretations: Src[]; faq: Array<{ id: number; question: string; url: string }> } =
    { interpretations: [], faq: [] };

  if (!limited) {
    for (const query of queries) {
      let embedding = EMB_CACHE.get(query) ?? null;
      if (!embedding) {
        try {
          const key = process.env.OPENAI_API_KEY;
          if (key) {
            const r = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
            });
            if (r.ok) {
              embedding = (await r.json())?.data?.[0]?.embedding ?? null;
              if (embedding) {
                if (EMB_CACHE.size >= EMB_CACHE_MAX) EMB_CACHE.clear();
                EMB_CACHE.set(query, embedding);
              }
            }
          }
        } catch { /* 근거 없이 간다 */ }
      }
      if (!embedding) continue;

      const [interp, faq] = await Promise.all([
        db.rpc('search_interpretation_semantic_v2', {
          query_embedding: embedding, max_results: 2, min_similarity: 0.50,
        }),
        db.rpc('search_faq_combined', {
          query_text: toLexQuery(query), query_embedding: embedding,
          max_results: 100, canonical_only: false,
        }),
      ]);
      if (!interp.error) {
        for (const it of (interp.data ?? []) as Array<Record<string, string>>) {
          if (sources.interpretations.some((x) => x.id === it.id)) continue;
          const d = it.decision_date || '';
          sources.interpretations.push({
            id: it.id, title: it.title, date: d || undefined,
            url: `/interpretations/${encodeURIComponent(it.id)}`,
            beforeTurningPoint: !!d && d < TURNING_POINT,
          });
        }
      }
      if (!faq.error) {
        for (const f of ((faq.data ?? []) as Array<Record<string, never>>).slice(0, 2)) {
          const id = f['id'] as unknown as number;
          if (sources.faq.some((x) => x.id === id)) continue;
          sources.faq.push({ id, question: f['question'] as unknown as string, url: `/faq?id=${id}` });
        }
      }
    }
  }

  const next: Array<{ title: string; body: string; href?: string }> = [];
  if (sources.interpretations.some((s) => s.beforeTurningPoint)) {
    next.push({
      title: '오래된 해석이 섞여 있습니다',
      body: '통상임금의 판단 기준은 2013년 12월 대법원 전원합의체 판결로 달라졌습니다. 그 이전 회신은 지금 기준과 다를 수 있어 표시해 두었습니다. 날짜를 함께 보세요.',
    });
  }
  next.push({
    title: '퇴직금을 계산하신다면',
    body: '퇴직금은 평균임금으로 계산하는 것이 원칙이고, 평균임금이 통상임금보다 적으면 통상임금을 평균임금으로 봅니다. 퇴직금 계산기에서 함께 확인하실 수 있습니다.',
    href: '/tools/severance.html',
  });

  return NextResponse.json({ checks, sources, next, queries, limited }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
