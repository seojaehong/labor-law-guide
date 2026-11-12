import { publicMetadata } from '@/lib/public-metadata';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = publicMetadata({
  // 2026-09-12 — 메뉴에서 내리면서 색인도 끈다. 페이지와 주소는 그대로이고
  // 링크를 아는 사람은 계속 쓴다. 서버 렌더 본문이 300~800자뿐이라 크롤러 눈에는
  // 빈 페이지이고, 얇은 페이지가 많으면 진짜 콘텐츠의 크롤 배분이 줄어든다.
  // follow 는 남긴다. 되살리려면 index 를 true 로 되돌린다.
  robots: { index: false, follow: true },
  // 261112 — 「노란봉투법 AI 질의응답」에서 「근거 자료 찾기」로. 색인은 계속 끈다(검토 중).
  title: '노동법 근거 자료 찾기 | 일의 무늬',
  description: '질문을 적으면 사이트에 모아 둔 법령 조문·FAQ·노동위원회 판정례·법원 판례·행정해석·해설 글을 먼저 찾아 보여 줍니다. 자료 요약은 찾은 자료만 정리한 참고용입니다.',
  alternates: { canonical: `${SITE_URL}/ai` },
});

export default function AILayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
