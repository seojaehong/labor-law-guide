import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '노동절(5/1)에 일하면 얼마나 더 받나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '5인 이상 사업장은 통상시급의 2.5배(휴일근로 1.0배 + 가산 1.5배). 단 월급제는 월급에 1.0배가 이미 포함되어 있어 가산분 1.5배만 추가 지급됩니다. 5인 미만 사업장은 가산수당(1.5배) 의무가 없어 통상임금 100%만 추가 지급합니다.',
      },
    },
    {
      '@type': 'Question',
      name: '5인 미만 사업장도 노동절 수당을 받나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '노동절(5/1)은 「노동절 제정에 관한 법률」에 따라 5인 미만 사업장에도 적용되는 유급휴일입니다. 다만 가산수당(1.5배·2배)은 근로기준법 제56조 사항이라 5인 미만 사업장은 의무가 없습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '시급에 주휴수당이 포함된 파트타이머는 어떻게 계산하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '시급이 주휴수당을 포함한 단가라면 가산수당 산정 기준은 "기본시급(주휴 제외)"입니다. 주 40시간 기준으로 시급 ÷ 1.2가 통상시급이 됩니다. 예: 시급 13,000원(주휴포함) → 통상시급 약 10,833원.',
      },
    },
    {
      '@type': 'Question',
      name: '일용직도 휴일근로 가산수당을 받나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '명칭과 관계없이 동일 사업장에서 지속적으로 근로(반복 호출)하는 일용직은 통상임금 산정 대상이 됩니다(행정해석 근기 68207-2508). 가산수당 계산은 "일급 ÷ 1일 근로시간"으로 산정한 통상시급이 기준이 됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '관공서 공휴일과 노동절은 다른가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '근거 법령이 다릅니다. 관공서 공휴일(빨간날)은 근로기준법 제55조·시행령 제30조 — 5인 이상 사업장만 유급휴일입니다. 노동절(5/1)은 「노동절 제정에 관한 법률」 — 5인 미만 사업장 포함 모든 사업장 유급휴일입니다.',
      },
    },
  ],
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: '도구', item: `${SITE_URL}/tools/holiday-pay` },
    { '@type': 'ListItem', position: 3, name: '공휴일 수당 계산기' },
  ],
};

export const metadata: Metadata = {
  title: '공휴일 수당 계산기 | 노동절·관공서 공휴일 | 노란봉투법 가이드',
  description:
    '노동절(5/1)·관공서 공휴일에 일하면 얼마 더 받나? 5인 이상/미만 × 월급제·일용직·시급제(파트) 6분기 정확 계산. 시급에 주휴수당 포함 케이스까지 자동 분리. 카톡 공유 지원.',
  keywords: ['공휴일 수당 계산기', '노동절 수당', '노동절 수당', '휴일근로 가산수당', '5인 미만', '시급 주휴수당'],
  alternates: { canonical: `${SITE_URL}/tools/holiday-pay` },
  openGraph: {
    title: '공휴일 수당 계산기 | 노동절·관공서 공휴일',
    description:
      '5인 이상/미만 × 월급제·일용직·시급제(파트) 6분기 정확 계산. 시급 주휴수당 포함도 자동 분리. 카톡 공유 지원.',
    url: `${SITE_URL}/tools/holiday-pay`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '공휴일 수당 계산기 | 노동절·관공서 공휴일',
    description:
      '5인 이상/미만 × 월급제·일용직·시급제(파트) 6분기 정확 계산. 시급 주휴수당 포함 케이스까지 자동 분리.',
  },
};

export default function HolidayPayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
