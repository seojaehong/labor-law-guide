import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

const FALLBACK_BLOG_DATE = new Date('2026-03-29T00:00:00.000Z');
const FALLBACK_NEWS_DATE = new Date('2026-03-31T00:00:00.000Z');
const CONTACT_LAST_MODIFIED = new Date('2026-04-04T00:00:00.000Z');
const NLRC_CHUNK_SIZE = 25000;

function clampToNow(date: Date) {
  const now = new Date();
  return date.getTime() > now.getTime() ? now : date;
}

function parseDate(value: string | null | undefined, fallback: Date) {
  if (!value) return clampToNow(fallback);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? clampToNow(fallback) : clampToNow(parsed);
}

function maxDate(...dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

// Sitemap index: split large dataset into multiple sitemaps
// id 0 = static + blog
// id 1 = cases (3,997)
// id 2+ = nlrc_decisions chunks (25,000 each)
export async function generateSitemaps() {
  const { count } = await supabaseServer
    .from('nlrc_decisions')
    .select('id', { count: 'exact', head: true });

  const nlrcCount = count || 0;
  const nlrcChunks = Math.ceil(nlrcCount / NLRC_CHUNK_SIZE);

  const sitemaps = [
    { id: 0 }, // static + blog
    { id: 1 }, // cases
  ];

  for (let i = 0; i < nlrcChunks; i++) {
    sitemaps.push({ id: 2 + i });
  }

  return sitemaps;
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  // Sitemap 0: static pages + blog articles
  if (id === 0) {
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

  // Sitemap 1: cases (법원 판례)
  if (id === 1) {
    const { data: cases } = await supabaseServer
      .from('cases')
      .select('id, decision_date')
      .order('decision_date', { ascending: false });

    return (cases || []).map((c: { id: string; decision_date: string | null }) => ({
      url: `${SITE_URL}/cases/${encodeURIComponent(c.id)}`,
      lastModified: parseDate(c.decision_date, new Date('2026-01-01')),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  }

  // Sitemap 2+: nlrc_decisions chunks
  const chunkIndex = id - 2;
  const offset = chunkIndex * NLRC_CHUNK_SIZE;

  const { data: decisions } = await supabaseServer
    .from('nlrc_decisions')
    .select('id, decision_date')
    .order('id', { ascending: true })
    .range(offset, offset + NLRC_CHUNK_SIZE - 1);

  return (decisions || []).map((d: { id: string; decision_date: string | null }) => ({
    url: `${SITE_URL}/decisions/${encodeURIComponent(d.id)}`,
    lastModified: parseDate(d.decision_date, new Date('2026-01-01')),
    changeFrequency: 'monthly' as const,
    priority: 0.65,
  }));
}
