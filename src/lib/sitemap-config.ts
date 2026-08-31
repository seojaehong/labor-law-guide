import { supabaseServer } from '@/lib/supabase-server';

/**
 * 사이트맵의 크기·필터·청크 경계를 한 곳에서 정한다.
 *
 * 왜 모으는가 (2026-08-31)
 *   같은 조건이 세 곳에 하드코딩돼 있었고, 세 곳이 서로 어긋났다.
 *     src/app/sitemap.xml/route.ts   인덱스가 선언하는 청크 수
 *     src/app/sitemap/[id]/route.ts  getTableCount() — 청크 경계 계산
 *     src/app/sitemap/[id]/route.ts  buildDecisionsSitemap() — 실제 URL 생성
 *   8/30 에 뒤의 두 곳을 고치면서 인덱스 라우트를 못 봤다. 그 결과 인덱스는 52 까지만
 *   선언하는데 /sitemap/53.xml 에 240건이 실재해서, 그 240건이 구글에 전달되지 않았다.
 *   조건이 흩어져 있는 한 같은 사고가 반복되므로 모듈 하나로 합친다.
 */

export const SITEMAP_CHUNK_SIZE = 1_000;

// nlrc_decisions.tier 의 실제 값은 standard / high_priority / low_priority 세 가지다.
// 예전 조건은 DB 에 0건인 'premium' 을 넣고 정작 존재하는 high_priority 6,657건을
// 통째로 빠뜨리고 있었다.
export const NLRC_SITEMAP_TIERS = ['standard', 'high_priority'] as const;

// decisions/[id] 는 SHOW_LAWGO 가 꺼져 있으면 prec_ 를 404 로 돌려준다.
// 404 를 사이트맵에 실으면 크롤 버짓만 낭비되므로 같은 스위치를 여기서도 본다.
export const SHOW_LAWGO = process.env.SHOW_LAWGO === 'true';

export function applyNlrcSitemapFilter<T>(q: T): T {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const out: any = (q as any)
    .in('tier', NLRC_SITEMAP_TIERS)
    .not('is_non_labor', 'is', true)
    .gte('confidence_level', 0.8);
  return out as T;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

async function count(table: string, quality = false): Promise<number> {
  try {
    let q = supabaseServer.from(table).select('id', { count: 'exact', head: true });
    if (quality) q = applyNlrcSitemapFilter(q);
    const { count: n } = await q;
    return n ?? 0;
  } catch {
    return 0;
  }
}

// 건수가 0이면 청크도 0이어야 한다. 예전에는 Math.max(1, ...) 라서 0건인 소스도
// 청크 하나를 예약했고, 그 청크는 빈 XML 을 돌려줬다. 크롤러에게 빈 청크를 주면
// 사이트맵 전체의 신뢰도가 깎인다.
export function chunkCount(n: number): number {
  return n > 0 ? Math.ceil(n / SITEMAP_CHUNK_SIZE) : 0;
}

export interface SitemapLayout {
  casesChunks: number;
  decisionsChunks: number;
  lawgoChunks: number;
  /** 인덱스가 선언해야 하는 청크 총 개수 (0번 = 정적/블로그) */
  total: number;
}

/**
 * 인덱스 라우트와 청크 라우트가 반드시 같은 값을 봐야 한다.
 * 둘이 갈라지면 "선언은 됐는데 비어 있는 청크" 또는 "실재하는데 선언 안 된 청크"가 생긴다.
 */
export async function getSitemapLayout(): Promise<SitemapLayout> {
  const [cases, decisions, lawgo] = await Promise.all([
    count('cases'),
    count('nlrc_decisions', true),
    SHOW_LAWGO ? count('lawgo_precedents') : Promise.resolve(0),
  ]);
  const casesChunks = chunkCount(cases);
  const decisionsChunks = chunkCount(decisions);
  const lawgoChunks = chunkCount(lawgo);
  return {
    casesChunks,
    decisionsChunks,
    lawgoChunks,
    total: 1 + casesChunks + decisionsChunks + lawgoChunks,
  };
}
