import { describe, expect, it } from 'vitest';
import { calcAbsence, calcProration, paidHoursOf, type MethodId, type ProrationResult } from '@/lib/calc/pay-proration';
import { check } from '@/lib/pay-check/check';
import { applyPolicy } from '@/lib/pay-check/policies';
import { checkMinWage } from '@/lib/calc/min-wage';

// 급여 일할계산 — 월급제 근로자가 월 중간에 입사·퇴사·결근한 달.
// 법은 일할 방식을 정하지 않는다(근기68207-690). 방식마다 값을 나란히 내고, 회사 기준은 사용자가 고른다.
// 기대값은 리서치(scratchpad/research_pay_proration_cases_calc.py, Fraction 정확 산술)와 손계산이다. 합성 입력만 쓴다.
// 공통: 2026년, 주 40시간(월~금 8시간), 주휴일 = 일요일. 공휴일은 이 도구가 달력에서 찾지 않고 넣은 날만 센다.
// BASE 2,508,000 = 209 × 12,000 → 통상시급 12,000원, 30일 기준 1일분 83,600원.

const BASE = 2_508_000;
const row = (r: ProrationResult, id: MethodId) => r.rows.find((x) => x.id === id)!;
const amt = (r: ProrationResult, id: MethodId) => row(r, id).variants.map((v) => v.amount);
const val = (r: ProrationResult, id: MethodId) => row(r, id).variants.map((v) => v.exact.num / v.exact.den);
const FLOOR1 = { how: 'FLOOR', unit: 1 } as const;

describe('엔진 게이트(src/lib/pay-check) — 이 도구가 엔진에 넘기는 값의 뜻', () => {
  const period = (m: string, last: string) => ({ pay_period_start: `${m}-01`, pay_period_end: `${m}-${last}`, calculation_basis_documented: true });

  it('G1 입사일이 급여기간 첫날이면 중도입사 달이 아니다(금액 없음)', () => {
    const r = check({ scenario: 'MID_JOIN', policy_id: 'DAY_30', confirmed: { ...period('2026-11', '30'), employment_start: '2026-11-01', monthly_base_pay: BASE, eligible_days: 30, payslip_amount: BASE } });
    expect(r.status).toBe('OUTSIDE_SCOPE');
    expect(r.reasons).toEqual(['NOT_MID_PERIOD:starts_on_or_before_period']);
    expect(r.expected_amount).toBeNull();
    expect(calcProration({ month: '2026-11', monthlyPay: BASE, start: '2026-11-01', fivePlus: true }).status).toBe('full-month');
  });

  it('G2 회사 기준이 없으면 금액을 만들지 않는다', () => {
    const r = check({ scenario: 'MID_JOIN', policy_id: null, confirmed: { ...period('2026-03', '31'), employment_start: '2026-03-16', payslip_amount: 1_337_600 } });
    expect(r.status).toBe('NEEDS_CONFIRMATION');
    expect(r.reasons).toEqual(['COMPANY_BASIS_NOT_CONFIRMED']);
    expect(r.expected_amount).toBeNull();
  });

  it('G3 퇴사월 유급휴일 처리를 모르면 멈춘다', () => {
    const r = check({ scenario: 'MID_LEAVE', policy_id: 'DAY_30', confirmed: { ...period('2026-02', '28'), employment_end: '2026-02-13', last_scheduled_workday: '2026-02-13', monthly_base_pay: BASE, eligible_days: 13, payslip_amount: 1_086_800 } });
    expect(r.status).toBe('NEEDS_CONFIRMATION');
    expect(r.reasons).toContain('FACT_UNKNOWN:paid_holiday_treatment');
    expect(r.expected_amount).toBeNull();
  });
});

describe('C1 중도입사 · 31일 달(2026-03, 3/16 월 입사, 3/2 대체공휴일 입력)', () => {
  const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, holidays: ['2026-03-02'] });

  it('재직 역일 16일 · 평일 12일 · 유급시간 112시간(주휴 3/22·3/29)', () => {
    expect(r.status).toBe('calculated');
    expect(r.employedDays).toBe(16);
    expect(r.notEmployedDays).toBe(15);
    expect(r.employedWorkdays).toBe(12);
    expect(r.hours).toMatchObject({ work: 96, publicHoliday: 0, weekly: 16, firstWeekOpen: 0 });
  });

  it('방식마다 값이 1,254,000 ~ 1,433,142.857… 로 갈린다', () => {
    expect(amt(r, 'DAY_30')).toEqual([1_337_600]);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_344_000]);
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([1_254_000]);
    expect(row(r, 'CALENDAR').variants[0].exact).toEqual({ num: 40_128_000, den: 31 });
    expect(amt(r, 'CALENDAR')).toEqual([null]); // 끝수 기준 없음
    // 소정근로일 — 공휴일을 소정근로일에서 빼면 12/21, 넣으면 12/22
    expect(val(r, 'WORKDAY')[0]).toBeCloseTo(10_032_000 / 7, 6);
    expect(amt(r, 'WORKDAY')).toEqual([null, 1_368_000]);
    expect(amt(r, 'FULL')).toEqual([BASE]);
    expect(r.roundingOpen).toBe(true);
    expect(r.range.min).toBe(1_254_000);
    expect(r.range.max).toBeCloseTo(10_032_000 / 7, 6);
  });

  it('달력 일수 기준 끝수 — 버림·1원 / 반올림·1원 / 버림·10원', () => {
    const at = (how: 'FLOOR' | 'ROUND', unit: 1 | 10) => amt(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, rounding: { how, unit } }), 'CALENDAR');
    expect(at('FLOOR', 1)).toEqual([1_294_451]);
    expect(at('ROUND', 1)).toEqual([1_294_452]);
    expect(at('FLOOR', 10)).toEqual([1_294_450]);
  });

  it('공휴일을 넣지 않으면 소정근로일 기준은 한 값(12/22)', () => {
    const plain = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true });
    expect(amt(plain, 'WORKDAY')).toEqual([1_368_000]);
    expect(row(plain, 'WORKDAY').variants[0].label).toBeNull();
  });

  it('엔진과 같은 값 — 30일 기준 일치, 시간 기준은 +6,400 어긋남', () => {
    const confirmed = { pay_period_start: '2026-03-01', pay_period_end: '2026-03-31', employment_start: '2026-03-16', calculation_basis_documented: true, payslip_amount: 1_337_600 };
    const d30 = check({ scenario: 'MID_JOIN', policy_id: 'DAY_30', confirmed: { ...confirmed, monthly_base_pay: BASE, eligible_days: r.employedDays } });
    expect(d30.status).toBe('MATCH');
    expect(d30.expected_amount).toBe(amt(r, 'DAY_30')[0]);
    const hour = check({ scenario: 'MID_JOIN', policy_id: 'HOUR_ACTUAL', confirmed: { ...confirmed, hourly_rate: 12_000, paid_hours: row(r, 'HOUR_ACTUAL').variants[0].hours! } });
    expect(hour.status).toBe('POTENTIAL_MISMATCH');
    expect(hour.difference).toBe(6_400);
    expect(hour.expected_amount).toBe(amt(r, 'HOUR_ACTUAL')[0]);
  });

  it('명세서 금액을 넣으면 같은 방식을 찾는다', () => {
    const p = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, payslip: 1_337_600 });
    expect(p.payslip!.matches.map((m) => m.id)).toEqual(['DAY_30']);
    const c = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, payslip: 1_294_451 });
    expect(c.payslip!.matches).toEqual([{ id: 'CALENDAR', label: null, how: { how: 'FLOOR', unit: 1 } }]);
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, payslip: 1_300_000 }).payslip!.matches).toEqual([]);
  });
});

describe('C2 중도입사 · 30일 달 · 공휴일 없음(2026-11, 11/16 월 입사)', () => {
  const r = calcProration({ month: '2026-11', monthlyPay: BASE, start: '2026-11-16', fivePlus: true });
  it('30일 달이라 30일 기준 = 달력 일수 기준 = 공제식', () => {
    expect(r.employedDays).toBe(15);
    expect(amt(r, 'DAY_30')).toEqual([1_254_000]);
    expect(amt(r, 'CALENDAR')).toEqual([1_254_000]);
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([1_254_000]);
  });
  it('시간 기준 104시간 = 1,248,000 · 소정근로일 11/21', () => {
    expect(row(r, 'HOUR_ACTUAL').variants[0].hours).toBe(104);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_248_000]);
    expect(row(r, 'WORKDAY').variants[0].exact.num / row(r, 'WORKDAY').variants[0].exact.den).toBeCloseTo(9_196_000 / 7, 6);
  });
});

describe('C3 중도퇴사 · 28일 달 — 퇴사 주 주휴는 일요일까지 근로관계가 이어져야(임금근로시간과-1736)', () => {
  it('C3a 2/13(금)이 재직 마지막 날 — 그 주 주휴 없음, 96시간', () => {
    const r = calcProration({ month: '2026-02', monthlyPay: BASE, end: '2026-02-13', fivePlus: true });
    expect(r.employedDays).toBe(13);
    expect(r.hours).toMatchObject({ work: 80, weekly: 16 }); // 2/1(1/26~2/1 주)·2/8
    expect(r.leaveWeekNoHoliday).toBe(true);
    expect(amt(r, 'DAY_30')).toEqual([1_086_800]);
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([1_254_000]);
    expect(row(r, 'CALENDAR').variants[0].exact).toEqual({ num: 8_151_000, den: 7 }); // 32,604,000/28 약분
    expect(val(r, 'CALENDAR')[0]).toBeCloseTo(8_151_000 / 7, 6);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_152_000]);
    // 엔진에 넘길 때 퇴사월 유급휴일 처리 = 무급
    const e = check({ scenario: 'MID_LEAVE', policy_id: 'HOUR_ACTUAL', confirmed: { pay_period_start: '2026-02-01', pay_period_end: '2026-02-28', employment_end: '2026-02-13', last_scheduled_workday: '2026-02-13', paid_holiday_treatment: 'unpaid', calculation_basis_documented: true, hourly_rate: 12_000, paid_hours: 96, payslip_amount: 1_152_000 } });
    expect(e.status).toBe('MATCH');
  });

  it('C3b 2/15(일)까지 재직 — 그 주 주휴 생김, 104시간', () => {
    const r = calcProration({ month: '2026-02', monthlyPay: BASE, end: '2026-02-15', fivePlus: true });
    expect(r.employedDays).toBe(15);
    expect(r.hours).toMatchObject({ work: 80, weekly: 24 });
    expect(r.leaveWeekNoHoliday).toBe(false);
    expect(amt(r, 'DAY_30')).toEqual([1_254_000]);
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([1_421_200]);
    expect(val(r, 'CALENDAR')[0]).toBeCloseTo(9_405_000 / 7, 6);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_248_000]);
  });
});

describe('C4 30일 기준 꼬리 — 31일 달에 30일 재직(2026-12, 12/30 퇴사, 12/25 입력)', () => {
  const r = calcProration({ month: '2026-12', monthlyPay: BASE, end: '2026-12-30', fivePlus: true, holidays: ['2026-12-25'] });
  it('하루가 빠졌는데 30일 기준(지급식)은 월급 전액', () => {
    expect(r.employedDays).toBe(30);
    expect(amt(r, 'DAY_30')).toEqual([BASE]);
    expect(row(r, 'DAY_30').fullByThirty).toBe(true);
    expect(val(r, 'CALENDAR')[0]).toBeCloseTo(75_240_000 / 31, 6);
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([2_424_400]);
  });
  it('시간 기준 208시간 — 평일 22일(12/25 유급 포함) + 주휴 4', () => {
    expect(r.hours).toMatchObject({ work: 168, publicHoliday: 8, weekly: 32 });
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([2_496_000]);
  });
});

describe('C5 중도입사 · 28일 달 — 지급식 30일 기준이 가장 낮다(2026-02, 2/2 월 입사, 설 2/16~18 입력)', () => {
  const holidays = ['2026-02-16', '2026-02-17', '2026-02-18'];
  const five = calcProration({ month: '2026-02', monthlyPay: BASE, start: '2026-02-02', fivePlus: true, holidays });
  const four = calcProration({ month: '2026-02', monthlyPay: BASE, start: '2026-02-02', fivePlus: false, holidays });

  it('일수 방식은 사업장 규모와 상관없다', () => {
    for (const r of [five, four]) {
      expect(amt(r, 'DAY_30')).toEqual([2_257_200]);
      expect(amt(r, 'DAY_30_DEDUCT')).toEqual([2_424_400]);
      expect(val(r, 'CALENDAR')[0]).toBeCloseTo(16_929_000 / 7, 6);
      expect(amt(r, 'WORKDAY')).toEqual([BASE]); // 17/17 = 20/20 → 한 값
    }
    // 일수 방식 가운데는 30일 지급식이 가장 낮다. 시간 기준(설 3일 유급 포함 184시간)은 그보다도 낮다
    expect(Math.min(...(["DAY_30", "DAY_30_DEDUCT", "CALENDAR", "WORKDAY"] as const).flatMap((id) => val(five, id)))).toBe(2_257_200);
    expect(five.range.min).toBe(2_208_000);
  });

  it('5명 이상 = 공휴일 유급(§55②) 184시간 · 4명 이하 = 공휴일 유급이면 184, 무급이면 160시간', () => {
    expect(amt(five, 'HOUR_ACTUAL')).toEqual([2_208_000]);
    expect(row(four, 'HOUR_ACTUAL').variants.map((v) => v.hours)).toEqual([184, 160]);
    expect(amt(four, 'HOUR_ACTUAL')).toEqual([2_208_000, 1_920_000]);
  });
});

describe('C6 주 중간 입사 — 첫 주 주휴는 정해진 해석이 없어 두 값(2026-03, 3/18 수 입사)', () => {
  const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-18', fivePlus: true, holidays: ['2026-03-02'] });
  it('일수 방식', () => {
    expect(r.employedDays).toBe(14);
    expect(amt(r, 'DAY_30')).toEqual([1_170_400]);
    expect(val(r, 'CALENDAR')[0]).toBeCloseTo(35_112_000 / 31, 6);
  });
  it('시간 기준 — 첫 주(3/22) 주휴를 넣지 않으면 88시간, 넣으면 96시간', () => {
    expect(r.hours.firstWeekOpen).toBe(8);
    expect(row(r, 'HOUR_ACTUAL').variants.map((v) => v.hours)).toEqual([88, 96]);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_056_000, 1_152_000]);
  });
});

describe('R 끝수 — 월급 2,500,000(209·30·31 어느 것으로도 나누어떨어지지 않음), 3/16 입사', () => {
  const at = (rounding?: { how: 'FLOOR' | 'ROUND' | 'CEIL'; unit: 1 | 10 | 100 }) =>
    calcProration({ month: '2026-03', monthlyPay: 2_500_000, start: '2026-03-16', fivePlus: true, rounding });

  it('R1 30일 기준 4,000,000/3 — 기준이 없으면 금액을 정하지 않는다(엔진도 rounding·rounding_unit 을 요구)', () => {
    expect(row(at(), 'DAY_30').variants[0].amount).toBeNull();
    expect(val(at(), 'DAY_30')[0]).toBeCloseTo(4_000_000 / 3, 6);
    const e = applyPolicy('DAY_30', { monthly_base_pay: 2_500_000, eligible_days: 16 });
    expect(e).toEqual({ ok: false, reason: 'ROUNDING_RULE_NOT_CONFIRMED', missing: ['rounding', 'rounding_unit'] });
    expect(amt(at(FLOOR1), 'DAY_30')).toEqual([1_333_333]);
    expect(amt(at({ how: 'CEIL', unit: 1 }), 'DAY_30')).toEqual([1_333_334]);
    expect(amt(at({ how: 'FLOOR', unit: 10 }), 'DAY_30')).toEqual([1_333_330]);
    expect(amt(at({ how: 'ROUND', unit: 100 }), 'DAY_30')).toEqual([1_333_300]);
  });

  it('R2 시간 기준 — 통상시급 끝수를 마지막에 한 번 / 시급을 먼저 버림·반올림', () => {
    const v = row(at(), 'HOUR_ACTUAL').variants[0];
    expect(v.exact).toEqual({ num: 280_000_000, den: 209 });
    expect(v.amount).toBeNull();
    expect(v.hourlyFirst).toEqual({ floor: 1_339_632, round: 1_339_744 }); // 11,961 × 112 · 11,962 × 112
    expect(amt(at(FLOOR1), 'HOUR_ACTUAL')).toEqual([1_339_712]);
    expect(amt(at({ how: 'ROUND', unit: 1 }), 'HOUR_ACTUAL')).toEqual([1_339_713]);
  });

  it('통상시급이 원 단위로 떨어지면 시급 끝수 안내가 없다', () => {
    expect(row(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true }), 'HOUR_ACTUAL').variants[0].hourlyFirst).toBeUndefined();
  });
});

describe('입력 경계', () => {
  it('그달 내내 재직이면 일할 대상이 아니다 — 퇴사일이 말일인 달도', () => {
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, fivePlus: true }).status).toBe('full-month');
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, end: '2026-03-31', fivePlus: true }).status).toBe('full-month');
  });

  it('같은 달 입사·퇴사', () => {
    const r = calcProration({ month: '2026-11', monthlyPay: BASE, start: '2026-11-16', end: '2026-11-22', fivePlus: true });
    expect(r.employedDays).toBe(7);
    expect(r.hours).toMatchObject({ work: 40, weekly: 8 });
    expect(amt(r, 'DAY_30')).toEqual([585_200]);
  });

  it('주말 공휴일은 세지 않고 알린다 · 잘못된 날짜는 오류', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, holidays: ['2026-03-01', '2026-03-02'] });
    expect(r.ignoredHolidays).toEqual(['2026-03-01']);
    expect(r.holidaysInMonth).toEqual(['2026-03-02']);
    expect(() => calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-04-02', fivePlus: true })).toThrow();
    expect(() => calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-20', end: '2026-03-10', fivePlus: true })).toThrow();
    expect(() => calcProration({ month: '2026-02', monthlyPay: BASE, start: '2026-02-30', fivePlus: true })).toThrow();
    expect(() => calcProration({ month: '2026-03', monthlyPay: 0, start: '2026-03-16', fivePlus: true })).toThrow();
    expect(() => calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, holidays: ['2026-04-01'] })).toThrow();
  });
});

describe('A 결근 공제 — 2026-11, 통상시급 12,000, 그달 내내 재직', () => {
  const at = (absences: string[], extra: Partial<Parameters<typeof calcAbsence>[0]> = {}) =>
    calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences, ...extra });
  const cell = (r: ReturnType<typeof calcAbsence>, unit: string) => r.rows.find((x) => x.unit === unit)!;

  it('A1·A2 11/18(수) 결근 — 결근일분만 96,000 / 그 주 주휴 1일분까지 192,000', () => {
    const r = at(['2026-11-18']);
    expect(r.absentDays).toBe(1);
    expect(r.holidayWeeks).toBe(1);
    expect(cell(r, 'HOUR8').daysOnly.amount).toBe(96_000);
    expect(cell(r, 'HOUR8').withHoliday.amount).toBe(192_000);
    // 엔진 시간 단위 결근 공제와 같은 값
    expect(applyPolicy('ABSENCE_HOUR', { hourly_rate: 12_000, unpaid_absence_hours: 8 })).toMatchObject({ ok: true, amount: 96_000 });
    const e = check({ scenario: 'ABSENCE_DEDUCTION', policy_id: 'ABSENCE_HOUR', confirmed: { hourly_rate: 12_000, unpaid_absence_hours: 8, payslip_absence_deduction: 96_000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, calculation_basis_documented: true } });
    expect(e.status).toBe('MATCH');
    expect(applyPolicy('ABSENCE_HOUR', { hourly_rate: 12_000, unpaid_absence_hours: 16 })).toMatchObject({ ok: true, amount: 192_000 });
  });

  it('A3 1일 단가 — 월급 ÷ 30 = 83,600 · 30일 달은 달력 일수와 같다 · 31일 달은 80,903.22…', () => {
    const r = at(['2026-11-18']);
    expect(cell(r, 'DAY_30').daysOnly.amount).toBe(83_600);
    expect(cell(r, 'CALENDAR').daysOnly.amount).toBe(83_600);
    const dec = calcAbsence({ month: '2026-12', monthlyPay: BASE, fivePlus: true, absences: ['2026-12-16'] });
    expect(cell(dec, 'CALENDAR').dayRate).toEqual({ num: BASE, den: 31 });
    expect(cell(dec, 'CALENDAR').daysOnly.amount).toBeNull();
  });

  it('A5 같은 주 2일 결근 — 주휴는 그 주 1일만: 192,000 / 288,000(384,000 아님)', () => {
    const r = at(['2026-11-18', '2026-11-19']);
    expect(r.holidayWeeks).toBe(1);
    expect(cell(r, 'HOUR8').daysOnly.amount).toBe(192_000);
    expect(cell(r, 'HOUR8').withHoliday.amount).toBe(288_000);
  });

  it('다른 주 결근이면 주마다 1일', () => {
    expect(at(['2026-11-18', '2026-11-25']).holidayWeeks).toBe(2);
  });

  it('주휴일이 다음 달인 주(11/30 월 결근 → 12/6)는 이 달 공제에 넣지 않고 알린다', () => {
    const r = at(['2026-11-30']);
    expect(r.holidayWeeks).toBe(0);
    expect(r.nextMonthWeeks).toBe(1);
    expect(cell(r, 'HOUR8').withHoliday.amount).toBe(96_000);
  });

  it('A6 결근 없이 지각·조퇴 8시간 — 시간분 96,000만, 주휴 공제 0. 192,000을 뺐으면 96,000 초과', () => {
    const r = at([], { lateHours: 8, companyDeduction: 192_000 });
    expect(r.late!.amount).toBe(96_000);
    expect(r.noWorkMax).toEqual({ num: 96_000, den: 1 });
    expect(r.company!.excess).toEqual({ num: 96_000, den: 1 });
  });

  it('B 감급 한도(5명 이상) — 평균임금 1일분 7,524,000 ÷ 92 → 1회 40,891.30… · 총액 250,800', () => {
    const r = at([], { lateHours: 8, companyDeduction: 192_000, avgDailyWage: 7_524_000 / 92 });
    expect(r.company!.limits!.perIncident!).toBeCloseTo(40_891.304, 2);
    expect(r.company!.limits!.total).toEqual({ num: 250_800, den: 1 });
    expect(r.company!.overPerIncident).toBe(true);
    expect(r.company!.overTotal).toBe(false);
    // 4명 이하는 제95조 미적용(시행령 별표1) — 한도를 대조하지 않는다
    const four = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: false, absences: [], lateHours: 8, companyDeduction: 192_000, avgDailyWage: 81_782 });
    expect(four.company!.limits).toBeNull();
    expect(four.company!.overPerIncident).toBeNull();
  });

  it('회사 공제액이 표의 값과 같으면 어느 칸인지 알려 준다', () => {
    expect(at(['2026-11-18'], { companyDeduction: 192_000 }).company!.matches).toEqual([{ unit: 'HOUR8', holiday: true }]);
    expect(at(['2026-11-18'], { companyDeduction: 83_600 }).company!.matches).toEqual([{ unit: 'DAY_30', holiday: false }, { unit: 'CALENDAR', holiday: false }]);
    expect(at(['2026-11-18'], { companyDeduction: 192_000 }).company!.excess).toBeNull();
  });

  it('결근일은 그달 평일 · 넣은 공휴일이 아니어야 한다', () => {
    expect(() => at(['2026-11-22'])).toThrow(); // 일요일
    expect(() => at(['2026-12-01'])).toThrow();
    expect(() => at(['2026-11-18'], { holidays: ['2026-11-18'] })).toThrow();
    expect(() => at([])).toThrow(); // 결근도 지각·조퇴도 없음
  });
});

describe('M 최저임금 이음새 — 월급 원금을 checkMinWage 로 대조, 일할액은 참고만', () => {
  it('M0 원금 대조 = checkMinWage({unit:month, weeklyHours:40})', () => {
    const low = calcProration({ month: '2026-03', monthlyPay: 2_090_000, start: '2026-03-16', fivePlus: true });
    expect(low.minWage!.check).toEqual(checkMinWage({ unit: 'month', amount: 2_090_000, weeklyHours: 40, minHourly: 10_320 }));
    expect(low.minWage!.check).toMatchObject({ hours: 209, required: 2_156_880, meets: false, shortfall: 66_880, hourly: 10_000 });
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true }).minWage!.check).toMatchObject({ meets: true, hourly: 12_000 });
    const y27 = calcProration({ month: '2027-03', monthlyPay: BASE, start: '2027-03-16', fivePlus: true });
    expect(y27.minWage).toMatchObject({ year: 2027, minHourly: 10_700, check: { required: 2_236_300 } });
  });

  it('고시가 없는 해는 다른 해 값으로 대신하지 않는다', () => {
    expect(calcProration({ month: '2025-03', monthlyPay: BASE, start: '2025-03-17', fivePlus: true }).minWage).toBeNull();
    expect(calcAbsence({ month: '2025-11', monthlyPay: BASE, fivePlus: true, absences: ['2025-11-18'] }).minWage).toBeNull();
  });

  it('M1 월급 2,156,880 · 3/16 입사 · 112시간 — 참고 시간당 금액(30일 −5,504 · 달력 −42,611.61 · 시간 0)', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: 2_156_880, start: '2026-03-16', fivePlus: true, holidays: ['2026-03-02'] });
    expect(r.reference).toEqual({ paidHours: 112, minHourly: 10_320, floor: 1_155_840 });
    const eff = (id: MethodId) => row(r, id).variants[0].exact.num / row(r, id).variants[0].exact.den;
    expect(eff('DAY_30')).toBe(1_150_336);
    expect(eff('DAY_30') - 1_155_840).toBe(-5_504);
    expect(eff('DAY_30') / 112).toBeCloseTo(10_270.86, 2);
    expect(eff('CALENDAR') - 1_155_840).toBeCloseTo(-42_611.61, 2);
    expect(eff('CALENDAR') / 112).toBeCloseTo(9_939.54, 2);
    expect(eff('HOUR_ACTUAL')).toBe(1_155_840);
    expect(r.minWage!.check.meets).toBe(true); // 원금은 충족(2,156,880 = 월 환산액)
  });

  it('M2 같은 달이라도 방식에 따라 참고 시간당 금액이 최저임금 위·아래로 갈린다(2/27 퇴사, 192시간)', () => {
    const r = calcProration({ month: '2026-02', monthlyPay: 2_156_880, end: '2026-02-27', fivePlus: true, holidays: ['2026-02-16', '2026-02-17', '2026-02-18'] });
    expect(r.reference).toEqual({ paidHours: 192, minHourly: 10_320, floor: 1_981_440 });
    expect(amt(r, 'DAY_30')).toEqual([1_941_192]);
    expect(amt(r, 'DAY_30')[0]! / r.reference!.paidHours).toBeCloseTo(10_110.38, 2);
    expect(val(r, 'CALENDAR')[0] / 192).toBeCloseTo(10_832.54, 2);
  });

  it('유급시간이 두 값으로 갈리면 참고 시간당 금액을 내지 않는다', () => {
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-18', fivePlus: true }).reference).toBeNull();
  });

  it('M3 만월 3월도 유급시간은 216시간 — 월 환산 209시간과 달라 이 비교는 참고다', () => {
    expect(paidHoursOf({ month: '2026-03', fivePlus: true, holidays: ['2026-03-02'] }).total).toBe(216);
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true }).monthHours).toBe(209);
  });
});

// PR #127 검토 반영 — 경계·사실로 갈리는 값
describe('F 첫 주 주휴 — 그 주 재직 기간에 소정근로일이 없으면 변형을 만들지 않는다(시행령 §30①)', () => {
  it('토요일(3/21) 입사 — 64시간 한 값', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-21', fivePlus: true });
    expect(r.hours).toMatchObject({ work: 56, weekly: 8, firstWeekOpen: 0 });
    expect(row(r, 'HOUR_ACTUAL').variants.map((v) => v.hours)).toEqual([64]);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([768_000]);
  });

  it('일요일(3/15) 입사 — 112시간 한 값, 폭의 최댓값은 30일 기준(지급식) 17/30', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-15', fivePlus: true });
    expect(r.hours.firstWeekOpen).toBe(0);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_344_000]);
    expect(r.range.max).toBe(1_421_200);
  });

  it('일요일 하루만 재직 — 유급시간 0, 참고 시간당 금액을 내지 않는다', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-01', end: '2026-03-01', fivePlus: true });
    expect(r.hours).toMatchObject({ work: 0, weekly: 0, firstWeekOpen: 0, total: 0 });
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([0]);
    expect(r.reference).toBeNull();
  });

  it('수요일(3/18) 입사는 그대로 두 값', () => {
    expect(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-18', fivePlus: true }).hours.firstWeekOpen).toBe(8);
  });
});

describe('E 경계 — 31일 달 하루 재직 · 윤년 2월', () => {
  it('3/31 하루 재직 — 30일 기준(공제식)은 0원(월급 − 월급 ÷ 30 × 30일)', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-31', fivePlus: true });
    expect(r.notEmployedDays).toBe(30);
    expect(row(r, 'DAY_30_DEDUCT').variants[0].exact).toEqual({ num: 0, den: 1 });
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([0]);
    expect(amt(r, 'DAY_30')).toEqual([83_600]);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([96_000]);
    expect(r.range.min).toBe(0);
    expect(r.reference).toEqual({ paidHours: 8, minHourly: 10_320, floor: 82_560 });
  });

  it('2028-02(29일) — 그달 날수 29를 분모로', () => {
    const r = calcProration({ month: '2028-02', monthlyPay: BASE, start: '2028-02-15', fivePlus: true });
    expect(r.monthDays).toBe(29);
    expect(r.employedDays).toBe(15);
    expect(row(r, 'CALENDAR').variants[0].exact).toEqual({ num: 37_620_000, den: 29 });
    expect(amt(r, 'DAY_30_DEDUCT')).toEqual([1_337_600]); // 2,508,000 − 83,600 × 14
  });

  it('명세서 금액·평균임금이 숫자가 아니면 오류', () => {
    expect(() => calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, payslip: NaN })).toThrow('명세서 금액');
    expect(() => calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, payslip: -1 })).toThrow('명세서 금액');
    expect(() => calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: [], lateHours: 8, companyDeduction: 192_000, avgDailyWage: NaN })).toThrow('평균임금');
  });
});

describe('L 5월 1일 노동절 — 관공서 공휴일(§55②)과 별개의 법정 유급휴일이라 4명 이하도 유급으로 센다', () => {
  const at = (fivePlus: boolean) => calcProration({ month: '2026-05', monthlyPay: BASE, end: '2026-05-15', fivePlus, holidays: ['2026-05-01', '2026-05-05'] });
  it('4명 이하 — 5/5만 유급·무급 두 값(104 / 96시간)', () => {
    const r = at(false);
    expect(r.hours).toMatchObject({ work: 72, laborDay: 8, publicHoliday: 8, weekly: 16 });
    expect(row(r, 'HOUR_ACTUAL').variants.map((v) => v.hours)).toEqual([104, 96]);
    expect(amt(r, 'HOUR_ACTUAL')).toEqual([1_248_000, 1_152_000]);
  });
  it('5명 이상 — 104시간 한 값', () => {
    expect(row(at(true), 'HOUR_ACTUAL').variants.map((v) => v.hours)).toEqual([104]);
  });
});

describe('K 지각·조퇴 공제와 감급 — 법무811-21010(월급자는 전액, 취업규칙에 정하면 §95 범위 감급) · 근로기준팀-462(한도 안 수회 감급)', () => {
  const at = (extra: Partial<Parameters<typeof calcAbsence>[0]>) => calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: [], ...extra });

  it('지각·조퇴 공제 전체를 감급으로 보면 결근분을 넘는 공제 전부가 감급액', () => {
    const r = at({ lateHours: 8, companyDeduction: 192_000, avgDailyWage: 7_524_000 / 92 });
    expect(r.absenceMax).toEqual({ num: 0, den: 1 });
    expect(r.company!.lateAll!.amount).toEqual({ num: 192_000, den: 1 });
    expect(r.company!.lateAll!.overTotal).toBe(false); // 250,800 이하
    expect(r.company!.lateAll!.overPerIncident).toBe(true); // 한 번의 감급이라면
  });

  it('결근도 있으면 결근일분·그 주 주휴를 뺀 나머지', () => {
    const r = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-18'], lateHours: 2, companyDeduction: 230_000 });
    expect(r.absenceMax).toEqual({ num: 192_000, den: 1 });
    expect(r.company!.lateAll!.amount).toEqual({ num: 38_000, den: 1 });
    expect(r.company!.excess).toEqual({ num: 14_000, den: 1 }); // 230,000 − (192,000 + 24,000)
  });

  it('지각·조퇴가 없으면 lateAll 은 없다', () => {
    const r = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-18'], companyDeduction: 200_000 });
    expect(r.company!.lateAll).toBeNull();
  });

  it('초과분이 1회 한도 이하면 몇 번이든 한도 안 — 큼은 「한 번이라면」', () => {
    const r = at({ lateHours: 3, companyDeduction: 96_000, avgDailyWage: 80_000 });
    expect(r.company!.excess).toEqual({ num: 60_000, den: 1 });
    expect(r.company!.overPerIncident).toBe(true);
    const small = at({ lateHours: 3, companyDeduction: 70_000, avgDailyWage: 80_000 });
    expect(small.company!.overPerIncident).toBe(false);
  });
});
