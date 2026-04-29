import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { cleanBlogSummary } from '@/lib/blog-summary';
import BlogClient from '../../BlogClient';
import type { BlogArticle } from '../../page';

export const revalidate = 3600;
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

export default async function BlogCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);

  const { data, error } = await supabaseServer
    .from('blog_articles')
    .select('slug, title, subtitle, summary, content, category, subtype, tags, author, published_at, seo_title, seo_description')
    .eq('category', decoded)
    .order('published_at', { ascending: false });

  const articles = ((data || []) as BlogArticleRow[]).map((article) => ({
    ...article,
    summary: cleanBlogSummary(article.summary, article.content),
  }));

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
      <BlogClient initialArticles={articles} />
    </>
  );
}
