import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '판례·행정해석 검색 | 노란봉투법 — 노동조합법 판례 DB',
  description: '노동조합법 관련 판례 2,900+건, 행정해석 890+건, 최신 뉴스를 검색하세요. 사용자성, 단체교섭, 부당노동행위 판례를 한곳에서.',
  alternates: { canonical: 'https://yellow-envelope-law.vercel.app/database' },
};

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
