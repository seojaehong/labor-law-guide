import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노동위 판정 통계 | 사유별·판정결과별 부당해고 인용률·기각률',
  description: '노동위원회 판정례 57,000건 이상을 사유·판정결과별로 집계한 통계입니다. 부당해고·부당노동행위·임금체불 등 사유별 인용률과 기각률, 연도별 트렌드를 한눈에 확인할 수 있습니다.',
  keywords: [
    '노동위 통계', '판정 통계', '부당해고 인용률', '부당노동행위 통계',
    '노동위 인용률', '판정결과 통계', '판정례 통계', '사유별 판정',
    '노동위 기각률', '부당해고 통계'
  ],
  alternates: { canonical: `${SITE_URL}/stats` },
  openGraph: {
    title: '노동위 판정 통계 | 사유별 인용률·기각률 | 노란봉투법 가이드',
    description: '판정례 57,000건 이상 사유·판정결과별 통계 — 인용률·기각률·연도 트렌드.',
    url: `${SITE_URL}/stats`,
    type: 'website',
    locale: 'ko_KR',
    siteName: '노란봉투법 가이드',
  },
  robots: { index: true, follow: true },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
