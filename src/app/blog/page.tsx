import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { cleanBlogSummary } from '@/lib/blog-summary';
import BlogClient from './BlogClient';

export const revalidate = 1800; // ISR: 30분마다 재생성

export const metadata: Metadata = {
  title: '노동 딥다이브',
  description: '노란봉투법, 노동조합법, 판례분석, 뉴스해설, 실무가이드 등 노동법 심층 분석 콘텐츠를 제공합니다. 노무법인 위너스의 전문가가 직접 작성합니다.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: '노동 딥다이브 | 노란봉투법 가이드',
    description: '노동법 심층 분석 콘텐츠. 판례분석, 뉴스해설, 실무가이드.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string;
  tags: string[];
  author: string;
  cover_image: string | null;
  published_at: string;
  updated_at: string;
  view_count: number;
  seo_title: string | null;
  seo_description: string | null;
}

interface BlogArticleRow extends BlogArticle {
  content: string | null;
}

async function getArticles() {
  const { data, error } = await supabaseServer
    .from('blog_articles')
    .select(
      'slug, title, subtitle, summary, content, category, tags, author, published_at, seo_title, seo_description'
    )
    .order('published_at', { ascending: false });

  if (error) {
    console.error('blog fetch error:', error);
    return [];
  }

  return ((data || []) as BlogArticleRow[]).map((article) => ({
    ...article,
    summary: cleanBlogSummary(article.summary, article.content),
  }));
}

export default async function BlogPage() {
  const articles = await getArticles();

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
      <BlogClient initialArticles={articles} />
    </>
  );
}
