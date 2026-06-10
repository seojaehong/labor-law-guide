import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노무사를 위한 Claude × Codex 실전 — 교재 (300페이지+)',
  description: '이산노무법인 강의 교재 — 8장 + 부록 4부. Claude 가입부터 코워크 HWPX 자동화·사무소 운영까지 노무사 전 과정. 공인노무사 서재홍 저.',
  alternates: { canonical: `${SITE_URL}/lecture/ai-isan-2026/textbook` },
  robots: { index: false, follow: false },
};

export default function TextbookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
