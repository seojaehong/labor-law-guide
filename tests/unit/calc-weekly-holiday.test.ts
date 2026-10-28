import { describe, expect, it } from 'vitest';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';

// 주휴수당 = 시급 × 1일 소정근로시간. 1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상근로자 소정근로일 수(시행령 별표2 제2호나목).
// 주 15시간 미만은 주휴 없음(근로기준법 §18③), 그 주 소정근로일을 개근해야 생긴다(시행령 §30①).
// 기대값은 손으로 곱한 것이다.

const base = { hourlyWage: 10_320, fullAttendance: true };

describe('주휴수당', () => {
  it('주 40시간 — 하루 8시간분', () => {
    const r = calcWeeklyHoliday({ ...base, weeklyHours: 40 });
    expect(r.status).toBe('paid');
    expect(r.dailyHours).toBe(8);
    expect(r.amount).toBe(82_560);
  });

  it('주 22.5시간 — 22.5 × 4 ÷ 20일 = 4.5시간분', () => {
    const r = calcWeeklyHoliday({ ...base, weeklyHours: 22.5 });
    expect(r.dailyHours).toBe(4.5);
    expect(r.amount).toBe(46_440);
  });

  it('15시간 경계 — 15시간이면 생기고 14.5시간이면 없다', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 15 }).amount).toBe(30_960);
    const under = calcWeeklyHoliday({ ...base, weeklyHours: 14.5 });
    expect(under.status).toBe('under15');
    expect(under.amount).toBe(0);
  });

  it('개근하지 않은 주는 없다 — 양쪽', () => {
    const absent = calcWeeklyHoliday({ ...base, weeklyHours: 40, fullAttendance: false });
    expect(absent.status).toBe('absent');
    expect(absent.amount).toBe(0);
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 40, fullAttendance: true }).status).toBe('paid');
  });

  it('통상근로자가 주 6일이면 6으로 나눈다', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 24, fullTimeDays: 6 }).dailyHours).toBe(4);
  });

  it('하루 8시간을 넘지 않는다', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 44 }).dailyHours).toBe(8);
  });

  it('월 환산은 1주 금액 × 365 ÷ 7 ÷ 12, 원 단위 반올림', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 40 }).monthly).toBe(358_743); // 82,560 × 365 ÷ 84 = 358,742.86
  });

  it('원 미만은 반올림 — 시급 10,321 × 4.5 = 46,444.5 → 46,445', () => {
    expect(calcWeeklyHoliday({ hourlyWage: 10_321, weeklyHours: 22.5, fullAttendance: true }).amount).toBe(46_445);
  });

  it('나누어떨어지지 않으면 나누기 전 값으로 센다 — 23시간 ÷ 6일 × 10,320 = 39,560', () => {
    const r = calcWeeklyHoliday({ ...base, weeklyHours: 23, fullTimeDays: 6 });
    expect(r.dailyHours).toBe(3.83);
    expect(r.amount).toBe(39_560); // 237,360 ÷ 6
  });

  it('잘못된 입력은 오류', () => {
    expect(() => calcWeeklyHoliday({ ...base, weeklyHours: -1 })).toThrow();
    expect(() => calcWeeklyHoliday({ ...base, weeklyHours: 40, hourlyWage: 0 })).toThrow();
    expect(() => calcWeeklyHoliday({ ...base, weeklyHours: 40, fullTimeDays: 0 })).toThrow();
  });
});
