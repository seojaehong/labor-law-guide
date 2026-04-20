import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';
import { FAQ_CATEGORIES, categoryToSlug } from '@/lib/faq-categories';

export const revalidate = 3600;

const CHUNK_SIZE = 10_000;
const FALLBACK_BLOG_DATE = new Date('2026-03-29T00:00:00.000Z');
const FALLBACK_NEWS_DATE = new Date('2026-03-31T00:00:00.000Z');
const CONTACT_LAST_MODIFIED = new Date('2026-04-04T00:00:00.000Z');
const MIN_VALID_DATE = new Date('2000-01-01T00:00:00.000Z');

// ── Helpers ──

function clampToNow(date: Date) {
  const now = new Date();
  return date.getTime() > now.getTime() ? now : date;
}

function parseDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return clampToNow(fallback);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return clampToNow(fallback);
  // Reject dates before 2000 — these are likely data errors
  if (parsed.getTime() < MIN_VALID_DATE.getTime()) return clampToNow(fallback);
  return clampToNow(parsed);
}

function maxDate(...dates: Date[]) {
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

// ── Chunk layout ──
// id=0  → static pages + FAQ + blog categories + blog articles
// id=1+ → cases (ordered by id), then nlrc_decisions (ordered by id)

async function getTableCount(table: 'cases' | 'nlrc_decisions'): Promise<number> {
  const { count } = await supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function generateSitemaps() {
  const [casesCount, decisionsCount] = await Promise.all([
    getTableCount('cases'),
    getTableCount('nlrc_decisions'),
  ]);

  const casesChunks = Math.max(1, Math.ceil(casesCount / CHUNK_SIZE));
  const decisionsChunks = Math.max(1, Math.ceil(decisionsCount / CHUNK_SIZE));

  // id 0 = static + blog, id 1..casesChunks = cases, then decisions
  const total = 1 + casesChunks + decisionsChunks;
  return Array.from({ length: total }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  // Compute chunk boundaries
  const [casesCount, decisionsCount] = await Promise.all([
    getTableCount('cases'),
    getTableCount('nlrc_decisions'),
  ]);
  const casesChunks = Math.max(1, Math.ceil(casesCount / CHUNK_SIZE));

  // ── Chunk 0: static pages + blog ──
  if (id === 0) {
    return buildStaticAndBlogSitemap();
  }

  // ── Chunks 1..casesChunks: cases ──
  if (id <= casesChunks) {
    const chunkIndex = id - 1; // 0-based within cases
    return buildCasesSitemap(chunkIndex);
  }

  // ── Remaining chunks: nlrc_decisions ──
  const decisionChunkIndex = id - 1 - casesChunks; // 0-based within decisions
  const maxDecisionChunks = Math.max(1, Math.ceil(decisionsCount / CHUNK_SIZE));
  if (decisionChunkIndex < maxDecisionChunks) {
    return buildDecisionsSitemap(decisionChunkIndex);
  }

  return [];
}

// ── Builders ──

async function buildStaticAndBlogSitemap(): Promise<MetadataRoute.Sitemap> {
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
    { url: `${SITE_URL}/privacy`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: CONTACT_LAST_MODIFIED, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/faq`, lastModified: latestContentDate, changeFrequency: 'weekly', priority: 0.85 },
  ];

  const faqCategoryRoutes: MetadataRoute.Sitemap = FAQ_CATEGORIES.map((cat) => ({
    url: `${SITE_URL}/faq/${categoryToSlug(cat)}`,
    lastModified: latestContentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }));

  const blogCategoryRoutes: MetadataRoute.Sitemap = ['노동법', '판례분석', '뉴스해설', '실무가이드'].map((cat) => ({
    url: `${SITE_URL}/blog/category/${encodeURIComponent(cat)}`,
    lastModified: latestBlogDate,
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }));

  const blogRoutes: MetadataRoute.Sitemap = (blogArticles || []).map(
    (article: { slug: string; updated_at: string | null }) => ({
      url: `${SITE_URL}/blog/${article.slug}`,
      lastModified: parseDate(article.updated_at, latestBlogDate),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }),
  );

  return [...staticRoutes, ...faqCategoryRoutes, ...blogCategoryRoutes, ...blogRoutes];
}

async function buildCasesSitemap(chunkIndex: number): Promise<MetadataRoute.Sitemap> {
  const from = chunkIndex * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

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
}

async function buildDecisionsSitemap(chunkIndex: number): Promise<MetadataRoute.Sitemap> {
  const from = chunkIndex * CHUNK_SIZE;
  const to = from + CHUNK_SIZE - 1;

  const { data } = await supabaseServer
    .from('nlrc_decisions')
    .select('id, decision_date')
    .order('id', { ascending: true })
    .range(from, to);

  return (data || []).map((item: { id: string; decision_date: string | null }) => ({
    url: `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`,
    lastModified: parseDate(item.decision_date, new Date('2026-01-01')),
    changeFrequency: 'monthly' as const,
    priority: 0.65,
  }));
}
