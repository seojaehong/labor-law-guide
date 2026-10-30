// 구독 폼을 어디에 뒀는지 — **목록을 한 곳에만 둔다.**
//
// 🔴 2026-10-30. 컴포넌트 타입과 API 허용목록에 같은 목록이 따로 적혀 있었고 어긋났다.
//   컴포넌트는 `decision-footer` 를 받는데 API 는 안 받아서, 판례·행정해석 상세
//   (src/app/decisions/[id]/page.tsx)의 구독 폼이 **400 「잘못된 source 값입니다」로
//   전부 거절되고 있었다.** `subscribers` 에 `source='decision-footer'` 가 0건인 게 그 증거다.
//   타입은 컴파일 때만 보고 허용목록은 런타임에 보므로, 둘이 갈리면 **빌드도 시험도 통과한다.**
//   그래서 목록을 여기 한 벌만 두고 양쪽이 이걸 읽는다.
//
// 값을 더할 때는 여기만 고친다. DB `subscribers.source` 는 TEXT 이고 제약이 없으므로
// 마이그레이션은 필요 없다 — 다만 집계를 바꿀 일이 생기니 새 값은 뜻이 겹치지 않게 짓는다.
export const SUBSCRIBE_SOURCES = [
  'home-bottom',      // 홈 하단
  'article-footer',   // 블로그 글 하단
  'decision-footer',  // 판례·행정해석 상세 하단
  'search-results',   // 검색 결과
  'sidebar',
  'contact',
] as const;

export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export function isSubscribeSource(v: unknown): v is SubscribeSource {
  return typeof v === 'string' && (SUBSCRIBE_SOURCES as readonly string[]).includes(v);
}
