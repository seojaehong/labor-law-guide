import { supabaseServer } from '@/lib/supabase-server';
import NewsClient from './NewsClient';

export const revalidate = 3600; // ISR: 1시간마다 재생성

interface NewsItem {
  id: string;
  title: string;
  source: string;
  published_at: string;
  url: string;
  summary: string;
  keywords_matched: string[];
}

interface Briefing {
  date: string;
  title: string;
  content: string;
  news_count: number;
  top_keywords: string[];
  created_at?: string;
}

async function getInitialData() {
  // KST 기준 오늘 날짜
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);

  const [newsResult, briefingResult] = await Promise.all([
    supabaseServer
      .from('news')
      .select('*', { count: 'exact' })
      .order('published_at', { ascending: false })
      .range(0, 20),
    supabaseServer
      .from('news_briefings')
      .select('*')
      .eq('date', today)
      .single(),
  ]);

  return {
    news: (newsResult.data || []) as NewsItem[],
    totalCount: newsResult.count || 0,
    briefing: (briefingResult.data as Briefing) || null,
    lastUpdated: newsResult.data?.[0]?.published_at || null,
  };
}

export default async function NewsPage() {
  const { news, totalCount, briefing, lastUpdated } = await getInitialData();

  return (
    <NewsClient
      initialNews={news.slice(0, 20)}
      initialTotalCount={totalCount}
      initialBriefing={briefing}
      initialLastUpdated={lastUpdated}
    />
  );
}
