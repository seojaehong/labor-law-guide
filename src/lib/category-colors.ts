// DESIGN.md §9 P3-4 / §6.4 배지 표. 토큰이 있는 카테고리만 옮긴다 —
// 라이트 파스텔이 다크에 그대로 남던 문제가 그만큼 해소된다.
// ★ 판례분석(보라)·뉴스브리핑(주황)은 레포에 그 계열 램프도 의미색 토큰도 없다.
//   grey로 뭉치면 종합·general까지 네 칩이 같은 회색이 되어 새 파손이 된다 → hex를 보존하고 US-016으로 넘긴다.
//   여기에 보라·주황 토큰을 지어내지 말 것(DESIGN.md에 값이 없다).
export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  '노동법': { bg: 'var(--color-info-bg)', text: 'var(--color-info-ink)' },
  '판례분석': { bg: '#f5f3ff', text: '#6d28d9' },
  '뉴스해설': { bg: 'var(--color-warn-bg)', text: 'var(--color-warn-ink)' },
  '실무가이드': { bg: 'var(--color-success-bg)', text: 'var(--color-success-ink)' },
  '뉴스브리핑': { bg: '#fff7ed', text: '#9a3412' },
  '종합': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
  'general': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
};

export function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['general'];
}
