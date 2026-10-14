import { createUrlScrubber } from '@/lib/chat/scrub-urls';
import { normalizeValidatedHref, type EvidenceId } from '@/lib/chat/citations';
import type { FaqRow } from '@/lib/chat/context/faq';

export function faqReferences(rows: FaqRow[]) {
  return rows.map(row => ({ id: row.id, category: row.unified_category || row.category || '',
    question: row.question, answer: row.answer, source: row.source || '' }));
}

/** Confirm provenance only; membership does not validate the legal conclusion. */
export function validateFaqCitations(text: string, ids: number[]): string {
  const allowed = new Set(ids.map(String));
  const evidence: EvidenceId[] = ids.map(id => ({ type: 'FAQ', id: String(id) }));
  let result = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label: string, href: string) => {
    const normalized = normalizeValidatedHref(href, evidence);
    return normalized === null ? label : normalized === href ? full : `[${label}](${normalized})`;
  });
  result = result.replace(/FAQ#(\d+)/g, (full, id: string) => allowed.has(id) ? full : '현재 근거에서 확인되지 않은 FAQ 인용');
  return result;
}

/** Keep unfinished links/citation tokens out of the stream until they can be checked. */
export function createFaqCitationGuard(ids: number[]) {
  const scrubber = createUrlScrubber();
  return {
    push: (chunk: string) => validateFaqCitations(scrubber.push(chunk), ids),
    flush: () => validateFaqCitations(scrubber.flush(), ids),
  };
}

export function providerCompletion(provider: string, data: string): boolean {
  if (provider !== 'anthropic') return data === '[DONE]';
  try { return JSON.parse(data).type === 'message_stop'; } catch { return false; }
}

export function requireProviderCompletion(complete: boolean): void {
  if (!complete) throw new Error('모델 응답이 완료되기 전에 전송이 중단되었습니다.');
}
