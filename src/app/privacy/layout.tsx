import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 노란봉투법 가이드',
  description: '노란봉투법 가이드의 개인정보처리방침. 이메일 구독, 챗봇 사용, 자가진단 입력 데이터의 수집·이용·보관·파기 기준과 정보주체 권리를 안내합니다.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
