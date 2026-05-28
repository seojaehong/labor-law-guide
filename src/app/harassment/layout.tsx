import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '직장 내 괴롭힘 판례·판정례 검색 | 인정·기각 사례와 업무상 적정범위 판단기준',
  description: '직장 내 괴롭힘으로 인정된 사례와 기각된 사례를 비교 검색합니다. 근로기준법 제76조의2, 업무상 적정범위, 정신질환 산재 인정 요건과 신고 후 불이익 처우 금지(제76조의3) 판정례를 정리했습니다.',
  keywords: [
    '직장 내 괴롭힘', '직장내 괴롭힘 판례', '직장내 괴롭힘 판정례',
    '근로기준법 제76조의2', '업무상 적정범위', '괴롭힘 신고', '불이익 처우 금지',
    '괴롭힘 산재', '괴롭힘 인정 사례', '괴롭힘 기각 사례', '괴롭힘 정신질환'
  ],
  alternates: { canonical: `${SITE_URL}/harassment` },
  openGraph: {
    title: '직장 내 괴롭힘 판례·판정례 검색 | 노란봉투법 가이드',
    description: '인정·기각 사례 비교, 근기법 제76조의2·제76조의3 기준과 판정례 정리.',
    url: `${SITE_URL}/harassment`,
    type: 'website',
    locale: 'ko_KR',
    siteName: '노란봉투법 가이드',
  },
  robots: { index: true, follow: true },
};

export default function HarassmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
