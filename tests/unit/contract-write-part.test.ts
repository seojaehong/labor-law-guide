// 근로계약서 작성 — 시급·일급 파트 임금 구성 회귀 표본.
// 표본 = 수원 파트 계약서 양식(시급 13,000 · 휴게 포함 체류시간 기준) 「_2026」 시트 a~e. 금액·근무형태만 옮겼다(실명 없음).
// 양식은 주 15시간 미만(c·d)에도 주휴·연차·휴일을 넣는다 — 엔진 기본값은 근로기준법 제18조 제3항대로 넣지 않고,
// 양식 재현은 includeUnder15 로만 한다.
import { describe, expect, it } from 'vitest';

import { designHourlyWage, type HourlyDesignInput } from '@/lib/contract-write/part';

const base = { hourlyWage: 13_000, includeUnder15: true } as const;
const A: HourlyDesignInput = { ...base, stayHours: 6, breakMinutes: 30, nightHours: 0, daysPerWeek: 5, holidayDaysPerYear: 16 };
const B: HourlyDesignInput = { ...base, stayHours: 5.5, breakMinutes: 40, nightHours: 0.5, daysPerWeek: 5, holidayDaysPerYear: 16 };
const C: HourlyDesignInput = { ...base, stayHours: 6, breakMinutes: 30, nightHours: 0, daysPerWeek: 2, holidayDaysPerYear: 6 };
const D: HourlyDesignInput = { ...base, stayHours: 5.5, breakMinutes: 30, nightHours: 0.5, daysPerWeek: 2, holidayDaysPerYear: 6 };
const E: HourlyDesignInput = { ...base, stayHours: 11.5, breakMinutes: 75, nightHours: 0.5, daysPerWeek: 2, holidayDaysPerYear: 6 };

const exact = (input: HourlyDesignInput) => Object.fromEntries(designHourlyWage(input).items.map((i) => [i.key, i.exact]));

describe('designHourlyWage — 양식 「_2026」 a~e 재현(includeUnder15)', () => {
  it('a 평일 11:00~17:00 주5: 일 78,000원', () => {
    const r = designHourlyWage(A);
    expect(r.total).toBe(78_000);
    expect(r.totalHours).toBeCloseTo(7.359465926825038, 10);
    expect(r.rate).toBeCloseTo(10_598.595166490586, 6);
    const x = exact(A);
    expect(x.base).toBeCloseTo(58_292.27, 2);
    expect(x.weeklyHoliday).toBeCloseTo(11_658.45, 2);
    expect(x.leave).toBeCloseTo(2_683.19, 2);
    expect(x.holiday).toBeCloseTo(5_366.08, 2);
    expect(x.overtime ?? 0).toBe(0);
    expect(x.night ?? 0).toBe(0);
  });

  it('b 평일 17:00~22:30 주5(휴게 40분, 야간 30분)', () => {
    const r = designHourlyWage(B);
    expect(r.total).toBe(71_500);
    expect(r.totalHours).toBeCloseTo(6.717409450846246, 10);
    const x = exact(B);
    expect(x.base).toBeCloseTo(51_445.92, 2);
    expect(x.weeklyHoliday).toBeCloseTo(10_289.18, 2);
    expect(x.night).toBeCloseTo((71_500 * 0.25) / 6.717409450846246, 6);
    expect(x.leave).toBeCloseTo(2_368.05, 2);
    expect(x.holiday).toBeCloseTo(4_735.84, 2);
  });

  it('c 주말 11:00~17:00 주2', () => {
    const x = exact(C);
    expect(x.base).toBeCloseTo(58_544.0, 2);
    expect(x.weeklyHoliday).toBeCloseTo(11_708.8, 2);
    expect(x.holiday).toBeCloseTo(5_052.43, 2);
    expect(designHourlyWage(C).totalHours).toBeCloseTo(7.3278220912086, 10);
  });

  it('d 주말 17:00~22:30 주2', () => {
    const x = exact(D);
    expect(x.base).toBeCloseTo(51_724.21, 2);
    expect(x.weeklyHoliday).toBeCloseTo(10_344.84, 2);
    expect(x.leave).toBeCloseTo(2_380.86, 2);
    expect(x.holiday).toBeCloseTo(4_463.87, 2);
  });

  it('e 주말 11:00~22:30 주2(실근무 10.25h → 연장 2.25h)', () => {
    const r = designHourlyWage(E);
    expect(r.total).toBe(149_500);
    expect(r.totalHours).toBeCloseTo(14.283650314485238, 10);
    const x = exact(E);
    expect(x.base).toBeCloseTo(83_732.1, 2);
    expect(x.weeklyHoliday).toBeCloseTo(16_746.42, 2);
    expect(x.overtime).toBeCloseTo(35_324.48, 2);
    expect(x.holiday).toBeCloseTo(7_226.19, 2);
  });

  it('원 단위 금액 합은 언제나 일 지급액이다(기본급이 잔액)', () => {
    for (const input of [A, B, C, D, E]) {
      const r = designHourlyWage(input);
      expect(r.items.reduce((s, i) => s + i.amount, 0)).toBe(r.total);
      expect(r.items.every((i) => Number.isInteger(i.amount))).toBe(true);
    }
  });
});

describe('designHourlyWage — 법 기준 기본값', () => {
  it('주 15시간 미만(c: 5.5h × 2일 = 11h)은 주휴·연차·휴일을 넣지 않는다(근로기준법 제18조 제3항)', () => {
    const r = designHourlyWage({ ...C, includeUnder15: false });
    expect(r.hours.weeklyHoliday).toBe(0);
    expect(r.hours.leave).toBe(0);
    expect(r.hours.holiday).toBe(0);
    expect(r.rate).toBeCloseTo(78_000 / 5.5, 6);
  });

  it('주 15시간 이상(e: 8h × 2일 = 16h)이면 옵션과 무관하게 넣는다', () => {
    expect(designHourlyWage({ ...E, includeUnder15: false }).hours.weeklyHoliday).toBeCloseTo(1.6, 10);
  });

  it('5명 미만이면 연장은 가산 없이 실시간, 야간·휴일·연차는 넣지 않는다(시행령 제7조 별표 1)', () => {
    const r = designHourlyWage({ ...E, fivePlus: false });
    expect(r.hours.overtime).toBeCloseTo(2.25, 10);
    expect(r.hours.night).toBe(0);
    expect(r.hours.holiday).toBe(0);
    expect(r.hours.leave).toBe(0);
    expect(r.hours.weeklyHoliday).toBeCloseTo(1.6, 10);
  });

  it('통상시급이 최저시급보다 낮으면 검사가 실패한다', () => {
    const r = designHourlyWage({ ...A, hourlyWage: 10_320, minimumWage: 10_320 });
    expect(r.checks.minimumWage.ok).toBe(false);
    expect(designHourlyWage({ ...A, minimumWage: 10_320 }).checks.minimumWage.ok).toBe(true);
  });

  it('흡수 항목·단위 선택은 월급제와 같다', () => {
    const r = designHourlyWage({ ...A, rounding: 'floor10', absorbInto: 'weeklyHoliday' });
    const by = Object.fromEntries(r.items.map((i) => [i.key, i.amount]));
    expect(by.base).toBe(58_290);
    expect(by.leave).toBe(2_680);
    expect(by.holiday).toBe(5_360);
    expect(by.weeklyHoliday).toBe(78_000 - 58_290 - 2_680 - 5_360);
  });
});
