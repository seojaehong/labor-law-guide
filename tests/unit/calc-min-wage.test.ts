import { describe, expect, it } from 'vitest';
import { checkMinWage } from '@/lib/calc/min-wage';

// 최저임금 확인 — 받는 임금을 시간급으로 바꿔(시행령 §5①) 그해 최저임금과 비교한다.
// 월급 환산 시간 = (1주 소정근로시간 + 주휴 시간) × 365 ÷ 7 ÷ 12, 고시의 209시간처럼 반올림.
// 기대값은 손으로 센 것이다.

const MIN26 = 10_320;
const MIN27 = 10_700;

describe('최저임금 확인 — 단위 환산', () => {
  it('주 40시간 월급은 209시간 — 2,156,880원이면 2026년 기준 딱 맞다', () => {
    const r = checkMinWage({ unit: 'month', amount: 2_156_880, weeklyHours: 40, minHourly: MIN26 });
    expect(r.hours).toBe(209);
    expect(r.hourly).toBe(10_320);
    expect(r.meets).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it('1원 적으면 못 미친다 — 양쪽', () => {
    const r = checkMinWage({ unit: 'month', amount: 2_156_879, weeklyHours: 40, minHourly: MIN26 });
    expect(r.meets).toBe(false);
    expect(r.shortfall).toBe(1);
  });

  it('같은 월급도 2027년(10,700원) 기준으로는 79,420원 모자란다', () => {
    const r = checkMinWage({ unit: 'month', amount: 2_156_880, weeklyHours: 40, minHourly: MIN27 });
    expect(r.required).toBe(2_236_300); // 10,700 × 209
    expect(r.shortfall).toBe(79_420);
  });

  it('주 20시간 월급은 (20 + 4) × 365 ÷ 84 = 104.29 → 104시간', () => {
    expect(checkMinWage({ unit: 'month', amount: 1_073_280, weeklyHours: 20, minHourly: MIN26 }).hours).toBe(104);
  });

  it('주 15시간 미만이면 주휴 시간 없이 센다 — 14 × 365 ÷ 84 = 60.83 → 61시간', () => {
    expect(checkMinWage({ unit: 'month', amount: 700_000, weeklyHours: 14, minHourly: MIN26 }).hours).toBe(61);
  });

  it('일급은 1일 소정근로시간으로 나눈다', () => {
    const r = checkMinWage({ unit: 'day', amount: 80_000, dailyHours: 8, minHourly: MIN26 });
    expect(r.hourly).toBe(10_000);
    expect(r.meets).toBe(false);
    expect(r.shortfall).toBe(2_560); // (10,320 − 10,000) × 8
  });

  it('주급은 1주 소정근로시간 + 주휴 시간으로 나눈다 — 495,360 ÷ 48 = 10,320', () => {
    expect(checkMinWage({ unit: 'week', amount: 495_360, weeklyHours: 40, minHourly: MIN26 }).meets).toBe(true);
  });

  it('시급은 그대로', () => {
    expect(checkMinWage({ unit: 'hour', amount: 10_319, minHourly: MIN26 }).meets).toBe(false);
  });
});

describe('최저임금 확인 — 산입과 수습', () => {
  it('매월 주는 정기상여금·현금 복리후생비는 전액 더한다(2024년부터 부칙 제2조 100분의 0)', () => {
    const r = checkMinWage({ unit: 'month', amount: 2_000_000, monthlyBonus: 100_000, monthlyWelfareCash: 56_880, weeklyHours: 40, minHourly: MIN26 });
    expect(r.counted).toBe(2_156_880);
    expect(r.meets).toBe(true);
  });

  it('수습 90% — 1년 이상 계약 + 수습 3개월 이내 + 단순노무 아님일 때만', () => {
    const ok = { oneYearContract: true, withinThreeMonths: true, simpleLabor: false };
    expect(checkMinWage({ unit: 'hour', amount: 9_288, minHourly: MIN26, probation: ok }).applied).toBe(9_288);
    expect(checkMinWage({ unit: 'hour', amount: 9_288, minHourly: MIN26, probation: ok }).meets).toBe(true);
    expect(checkMinWage({ unit: 'hour', amount: 9_288, minHourly: MIN26, probation: { ...ok, simpleLabor: true } }).applied).toBe(MIN26);
    expect(checkMinWage({ unit: 'hour', amount: 9_288, minHourly: MIN26, probation: { ...ok, oneYearContract: false } }).applied).toBe(MIN26);
    expect(checkMinWage({ unit: 'hour', amount: 9_288, minHourly: MIN26, probation: { ...ok, withinThreeMonths: false } }).applied).toBe(MIN26);
  });

  it('잘못된 입력은 오류', () => {
    expect(() => checkMinWage({ unit: 'month', amount: 2_000_000, minHourly: MIN26 })).toThrow();
    expect(() => checkMinWage({ unit: 'day', amount: 80_000, minHourly: MIN26 })).toThrow();
    expect(() => checkMinWage({ unit: 'hour', amount: -1, minHourly: MIN26 })).toThrow();
  });
});
