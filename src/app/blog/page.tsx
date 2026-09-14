import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { cleanBlogSummary } from '@/lib/blog-summary';
import { getCurrentTopicPicks } from '@/lib/topic-picks';
import TopicPicks from '@/components/TopicPicks';
import BlogClient from './BlogClient';
import { PAGE_SIZE } from '@/lib/blog-list';

// 목록은 요청마다 그린다. 예전에는 ISR 1시간에 960편 전부를 정적으로 구웠는데,
// 그 페이로드가 1.5MB 였다 — 12편만 보여주면서 960편치 제목·요약·태그를 전부 내려보냈다.
// 2026-09-11 실측: 첫 응답 1,506,923 바이트, 그중 RSC 플라이트가 763,704자.
// 필터·검색·페이지를 URL 로 옮기고 그 페이지 몫만 읽는다.
export const dynamic = 'force-dynamic';

export interface BlogArticle {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string;
  subtype: string | null;
  tags: string[];
  author: string;
  published_at: string;
  seo_title: string | null;
  seo_description: string | null;
}

interface BlogArticleRow extends BlogArticle {
  content: string | null;
}

export const CATEGORIES = ['노동법', '판례분석', '뉴스해설', '뉴스브리핑', '실무가이드'];

type Search = { page?: string; cat?: string; sub?: string; q?: string };

function parse(sp: Search) {
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const cat = sp.cat && CATEGORIES.includes(sp.cat) ? sp.cat : 'all';
  const sub = sp.sub === 'deep-dive' ? 'deep-dive' : null;
  const q = (sp.q || '').trim().slice(0, 80);
  return { page, cat, sub, q };
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Search> }
): Promise<Metadata> {
  const { page, cat, q } = parse(await searchParams);
  // 검색 결과는 색인시키지 않는다 — 같은 글이 질의마다 다른 URL 로 중복된다.
  const noindex = Boolean(q);
  const suffix = cat !== 'all' ? ` · ${cat}` : '';
  const pageSuffix = page > 1 ? ` (${page}페이지)` : '';
  // 카테고리를 고른 목록의 정본 주소는 /blog/category/<카테고리> 다.
  // /blog?cat=X 와 두 주소로 갈리면 같은 목록이 중복 색인된다.
  const canonical = new URL(
    cat === 'all' ? `${SITE_URL}/blog` : `${SITE_URL}/blog/category/${encodeURIComponent(cat)}`);
  if (page > 1) canonical.searchParams.set('page', String(page));

  return {
    title: `노동 딥다이브${suffix}${pageSuffix}`,
    description:
      '노란봉투법, 노동조합법, 판례분석, 뉴스해설, 실무가이드 등 노동법 심층 분석 콘텐츠를 제공합니다. 노무법인 위너스의 전문가가 직접 작성합니다.',
    alternates: { canonical: canonical.toString() },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: '노동 딥다이브 | 노란봉투법 가이드',
      description: '노동법 심층 분석 콘텐츠. 판례분석, 뉴스해설, 실무가이드.',
      url: canonical.toString(),
      type: 'website',
      locale: 'ko_KR',
      images: [{ url: `${SITE_URL}/opengraph-image` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: '노동 딥다이브 | 노란봉투법 가이드',
      description: '노동법 심층 분석 콘텐츠. 판례분석, 뉴스해설, 실무가이드.',
    },
  };
}

async function fetchPage({ page, cat, sub, q }: ReturnType<typeof parse>) {
  let query = supabaseServer
    .from('blog_articles')
    .select(
      'slug, title, subtitle, summary, content, category, subtype, tags, author, published_at, seo_title, seo_description',
      { count: 'exact' }
    )
    .order('published_at', { ascending: false });

  if (cat !== 'all') query = query.eq('category', cat);
  if (sub) query = query.eq('subtype', sub);
  if (q) {
    // 제목·부제·요약 세 곳을 본다. 쉼표와 괄호는 or() 문법을 깨므로 지운다.
    const safe = q.replace(/[,()*]/g, ' ').trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,subtitle.ilike.%${safe}%,summary.ilike.%${safe}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  // 실패는 캐시에 담지 않는다 — 빈 목록이 10분 동안 굳어 버린다.
  if (error) throw error;

  // content 는 summary 를 만드는 데만 쓰고 클라이언트로 넘기지 않는다.
  const articles = ((data || []) as BlogArticleRow[]).map(({ content, ...a }) => ({
    ...a,
    summary: cleanBlogSummary(a.summary, content),
  }));
  return { articles, total: count ?? articles.length };
}

// 2026-09-14 — 목록 20편의 content 전문을 요약 한 줄 만들자고 매 요청 끌어오고 있었다.
// PostgREST 직접 실측: content 포함 1,333KB·0.60s, 빼면 25KB·0.15s. 하네스 콜드 측정 9/12 2.2s → 9/14 4.4s.
// 요약을 다 만든 결과(25KB)만 10분 캐시한다. 인자(page·cat·sub)가 캐시 키에 들어간다.
// 검색(q)은 질의마다 달라 캐시하지 않는다.
const getCachedPage = unstable_cache(fetchPage, ['blog-list-v1'], { revalidate: 600 });

async function getPage(state: ReturnType<typeof parse>) {
  try {
    return await (state.q ? fetchPage(state) : getCachedPage(state));
  } catch (error) {
    console.error('blog fetch error:', error);
    return { articles: [] as BlogArticle[], total: 0 };
  }
}

export default async function BlogPage(
  { searchParams }: { searchParams: Promise<Search> }
) {
  const state = parse(await searchParams);
  const [{ articles, total }, topicPicks] = await Promise.all([
    getPage(state),
    getCurrentTopicPicks(),
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '노동 딥다이브', item: `${SITE_URL}/blog` },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/blog`,
        name: '노동 딥다이브',
        description: '노동법 심층 분석 콘텐츠. 판례분석, 뉴스해설, 실무가이드.',
        url: `${SITE_URL}/blog`,
        inLanguage: 'ko',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopicPicks items={topicPicks} variant="index" />
      <BlogClient
        articles={articles}
        total={total}
        page={state.page}
        activeCategory={state.cat}
        activeSubtype={state.sub}
        query={state.q}
      />
    </>
  );
}
