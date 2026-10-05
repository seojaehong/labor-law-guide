import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { toLexQuery } from '@/lib/chat/context/lex-query';

/**
 * 퇴직금 계산 결과에 **근거와 다음 단계**를 붙인다 (2026-10-05 신설).
 *
 * 왜 만드나. 노동법 도구 52개를 유형으로 늘어놓고 보니 48%가 「금액 계산」이고,
 * 전부 숫자를 뱉고 끝난다(2026-10-05 도구 지도). 우리가 다를 수 있는 자리는
 * 계산 자체가 아니라 **계산 뒤에 붙는 것**이다 — 이 금액이 맞는지 확인할 점,
 * 왜 그런지의 근거, 그래서 무엇을 할지.
 *
 * 퇴직금을 먼저 잡은 이유는 밑천이 가장 두껍기 때문이다(실측 2026-10-05):
 * FAQ 2,869건 · 행정해석 1,571건 · 판례 351건.
 *
 * 설계 원칙
 *   · 확인할 점은 **조문으로 말할 수 있는 것만** 넣는다. 조문을 2026-10-05 에
 *     법제처 원문으로 전부 대조했고, 근거를 응답에 같이 실어 화면에서 보이게 한다.
 *   · 금액을 다시 계산하지 않는다. 계산기가 이미 한 일이고, 두 번 계산하면 두 값이 갈린다.
 *   · 확률·점수는 내지 않는다(사이트 규칙).
 *   · 자료가 없으면 없는 대로 돌려준다. 억지로 채우지 않는다.
 */

const db = supabaseAdmin || supabase;

type Body = {
  startDate?: string;      // 입사일 YYYY-MM-DD
  endDate?: string;        // 퇴사일
  serviceDays?: number;    // 계속근로일수
  avgWage?: number;        // 1일 평균임금
  ordinaryWage?: number;   // 1일 통상임금 (알면)
  weeklyHours?: number;    // 1주 소정근로시간
  severance?: number;      // 계산기가 낸 퇴직금
  paid?: boolean;          // 받았는지
};

type Check = { level: 'block' | 'warn' | 'info'; title: string; body: string; basis: string };

function days(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const s = Date.parse(a), e = Date.parse(b);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.round((e - s) / 86400000);
}

/** 조문으로 말할 수 있는 것만. 각 항목의 basis 는 2026-10-05 법제처 원문 대조. */
function buildChecks(b: Body): Check[] {
  const out: Check[] = [];
  const svc = b.serviceDays ?? days(b.startDate, b.endDate);

  if (svc !== null && svc < 365) {
    out.push({
      level: 'block',
      title: '계속근로기간이 1년이 안 됩니다',
      body: `입사일부터 퇴사일까지 ${svc}일입니다. 1년 미만이면 퇴직급여를 지급할 의무가 없습니다. 다만 계속근로기간을 어떻게 세는지(수습·휴직·재입사 포함 여부)에 따라 1년을 넘길 수 있으니 기간부터 확인하세요.`,
      basis: '근로자퇴직급여 보장법 제4조 제1항 단서',
    });
  }
  if (typeof b.weeklyHours === 'number' && b.weeklyHours < 15) {
    out.push({
      level: 'block',
      title: '1주 소정근로시간이 15시간 미만입니다',
      body: '4주를 평균해 1주 소정근로시간이 15시간 미만이면 퇴직급여 지급 대상이 아닙니다. 주마다 시간이 달랐다면 4주 평균으로 다시 보세요.',
      basis: '근로자퇴직급여 보장법 제4조 제1항 단서',
    });
  }
  if (typeof b.avgWage === 'number' && typeof b.ordinaryWage === 'number' && b.avgWage < b.ordinaryWage) {
    out.push({
      level: 'warn',
      title: '평균임금이 통상임금보다 적습니다 — 통상임금으로 계산해야 합니다',
      body: `평균임금 ${Math.round(b.avgWage).toLocaleString()}원이 통상임금 ${Math.round(b.ordinaryWage).toLocaleString()}원보다 적습니다. 이 경우 통상임금을 평균임금으로 봅니다. 퇴직 전 3개월에 결근·휴직·무급휴가가 있으면 이렇게 됩니다.`,
      basis: '근로기준법 제2조 제2항',
    });
  }
  const since = days(b.endDate, new Date().toISOString().slice(0, 10));
  if (b.paid === false && since !== null && since > 14) {
    out.push({
      level: 'warn',
      title: `퇴사한 지 ${since}일이 지났는데 아직 못 받으셨습니다`,
      body: '퇴직일부터 14일 안에 지급해야 합니다. 당사자 합의로 기일을 연장한 경우가 아니라면 이미 기한을 넘긴 것입니다. 지급을 요청한 기록(문자·메일)을 남겨 두세요.',
      basis: '근로기준법 제36조',
    });
  }
  out.push({
    level: 'info',
    title: '평균임금에 빠진 것이 없는지 보세요',
    body: '퇴직 전 3개월 임금총액에는 기본급 외에 정기상여금과 연차수당 중 일정 부분이 들어갑니다. 이것들을 빼고 계산하면 퇴직금이 실제보다 적게 나옵니다. 계산기의 상여금·연차수당 칸을 비워 두셨다면 다시 확인하세요.',
    basis: '근로기준법 제2조 제1항 제6호 (평균임금의 정의)',
  });
  out.push({
    level: 'info',
    title: '계산 구조',
    body: '퇴직금은 계속근로기간 1년에 대해 30일분 이상의 평균임금입니다. 회사 규정이 이보다 많으면 그 규정을 따릅니다.',
    basis: '근로자퇴직급여 보장법 제8조 제1항',
  });
  return out;
}

/**
 * 사실관계에서 검색어를 만든다.
 *
 * 🔴 걸린 쟁점을 **앞에 두고 기본 질의는 뒤로** 뺀다. 처음엔 '퇴직금 평균임금 산정'을
 * 항상 앞에 두었는데, 그러면 「1년 미만」이 걸렸는데도 평균임금 산정 행정해석이
 * 돌아왔다(2026-10-05 실측). 기본 질의가 검색을 끌고 간 것이다.
 * 쟁점이 하나라도 걸리면 그 쟁점만으로 찾고, 아무것도 안 걸렸을 때만 기본 질의를 쓴다.
 */
function buildQuery(b: Body, checks: Check[]): string {
  const hit: string[] = [];
  if (checks.some((c) => c.title.includes('1년'))) hit.push('퇴직금 계속근로기간 1년 미만 지급의무');
  if (checks.some((c) => c.title.includes('15시간'))) hit.push('소정근로시간 15시간 미만 퇴직금');
  if (checks.some((c) => c.title.includes('통상임금'))) hit.push('평균임금이 통상임금보다 적을 때');
  if (checks.some((c) => c.title.includes('못 받'))) hit.push('퇴직금 체불 금품청산 14일');
  return hit.length ? hit.join(' ') : '퇴직금 평균임금 산정 방법';
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const checks = buildChecks(body);
  const query = buildQuery(body, checks);

  // 임베딩이 없으면 근거 없이 확인할 점만 돌려준다 — 화면이 비지 않게 한다.
  let embedding: number[] | null = null;
  try {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
      });
      if (r.ok) embedding = (await r.json())?.data?.[0]?.embedding ?? null;
    }
  } catch { /* 근거 없이 간다 */ }

  const sources: {
    interpretations: Array<{ id: string; title: string; date?: string; url: string }>;
    faq: Array<{ id: number; question: string; url: string }>;
  } = { interpretations: [], faq: [] };

  if (embedding) {
    const [interp, faq] = await Promise.all([
      db.rpc('search_interpretation_semantic_v2', {
        query_embedding: embedding, max_results: 3, min_similarity: 0.35,
      }),
      db.rpc('search_faq_combined', {
        query_text: toLexQuery(query), query_embedding: embedding,
        max_results: 100, canonical_only: false,
      }),
    ]);
    if (!interp.error) {
      for (const it of (interp.data ?? []) as Array<Record<string, string>>) {
        sources.interpretations.push({
          id: it.id, title: it.title,
          date: it.decision_date || undefined,
          url: `/interpretations/${encodeURIComponent(it.id)}`,
        });
      }
    }
    if (!faq.error) {
      for (const f of ((faq.data ?? []) as Array<Record<string, never>>).slice(0, 4)) {
        sources.faq.push({
          id: f['id'] as unknown as number,
          question: f['question'] as unknown as string,
          url: `/faq?id=${f['id']}`,
        });
      }
    }
  }

  const next: Array<{ title: string; body: string; href?: string }> = [];
  if (checks.some((c) => c.title.includes('못 받'))) {
    next.push({
      title: '지연이자를 함께 청구할 수 있습니다',
      body: '퇴직일 14일이 지난 뒤부터는 지연이자가 붙습니다. 금액은 체불 기간과 이율에 따라 달라집니다.',
    });
    next.push({
      title: '고용노동부에 진정을 넣을 수 있습니다',
      body: '사업장 관할 지방고용노동관서에 임금체불 진정을 접수합니다. 계산서와 지급 요청 기록을 함께 내면 좋습니다.',
      href: 'https://www.moel.go.kr',
    });
  }
  next.push({
    title: '계산 근거를 남겨 두세요',
    body: '이 계산기의 산정서를 인쇄하거나 저장해 두면 나중에 다툴 때 그대로 쓸 수 있습니다.',
  });

  return NextResponse.json({ checks, sources, next, query }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
