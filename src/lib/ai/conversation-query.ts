type ConversationMessage = { role: string; content: string };
const HISTORY_HEADER = '이전 사용자 상황:\n';
const CURRENT_HEADER = '\n현재 질문:\n';
export const CONVERSATION_QUERY_OVERHEAD = HISTORY_HEADER.length + CURRENT_HEADER.length;

/** Only explicit leading topic-reset instructions end a thread. */
export function isExplicitContextReset(content: string): boolean {
  return /^(?:새(?:로운)?\s*질문|다른\s*질문|새(?:로운)?\s*주제|주제를?\s*(?:바꿀게요?|바꾸겠습니다|전환)|이전\s*(?:질문|상황|대화)(?:은|는|을|를)?\s*(?:잊고|무시하고)|new\s+(?:question|topic)|start\s+over)(?=\s|[:：.!?。]|$)/i.test(content.trimStart());
}

/** Provider history and stored-profile policy must use the same reset boundary. */
export function activeConversation<T extends ConversationMessage>(messages: T[]): {
  messages: T[]; resetsContext: boolean;
} {
  let boundary = -1;
  messages.forEach((message, index) => {
    if (message.role === 'user' && isExplicitContextReset(message.content)) boundary = index;
  });
  return { messages: boundary < 0 ? messages : messages.slice(boundary), resetsContext: boundary >= 0 };
}

function boundedText(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  const omission = '\n[중간 생략]\n';
  if (limit <= omission.length) return text.slice(0, limit);
  const available = limit - omission.length;
  const head = Math.ceil(available * 0.75);
  const tail = available - head;
  return text.slice(0, head) + omission + (tail > 0 ? text.slice(-tail) : '');
}

/** Bound only user history; preserve the initial facts and full current question. */
export function conversationQuery(messages: ConversationMessage[], historyBudget = 1200): string {
  const users = activeConversation(messages).messages.filter(message => message.role === 'user');
  const current = users.at(-1)?.content || '';
  const prior = users.slice(0, -1);
  if (prior.length === 0 || historyBudget <= 0) return current;

  // Keep the thread's original factual anchor plus the latest two user updates.
  // Label provenance and truncation instead of treating model output as facts.
  const indices = [...new Set([0, ...prior.map((_, index) => index).slice(-2)])];
  let remaining = Math.floor(Math.min(1200, historyBudget));
  const segments: string[] = [];
  for (const [position, index] of indices.entries()) {
    const label = `[사용자 ${index + 1}]\n`;
    const slots = indices.length - position;
    const allowance = slots === 1 ? remaining : position === 0
      ? Math.floor(remaining * 0.65) : Math.floor(remaining / slots);
    if (allowance <= label.length + 1) continue;
    const segment = label + boundedText(prior[index].content, allowance - label.length);
    segments.push(segment);
    remaining -= segment.length + 1;
  }
  const history = segments.join('\n');
  return history ? HISTORY_HEADER + history + CURRENT_HEADER + current : current;
}
