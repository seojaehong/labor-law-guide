import { describe, expect, it } from 'vitest';
import { countInputError } from '@/app/tools/headcount/copy';
import { daysPerWeekError } from '@/app/tools/contract-check/formState';

// 261112 운영 실측 — 음수를 넣으면 빼기표만 지워져 조용히 다른 값이 됐다.
// /tools/headcount 인원 -100 → 99, /tools/contract-check 주 근무일수 -100 → 100. 고쳐 넣지 않고 알린다.
describe('headcount 인원 칸', () => {
  it.each(['1', '5', '99'])('accepts %s', (raw) => expect(countInputError(raw)).toBeNull());
  it('asks for a value when blank', () => expect(countInputError('')).toBe('인원을 넣어 주세요(1~99명).'));
  it.each(['-100', '0', '100', '2.5', 'abc'])('rejects %s instead of clamping', (raw) => {
    expect(countInputError(raw)).toBe('인원은 1명부터 99명까지 숫자로 넣어 주세요.');
  });
});

describe('contract-check 주 근무일수 칸', () => {
  it.each(['', '1', '5', '5.5', '7'])('accepts %j', (raw) => expect(daysPerWeekError(raw)).toBeNull());
  it.each(['-100', '-1', 'abc', '0', '8', '100'])('rejects %s instead of dropping the sign', (raw) => {
    expect(daysPerWeekError(raw)).toBe('주 근무일수는 1일부터 7일까지 숫자로 넣어 주세요. 이 값은 점검에 쓰지 않았습니다.');
  });
});
