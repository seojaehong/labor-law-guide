import { supabaseServer } from './supabase-server';

export interface TopicPick {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string;
  topic_pick_rank: number;
  topic_pick_week: string;
  published_at: string;
}

/**
 * 가장 최근 주의 토픽 픽을 반환.
 * - is_topic_pick=true 행만
 * - 가장 최근 topic_pick_week 1개만 (지난 주 픽이 새 주 시작 시점에 같이 노출되는 일 차단)
 * - rank 오름차순
 * - excludeSlug 옵션 (글 본문 페이지에서 자기 자신 제외용)
 */
export async function getCurrentTopicPicks(excludeSlug?: string): Promise<TopicPick[]> {
  const { data, error } = await supabaseServer
    .from('blog_articles')
    .select('slug, title, subtitle, summary, category, topic_pick_rank, topic_pick_week, published_at')
    .eq('is_topic_pick', true)
    .not('topic_pick_week', 'is', null)
    .order('topic_pick_week', { ascending: false })
    .order('topic_pick_rank', { ascending: true })
    .limit(12);

  if (error || !data || data.length === 0) return [];

  const latestWeek = data[0].topic_pick_week;
  return data
    .filter((d) => d.topic_pick_week === latestWeek && d.slug !== excludeSlug)
    .slice(0, 4) as TopicPick[];
}
