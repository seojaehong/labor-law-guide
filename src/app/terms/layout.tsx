import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '이용약관 | 노란봉투법 가이드',
  description: '노란봉투법 가이드 서비스 이용약관. 본 사이트는 법률 자문이 아닌 정보 제공 목적이며, 이용자의 권리·의무와 책임 한도, 분쟁 처리 기준을 안내합니다.',
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
