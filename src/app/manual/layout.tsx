import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '교섭절차 가이드 | 노란봉투법 가이드',
  description: '원·하청 교섭절차 6단계: 교섭요구, 공고, 참여, 확정, 대표결정, 단체교섭. 교섭단위 분리, 준비 체크리스트.',
};

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
