import { describe, expect, it } from 'vitest';
import { MAX_WON, wonInputError } from '@/lib/tool-kit';

// 금액 칸 확인 — /tools/min-wage·/tools/weekly-holiday-pay(261112 운영: 빈칸·0 이 0원으로 계산돼
// 「2,156,880원 적습니다」, 14자리 금액도 그대로 계산). 상한은 실수령액 계산기와 같은 10억원.
describe('wonInputError', () => {
  it('uses the same 10억원 bound as take-home-pay', () => {
    expect(MAX_WON).toBe(1_000_000_000);
  });

  it.each([
    ['2,156,880', null],
    ['1000000000', null],
    ['9860.5', null],
  ])('accepts %s', (raw, expected) => {
    expect(wonInputError('월급', raw, { required: true })).toBe(expected);
  });

  it.each(['', '0', '  ', '0,000'])('asks for a value when required and %j is blank or zero', (raw) => {
    expect(wonInputError('월급', raw, { required: true })).toBe('월급 금액을 넣어 주세요. 0원으로는 계산하지 않습니다.');
  });

  it('lets an optional blank or zero through', () => {
    expect(wonInputError('정기상여금', '')).toBeNull();
    expect(wonInputError('정기상여금', '0')).toBeNull();
  });

  it.each(['abc', '-100', '12abc', '1e9'])('rejects non-numeric or negative %j', (raw) => {
    expect(wonInputError('시급', raw)).toBe('시급 금액은 0 이상의 숫자로 넣어 주세요.');
  });

  it.each(['1000000001', '12345678901234'])('rejects %s above 10억원', (raw) => {
    expect(wonInputError('월급', raw, { required: true })).toBe('월급 금액을 확인해 주세요(원 단위, 10억원까지).');
  });
});
