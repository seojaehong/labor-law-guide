import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노란봉투법 전문가 상담 | 사용자성·교섭 대응·하도급 자문',
  description: '노란봉투법 대응 전문가 상담. 사용자성 판단, 원청 교섭 의무, 하도급·공공기관 교섭 전략, 부당노동행위 리스크 점검. 노무법인 위너스.',
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: '노란봉투법 전문가 상담 | 사용자성·교섭 대응·하도급 자문',
    description: '노란봉투법 대응 전문가 상담. 사용자성 판단, 원청 교섭 의무, 하도급·공공기관 교섭 전략, 부당노동행위 리스크 점검. 노무법인 위너스.',
    url: `${SITE_URL}/contact`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '노란봉투법 전문가 상담 | 사용자성·교섭 대응·하도급 자문',
    description: '노란봉투법 대응 전문가 상담. 사용자성 판단, 원청 교섭 의무, 하도급·공공기관 교섭 전략, 부당노동행위 리스크 점검. 노무법인 위너스.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
