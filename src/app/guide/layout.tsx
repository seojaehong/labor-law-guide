import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '해석지침 | 노란봉투법 가이드',
  description: '개정 노동조합법 사용자 범위 확대, 노동쟁의 확대 해석지침. 조문 해설, 판례, 자가진단 체크리스트.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/guide' },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
