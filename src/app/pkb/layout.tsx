import type { Metadata } from 'next';

/**
 * 메뉴에서 내리고 색인도 끈다 (2026-09-12).
 *
 * 페이지는 그대로 살아 있고 주소도 안 바뀐다 — 링크를 아는 사람은 계속 쓴다.
 * 다만 검색에 내보내지 않는다. 이 화면들은 서버가 그려 보내는 본문이 300~800자뿐이라
 * 크롤러 눈에는 빈 페이지이고, 얇은 페이지가 많으면 진짜 콘텐츠의 크롤 배분이 줄어든다.
 * follow 는 남겨 둔다 — 이 페이지에서 나가는 링크는 계속 따라가라는 뜻이다.
 *
 * 되살리려면 이 파일을 지우면 된다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
