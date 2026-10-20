export class IncompleteGenerationError extends Error {
  constructor(readonly kind: 'limit' | 'filtered' | 'incomplete') {
    super(kind === 'limit'
      ? '출력 길이 제한으로 답변이 중단되었습니다. 표시된 내용은 미완료 답변입니다.'
      : kind === 'filtered'
        ? '제공자의 콘텐츠 제한으로 답변이 완료되지 않았습니다.'
        : '모델의 정상 종료를 확인하지 못했습니다. 표시된 내용은 미완료 답변입니다.');
    this.name = 'IncompleteGenerationError';
  }
}

/** Provider termination metadata is required; prose length never proves completion. */
export function requireGenerationFinish(provider: 'vertex' | 'anthropic', reasons: unknown[], terminal = true): void {
  const present = reasons.filter(reason => reason !== undefined && reason !== null);
  const normal = provider === 'vertex' ? ['STOP'] : ['end_turn', 'stop_sequence'];
  for (const reason of present) {
    if (reason === 'MAX_TOKENS' || reason === 'max_tokens' || reason === 'model_context_window_exceeded') throw new IncompleteGenerationError('limit');
    if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MODEL_ARMOR', 'IMAGE_SAFETY', 'refusal'].includes(String(reason))) {
      throw new IncompleteGenerationError('filtered');
    }
    if (!normal.includes(String(reason))) throw new IncompleteGenerationError('incomplete');
  }
  if (!terminal || present.length === 0) throw new IncompleteGenerationError('incomplete');
}
