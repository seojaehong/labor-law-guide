import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '노란봉투법 AI 상담 | 사용자성·교섭·대응 무료 질의응답',
  description: '노란봉투법 뜻, 대응 방법, 사용자성 판단, 교섭절차를 AI에게 즉시 질문. 하도급·공공기관·손해배상 관련 FAQ·용어사전 포함.',
  alternates: { canonical: 'https://yellow-envelope.vercel.app/ai' },
};

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
