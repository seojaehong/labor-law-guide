import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';
import { FAQ_CATEGORIES, categoryToSlug } from '@/lib/faq-categories';

export const revalidate = 3600;

const FALLBACK_BLOG_DATE = new Date('2026-03-29T00:00:00.000Z');
const FALLBACK_NEWS_DATE = new Date('2026-03-31T00:00:00.000Z');
const CONTACT_LAST_MODIFIED = new Date('2026-04-04T00:00:00.000Z');
const PAGE_SIZE = 1000;

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

type CaseRow = { id: string; decision_date: string | null };
type DecisionRow = { id: string; decision_date: string | null };

type TableName = 'cases' | 'nlrc_decisions';

async function fetchAllRows<T extends CaseRow | DecisionRow>(
  table: TableName,
  columns: string,
  orderBy: 'id' | 'decision_date',
  ascending: boolean,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabaseServer
      .from(table)
      .select(columns)
      .order(orderBy, { ascending })
      .range(from, to);

    const chunk = (data || []) as unknown as T[];
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ data: blogArticles }, { data: latestNewsRows }, cases, decisions] = await Promise.all([
    supabaseServer
      .from('blog_articles')
      .select('slug, updated_at')
      .order('published_at', { ascending: false }),
    supabaseServer
      .from('news')
      .select('published_at')
      .order('published_at', { ascending: false })
      .limit(1),
    fetchAllRows<CaseRow>('cases', 'id, decision_date', 'decision_date', false),
    fetchAllRows<DecisionRow>('nlrc_decisions', 'id, decision_date', 'id', true),
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

  const blogRoutes: MetadataRoute.Sitemap = (blogArticles || []).map((article: { slug: string; updated_at: string | null }) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: parseDate(article.updated_at, latestBlogDate),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const caseRoutes: MetadataRoute.Sitemap = cases.map((item) => ({
    url: `${SITE_URL}/cases/${encodeURIComponent(item.id)}`,
    lastModified: parseDate(item.decision_date, new Date('2026-01-01')),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const decisionRoutes: MetadataRoute.Sitemap = decisions.map((item) => ({
    url: `${SITE_URL}/decisions/${encodeURIComponent(item.id)}`,
    lastModified: parseDate(item.decision_date, new Date('2026-01-01')),
    changeFrequency: 'monthly' as const,
    priority: 0.65,
  }));

  return [...staticRoutes, ...faqCategoryRoutes, ...blogCategoryRoutes, ...blogRoutes, ...caseRoutes, ...decisionRoutes];
}
