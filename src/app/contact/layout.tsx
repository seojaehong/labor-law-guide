import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노란봉투법 전문가 상담 | 사용자성·교섭 대응·하도급 자문',
  description: '노란봉투법 대응 전문가 상담. 사용자성 판단, 원청 교섭 의무, 하도급·공공기관 교섭 전략, 부당노동행위 리스크 점검. 노무법인 위너스.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
