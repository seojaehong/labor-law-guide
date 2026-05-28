import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '징계 정당성 AI 자가진단 | 부당해고·징계위반 5가지 쟁점 즉시 확인',
  description: '해고·정직·감봉 같은 징계 처분의 정당성을 5가지 핵심 쟁점(징계사유·양정·절차·소명·서면통지)으로 즉시 자가진단합니다. 노동위 판정례·법원 판례 데이터베이스 기반 AI 분석. 무료.',
  keywords: [
    '징계 자가진단', '부당해고 자가진단', '해고 정당성 진단', '징계 양정',
    '징계위원회 절차', '소명기회 부여', '서면통지', '해고예고',
    '징계위반 진단', '부당해고 구제신청', '노동위 진정', '징계 처분 적법성'
  ],
  alternates: { canonical: `${SITE_URL}/sanction` },
  openGraph: {
    title: '징계 정당성 AI 자가진단 | 5가지 쟁점 즉시 확인',
    description: '해고·정직·감봉 같은 징계의 정당성을 5가지 쟁점으로 즉시 자가진단. 판정례 기반 AI 분석.',
    url: `${SITE_URL}/sanction`,
    type: 'website',
    locale: 'ko_KR',
    siteName: '노란봉투법 가이드',
  },
  robots: { index: true, follow: true },
};

export default function SanctionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
