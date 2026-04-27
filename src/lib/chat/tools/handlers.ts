import { supabase } from '@/lib/supabase';
import { SITE_DOMAIN, SANCTION_DOMAIN } from '../config';

export async function searchBlogTool(args: {
  query: string;
  category?: string;
  limit?: number;
}) {
  const limit = Math.min(args.limit ?? 3, 5);
  const q = (args.query || '').trim().slice(0, 80);
  if (!q) return { results: [] };
  const pattern = `%${q.replace(/[%_\\]/g, '')}%`;
  let query = supabase
    .from('blog_articles')
    .select('slug, title, summary, category, published_at')
    .or(`title.ilike.${pattern},summary.ilike.${pattern},seo_description.ilike.${pattern}`)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (args.category) query = query.eq('category', args.category);
  const { data, error } = await query;
  if (error || !data) return { results: [] };
  return {
    results: data.map((r) => ({
      slug: r.slug,
      title: r.title,
      summary: (r.summary || '').slice(0, 140),
      category: r.category,
      url: `${SITE_DOMAIN}/blog/${r.slug}`,
    })),
  };
}

export function suggestCaseAnalyzerTool(args: { dispute_summary: string }) {
  const q = encodeURIComponent((args.dispute_summary || '').trim().slice(0, 200));
  const url = `${SANCTION_DOMAIN}/sanction?q=${q}`;
  return {
    url,
    label: 'AI 판정례 비교분석',
    note:
      '비슷한 판정례를 자동 비교해 승패 요인과 실무 체크리스트를 제공합니다 (42,000건+ 노동위 판정례 기반).',
  };
}
