import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노란봉투법 해석지침 | 뜻·내용·사용자 범위 확대·하도급·공공기관 해설',
  description: '노란봉투법 뜻과 핵심 내용 정리. 사용자 범위 확대, 노동쟁의 확대, 손해배상 제한 조문별 해설. 공공기관·하도급·원하청 실무 적용 가이드.',
  alternates: { canonical: `${SITE_URL}/guide` },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
