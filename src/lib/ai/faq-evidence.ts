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

export class ProviderCompletionError extends Error {
  constructor(readonly code: 'output_limit' | 'content_filter' | 'refusal' | 'incomplete') {
    super({ output_limit: '답변 길이 한도에 도달해 일부 답변만 생성되었습니다. 질문을 나누어 다시 시도해주세요.',
      content_filter: '안전 필터로 답변 생성이 중단되었습니다. 질문을 조정해 다시 시도해주세요.',
      refusal: '모델이 요청에 대한 답변을 제공하지 않았습니다. 질문을 조정해 다시 시도해주세요.',
      incomplete: '모델 응답의 정상 완료를 확인할 수 없습니다. 다시 시도해주세요.' }[code]);
  }
}

function completionFailure(provider: string, reason: unknown): ProviderCompletionError | null {
  if (reason === 'length' || reason === 'max_tokens' || reason === 'model_context_window_exceeded') return new ProviderCompletionError('output_limit');
  if (reason === 'content_filter' || reason === 'SAFETY') return new ProviderCompletionError('content_filter');
  if (reason === 'refusal') return new ProviderCompletionError('refusal');
  return (provider === 'anthropic' ? ['end_turn', 'stop_sequence'] : ['stop']).includes(String(reason))
    ? null : new ProviderCompletionError('incomplete');
}

/** Terminal transport frames alone never establish successful generation. */
export function createProviderCompletionTracker(provider: string) {
  let terminal = false;
  let reasonSeen = false;
  let failure: ProviderCompletionError | null = null;
  return {
    observe(payload: string) {
      if (providerCompletion(provider, payload)) { terminal = true; return true; }
      try {
        const parsed = JSON.parse(payload);
        const reason = provider === 'anthropic' ? parsed.delta?.stop_reason ?? parsed.message?.stop_reason : parsed.choices?.[0]?.finish_reason;
        if (parsed.error) failure ??= new ProviderCompletionError('incomplete');
        if (parsed.choices?.[0]?.delta?.refusal) failure ??= new ProviderCompletionError('refusal');
        if (reason !== null && reason !== undefined) { reasonSeen = true; failure ??= completionFailure(provider, reason); }
      } catch { /* Malformed frames cannot prove completion. */ }
      return false;
    },
    requireComplete() {
      if (failure) throw failure;
      if (!terminal || !reasonSeen) throw new ProviderCompletionError('incomplete');
    },
  };
}

/** Provider JSON must include a normal generation finish reason. */
export function requireNonstreamCompletion(provider: string, data: { stop_reason?: unknown; error?: unknown; choices?: Array<{finish_reason?: unknown; message?: {refusal?: unknown}}> }): void {
  if (data.error) throw new ProviderCompletionError('incomplete');
  if (data.choices?.[0]?.message?.refusal) throw new ProviderCompletionError('refusal');
  const reason = provider === 'anthropic' ? data.stop_reason : data.choices?.[0]?.finish_reason;
  const failure = completionFailure(provider, reason);
  if (failure) throw failure;
}
