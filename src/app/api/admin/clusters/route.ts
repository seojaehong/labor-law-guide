import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { checkAdminAuth } from '@/lib/admin-auth';
import {
  articleSubclusters,
  listAllSubclusters,
  CLUSTER_LABELS,
  AUTHOR_MATRIX,
  SUBCLUSTER_SATURATED_COUNT,
  SUBCLUSTER_COOLDOWN_COUNT,
} from '@/lib/blog-clusters';

const db = supabaseAdmin || supabaseServer;

interface ArticleRow {
  slug: string;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  author: string | null;
  published_at: string | null;
  tags: string[] | null;
}

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  // 최근 30일 딥다이브 (뉴스브리핑 제외)
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();

  const { data: articles, error } = await db
    .from('blog_articles')
    .select('slug, title, subtitle, category, author, published_at, tags')
    .gte('published_at', since30)
    .neq('category', '뉴스브리핑')
    .order('published_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[admin/clusters] supabase error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (articles || []) as ArticleRow[];

  // 서브클러스터별 카운트 계산
  const subKey = (c: string, s: string) => `${c}::${s}`;
  const count30: Record<string, number> = {};
  const count14: Record<string, number> = {};
  const authorSubCount: Record<string, Record<string, number>> = {};
  const subArticles: Record<string, ArticleRow[]> = {};

  for (const art of rows) {
    const subs = articleSubclusters({
      title: art.title,
      subtitle: art.subtitle,
      tags: art.tags,
    });
    const isRecent = art.published_at && art.published_at >= since14;
    for (const [c, s] of subs) {
      const k = subKey(c, s);
      count30[k] = (count30[k] || 0) + 1;
      if (isRecent) count14[k] = (count14[k] || 0) + 1;
      const author = art.author || '(unknown)';
      authorSubCount[author] = authorSubCount[author] || {};
      authorSubCount[author][k] = (authorSubCount[author][k] || 0) + 1;
      subArticles[k] = subArticles[k] || [];
      if (subArticles[k].length < 5) {
        subArticles[k].push(art);
      }
    }
  }

  // 모든 서브클러스터 리스트 + 상태 판정
  const allSubs = listAllSubclusters();
  const rows_out = allSubs.map(({ cluster, sub, label }) => {
    const k = subKey(cluster, sub);
    const c30 = count30[k] || 0;
    const c14 = count14[k] || 0;
    let status: 'SATURATED' | 'COOLDOWN' | 'MODERATE' | 'FREE' = 'FREE';
    if (c30 >= SUBCLUSTER_SATURATED_COUNT) status = 'SATURATED';
    else if (c14 >= SUBCLUSTER_COOLDOWN_COUNT) status = 'COOLDOWN';
    else if (c30 >= 2) status = 'MODERATE';
    return {
      cluster,
      sub,
      cluster_label: label || CLUSTER_LABELS[cluster] || cluster,
      count_30d: c30,
      count_14d: c14,
      status,
      sample_articles: (subArticles[k] || []).map((a) => ({
        slug: a.slug,
        title: a.title,
        author: a.author,
        published_at: a.published_at,
      })),
    };
  });

  return NextResponse.json({
    total_articles: rows.length,
    window_30d_since: since30,
    thresholds: {
      saturated: SUBCLUSTER_SATURATED_COUNT,
      cooldown_14d: SUBCLUSTER_COOLDOWN_COUNT,
    },
    subclusters: rows_out.sort((a, b) => b.count_30d - a.count_30d),
    author_matrix: AUTHOR_MATRIX,
    author_sub_counts: authorSubCount,
  });
}
