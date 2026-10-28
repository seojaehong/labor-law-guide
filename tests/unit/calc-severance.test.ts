import { describe, expect, it } from 'vitest';
import { calcSeverance, periodSegments } from '@/lib/calc/severance';

// 퇴직금 정본 엔진. 식 = 1일 평균임금 × 30 × 재직일수 ÷ 365 (퇴직급여법 §8①, 근로기준법 §2①6·②).
// 날짜·일수 기대값은 달력으로 손으로 센 것이다. 금액 기대값은 그 일수로 적은 식을 그대로 나눈 것이다.

const base = { wageTotal: 9_000_000 };

/** 고용노동부 계산기 끝수 — 1일 평균임금 소수 둘째 자리 올림(전 단위), 퇴직금 원 단위 반올림 */
const moel = (dailyCents: number, serviceDays: number) => Math.round((dailyCents * 30 * serviceDays) / 36_500);
const ceilCents = (total: number, days: number) => Math.ceil((total * 100) / days);

describe('산정기간 — 퇴직일 전 3개월', () => {
  it('퇴직일이 1일이면 앞 세 달 통째(3구간)', () => {
    const s = periodSegments('2023-01-01', '2026-01-01');
    expect(s.map((p) => `${p.from}~${p.to}:${p.days}`)).toEqual(['2025-10-01~2025-10-31:31', '2025-11-01~2025-11-30:30', '2025-12-01~2025-12-31:31']);
  });

  it('달 중간이면 4구간, 3개월 전 같은 날부터 퇴직일 전날까지', () => {
    const s = periodSegments('2023-01-01', '2026-10-15');
    expect(s.map((p) => p.days)).toEqual([17, 31, 30, 14]); // 7.15~7.31 · 8월 · 9월 · 10.1~10.14
    expect(s[0].from).toBe('2026-07-15');
  });

  it('3개월 전 같은 날이 없으면 그 달 말일부터(7.31 → 4.30)', () => {
    const s = periodSegments('2020-01-01', '2026-07-31');
    expect(s[0].from).toBe('2026-04-30');
    expect(s.reduce((a, p) => a + p.days, 0)).toBe(92); // 1 + 31 + 30 + 30
  });

  it('2월에 같은 날이 없으면 3월 1일부터(5.31·5.30·평년 5.29) — 고용노동부 계산기와 같다', () => {
    expect(periodSegments('2020-01-01', '2026-05-31').map((p) => p.days)).toEqual([31, 30, 30]);
    expect(periodSegments('2020-01-01', '2026-05-30').map((p) => p.days)).toEqual([31, 30, 29]);
    expect(periodSegments('2020-01-01', '2026-05-29')[0].from).toBe('2026-03-01');
    expect(periodSegments('2020-01-01', '2028-05-29')[0].from).toBe('2028-02-29'); // 윤년
  });

  it('입사 3개월 안이면 입사일부터 센다', () => {
    const s = periodSegments('2026-03-15', '2026-05-01');
    expect(s[0].from).toBe('2026-03-15');
    expect(s.reduce((a, p) => a + p.days, 0)).toBe(47); // 17 + 30
  });
});

describe('퇴직금', () => {
  it('재직 3년(1,096일, 윤년 하루 포함) — 재직일수 ÷ 365', () => {
    const r = calcSeverance({ ...base, hireDate: '2023-01-01', lastWorkDate: '2025-12-31' });
    expect(r.retirementDate).toBe('2026-01-01');
    expect(r.serviceDays).toBe(1096);
    expect(r.periodDays).toBe(92);
    expect(r.applied).toBe('average');
    expect(r.dailyAverage).toBe(97_826.09); // 9,000,000 ÷ 92 = 97,826.086… → 올림
    expect(r.amount).toBe(moel(ceilCents(9_000_000, 92), 1096));
    expect(r.eligible).toBe(true);
  });

  it('상여·연차수당은 3/12 를 더한다', () => {
    const r = calcSeverance({ ...base, hireDate: '2023-01-01', lastWorkDate: '2025-12-31', annualBonus: 3_600_000, annualLeavePay: 1_200_000 });
    expect(r.bonusAdd).toBe(900_000);
    expect(r.leaveAdd).toBe(300_000);
    expect(r.amount).toBe(moel(ceilCents(10_200_000, 92), 1096));
  });

  it('평균임금이 통상임금보다 낮으면 통상임금으로 — 양쪽', () => {
    const low = calcSeverance({ hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 6_000_000, dailyOrdinaryWage: 80_000 });
    expect(low.applied).toBe('ordinary');
    expect(low.amount).toBe(moel(8_000_000, 1096));
    const high = calcSeverance({ hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000, dailyOrdinaryWage: 80_000 });
    expect(high.applied).toBe('average');
  });

  it('1년 경계 — 꼭 1년이면 대상, 하루 모자라면 아님', () => {
    expect(calcSeverance({ ...base, hireDate: '2025-03-01', lastWorkDate: '2026-02-28' }).eligible).toBe(true);
    expect(calcSeverance({ ...base, hireDate: '2025-03-01', lastWorkDate: '2026-02-27' }).eligible).toBe(false);
  });

  it('2월 29일 입사 — 1년은 다음 해 2월 28일에 찬다', () => {
    expect(calcSeverance({ ...base, hireDate: '2024-02-29', lastWorkDate: '2025-02-28' }).eligible).toBe(true);
    expect(calcSeverance({ ...base, hireDate: '2024-02-29', lastWorkDate: '2025-02-27' }).eligible).toBe(false);
  });

  it('없는 날짜·거꾸로 된 날짜는 오류', () => {
    expect(() => calcSeverance({ ...base, hireDate: '2026-02-30', lastWorkDate: '2027-01-01' })).toThrow();
    expect(() => calcSeverance({ ...base, hireDate: '2026-05-01', lastWorkDate: '2026-04-01' })).toThrow();
  });

  it('큰 금액도 원 단위까지 맞다(부동소수 오차 없음)', () => {
    const r = calcSeverance({ hireDate: '1996-03-04', lastWorkDate: '2026-10-27', wageTotal: 45_678_901, annualBonus: 23_456_789 });
    const base12 = BigInt(45_678_901 * 12 + 23_456_789 * 3);
    const den = BigInt(12) * BigInt(r.periodDays);
    const cents = (base12 * BigInt(100) + den - BigInt(1)) / den;
    const num = cents * BigInt(30) * BigInt(r.serviceDays);
    expect(r.amount).toBe(Number((num * BigInt(2) + BigInt(36_500)) / BigInt(73_000)));
  });
});
