import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DecisionCategoryNavigation from '@/components/DecisionCategoryNavigation';
import { REASON_LABELS, type ReasonCategory } from '@/lib/types';
import { categoryHref } from '@/lib/decisions-query';

describe('persistent decision category navigation', () => {
  const reasons = Object.keys(REASON_LABELS) as ReasonCategory[];
  it.each(reasons)('retains current %s and links to every other type', reason => {
    const html = renderToStaticMarkup(createElement(DecisionCategoryNavigation, { reason }));
    expect(html).toContain(`선택한 유형 <strong>${REASON_LABELS[reason]}</strong>`);
    expect(html).toContain('href="/decisions"');
    expect(html).toContain('선택 해제');
    expect(html).toContain('<summary');
    expect(html).not.toContain('<details open');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    for (const item of reasons) expect(html).toContain(`href="${categoryHref(item)}"`);
    expect(html).not.toContain('&amp;page=');
  });
});
