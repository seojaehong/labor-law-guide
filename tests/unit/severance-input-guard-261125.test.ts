import { describe, expect, it } from 'vitest';
import { calcSeverance } from '@/lib/calc/severance';

// 261124 검수 P2 #13 — 퇴직금 지급 요건과 평균임금 제외기간.
//   요건: 계속근로 1년 이상 + 4주 평균 1주 소정근로시간 15시간 이상(근로자퇴직급여 보장법 제4조제1항 단서).
//     시간을 넣지 않으면 「지급 대상」이라고 말하지 않는다(eligible = false, status = hours-unknown).
//   제외기간: 산정기간 중 근로기준법 시행령 제2조제1항의 기간(육아휴직 등)은 그 일수와 그 기간에 받은 임금을 뺀다.
// 기대값은 손으로 센 것이다.

const base = { hireDate: '2025-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_200_000 };

describe('퇴직금 지급 요건 — 1년과 주 15시간을 따로 본다', () => {
  it('1년 이상 + 주 15시간 = 지급 대상', () => {
    const r = calcSeverance({ ...base, weeklyHours: 15 });
    expect(r.oneYear).toBe(true);
    expect(r.hours15).toBe(true);
    expect(r.status).toBe('eligible');
    expect(r.eligible).toBe(true);
  });
  it('1년 이상이어도 주 14시간이면 지급 대상이 아니다', () => {
    const r = calcSeverance({ ...base, weeklyHours: 14 });
    expect(r.oneYear).toBe(true);
    expect(r.hours15).toBe(false);
    expect(r.status).toBe('under-15h');
    expect(r.eligible).toBe(false);
  });
  it('주 14.9시간도 미만', () => {
    expect(calcSeverance({ ...base, weeklyHours: 14.9 }).status).toBe('under-15h');
  });
  it('시간을 넣지 않으면 판정하지 않는다 — eligible 은 true 가 아니다', () => {
    const r = calcSeverance(base);
    expect(r.oneYear).toBe(true);
    expect(r.hours15).toBeNull();
    expect(r.status).toBe('hours-unknown');
    expect(r.eligible).toBe(false);
  });
  it('1년 미만이 먼저다', () => {
    const r = calcSeverance({ ...base, lastWorkDate: '2025-12-30', weeklyHours: 40 });
    expect(r.status).toBe('under-1y');
    expect(r.eligible).toBe(false);
  });
  it('주 시간이 숫자가 아니거나 168을 넘으면 오류', () => {
    expect(() => calcSeverance({ ...base, weeklyHours: -1 })).toThrow(/1주 소정근로시간/);
    expect(() => calcSeverance({ ...base, weeklyHours: 169 })).toThrow(/1주 소정근로시간/);
    expect(() => calcSeverance({ ...base, weeklyHours: Number.NaN })).toThrow(/1주 소정근로시간/);
  });
});

describe('평균임금 제외기간 — 근로기준법 시행령 제2조제1항', () => {
  // 2025-01-01 입사, 마지막 근무일 2025-12-31 → 퇴직일 2026-01-01, 산정기간 2025-10-01~12-31 = 92일. 재직 365일.
  it('92일 중 무급 육아휴직 30일, 나머지 62일 임금 6,200,000 → 100,000 × 30 = 3,000,000 (빼지 않으면 2,021,739)', () => {
    const plain = calcSeverance({ ...base, wageTotal: 6_200_000, weeklyHours: 40 });
    expect(plain.periodDays).toBe(92);
    expect(plain.amount).toBe(2_021_739);
    const r = calcSeverance({ ...base, wageTotal: 6_200_000, weeklyHours: 40, excludedDays: 30, excludedWage: 0 });
    expect(r.periodDays).toBe(92);
    expect(r.excludedDays).toBe(30);
    expect(r.averageDays).toBe(62);
    expect(r.dailyAverage).toBe(100_000);
    expect(r.serviceDays).toBe(365);
    expect(r.amount).toBe(3_000_000);
  });
  it('제외기간에 받은 임금은 총액에서 뺀다 — 총액 6,500,000 중 300,000 이 그 기간 임금이면 6,200,000 ÷ 62', () => {
    const r = calcSeverance({ ...base, wageTotal: 6_500_000, weeklyHours: 40, excludedDays: 30, excludedWage: 300_000 });
    expect(r.dailyAverage).toBe(100_000);
    expect(r.amount).toBe(3_000_000);
  });
  it('제외기간이 0일이면 종전과 같다', () => {
    const a = calcSeverance({ ...base, weeklyHours: 40 });
    const b = calcSeverance({ ...base, weeklyHours: 40, excludedDays: 0, excludedWage: 0 });
    expect(b.amount).toBe(a.amount);
    expect(b.dailyAverage).toBe(a.dailyAverage);
  });
  it('산정기간 전부가 제외기간이면 이 식으로 셀 수 없어 멈춘다', () => {
    expect(() => calcSeverance({ ...base, weeklyHours: 40, excludedDays: 92 })).toThrow(/전부/);
  });
  it('일수·임금이 음수이거나 정수가 아니거나 임금이 총액을 넘으면 오류', () => {
    expect(() => calcSeverance({ ...base, excludedDays: -1 })).toThrow(/제외/);
    expect(() => calcSeverance({ ...base, excludedDays: 1.5 })).toThrow(/제외/);
    expect(() => calcSeverance({ ...base, excludedDays: 10, excludedWage: 9_300_000 })).toThrow(/제외/);
    expect(() => calcSeverance({ ...base, excludedDays: 0, excludedWage: 100 })).toThrow(/제외/);
  });
});
