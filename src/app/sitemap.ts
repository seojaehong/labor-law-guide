import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 블로그 최신글 날짜를 blog/news 등 동적 페이지의 lastModified로 활용
  const { data: blogArticles } = await supabaseServer
    .from('blog_articles')
    .select('slug, updated_at')
    .order('published_at', { ascending: false });

  const latestBlogDate = blogArticles?.[0]?.updated_at
    ? new Date(blogArticles[0].updated_at)
    : new Date('2026-03-29');

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: latestBlogDate, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/guide`, lastModified: new Date('2026-03-15'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/checklist`, lastModified: new Date('2026-03-15'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/manual`, lastModified: new Date('2026-03-15'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/cases`, lastModified: new Date('2026-03-26'), changeFrequency: 'monthly', priority: 0.85 },
    { url: `${SITE_URL}/database`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.85 },
    { url: `${SITE_URL}/news`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: latestBlogDate, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${SITE_URL}/ai`, lastModified: new Date('2026-03-20'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/subsidy`, lastModified: new Date('2026-03-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified: new Date('2026-02-01'), changeFrequency: 'monthly', priority: 0.7 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = (blogArticles || []).map((article: { slug: string; updated_at: string }) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: new Date(article.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...blogRoutes];
}
