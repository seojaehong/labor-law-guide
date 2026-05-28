import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노동위 판정례·법원 판례 검색 | 사용자성·부당해고·교섭 검색',
  description: '노동위원회 판정례와 법원 판례를 무료로 검색하세요. 원청 사용자성, 부당해고, 부당노동행위, 단체교섭, 산재 등 사유·판정결과 필터 + 키워드 검색으로 유사 사례를 찾아드립니다.',
  keywords: [
    '노동위 판정례', '판례 검색', '노동위 판례', '부당해고 판례', '사용자성 판례',
    '교섭 판례', '부당노동행위 판례', '단체교섭 판정례', '노란봉투법 판례',
    '하청 교섭 판례', '원청 사용자성 판정례'
  ],
  alternates: { canonical: `${SITE_URL}/search` },
  openGraph: {
    title: '노동위 판정례·법원 판례 검색 | 노란봉투법 가이드',
    description: '판정례·판례 무료 검색. 사용자성·부당해고·교섭 필터 + 키워드.',
    url: `${SITE_URL}/search`,
    type: 'website',
    locale: 'ko_KR',
    siteName: '노란봉투법 가이드',
  },
  robots: { index: true, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
