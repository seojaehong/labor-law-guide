import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';

import { SITE_URL } from '@/lib/constants';
import { cleanBlogSummary } from '@/lib/blog-summary';
import BlogClient from '../../BlogClient';
import { PAGE_SIZE } from '@/lib/blog-list';
import type { BlogArticle } from '../../page';

// /blog 와 같은 이유로 요청마다 그린다 — 카테고리 최대치가 233편이라 전부 내려보내면
// 24편만 보여주면서 200편치를 같이 실어 보내게 된다 (2026-09-12).
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

const BLOG_CATEGORIES = ['노동법', '판례분석', '뉴스해설', '뉴스브리핑', '실무가이드'];

export async function generateStaticParams() {
  return BLOG_CATEGORIES.map((cat) => ({ category: cat }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const decoded = decodeURIComponent(category);

  return {
    title: `${decoded} — 노동 딥다이브`,
    description: `${decoded} 카테고리의 노동법 심층 분석 콘텐츠를 모아봅니다. 노무법인 위너스 전문가가 직접 작성합니다.`,
    alternates: { canonical: `${SITE_URL}/blog/category/${category}` },
    openGraph: {
      title: `${decoded} | 노동 딥다이브`,
      description: `${decoded} 관련 노동법 콘텐츠`,
      url: `${SITE_URL}/blog/category/${category}`,
      type: 'website',
      locale: 'ko_KR',
      images: [{ url: `${SITE_URL}/opengraph-image` }],
    },
  };
}

interface BlogArticleRow extends BlogArticle {
  content: string | null;
}

async function fetchCategoryPage(decoded: string, page: number) {
  const from = (page - 1) * PAGE_SIZE;

  const { data, count, error } = await supabaseServer
    .from('blog_articles')
    .select(
      'slug, title, subtitle, summary, content, category, subtype, tags, author, published_at, seo_title, seo_description',
      { count: 'exact' }
    )
    .eq('category', decoded)
    .order('published_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // 실패는 캐시에 담지 않는다 — 빈 목록이 10분 동안 굳어 버린다 (/blog 와 동일).
  if (error) throw error;

  // content 는 summary 생성용 — 클라이언트 페이로드에서는 제외 (/blog 와 동일 이유)
  const articles = ((data || []) as BlogArticleRow[]).map(({ content, ...article }) => ({
    ...article,
    summary: cleanBlogSummary(article.summary, content),
  }));
  return { articles, total: count ?? articles.length };
}

// 2026-09-15 — /blog 와 같은 쿼리를 쓰므로 같은 값을 치르고 있었다: 요약 한 줄을 만들자고
// 목록 24편의 content 전문을 매 요청 끌어온다. 실측 1.9~2.4s (캐시를 붙인 /blog 는 1.0~1.6s).
// 요약을 다 만든 결과만 10분 캐시한다. 인자(카테고리·페이지)가 캐시 키에 들어간다.
const getCachedCategoryPage = unstable_cache(fetchCategoryPage, ['blog-category-v1'], { revalidate: 600 });

async function getCategoryPage(decoded: string, page: number) {
  try {
    return await getCachedCategoryPage(decoded, page);
  } catch (error) {
    console.error('blog category fetch error:', error);
    return { articles: [] as BlogArticle[], total: 0 };
  }
}

export default async function BlogCategoryPage({
  params, searchParams,
}: { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const page = Math.max(1, parseInt((await searchParams).page || '1', 10) || 1);

  const { articles, total } = await getCategoryPage(decoded, page);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '노동 딥다이브', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: decoded, item: `${SITE_URL}/blog/category/${category}` },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/blog/category/${category}`,
        name: `${decoded} — 노동 딥다이브`,
        description: `${decoded} 카테고리 노동법 콘텐츠`,
        url: `${SITE_URL}/blog/category/${category}`,
        inLanguage: 'ko',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogClient
        articles={articles}
        total={total}
        page={page}
        activeCategory={decoded}
        activeSubtype={null}
        query=""
        basePath={`/blog/category/${category}`}
      />
    </>
  );
}
