export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  '노동법': { bg: '#e8f3ff', text: '#1b64da' },
  '판례분석': { bg: '#f5f3ff', text: '#6d28d9' },
  '뉴스해설': { bg: '#fef3c7', text: '#92400e' },
  '실무가이드': { bg: '#ecfdf5', text: '#065f46' },
  '뉴스브리핑': { bg: '#fff7ed', text: '#9a3412' },
  '종합': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
  'general': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
};

export function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['general'];
}
