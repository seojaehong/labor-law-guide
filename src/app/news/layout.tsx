import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노동조합법 최신 뉴스 | 노란봉투법 가이드',
  description: '노동조합법·노란봉투법 관련 최신 뉴스를 매일 업데이트합니다.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/news' },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
