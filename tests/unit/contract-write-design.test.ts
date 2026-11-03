// 근로계약서 작성 — 임금 구성 설계(월급 정직원) 회귀 표본.
// 정본 공식 = _e-contract/요구_U02_포괄설계_역산_계약서자동작성_261026.md, 표본 = 수원(U02)·의정부 주4(261103 교정).
import { describe, expect, it } from 'vitest';

import { designMonthlyWage, type DesignInput } from '@/lib/contract-write/design';

const SUWON: DesignInput = {
  monthlyTotal: 3_200_000,
  daysPerWeek: 5,
  dailyWorkHours: 10,
  holidayDaysPerYear: 18.75,
  overrides: { overtimeHours: 65.2, holidayHours: 25, leaveHours: 10 },
};

const UIJEONGBU: DesignInput = {
  monthlyTotal: 2_600_000,
  daysPerWeek: 4,
  dailyWorkHours: 12 - 155 / 60,
  holidayDaysPerYear: 22,
};

const amounts = (input: DesignInput) => Object.fromEntries(designMonthlyWage(input).items.map((i) => [i.key, i.amount]));

describe('designMonthlyWage — 기본값(원 단위 반올림, 기본급이 잔액 흡수)', () => {
  it('수원 320만 ÷ 309.2H 는 계약서 금액과 1원까지 같다', () => {
    const r = designMonthlyWage(SUWON);
    expect(r.totalHours).toBeCloseTo(309.2, 6);
    expect(amounts(SUWON)).toEqual({ base: 2_163_001, overtime: 674_774, holiday: 258_732, leave: 103_493 });
  });

  it('의정부 주4 260만 ÷ 231.936H 는 교정 표본과 같다', () => {
    const r = designMonthlyWage(UIJEONGBU);
    expect(r.hours.base).toBeCloseTo(166.848, 6);
    expect(r.hours.overtime).toBeCloseTo(36.9325, 6);
    expect(r.hours.leave).toBeCloseTo(6.4, 6);
    expect(r.hours.holiday).toBeCloseTo(21.7556, 4);
    expect(r.displayRate).toBe(11_209);
    expect(amounts(UIJEONGBU)).toEqual({ base: 1_870_364, overtime: 414_013, holiday: 243_879, leave: 71_744 });
  });

  it('항목 합은 언제나 월 총액이다', () => {
    for (const input of [SUWON, UIJEONGBU]) {
      expect(designMonthlyWage(input).items.reduce((s, i) => s + i.amount, 0)).toBe(input.monthlyTotal);
    }
  });

  it('주 40시간이면 기본 시간은 209, 그 밖은 (주소정+주휴)×4.345', () => {
    expect(designMonthlyWage({ ...SUWON, overrides: undefined }).hours.base).toBe(209);
    expect(designMonthlyWage({ monthlyTotal: 2_000_000, daysPerWeek: 5, dailyWorkHours: 6, holidayDaysPerYear: 0 }).hours.base).toBeCloseTo(36 * 4.345, 6);
  });

  it('주 15시간 미만이면 주휴 시간을 넣지 않는다', () => {
    expect(designMonthlyWage({ monthlyTotal: 600_000, daysPerWeek: 2, dailyWorkHours: 7, holidayDaysPerYear: 0 }).hours.base).toBeCloseTo(14 * 4.345, 6);
  });

  it('공식 시간: 주5·10h·18.75일이면 연장 65.175h·휴일 25h·연차 8h', () => {
    const r = designMonthlyWage({ ...SUWON, overrides: undefined });
    expect(r.hours.overtime).toBeCloseTo(65.175, 6);
    expect(r.hours.holiday).toBeCloseTo(25, 6);
    expect(r.hours.leave).toBeCloseTo(8, 6);
  });
});

describe('designMonthlyWage — 단위·흡수 항목 선택(재홍님 261103)', () => {
  it('10원 절사: 흡수하지 않는 항목은 10원 아래를 버리고 기본급이 나머지를 받는다', () => {
    const a = amounts({ ...UIJEONGBU, rounding: 'floor10' });
    expect(a).toEqual({ base: 1_870_380, overtime: 414_010, holiday: 243_870, leave: 71_740 });
  });

  it('100원 절사', () => {
    const a = amounts({ ...UIJEONGBU, rounding: 'floor100' });
    expect(a).toEqual({ base: 1_870_500, overtime: 414_000, holiday: 243_800, leave: 71_700 });
  });

  it('흡수 항목을 공휴일로 바꾸면 기본급은 계산값, 공휴일이 잔액', () => {
    const a = amounts({ ...UIJEONGBU, absorbInto: 'holiday' });
    expect(a.base).toBe(1_870_364);
    expect(a.overtime).toBe(414_013);
    expect(a.leave).toBe(71_744);
    expect(a.holiday).toBe(2_600_000 - 1_870_364 - 414_013 - 71_744);
  });

  it('흡수 항목을 연장근로수당으로 바꿀 수 있다', () => {
    const a = amounts({ ...SUWON, absorbInto: 'overtime', rounding: 'floor100' });
    expect(a.base + a.overtime + a.holiday + a.leave).toBe(3_200_000);
    expect(a.base % 100).toBe(0);
    expect(a.holiday % 100).toBe(0);
  });

  it('시간이 0인 항목은 흡수 항목으로 고를 수 없다(연장 0h)', () => {
    expect(() => designMonthlyWage({ monthlyTotal: 2_156_880, daysPerWeek: 5, dailyWorkHours: 8, holidayDaysPerYear: 0, absorbInto: 'overtime' })).toThrow();
  });
});

describe('designMonthlyWage — 검사', () => {
  it('최저임금: 내린 시급이 10,320 이상이면 통과, 아래면 미달', () => {
    const ok = designMonthlyWage({ monthlyTotal: 2_156_880, daysPerWeek: 5, dailyWorkHours: 8, holidayDaysPerYear: 0, overrides: { leaveHours: 0 }, minimumWage: 10_320 });
    expect(ok.displayRate).toBe(10_320);
    expect(ok.checks.minimumWage.ok).toBe(true);
    const low = designMonthlyWage({ monthlyTotal: 2_156_879, daysPerWeek: 5, dailyWorkHours: 8, holidayDaysPerYear: 0, overrides: { leaveHours: 0 }, minimumWage: 10_320 });
    expect(low.checks.minimumWage.ok).toBe(false);
  });

  it('주 연장 12시간 초과면 경고(주5·11h = 15h)', () => {
    expect(designMonthlyWage({ ...SUWON, overrides: undefined, dailyWorkHours: 11 }).checks.weeklyOvertime.ok).toBe(false);
    expect(designMonthlyWage(UIJEONGBU).checks.weeklyOvertime).toMatchObject({ ok: true });
  });
});
