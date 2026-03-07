import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노란봉투법 판례·행정해석 검색 | 사용자성·교섭·부당노동행위 판례 DB',
  description: '노란봉투법 관련 판례 2,900+건, 행정해석 890+건 무료 검색. 원청 사용자성, 하도급 교섭, 손해배상, 부당노동행위 판례. 공공기관·제조업·서비스업 판례 포함.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/database' },
};

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
