import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMinWage } from '@/lib/calc/min-wage';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { minWageView } from '@/app/tools/min-wage/result';
import type { Rate } from '@/content/rates';

// 261124 도구 검수 P1 — 최저임금 확인이 실제 미달을 「이상」으로 판정하던 두 원인과 40시간 초과 경고.
// 기대값은 손으로 센 것이다(최저임금법 시행령 §5①2·3, 근로기준법 시행령 별표2 제2호나목).

const MIN26 = 10_320;

describe('① 월 환산 시간 반올림이 미달을 충족으로 뒤집지 않는다', () => {
  // 주 20시간: (20 + 4) × 365 ÷ 84 = 104.2857…시간. 104로 내려 세면 필요액 1,073,280원이라 1,075,000원이 「이상」이 됐다.
  // 반올림 없이 세면 10,320 × 104.2857… = 1,076,228.57…원 → 1,076,229원부터 충족.
  it('주 20시간 월 1,075,000원은 1,229원 모자란다(전: 이상)', () => {
    const r = checkMinWage({ unit: 'month', amount: 1_075_000, weeklyHours: 20, minHourly: MIN26 });
    expect(r.meets).toBe(false);
    expect(r.required).toBe(1_076_229);
    expect(r.shortfall).toBe(1_229);
    // 화면의 시간당 환산도 판정과 같은 시간으로 나눈다 — 104시간으로 나눈 10,336원이 「적습니다」 옆에 뜨지 않게
    expect(r.hourly).toBeLessThan(MIN26);
    expect(r.hours).toBeCloseTo(104.2857, 3);
  });

  it('경계 양쪽 — 1,076,228원은 1원 미달, 1,076,229원은 충족', () => {
    expect(checkMinWage({ unit: 'month', amount: 1_076_228, weeklyHours: 20, minHourly: MIN26 })).toMatchObject({ meets: false, shortfall: 1 });
    expect(checkMinWage({ unit: 'month', amount: 1_076_229, weeklyHours: 20, minHourly: MIN26 })).toMatchObject({ meets: true, shortfall: 0 });
  });

  it('주 40시간은 고시의 209시간 그대로 — 2,156,879원 미달·2,156,880원 충족', () => {
    expect(checkMinWage({ unit: 'month', amount: 2_156_879, weeklyHours: 40, minHourly: MIN26 })).toMatchObject({ hours: 209, meets: false, shortfall: 1 });
    expect(checkMinWage({ unit: 'month', amount: 2_156_880, weeklyHours: 40, minHourly: MIN26 })).toMatchObject({ hours: 209, meets: true });
  });
});

describe('② 주휴 시간은 통상근로자 1주 소정근로일 수로 나눈다(별표2 제2호나목)', () => {
  // 통상근로자 주 4일·32시간, 단시간 주 24시간: 1일 소정 = 96 ÷ 16 = 6시간 → 1주 30시간 → 309,600원.
  it('통상근로자 주 4일이면 주급 300,000원은 9,600원 모자란다(전: 주 5일로 4.8시간 → 297,216원 「충족」)', () => {
    const r = checkMinWage({ unit: 'week', amount: 300_000, weeklyHours: 24, fullTimeDays: 4, minHourly: MIN26 });
    expect(r.hours).toBe(30);
    expect(r.required).toBe(309_600);
    expect(r.meets).toBe(false);
    expect(r.shortfall).toBe(9_600);
    expect(checkMinWage({ unit: 'week', amount: 309_600, weeklyHours: 24, fullTimeDays: 4, minHourly: MIN26 }).meets).toBe(true);
  });

  it('넣지 않으면 주 5일 — 기존 값 그대로', () => {
    const r = checkMinWage({ unit: 'week', amount: 300_000, weeklyHours: 24, minHourly: MIN26 });
    expect(r.hours).toBeCloseTo(28.8, 9);
    expect(r.required).toBe(297_216);
    expect(r.meets).toBe(true);
  });

  it('주휴수당 계산기와 같은 유급 시간을 쓴다', () => {
    for (const [weeklyHours, fullTimeDays] of [[24, 4], [24, 5], [30, 6], [36, 4]] as const) {
      const wh = calcWeeklyHoliday({ hourlyWage: 1, weeklyHours, fullAttendance: true, fullTimeDays });
      const r = checkMinWage({ unit: 'week', amount: 1, weeklyHours, fullTimeDays, minHourly: MIN26 });
      expect(r.hours - weeklyHours).toBeCloseTo(wh.amount === 0 ? 0 : Math.min(weeklyHours / fullTimeDays, 8), 9);
      expect(Math.round((r.hours - weeklyHours) * 100) / 100).toBe(wh.dailyHours);
    }
  });

  it('월급에도 적용한다 — 주 24시간·통상 주 4일: 30 × 365 ÷ 84 = 130.36시간', () => {
    const r = checkMinWage({ unit: 'month', amount: 1_340_000, weeklyHours: 24, fullTimeDays: 4, minHourly: MIN26 });
    expect(r.hours).toBeCloseTo(130.357, 3);
    expect(r.meets).toBe(false); // 10,320 × 130.357… = 1,345,285.7…
    expect(r.required).toBe(1_345_286);
  });

  it('통상근로자 근무일 수는 1~7 정수', () => {
    expect(() => checkMinWage({ unit: 'week', amount: 300_000, weeklyHours: 24, fullTimeDays: 0, minHourly: MIN26 })).toThrow();
    expect(() => checkMinWage({ unit: 'week', amount: 300_000, weeklyHours: 24, fullTimeDays: 4.5, minHourly: MIN26 })).toThrow();
  });

  it('시급·일급은 근무일 수를 보지 않는다(화면에 칸이 없다)', () => {
    expect(checkMinWage({ unit: 'hour', amount: 10_320, fullTimeDays: 0, minHourly: MIN26 }).meets).toBe(true);
    expect(checkMinWage({ unit: 'day', amount: 82_560, dailyHours: 8, fullTimeDays: 0, minHourly: MIN26 }).meets).toBe(true);
  });
});

describe('③ 1주 소정근로시간 40시간 초과 경고(웹·MCP 공통 warnings)', () => {
  it('주 52시간 월 2,600,000원 — 계산은 하되 경고를 낸다', () => {
    const r = checkMinWage({ unit: 'month', amount: 2_600_000, weeklyHours: 52, minHourly: MIN26 });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/40시간/);
    expect(r.warnings[0]).toMatch(/제50조/);
    expect(r.warnings[0]).toMatch(/소정근로시간이 될 수 없/);
  });

  it('주 40시간·시급·일급은 경고 없음', () => {
    expect(checkMinWage({ unit: 'month', amount: 2_156_880, weeklyHours: 40, minHourly: MIN26 }).warnings).toEqual([]);
    expect(checkMinWage({ unit: 'hour', amount: 10_320, weeklyHours: 52, minHourly: MIN26 }).warnings).toEqual([]);
    expect(checkMinWage({ unit: 'day', amount: 82_560, dailyHours: 8, weeklyHours: 52, minHourly: MIN26 }).warnings).toEqual([]);
  });

  it('웹 결과 블록이 경고를 보여 준다', () => {
    const rate = { from: '2026-01-01', until: '2026-12-31', value: MIN26, basis: 'x', checked: '2026-10-28' } as Rate;
    const r = checkMinWage({ unit: 'month', amount: 2_600_000, weeklyHours: 52, minHourly: MIN26 });
    expect(minWageView([{ year: 2026, rate, r }], 'month').warnings).toEqual(r.warnings);
  });

  it('MCP check_min_wage 도 같은 엔진 경고를 내고 fullTimeDays 를 받는다', () => {
    const calc = readFileSync('tools/k-labor/groups/calc.mjs', 'utf8');
    const from = calc.indexOf("    'check_min_wage',");
    const mw = calc.slice(from, calc.indexOf("    'calc_weekly_holiday_pay',", from));
    expect(mw).toMatch(/fullTimeDays: z\.number\(\)\.int\(\)/);
    // 응답 최상위에 엔진 경고를 한 번 싣고, 해마다의 줄에서는 뺀다
    expect(mw).toMatch(/\n\s+warnings: checkMinWage\(\{ \.\.\.a, minHourly: rows\[0\]\.minHourly \}\)\.warnings,/);
    expect(mw).toMatch(/\n\s+warnings: undefined,/);
    expect(mw).not.toMatch(/반올림\(주 40시간이면 209시간\)/);
  });
});
