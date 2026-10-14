/** Bound historical context only: the current user question is always retained in full. */
export function conversationQuery(messages: Array<{ role: string; content: string }>): string {
  const users = messages.filter(m => m.role === 'user');
  const current = users.at(-1)?.content || '';
  const prior = users.slice(-3, -1).map(m => m.content).join('\n').slice(-1200);
  return prior ? `이전 사용자 상황:\n${prior}\n현재 질문:\n${current}` : current;
}
