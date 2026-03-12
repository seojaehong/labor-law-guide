import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노란봉투법 핵심판례 6선 | 사용자성·파견·하도급·공공기관 판례 정리',
  description: '노란봉투법 시행의 근거가 된 핵심 판례 6건 쟁점별 정리. 현대중공업·현대자동차·대한통운·현대제철·한화오션·백화점 판결. 사용자성·파견·도급·경제적 종속성 판시 요약.',
  alternates: { canonical: `${SITE_URL}/cases` },
  openGraph: {
    title: '노란봉투법 핵심판례 6선',
    description: '사용자성, 파견·도급, 원청 지배력 판단에 중요한 판례 6건을 쟁점별로 정리',
    type: 'article',
    url: `${SITE_URL}/cases`,
  },
  twitter: {
    card: 'summary_large_image',
    title: '노란봉투법 핵심판례 6선',
    description: '사용자성·파견·하도급·공공기관 판례를 쟁점별로 정리',
  },
};

export default function CasesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
