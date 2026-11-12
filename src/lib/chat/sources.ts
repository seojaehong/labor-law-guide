/**
 * /ai 「근거 자료 찾기」가 화면에 먼저 보여 주는 자료 한 건 (261112).
 *
 * 목록은 챗 경로가 이미 찾아 요약 프롬프트에 넣은 **그 행**으로만 만든다.
 * 검색을 한 번 더 돌리지 않는다 — 유료 호출(임베딩·재선택)을 늘리지 않고,
 * 화면의 목록과 요약이 인용하는 자료가 어긋나지 않게 하려는 것이다.
 */
import { citationHref } from './citations';
import type { FaqRow } from './context/faq';

export type SourceType = 'LAW' | 'FAQ' | 'CASE' | 'COURT' | 'INTERP' | 'BLOG';

export type SourceItem = {
  type: SourceType;
  /** 인용 id. FAQ·CASE·COURT·INTERP 는 evidence 와 같은 값, LAW 는 「법령명 조문」. */
  id: string;
  title: string;
  /** 사이트 안 상세 주소. 조문만 법제처 원문 주소다. */
  href: string;
  meta?: string;
  excerpt?: string;
};

const EXCERPT_MAX = 140;

export function excerpt(text: string | null | undefined): string | undefined {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX)}…` : t;
}

export function joinMeta(...parts: Array<string | null | undefined>): string | undefined {
  const s = parts.map(p => (p || '').trim()).filter(Boolean).join(' · ');
  return s || undefined;
}

/**
 * 법제처 원문 주소. 사이트의 다른 링크(duties-data·pay-check)와 같이 법령명의 공백을 뺀다.
 * 「제60조」·「제76조의2」 꼴이면 조문까지, 별표 등 그 밖의 표기는 법령까지만 잇는다.
 */
export function lawArticleHref(lawName: string, articleLabel: string): string {
  const base = `https://www.law.go.kr/법령/${lawName.replace(/\s+/g, '')}`;
  const label = articleLabel.trim();
  return /^제\d+조(의\d+)?$/.test(label) ? `${base}/${label}` : base;
}

export function faqSourceItems(rows: FaqRow[] | undefined): SourceItem[] {
  return (rows ?? []).map(row => ({
    type: 'FAQ' as const,
    id: String(row.id),
    title: row.question,
    href: citationHref({ type: 'FAQ', id: String(row.id) }),
    meta: joinMeta(row.unified_category || row.category),
    excerpt: excerpt(row.answer),
  }));
}
