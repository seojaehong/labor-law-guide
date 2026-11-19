import { unwrapSourceAnnotations } from '@/lib/legal-display-text';
import { decisionDate } from '@/lib/decision-date';
import { REASON_CATEGORY_LABELS } from './types';
import { createElement, type ReactNode } from 'react';

export function highlightText(text: string, query: string): ReactNode {
  if (!query || query.length < 2 || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? createElement('mark', { key: i, style: { backgroundColor: 'var(--color-brand-surface, #fef9c3)', color: 'inherit', borderRadius: '2px', padding: '0 1px' } }, part)
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
  return decisionDate(value)?.replace(/-/g,'.')??null;
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
  return unwrapSourceAnnotations(raw)
    .replace(/^#{1,4}\s+(.+)$/gm, '**$1**')
    .replace(/([^\n])(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/g, '$1\n$2')
    .replace(/([^\n])(□\s)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 행정해석 번호 표시·중복 판정용. DB 함수 admin_interp_doc_norm 과 같은 규칙(#218): 대시류 → '-', 공백 제거. */
export function displayDocNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/[－—–]/g, '-').replace(/\s+/g, '');
}

/** 행정해석 목록 중복 키 — 같은 번호를 다른 해에 다시 쓴 별개 회시는 따로 남긴다. */
export function adminDedupeKey(item: { id: string; doc_number?: string | null; decision_date?: string | null }): string {
  return `${displayDocNumber(item.doc_number) || item.id}|${item.decision_date ?? ''}`;
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
