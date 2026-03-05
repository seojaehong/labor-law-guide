import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI 상담 | 노란봉투법 가이드',
  description: '개정 노동조합법에 대한 AI 상담, FAQ, 용어사전. 사용자성 판단, 교섭절차 등 즉시 답변.',
};

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
