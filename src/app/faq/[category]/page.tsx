import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { SITE_URL } from '@/lib/constants';
import { FAQ_CATEGORIES, slugToCategory, categoryToSlug } from '@/lib/faq-categories';
import FaqClient from '../FaqClient';

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return FAQ_CATEGORIES.map((cat) => ({ category: categoryToSlug(cat) }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: slug } = await params;
  const category = slugToCategory(slug);

  return {
    title: `${category} FAQ — 노동법 질문과 답변`,
    description: `${category} 관련 자주 묻는 질문과 답변을 확인하세요. 공인노무사가 검수한 신뢰할 수 있는 노동법 FAQ입니다.`,
    alternates: { canonical: `${SITE_URL}/faq/${categoryToSlug(category)}` },
    openGraph: {
      title: `${category} FAQ | 노란봉투법 가이드`,
      description: `${category} 관련 노동법 Q&A`,
      url: `${SITE_URL}/faq/${categoryToSlug(category)}`,
      type: 'website',
      locale: 'ko_KR',
    },
  };
}

export default async function FaqCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const category = slugToCategory(slug);

  const [faqResult, countResult] = await Promise.all([
    supabaseServer.rpc('get_faq_by_category', {
      cat: category,
      page_size: 20,
      page_offset: 0,
      search_query: null,
      canonical_only: true,
    }),
    supabaseServer.rpc('get_faq_category_counts', { canonical_only: true }),
  ]);

  const faqs = (faqResult.data || []).map((r: { id: number; unified_category: string; question: string; answer: string }) => ({
    id: r.id,
    unified_category: r.unified_category,
    question: r.question,
    answer: r.answer,
  }));
  const categoryCounts = (countResult.data || []) as { unified_category: string; count: number }[];
  const totalCount = faqResult.data?.[0]?.total_count || 0;

  const topFaqs = faqs.slice(0, 10);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '노동법 FAQ', item: `${SITE_URL}/faq` },
          { '@type': 'ListItem', position: 3, name: `${category} FAQ`, item: `${SITE_URL}/faq/${categoryToSlug(category)}` },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/faq/${categoryToSlug(category)}`,
        name: `${category} FAQ`,
        description: `${category} 관련 노동법 질문과 답변`,
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
      <FaqClient initialFaqs={faqs} categoryCounts={categoryCounts} totalCount={totalCount} initialCategory={category} />
    </>
  );
}
