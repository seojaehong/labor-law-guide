import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  // 2026-09-12 — 메뉴에서 내리면서 색인도 끈다. 페이지와 주소는 그대로이고
  // 링크를 아는 사람은 계속 쓴다. 서버 렌더 본문이 300~800자뿐이라 크롤러 눈에는
  // 빈 페이지이고, 얇은 페이지가 많으면 진짜 콘텐츠의 크롤 배분이 줄어든다.
  // follow 는 남긴다. 되살리려면 index 를 true 로 되돌린다.
  robots: { index: false, follow: true },
  title: '노란봉투법 AI 상담 | 사용자성·교섭·대응 무료 질의응답',
  description: '노란봉투법 뜻, 대응 방법, 사용자성 판단, 교섭절차를 AI에게 즉시 질문. 하도급·공공기관·손해배상 관련 FAQ·용어사전 포함.',
  alternates: { canonical: `${SITE_URL}/ai` },
};

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
