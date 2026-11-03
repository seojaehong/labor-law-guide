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
  // #139 적대 검토 4 — 버리면 연장·휴일 수당이 「통상시급 × 시간 × 가산율」보다 적어진다. 올리고 기본급이 나머지를 받는다
  it('10원 단위 올림: 흡수하지 않는 항목은 10원 단위로 올리고 기본급이 나머지를 받는다', () => {
    const a = amounts({ ...UIJEONGBU, rounding: 'ceil10' });
    expect(a).toEqual({ base: 1_870_350, overtime: 414_020, holiday: 243_880, leave: 71_750 });
  });

  it('100원 단위 올림', () => {
    const a = amounts({ ...UIJEONGBU, rounding: 'ceil100' });
    expect(a).toEqual({ base: 1_870_200, overtime: 414_100, holiday: 243_900, leave: 71_800 });
  });

  it('단위 올림 항목은 계산값 이상이다', () => {
    for (const rounding of ['ceil10', 'ceil100'] as const) {
      for (const i of designMonthlyWage({ ...UIJEONGBU, rounding }).items) if (!i.absorbs) expect(i.amount).toBeGreaterThanOrEqual(i.exact);
    }
  });

  it('흡수 항목을 공휴일로 바꾸면 기본급은 계산값, 공휴일이 잔액', () => {
    const a = amounts({ ...UIJEONGBU, absorbInto: 'holiday' });
    expect(a.base).toBe(1_870_364);
    expect(a.overtime).toBe(414_013);
    expect(a.leave).toBe(71_744);
    expect(a.holiday).toBe(2_600_000 - 1_870_364 - 414_013 - 71_744);
  });

  it('흡수 항목을 연장근로수당으로 바꿀 수 있다(원 단위) — 단위 올림과는 함께 쓸 수 없다', () => {
    const a = amounts({ ...SUWON, absorbInto: 'overtime' });
    expect(a.base + a.overtime + a.holiday + a.leave).toBe(3_200_000);
    expect(() => amounts({ ...SUWON, absorbInto: 'overtime', rounding: 'ceil100' })).toThrow('기본급');
  });

  it('시간이 0인 항목은 흡수 항목으로 고를 수 없다(연장 0h)', () => {
    expect(() => designMonthlyWage({ monthlyTotal: 2_156_880, daysPerWeek: 5, dailyWorkHours: 8, holidayDaysPerYear: 0, absorbInto: 'overtime' })).toThrow();
  });
});

// 최저임금·1주 연장 한도는 설계가 아니라 점검 규칙(MINWAGE·WH-52CAP)이 본다 — tests/unit/contract-write-form.test.ts 「최저임금 한 줄」

describe('designMonthlyWage — 야간·5명 미만(261103 전수 개선)', () => {
  // 수원 홀 10:00~22:30 · 휴게 2시간 30분 · 실근로 10h → 22:00~22:30 야간 0.5h
  const NIGHT: DesignInput = { monthlyTotal: 3_200_000, daysPerWeek: 5, dailyWorkHours: 10, holidayDaysPerYear: 18.75, nightHoursPerDay: 0.5 };

  it('야간 가중시간 = 하루 야간h × 0.5 × 주근무일 × 4.345', () => {
    const r = designMonthlyWage(NIGHT);
    expect(r.hours.night).toBeCloseTo(0.5 * 0.5 * 5 * 4.345, 10);
    const night = r.items.find((i) => i.key === 'night')!;
    expect(night.label).toBe('야간근로수당');
    expect(night.amount).toBe(Math.round(r.rate * r.hours.night));
    expect(r.items.reduce((s, i) => s + i.amount, 0)).toBe(3_200_000);
  });

  it('야간이 없으면 항목에 넣지 않는다(기존 4항목 그대로)', () => {
    expect(designMonthlyWage(UIJEONGBU).items.map((i) => i.key)).toEqual(['base', 'overtime', 'holiday', 'leave']);
  });

  it('5명 미만이면 연장은 실시간(가산 없음), 야간·휴일·연차는 0', () => {
    const r = designMonthlyWage({ ...NIGHT, fivePlus: false });
    expect(r.hours.overtime).toBeCloseTo(2 * 5 * 4.345, 10);
    expect(r.hours.night).toBe(0);
    expect(r.hours.holiday).toBe(0);
    expect(r.hours.leave).toBe(0);
    expect(r.items.map((i) => i.key)).toEqual(['base', 'overtime']);
  });
});

// #139 적대 검토 1 — 주 6일처럼 하루 8시간 이내여도 1주 40시간을 넘으면 그 시간은 연장근로다(근로기준법 제50조 제1항·제53조 제1항).
// 점검 엔진 normalize 와 같은 식: 1주 연장 = Σ하루 실근로 − min(Σmin(하루, 8), 40)
describe('designMonthlyWage — 1주 40시간 넘는 연장', () => {
  const six = (daily: number): DesignInput => ({ monthlyTotal: 3_500_000, daysPerWeek: 6, dailyWorkHours: daily, holidayDaysPerYear: 0 });
  it.each([
    [8, 8],
    [10, 20],
    [7, 2],
  ])('주 6일 × 하루 %s시간 → 1주 연장 %s시간', (daily, weeklyOt) => {
    const r = designMonthlyWage(six(daily));
    expect(r.hours.overtime).toBeCloseTo(weeklyOt * 1.5 * 4.345, 6);
    expect(r.hours.base).toBe(209);
  });
  it('주 5일 × 하루 10시간은 그대로 1주 10시간', () => {
    expect(designMonthlyWage({ ...six(10), daysPerWeek: 5 }).hours.overtime).toBeCloseTo(10 * 1.5 * 4.345, 6);
  });
});
