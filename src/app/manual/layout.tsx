import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노란봉투법 교섭절차 매뉴얼 | 원청 교섭 의무·교섭단위 분리·대응 방법',
  description: '노란봉투법 시행 후 원·하청 교섭절차 6단계 완벽 가이드. 교섭요구→공고→참여→확정→대표결정→단체교섭. 교섭단위 분리, 하도급·공공기관 교섭 대응 체크리스트.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/manual' },
};

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
