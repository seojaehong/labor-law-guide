import { describe, expect, it } from 'vitest';
import { estimateBlockers, validate, type Input } from '@/app/exit/exit-calc';

// /exit — 월 급여 0·-100·abc 를 넣으면 「확인용 추정」 카드가 말없이 사라졌다(261112 운영 실측). 까닭을 한 줄로 알린다.
const base: Input = { hireDate: '2023-01-01', lastDay: '2025-12-31', monthlyWage: 3_000_000, weeklyHours: 40 };
const raw = { wage: '3000000', hours: '40', leave: '' };

describe('estimateBlockers', () => {
  it('says nothing when the estimate is shown', () => {
    expect(estimateBlockers(validate(base), raw)).toEqual([]);
  });

  it.each([
    ['0', 0],
    ['-100', -100],
    ['abc', NaN],
  ])('explains why the 퇴직금 card is hidden for wage %s', (text, wage) => {
    const lines = estimateBlockers(validate({ ...base, monthlyWage: wage }), { ...raw, wage: text });
    expect(lines).toEqual(['월 급여는 0보다 큰 숫자로 넣어 주세요(예: 2,500,000). 맞게 넣으면 퇴직금 추정이 나옵니다.']);
  });

  it('stays quiet on the untouched blank wage (first screen)', () => {
    expect(estimateBlockers(validate({ ...base, monthlyWage: NaN }), { ...raw, wage: '' })).toEqual([]);
  });

  it('also explains hours and leave days that block the card', () => {
    const lines = estimateBlockers(validate({ ...base, weeklyHours: 200, unusedLeaveDays: -1 }), { ...raw, hours: '200', leave: '-1' });
    expect(lines).toEqual([
      '주 소정근로시간은 0보다 크고 168 이하인 숫자로 넣어 주세요.',
      '남은 연차 일수는 0부터 400까지 숫자로 넣어 주세요.',
    ]);
  });
});
