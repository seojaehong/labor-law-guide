import { REASON_CATEGORY_LABELS } from './types';

export function highlightText(text: string, query: string) {
  if (!query || query.length < 2 || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? { __highlight: true, key: i, text: part }
      : part
  );
}

export function scoreResult(item: { decision_date?: string | null; summary?: string | null; holding_points?: string | null; title?: string | null }) {
  const summaryLength = item.summary?.trim().length || 0;
  const holdingLength = item.holding_points?.trim().length || 0;

  return (
    (item.decision_date ? 100 : 0) +
    Math.min(summaryLength, 600) +
    Math.min(holdingLength, 600) +
    (item.title?.trim() ? 20 : 0)
  );
}

export function formatDecisionDate(value?: string | null) {
  if (!value) return null;
  const compact = value.replace(/[^\d]/g, '');
  if (compact.length === 8) {
    const year = compact.slice(0, 4);
    const month = compact.slice(4, 6);
    const day = compact.slice(6, 8);
    if (year === '0001') return null;
    return `${year}.${month}.${day}`;
  }

  const sliced = value.slice(0, 10).replace(/-/g, '.');
  return sliced || null;
}

export function translateReasonCategory(code: string) {
  return REASON_CATEGORY_LABELS[code] || code;
}

export function getPreferredSummary(item: {
  summary?: string | null;
  summary_short?: string | null;
  holding_summary?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_summary || item.summary || item.summary_short || item.key_issue || '';
}

export function getPreferredDetail(item: {
  holding_points?: string | null;
  key_issue?: string | null;
}) {
  return item.holding_points || item.key_issue || '';
}

export function normalizeSnippetMarkdown(raw: string): string {
  return raw
    .replace(/^#{1,4}\s+(.+)$/gm, '**$1**')
    .replace(/([^\n])([가-힣]\.\s)/g, '$1\n\n$2')
    .replace(/([^\n])(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '$1\n$2')
    .replace(/([^\n])(□\s)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+/gm, '')
    .trim();
}

export function dedupeResults<T extends { id: string; summary?: string | null; holding_points?: string | null; decision_date?: string | null; title?: string | null }>(
  items: T[],
  getKey: (item: T) => string,
) {
  const deduped: T[] = [];
  const indexByKey = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item).trim();
    if (!key) {
      deduped.push(item);
      return;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push(item);
      return;
    }

    if (scoreResult(item) > scoreResult(deduped[existingIndex])) {
      deduped[existingIndex] = item;
    }
  });

  return deduped;
}
