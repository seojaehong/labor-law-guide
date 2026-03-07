import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노란봉투법 최신 뉴스 | 시행·대응·하도급·공공기관 동향',
  description: '노란봉투법 시행 관련 최신 뉴스 매일 업데이트. 원청 교섭 의무, 사용자성 판단, 하도급 대응, 공공기관 동향, 교섭단위 분리 소식.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/news' },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
