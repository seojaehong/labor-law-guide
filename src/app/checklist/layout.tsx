import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '자가진단 체크리스트 | 노란봉투법 — 교섭 의무·사용자성 진단',
  description: '하청 교섭 요구 시 원청의 교섭 의무 가능성과 사용자성을 자가진단하세요. 개정 노동조합법 기반.',
  alternates: { canonical: 'https://yellow-envelope-law.vercel.app/checklist' },
};

export default function ChecklistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
