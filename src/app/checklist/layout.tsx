import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '우리 회사가 노란봉투법상 사용자에 해당하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '원청·발주처가 하청 근로자에 대해 실질적 지휘·감독권을 행사하거나 근로조건을 실질적으로 결정하는 경우 사용자로 인정될 수 있습니다. 자가진단 체크리스트로 먼저 확인해 보세요.',
      },
    },
    {
      '@type': 'Question',
      name: '하청 노조가 원청에 교섭을 요구할 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '개정 노동조합법(노란봉투법)에 따라 원청이 실질적 사용자로 인정되면 하청 노조의 교섭 요구에 응해야 합니다. 교섭 의무 범위는 원청이 실질적으로 결정하는 근로조건 사항으로 한정됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '공공기관·지방자치단체도 노란봉투법 적용 대상인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '네, 공공기관·지방자치단체도 민간사업자와 동일하게 적용됩니다. 용역·위탁 계약을 통해 간접고용된 근로자가 있다면 사용자성 판단 대상이 됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '교섭 거부 시 부당노동행위로 처벌받나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '사용자로 인정된 원청이 정당한 이유 없이 교섭을 거부하면 부당노동행위(노동조합법 제81조)에 해당하여 형사처벌(2년 이하 징역 또는 2천만 원 이하 벌금) 대상이 됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '손해배상 청구가 제한되나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '노란봉투법은 노동쟁의 관련 손해배상 청구 요건을 강화하고 일부 쟁의행위에 대한 면책 범위를 확대했습니다. 다만 불법쟁의행위로 인한 손해배상은 여전히 가능합니다.',
      },
    },
  ],
};

export const metadata: Metadata = {
  title: '노란봉투법 자가진단 체크리스트 | 사용자성·교섭 의무 무료 진단',
  description: '노란봉투법 대응 첫걸음: 우리 회사도 교섭에 응해야 하나? 약식(체크박스)·심층(18항목) 2-트랙 자가진단. 원청 사용자성, 하도급·공공기관 교섭 의무 판단.',
  alternates: { canonical: `${SITE_URL}/checklist` },
  openGraph: {
    title: '노란봉투법 자가진단 체크리스트 | 사용자성·교섭 의무 무료 진단',
    description: '노란봉투법 대응 첫걸음: 우리 회사도 교섭에 응해야 하나? 약식(체크박스)·심층(18항목) 2-트랙 자가진단. 원청 사용자성, 하도급·공공기관 교섭 의무 판단.',
    url: `${SITE_URL}/checklist`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '노란봉투법 자가진단 체크리스트 | 사용자성·교섭 의무 무료 진단',
    description: '노란봉투법 대응 첫걸음: 우리 회사도 교섭에 응해야 하나? 약식(체크박스)·심층(18항목) 2-트랙 자가진단. 원청 사용자성, 하도급·공공기관 교섭 의무 판단.',
  },
};

export default function ChecklistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
