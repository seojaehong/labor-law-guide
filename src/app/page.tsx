import type { Metadata } from 'next';
import { SITE_URL, BRAND_NAME } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';
import { getCurrentTopicPicks } from '@/lib/topic-picks';
import TopicPicks from '@/components/TopicPicks';
import HomeClient from './HomeClient';

export const revalidate = 3600; // ISR: 1시간

interface LatestBlogArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  category: string;
  published_at: string;
}

// 261112 — 홈의 「자주 묻는 질문」 7개는 전부 노란봉투법 문답이라 섹션과 FAQPage JSON-LD 를 함께 뺐다.
// 노란봉투법 페이지(/guide·/manual·/checklist·/cases·/news)는 그대로 있다. 일반 노동법 FAQ 는 /faq 에 있다.

// 홈 canonical 은 여기서 적는다. 루트 layout 에 두면 alternates 를 안 적은 페이지가 홈을 물려받는다.
// alternates 는 통째로 바뀌므로 RSS 자동 발견 링크도 같이 적는다.
export const metadata: Metadata = {
  alternates: {
    canonical: SITE_URL,
    types: { 'application/rss+xml': `${SITE_URL}/rss.xml` },
  },
};

async function getHomeStats() {
  const [casesResult, adminResult, newsResult, blogResult] = await Promise.all([
    supabaseServer.from('cases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('admin_interpretations').select('id', { count: 'exact', head: true }),
    supabaseServer.from('news').select('id', { count: 'exact', head: true }),
    supabaseServer
      .from('blog_articles')
      .select('slug, title, subtitle, summary, category, published_at')
      .order('published_at', { ascending: false })
      .limit(4),
  ]);

  return {
    totalCases: casesResult.count || 0,
    totalAdmin: adminResult.count || 0,
    totalNews: newsResult.count || 0,
    latestBlogArticles: (blogResult.data || []) as LatestBlogArticle[],
  };
}

export default async function Home() {
  const [{ totalCases, totalAdmin, totalNews, latestBlogArticles }, topicPicks] = await Promise.all([
    getHomeStats(),
    getCurrentTopicPicks(),
  ]);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: BRAND_NAME,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${SITE_URL}/#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient
        totalCases={totalCases}
        totalAdmin={totalAdmin}
        totalNews={totalNews}
        latestBlogArticles={latestBlogArticles}
        topicPicksSlot={<TopicPicks items={topicPicks} variant="home" />}
      />
    </>
  );
}
