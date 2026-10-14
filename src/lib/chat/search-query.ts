export function buildSearchQuery(messages: Array<{ role: string; content: string }>): {
  searchQuery: string;
  lastUserMsg: { role: string; content: string } | undefined;
} {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const lastUserMsg = messages[lastUserIndex];
  let searchQuery = lastUserMsg?.content || '';

  if (lastUserMsg && messages.length > 1) {
    const isShortFollowup =
      lastUserMsg.content.length < 30 ||
      /^(그럼|그러면|그건|이건|왜|어떻게|네\?|뭐|아|그|이)\s/.test(lastUserMsg.content);
    if (isShortFollowup) {
      const prevUsers = messages
        .slice(0, lastUserIndex)
        .filter((m) => m.role === 'user')
        .slice(-1);
      if (prevUsers.length > 0) {
        const previousBudget = Math.max(0, 300 - lastUserMsg.content.length - 1);
        searchQuery = `${prevUsers[0].content.slice(-previousBudget)} ${lastUserMsg.content}`;
        if (previousBudget === 0) searchQuery = lastUserMsg.content;
      }
    }
  }
  return { searchQuery, lastUserMsg };
}
