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
  // 2026-09-12 — 메뉴에서 내리면서 색인도 끈다. 페이지와 주소는 그대로이고
  // 링크를 아는 사람은 계속 쓴다. 서버 렌더 본문이 300~800자뿐이라 크롤러 눈에는
  // 빈 페이지이고, 얇은 페이지가 많으면 진짜 콘텐츠의 크롤 배분이 줄어든다.
  // follow 는 남긴다. 되살리려면 index 를 true 로 되돌린다.
  robots: { index: false, follow: true },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
