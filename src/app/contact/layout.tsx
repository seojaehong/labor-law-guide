import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전문가 상담 문의 | 노란봉투법 가이드',
  description: '사용자성 판단, 교섭 대응, 노동쟁의 등 전문가 상담. 내산노무법인.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
