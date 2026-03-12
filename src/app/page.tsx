import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';
import HomeClient from './HomeClient';

export const revalidate = 3600;

async function getHomeStats() {
  const [casesResult, adminResult, newsResult] = await Promise.all([
    supabaseServer.from('cases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('admin_interpretations').select('id', { count: 'exact', head: true }),
    supabaseServer.from('news').select('id', { count: 'exact', head: true }),
  ]);

  return {
    totalCases: casesResult.count || 0,
    totalAdmin: adminResult.count || 0,
    totalNews: newsResult.count || 0,
  };
}

export default async function Home() {
  const { totalCases, totalAdmin, totalNews } = await getHomeStats();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: '노란봉투법 완벽 가이드',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: {
          '@type': 'Article',
          name: '개정 노동조합법(노란봉투법)',
          datePublished: '2026-03-10',
        },
        breadcrumb: { '@id': `${SITE_URL}/#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: '노란봉투법이란?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '2026년 3월 10일 시행 개정 노동조합법의 별칭으로, 사용자 범위를 확대하고 노동쟁의 범위를 넓힌 법률입니다. 근로계약 당사자가 아니더라도 근로조건을 실질적·구체적으로 지배·결정하는 자도 사용자로 보게 됩니다.',
            },
          },
          {
            '@type': 'Question',
            name: '원청도 사용자에 해당하나요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '원청이 하청 근로자의 채용·해고, 임금, 근로시간, 업무지시 등 근로조건을 실질적·구체적으로 지배·결정하는 경우 개정법상 사용자에 해당할 수 있습니다. 자가진단 체크리스트로 대략적인 판단이 가능합니다.',
            },
          },
          {
            '@type': 'Question',
            name: '하청이 교섭을 요구하면 반드시 응해야 하나요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '사용자성이 인정되는 범위 내에서는 교섭에 응할 의무가 있으며, 정당한 이유 없는 거부는 부당노동행위(형사처벌 대상)에 해당합니다.',
            },
          },
          {
            '@type': 'Question',
            name: '노란봉투법 시행일은 언제인가요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '2026년 3월 10일부터 시행됩니다. 시행 즉시 하청 노동조합이 원청에 교섭을 요구할 수 있습니다.',
            },
          },
          {
            '@type': 'Question',
            name: '사용자성은 전부 인정되나요 일부만 인정되나요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '일부 근로조건에 대해서만 사용자성이 인정될 수 있습니다. 원청은 실질적 지배력이 미치는 범위 내에서만 사용자로서의 의무를 부담합니다.',
            },
          },
          {
            '@type': 'Question',
            name: '교섭요구 사실 공고를 안 하면 어떻게 되나요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '하청노동조합이 노동위원회에 시정신청을 할 수 있고, 노동위원회가 공고를 명할 수 있습니다. 시정명령에도 불응하면 교섭 거부·해태의 부당노동행위로 처벌될 수 있습니다.',
            },
          },
          {
            '@type': 'Question',
            name: '교섭단위 분리는 어떻게 하나요?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '노동위원회에 교섭단위 분리 신청을 할 수 있습니다. 직무별, 상급단체별, 하청기업 특성별 등 다양한 형태로 분리가 가능하며, 노동위원회가 여러 요소를 종합 고려하여 결정합니다.',
            },
          },
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
      <HomeClient totalCases={totalCases} totalAdmin={totalAdmin} totalNews={totalNews} />
    </>
  );
}
