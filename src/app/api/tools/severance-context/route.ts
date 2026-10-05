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
  /**
   * 퇴직급여제도. 이게 갈리면 **계산의 의미 자체가 달라진다.**
   *   severance 퇴직금제도 · db 확정급여형 · dc 확정기여형 · unknown 모름
   * 퇴직연금 쪽에 행정해석이 더 많다(실측 2026-10-05: 퇴직연금 FAQ 335 vs 해석 723).
   * 질문이 쌓이는 곳(퇴직금)과 해석이 쌓이는 곳(퇴직연금)이 다르다.
   */
  pensionType?: 'severance' | 'db' | 'dc' | 'unknown';
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
  // 제도별 분기. 조문은 2026-10-05 법제처 원문 대조.
  const pt = b.pensionType ?? 'unknown';
  if (pt === 'dc') {
    out.push({
      level: 'block',
      title: '확정기여형(DC)이라면 이 계산 결과가 받을 금액이 아닙니다',
      body: 'DC 는 회사가 매년 연간 임금총액의 12분의 1 이상을 계좌에 넣어 주는 제도입니다. 퇴직할 때의 평균임금으로 거슬러 계산하지 않습니다. 실제로 받을 돈은 그동안 납입된 금액과 그 운용 성과로 정해지므로, 이 계산 결과와 다를 수 있습니다. 확인할 것은 금액이 아니라 매년 제때 납입됐는지입니다.',
      basis: '근로자퇴직급여 보장법 제20조 제1항',
    });
    out.push({
      level: 'info',
      title: '그래도 이 계산이 쓸모가 있습니다',
      body: '임금이 계속 올랐다면 퇴직금제도로 계산한 금액이 DC 적립금보다 큰 경우가 많습니다. 두 숫자를 비교해 보고 차이가 크면 납입 내역부터 확인하세요.',
      basis: '근로자퇴직급여 보장법 제20조 제1항',
    });
  } else if (pt === 'db') {
    out.push({
      level: 'info',
      title: '확정급여형(DB)이면 금액 기준은 퇴직금과 같습니다',
      body: 'DB 의 일시금은 계속근로기간 1년에 30일분 이상의 평균임금이 되도록 정해져 있습니다. 즉 이 계산 결과를 기준으로 삼을 수 있습니다. 다만 돈을 주는 주체가 회사가 아니라 퇴직연금사업자입니다.',
      basis: '근로자퇴직급여 보장법 제15조',
    });
    out.push({
      level: 'info',
      title: '지급 기한이 따로 있습니다',
      body: '급여를 지급할 사유가 생긴 날부터 14일 이내에 퇴직연금사업자가 적립금 범위에서 지급하도록 돼 있습니다. 적립이 모자라면 그 부분은 회사가 책임집니다.',
      basis: '근로자퇴직급여 보장법 제17조 제2항',
    });
  } else {
    out.push({
      level: 'info',
      title: '계산 구조',
      body: '퇴직금은 계속근로기간 1년에 대해 30일분 이상의 평균임금입니다. 회사 규정이 이보다 많으면 그 규정을 따릅니다.',
      basis: '근로자퇴직급여 보장법 제8조 제1항',
    });
    if (pt === 'unknown') {
      out.push({
        level: 'warn',
        title: '퇴직연금(DC·DB)에 가입돼 있는지 확인하세요',
        body: '확정기여형(DC)이라면 이 계산 방식이 아예 다릅니다. 급여명세서나 회사 규정에서 퇴직연금 가입 여부를 먼저 보세요. 위에서 제도를 고르면 그에 맞는 설명으로 바뀝니다.',
        basis: '근로자퇴직급여 보장법 제4조 제1항',
      });
    }
  }
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
  // 🔴 문장 형태를 쟁점마다 따로 골랐다. **일반 규칙이 없다** — 2026-10-05 실측:
  //   · 1년 미만 — 키워드형 0.715 > 문장형 0.694 (문장형은 1위가 중간정산으로 빗나갔다)
  //   · 통상임금 — 문장형 0.715 > 키워드형 0.648
  //   · 체불    — '퇴직 후 14일 이내 금품청산 의무' 0.509 > 다른 두 표현 0.398·0.442
  //   · 15시간  — 어떤 표현도 0.47 을 못 넘는다. 이 쟁점은 행정해석이 실제로 없다.
  // 그래서 표현을 바꿀 때는 반드시 다시 재야 한다. 그럴듯한 쪽이 이기지 않는다.
  const hit: string[] = [];
  if (checks.some((c) => c.title.includes('1년'))) hit.push('퇴직금 계속근로기간 1년 미만 지급의무');
  if (checks.some((c) => c.title.includes('15시간'))) hit.push('1주 소정근로시간이 15시간 미만인 근로자도 퇴직금을 받을 수 있나요');
  if (checks.some((c) => c.title.includes('통상임금'))) hit.push('평균임금이 통상임금보다 적으면 퇴직금을 어떻게 계산하나요');
  if (checks.some((c) => c.title.includes('못 받'))) hit.push('퇴직 후 14일 이내 금품청산 의무');
  // 제도 분기는 쟁점이 하나도 없어도 검색을 바꾼다 — 해석이 쌓인 곳이 여기다.
  if (b.pensionType === 'dc') hit.push('확정기여형 퇴직연금 부담금 납입 의무와 미납');
  if (b.pensionType === 'db') hit.push('확정급여형 퇴직연금 급여 수준과 지급');
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
      // 유사도 하한 0.50 — **챗봇(0.35)보다 높게 잡았다.**
      // 여기서는 「근거」라는 이름으로 붙으므로 빗나간 것이 섞이면 안 된다.
      // 2026-10-05 실측으로 경계가 깨끗하게 갈렸다:
      //   맞는 쪽 0.715·0.665·0.664 (1년 미만) / 0.648·0.573·0.555 (평균임금<통상임금)
      //   빗나간 쪽 0.448·0.392·0.385 (15시간 미만 — 이 쟁점은 행정해석이 실제로 얇다)
      // 15시간 단서는 조문이 명확해 해석이 쌓이지 않은 영역이다. 없으면 없는 대로 비워 둔다.
      db.rpc('search_interpretation_semantic_v2', {
        query_embedding: embedding, max_results: 3, min_similarity: 0.50,
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
