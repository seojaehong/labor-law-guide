import { describe, it, expect } from 'vitest';
import { splitArticles } from '@/lib/laws/standard-check';

describe('같은 번호 조문 2개', () => {
  it('제목이 다르면 둘 다 남는다', () => {
    const text = [
      '제54조(휴게) 사용자는 휴게시간을 준다.',
      '제55조(예방교육) 매년 교육을 실시한다.',
      '제55조(예방·대응조직) 조직을 둔다.',
      '제56조(기타) 그 밖의 사항은 따른다.',
    ].join('\n');
    const out = splitArticles(text);
    const n55 = out.filter((a) => a.no === '제55조');
    expect(out.length).toBe(4);
    expect(n55.length).toBe(2);
    expect(n55.map((a) => a.title)).toEqual(['예방교육', '예방·대응조직']);
  });
});
