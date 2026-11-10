// 261110 — 글에 보이는 필자명은 하나다. 재홍님 지시(텔레그램).
//
// `blog_articles.author` 에는 「뉴스룸」·「데일리 브리핑」처럼 데스크명이 들어 있다.
// 그 값은 관리 화면 필터와 blog-clusters 의 author_matrix(어느 데스크가 어느 주제를
// 덮었나)가 읽으므로 지우지 않는다. 읽는 사람에게 보이는 자리에서만 실명으로 바꾼다.
//
// 보이는 자리 네 곳 — 상세 머리말 · metadata.authors · JSON-LD · RSS.
export const BYLINE = '공인노무사 서재홍';

/** 화면·메타·RSS 에 쓰는 필자명. DB 값이 무엇이든 하나로 모은다. */
export function byline(_dbAuthor?: string | null): string {
  return BYLINE;
}
