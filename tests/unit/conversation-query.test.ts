import { describe, expect, it } from 'vitest';
import { activeConversation, conversationQuery, isExplicitContextReset } from '@/lib/ai/conversation-query';
import { buildSearchQuery } from '@/lib/chat/search-query';
const user = (content: string) => ({ role: 'user', content });

describe('conversation retrieval context boundaries', () => {
  it('discards prior misconduct facts for an explicit new question', () => {
    const current = '새 질문: 회사가 퇴직금을 지급하지 않았습니다.';
    const result = conversationQuery([user('영업비밀 기밀유출로 해고됐습니다.'), user('징계 수위가 과도한가요?'), user(current)]);
    expect(result).toBe(current);
    expect(result).not.toContain('기밀유출');
  });

  it('retains original facts across more than two short follow-ups', () => {
    const result = conversationQuery([user('영업비밀 기밀유출로 해고됐고 서면 통지도 없었습니다.'),
      user('그럼 절차는요?'), user('소명 기회는요?'), user('그 경우도 비교해줘'), user('비슷한 사례도요')]);
    expect(result).toContain('기밀유출');
    expect(result).toContain('서면 통지도 없었습니다');
    expect(result).toContain('현재 질문:\n비슷한 사례도요');
  });

  it('uses the latest reset as the provenance boundary on later follow-ups', () => {
    const result = conversationQuery([user('공금을 횡령해 해고됐습니다.'),
      user('다른 질문: 계약기간이 만료됐지만 갱신을 반복했습니다.'), user('유사 사례는요?')]);
    expect(result).not.toContain('횡령');
    expect(result).toContain('계약기간');
    expect(result).toContain('유사 사례는요?');
  });

  it('bounds prior text and preserves the full current question plus trusted-user provenance', () => {
    const current = '현재 질문 '.repeat(400) + '마지막 현재 사실';
    const result = conversationQuery([user('최초 사실 ' + '가'.repeat(2000) + ' 최초 끝 사실'),
      {role: 'assistant', content: '모델이 만든 잘못된 사실'}, user('직전 '.repeat(600)), user(current)]);
    expect(result).toContain('최초 사실');
    expect(result).toContain('최초 끝 사실');
    expect(result).not.toContain('모델이 만든');
    expect(result.endsWith(current)).toBe(true);
    const prior = result.split('현재 질문:\n')[0];
    expect(prior.length).toBeLessThanOrEqual(1220);
    expect(prior).toContain('사용자 1');
  });
  it('applies the same reset to chat retrieval and exposes a stored-profile reset flag', () => {
    const current = '새 질문: 퇴직금을 못 받았습니다.';
    const messages = [user('기밀유출로 해고됐습니다.'), {role: 'assistant', content: '기밀유출 설명'}, user(current)];
    const built = buildSearchQuery(messages);
    expect(built.searchQuery).toBe(current);
    expect(built.resetsContext).toBe(true);
    expect(activeConversation(messages).messages).toEqual([user(current)]);
    const later = buildSearchQuery([...messages, user('비슷한 사례도요')]);
    expect(later.searchQuery).not.toContain('기밀유출');
    expect(later.searchQuery).toContain('퇴직금');
    expect(later.resetsContext).toBe(true);
  });

  it('keeps the initial chat facts through repeated short follow-ups within its 300-character budget', () => {
    const built = buildSearchQuery([user('기밀유출로 해고됐고 서면 통지도 없었습니다.'),
      user('절차는요?'), user('그럼 소명은요?'), user('그때도 부당한가요?'), user('비슷한 사례도요')]);
    expect(built.searchQuery).toContain('기밀유출');
    expect(built.searchQuery).toContain('서면 통지');
    expect(built.searchQuery.endsWith('비슷한 사례도요')).toBe(true);
    expect(built.searchQuery.length).toBeLessThanOrEqual(300);
    expect(built.resetsContext).toBe(false);
  });

  it('does not reset merely because a user quotes or discusses the phrase', () => {
    expect(isExplicitContextReset('회사가 "새 질문"이라고 말했습니다.')).toBe(false);
    expect(isExplicitContextReset('새 질문이라는 표현이 무슨 뜻인가요?')).toBe(false);
    expect(isExplicitContextReset('새로운 질문: 임금체불')).toBe(true);
  });
  it.each([0, 1, 12, 18, 20, 30, 100, 1200])('enforces even small historical budgets %i', budget => {
    const current = '현재 질문';
    const result = conversationQuery([user('이전 사실'.repeat(1000)), user(current)], budget);
    expect(result.endsWith(current)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(current.length + budget + 22);
  });
});
