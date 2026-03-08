import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: '노란봉투법 자가진단 체크리스트 | 사용자성·교섭 의무 무료 진단',
  description: '노란봉투법 대응 첫걸음: 우리 회사도 교섭에 응해야 하나? 약식(체크박스)·심층(18항목) 2-트랙 자가진단. 원청 사용자성, 하도급·공공기관 교섭 의무 판단.',
  alternates: { canonical: `${SITE_URL}/checklist` },
};

export default function ChecklistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
