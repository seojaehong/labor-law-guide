import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

const FALLBACK_BLOG_DATE = new Date('2026-03-29T00:00:00.000Z');
const FALLBACK_NEWS_DATE = new Date('2026-03-31T00:00:00.000Z');
const CONTACT_LAST_MODIFIED = new Date('2026-04-02T00:00:00.000Z');

function parseDate(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function maxDate(...dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: blogArticles }, { data: latestNewsRows }] = await Promise.all([
    supabaseServer
      .from('blog_articles')
      .select('slug, updated_at')
      .order('published_at', { ascending: false }),
    supabaseServer
      .from('news')
      .select('published_at')
      .order('published_at', { ascending: false })
      .limit(1),
  ]);

  const latestBlogDate = parseDate(blogArticles?.[0]?.updated_at, FALLBACK_BLOG_DATE);
  const latestNewsDate = parseDate(latestNewsRows?.[0]?.published_at, FALLBACK_NEWS_DATE);
  const latestContentDate = maxDate(latestBlogDate, latestNewsDate);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: latestContentDate, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/guide`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/checklist`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/manual`, lastModified: new Date('2026-03-15T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/cases`, lastModified: new Date('2026-03-26T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.85 },
    { url: `${SITE_URL}/database`, lastModified: latestNewsDate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${SITE_URL}/news`, lastModified: latestNewsDate, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: latestBlogDate, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${SITE_URL}/ai`, lastModified: new Date('2026-03-20T00:00:00.000Z'), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/subsidy`, lastModified: new Date('2026-03-01T00:00:00.000Z'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.75 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = (blogArticles || []).map((article: { slug: string; updated_at: string | null }) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: parseDate(article.updated_at, latestBlogDate),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...blogRoutes];
}
