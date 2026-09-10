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

// ★ 2026-09-07 — sitemap 과 페이지 noindex 조건이 서로 달라서 GSC 경고가 났다.
//   sitemap 은 tier·신뢰도로 거르고, decisions/[id] 는 **본문 길이 200자**로 걸렀다.
//   그 사이에 낀 1,432건이 "sitemap 에는 있는데 noindex" 상태였다(실측).
//   조건을 두 곳에 따로 쓰면 또 갈라지므로 **DB 뷰 하나를 정본으로 삼는다.**
//     CREATE VIEW nlrc_sitemap_rows — tier·is_non_labor·confidence_level + body length >= 200
//   페이월/파싱실패 행은 tier 조건이 이미 전부 걸러낸다(추가 0건, 실측).
export const NLRC_SITEMAP_VIEW = 'nlrc_sitemap_rows';

// 판정례(/cases·/decisions·lawgo)를 사이트맵에 실을지. 기본은 **끈다** — 2026-09-11 색인 0건 대응.
// 켜려면 환경변수 SITEMAP_CASELAW=on. 자세한 이유는 getSitemapLayout() 머리말에 있다.
export const SITEMAP_CASELAW = process.env.SITEMAP_CASELAW === 'on';

export function applyNlrcSitemapFilter<T>(q: T): T {
  // 뷰가 조건을 이미 품고 있으므로 그대로 돌려준다.
  // (호출부가 nlrc_sitemap_rows 를 쓰지 않는 경우를 대비해 함수는 남겨 둔다)
  return q;
}

/** 세는 데 실패하면 **던진다.** 0 을 돌려주면 안 된다.
 *
 * 2026-09-07 사고 — nlrc_sitemap_rows 뷰에 인덱스가 없어 count=exact 가 timeout(500)을 냈고,
 * 여기서 `catch { return 0 }` 이 그걸 삼켜 decisionsChunks=0 이 됐다. 결과적으로 sitemap 인덱스가
 * 54 → 5 로 줄어 decisions 46,808 URL 이 통째로 빠진 채 1시간 CDN 캐시에 박혔다.
 *
 * **0 은 「없다」가 아니라 「못 셌다」다.** 두 경우를 같은 값으로 돌려주면 조용히 망가진다.
 * 던지면 라우트가 실패하고, revalidate 캐시가 직전 정상본을 유지한다 — 잘린 sitemap 을
 * 새로 내보내는 것보다 훨씬 안전하다.
 */
async function count(table: string, quality = false): Promise<number> {
  let q = supabaseServer.from(table).select('id', { count: 'exact', head: true });
  if (quality) q = applyNlrcSitemapFilter(q);
  const { count: n, error } = await q;
  if (error) {
    throw new Error(`sitemap count 실패 (${table}): ${error.message}`);
  }
  if (n === null || n === undefined) {
    throw new Error(`sitemap count 가 null (${table}) — 실패와 0 건을 구분할 수 없다`);
  }
  return n;
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
  // ★ 2026-09-11 — 판정례를 사이트맵에서 뺀다.
  //
  //   GSC 실측: 제출 42,731건 · **색인 0건**. 홈만 색인돼 있고 /blog 는 마지막 크롤이
  //   2026-07-17, 개별 글은 "Google 에 아직 알려지지 않은 URL" 이었다.
  //   제출한 42,731건 중 블로그는 964건뿐이고 나머지 4만 1천여 건이 자동 생성된
  //   /cases·/decisions 다. 신생 도메인이 얇은 페이지 4만 건을 한꺼번에 들이밀면
  //   크롤이 조여지고, 진짜 글 964편이 그 안에 묻힌다.
  //
  //   그래서 사이트맵에는 **사람이 쓴 것만** 싣는다. 판정례 페이지 자체는 그대로 살아 있고
  //   내부 링크로도 여전히 닿는다 — 사이트맵으로 밀어 넣는 것만 멈추는 것이다.
  //   되돌리려면 SITEMAP_CASELAW=on 하나면 된다.
  if (!SITEMAP_CASELAW) {
    return { casesChunks: 0, decisionsChunks: 0, lawgoChunks: 0, total: 1 };
  }
  const [cases, decisions, lawgo] = await Promise.all([
    count('cases'),
    count(NLRC_SITEMAP_VIEW),
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
