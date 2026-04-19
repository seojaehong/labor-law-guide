import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import FaqClient from './FaqClient';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: '노동법 FAQ — 1,600건+ 핵심 질문과 답변',
  description: '임금, 해고, 근로시간, 퇴직금, 연차휴가 등 30개 카테고리별 노동법 FAQ를 검색하세요. 공인노무사가 검수한 핵심 실무 Q&A를 제공합니다.',
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    title: '노동법 FAQ | 노란봉투법 가이드',
    description: '30개 카테고리, 1,600건+ 핵심 노동법 Q&A. 임금·해고·퇴직금·연차 등.',
    url: `${SITE_URL}/faq`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
};

async function getFaqData() {
  const [faqResult, countResult] = await Promise.all([
    supabaseServer.rpc('get_faq_by_category', {
      cat: null,
      page_size: 20,
      page_offset: 0,
      search_query: null,
      canonical_only: true,
    }),
    supabaseServer.rpc('get_faq_category_counts', { canonical_only: true }),
  ]);

  return {
    faqs: (faqResult.data || []).map((r: { id: number; unified_category: string; question: string; answer: string }) => ({
      id: r.id,
      unified_category: r.unified_category,
      question: r.question,
      answer: r.answer,
    })),
    categoryCounts: (countResult.data || []) as { unified_category: string; count: number }[],
    totalCount: faqResult.data?.[0]?.total_count || 0,
  };
}

export default async function FaqPage() {
  const { faqs, categoryCounts, totalCount } = await getFaqData();

  const topFaqs = faqs.slice(0, 10);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '노동법 FAQ', item: `${SITE_URL}/faq` },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/faq`,
        name: '노동법 FAQ',
        description: '30개 카테고리, 1,600건+ 핵심 노동법 질문과 답변',
        inLanguage: 'ko',
        mainEntity: topFaqs.map((faq: { question: string; answer: string }) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FaqClient initialFaqs={faqs} categoryCounts={categoryCounts} totalCount={totalCount} />
    </>
  );
}
