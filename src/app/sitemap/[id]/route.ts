import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';
import { FAQ_CATEGORIES, categoryToSlug } from '@/lib/faq-categories';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

const CHUNK_SIZE = 1_000;

// nlrc_decisions 의 tier 값은 standard / high_priority / low_priority 뿐이다.
// 카운트 계산부와 URL 생성부 두 곳에서 같은 조건을 써야 하는데, 예전엔 각자 하드코딩돼
// 있었다. 한 곳만 고치면 "sitemap 인덱스가 선언한 개수"와 "실제로 나오는 URL 수"가
// 어긋나 크롤러가 빈 청크를 받게 되므로 상수로 묶는다.
const NLRC_SITEMAP_TIERS = ['standard', 'high_priority'] as const;

// decisions/[id] 는 SHOW_CASES !== 'true' 이면 bigcase(bc_)/lawgo(prec_) 를 notFound()
// 처리한다 (2026-05-15 d0f344b, "데이터 정비 중 일시 숨김"). 그런데 sitemap 은 그 URL 을
// 계속 광고하고 있었다 — 실측 결과 sitemap 53,201건 중 10,917건이 bc_ 였고 전부 404 였다.
// 사이트맵의 20%가 404면 크롤 버짓이 통째로 낭비되고 사이트맵 신뢰도가 깎여서
// 정상 페이지 색인까지 밀린다. GSC 색인수가 6/1 44,230 → 8/21 38,606 으로 줄고
// 'NOINDEX 제외 7,348' / '리디렉션 7,446' 이 쌓인 시점이 정확히 이 커밋 직후다.
// 스위치가 켜지면 다시 싣고, 꺼져 있으면 싣지 않는다 — 페이지 동작과 항상 일치시킨다.
const SHOW_CASES = process.env.SHOW_CASES === 'true';

// 카운트부/생성부가 같은 조건을 쓰도록 쿼리 빌더를 한 곳에서 만든다.
function applyNlrcSitemapFilter<T>(q: T): T {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let out: any = q;
  out = out
    .in('tier', NLRC_SITEMAP_TIERS)
    .not('is_non_labor', 'is', true)
    .gte('confidence_level', 0.8);
  if (!SHOW_CASES) {
    // bc_ 상세 페이지는 현재 404 다. 404 를 사이트맵에 실으면 안 된다.
    // 'bc_%' 로 쓰면 PostgREST 가 escape 를 요구해 쿼리가 깨진다(실측: 결과 0/에러).
    // id 중 'bc' 로 시작하는 건 bc_ 뿐이므로 'bc%' 로 충분하다.
    // 실측 검증: 57,840 → 41,836 (= 57,840 - bc_ 16,004). sitemap 48,240 → 37,323.
    out = out.not('id', 'like', 'bc%');
  }
  return out as T;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
const FALLBACK_BLOG_DATE = new Date('2026-03-29T00:00:00.000Z');
const FALLBACK_NEWS_DATE = new Date('2026-03-31T00:00:00.000Z');
const CONTACT_LAST_MODIFIED = new Date('2026-04-04T00:00:00.000Z');
const MIN_VALID_DATE = new Date('2000-01-01T00:00:00.000Z');

type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
};

function clampToNow(date: Date) {
  const now = new Date();
  return date.getTime() > now.getTime() ? now : date;
}

function parseDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return clampToNow(fallback);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return clampToNow(fallback);
  if (parsed.getTime() < MIN_VALID_DATE.getTime()) return clampToNow(fallback);
  return clampToNow(parsed);
}

function maxDate(...dates: Date[]) {
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

async function getTableCount(table: string, extraFilter?: string): Promise<number> {
  try {
    let q = supabaseServer.from(table).select('id', { count: 'exact', head: true });
    if (extraFilter === 'nlrc_quality') {
      // tier 값은 실제로 standard / high_priority / low_priority 세 가지다.
      // 기존 조건은 'premium'(DB에 0건인 존재하지 않는 값)을 넣고,
      // 정작 존재하는 high_priority 6,657건을 통째로 빠뜨리고 있었다 (2026-08-30 확인).
      // sitemap 대상 42,280 → 48,240건.
      q = applyNlrcSitemapFilter(q);
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const loc = `<loc>${xmlEscape(e.url)}</loc>`;
      const lastMod = e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : '';
      const cf = e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : '';
      const pr = typeof e.priority === 'number' ? `<priority>${e.priority.toFixed(2)}</priority>` : '';
      return `  <url>${loc}${lastMod}${cf}${pr}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

async function buildStaticAndBlogSitemap(): Promise<SitemapEntry[]> {
  let blogArticles: Array<{ slug: string; updated_at: string | null }> = [];
  let latestNewsRows: Array<{ published_at: string | null }> = [];

  try {
    const res = await supabaseServer
      .from('blog_articles')
      .select('slug, updated_at')
      .order('published_at', { ascending: false });
    if (res.data) blogArticles = res.data as typeof blogArticles;
  } catch {}

  try {
    const res = await supabaseServer
      .from('news')
      .select('published_at')
      .order('published_at', { ascending: false })
      .limit(1);
    if (res.data) latestNewsRows = res.data as typeof latestNewsRows;
  } catch {}

  const latestBlogDate = parseDate(blogArticles[0]?.updated_at, FALLBACK_BLOG_DATE);
  const latestNewsDate = parseDate(latestNewsRows[0]?.published_at, FALLBACK_NEWS_DATE);
  const latestContentDate = maxDate(latestBlogDate, latestNewsDate);

  const staticRoutes: SitemapEntry[] = [
    { url: SITE_URL, lastModified: latestContentDate, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/guide`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/checklist`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/manual`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/cases`, lastModified: new Date('2026-03-26T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.85 },
    { url: `${SITE_URL}/database`, lastModified: latestNewsDate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${SITE_URL}/news`, lastModified: latestNewsDate, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: latestBlogDate, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${SITE_URL}/ai`, lastModified: new Date('2026-03-20T00:00:00.000Z'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${SITE_URL}/tools`, lastModified: new Date('2026-04-29T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.85 },
    { url: `${SITE_URL}/tools/holiday-pay`, lastModified: new Date('2026-04-29T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/tools/contract-check`, lastModified: new Date('2026-07-31T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/tools/severance.html`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.85 },
    { url: `${SITE_URL}/privacy`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/faq`, lastModified: latestContentDate, changeFrequency: 'weekly', priority: 0.85 },
  ];

  const faqCategoryRoutes: SitemapEntry[] = FAQ_CATEGORIES.map((cat) => ({
    url: `${SITE_URL}/faq/${categoryToSlug(cat)}`,
    lastModified: latestContentDate,
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  const blogCategoryRoutes: SitemapEntry[] = ['노동법', '판례분석', '뉴스해설', '실무가이드'].map((cat) => ({
    url: `${SITE_URL}/blog/category/${encodeURIComponent(cat)}`,
    lastModified: latestBlogDate,
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  const blogRoutes: SitemapEntry[] = blogArticles.map((article) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: parseDate(article.updated_at, latestBlogDate),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...faqCategoryRoutes, ...blogCategoryRoutes, ...blogRoutes];
}

async function buildCasesSitemap(chunkIndex: number): Promise<SitemapEntry[]> {
  const from = chunkIndex * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

  try {
    const { data } = await supabaseServer
      .from('cases')
      .select('id, decision_date')
      .order('id', { ascending: true })
      .range(from, to);

    return (data || []).map((item: { id: string; decision_date: string | null }) => ({
      url: `${SITE_URL}/cases/${encodeURIComponent(item.id)}`,
      lastModified: parseDate(item.decision_date, new Date('2026-01-01')),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

async function buildDecisionsSitemap(chunkIndex: number): Promise<SitemapEntry[]> {
  const from = chunkIndex * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

  try {
    const { data } = await applyNlrcSitemapFilter(
      supabaseServer.from('nlrc_decisions').select('id, decision_date')
    )
      .order('id', { ascending: true })
      .range(from, to);

    return (data || []).map((item: { id: string; decision_date: string | null }) => ({
      url: `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`,
      lastModified: parseDate(item.decision_date, new Date('2026-01-01')),
      changeFrequency: 'monthly' as const,
      priority: 0.65,
    }));
  } catch {
    return [];
  }
}

// 5/15 commit d0f344b 사고 회복: lawgo_precedents(법원 판례) 4,982건이 sitemap에
// 완전히 빠져있어서 Google 색인 못 함. + 5/15에 일시 차단 commit이 같은 페이지를
// notFound() 처리해서 색인 대거 삭제. 추가해서 회복 가속.
async function buildLawgoSitemap(chunkIndex: number): Promise<SitemapEntry[]> {
  const from = chunkIndex * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

  try {
    const { data } = await supabaseServer
      .from('lawgo_precedents')
      .select('id, judgment_date')
      .order('id', { ascending: true })
      .range(from, to);

    return (data || []).map((item: { id: string; judgment_date: string | null }) => ({
      url: `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`,
      lastModified: parseDate(item.judgment_date, new Date('2026-01-01')),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idRaw } = await params;
  const idParsed = parseInt(idRaw.replace(/\.xml$/, ''), 10);

  if (Number.isNaN(idParsed) || idParsed < 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const [casesCount, decisionsCount, lawgoCount] = await Promise.all([
    getTableCount('cases'),
    getTableCount('nlrc_decisions', 'nlrc_quality'),
    // lawgo(prec_) 상세도 SHOW_CASES 가 꺼져 있으면 404 다. 404 를 광고하지 않는다.
    SHOW_CASES ? getTableCount('lawgo_precedents') : Promise.resolve(0),
  ]);
  const casesChunks = Math.max(1, Math.ceil(casesCount / CHUNK_SIZE));
  const maxDecisionChunks = Math.max(1, Math.ceil(decisionsCount / CHUNK_SIZE));
  const maxLawgoChunks = Math.max(1, Math.ceil(lawgoCount / CHUNK_SIZE));

  let entries: SitemapEntry[] = [];

  if (idParsed === 0) {
    entries = await buildStaticAndBlogSitemap();
  } else if (idParsed <= casesChunks) {
    entries = await buildCasesSitemap(idParsed - 1);
  } else if (idParsed - casesChunks <= maxDecisionChunks) {
    entries = await buildDecisionsSitemap(idParsed - 1 - casesChunks);
  } else {
    const lawgoChunkIndex = idParsed - 1 - casesChunks - maxDecisionChunks;
    if (lawgoChunkIndex >= 0 && lawgoChunkIndex < maxLawgoChunks) {
      entries = await buildLawgoSitemap(lawgoChunkIndex);
    }
  }

  const xml = toXml(entries);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
