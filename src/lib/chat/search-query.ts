import { activeConversation, conversationQuery, CONVERSATION_QUERY_OVERHEAD } from '@/lib/ai/conversation-query';

export function buildSearchQuery(messages: Array<{ role: string; content: string }>): {
  searchQuery: string;
  lastUserMsg: { role: string; content: string } | undefined;
  resetsContext: boolean;
} {
  const active = activeConversation(messages);
  const lastUserMsg = active.messages.filter(message => message.role === 'user').at(-1);
  let searchQuery = lastUserMsg?.content || '';
  if (lastUserMsg) {
    const isShortFollowup = lastUserMsg.content.length < 30 ||
      /^(그럼|그러면|그건|이건|왜|어떻게|네\?|뭐|아|그|이)\s/.test(lastUserMsg.content);
    if (isShortFollowup) {
      // Keep the existing 300-character search budget while reserving the
      // current question in full and preserving the thread's factual anchor.
      const budget = Math.max(0, 300 - lastUserMsg.content.length - CONVERSATION_QUERY_OVERHEAD);
      searchQuery = conversationQuery(active.messages, budget);
    }
  }
  return { searchQuery, lastUserMsg, resetsContext: active.resetsContext };
}
