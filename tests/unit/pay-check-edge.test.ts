// 12건 밖의 경계 (원본: ~/dev/pay-exception-check @3263456 test/edge.test.ts, extractor slot 묶음 제외).
// 끝수 처리, [별표 2] 1일 소정근로시간, 15시간 선, 공제 부호.

import { describe, expect, it } from 'vitest';
import { check } from '@/lib/pay-check/check';

const hw = (extra: Record<string, number | boolean | null> = {}) =>
  check({
    scenario: 'HOURLY_WEEKLY_HOLIDAY',
    policy_id: 'WEEKLY_HOLIDAY_FIXED',
    confirmed: {
      four_week_scheduled_hours: 60,
      full_time_scheduled_days_4w: 20,
      holiday_weeks: 1,
      all_scheduled_days_attended: true,
      employment_continued_for_7_days: true,
      hourly_rate: 10000,
      payslip_weekly_holiday_pay: 30000,
      ...extra,
    },
  });

describe('weekly holiday (근로기준법 제18조제3항, 시행령 [별표 2])', () => {
  it("1-day hours divide by the full-time worker's days, not the part-timer's", () => {
    // 4주 60시간, 본인 주 3일 근무, 통상 근로자 4주 20일 → 1일 3시간 (본인 일수로 나누면 5시간)
    const r = hw({ scheduled_days_per_week: 3 });
    expect(r.status).toBe('MATCH');
    expect(r.expected_amount).toBe(30000);
  });
  it('a 4-week average just under 15 hours is outside the comparison', () => {
    expect(hw({ four_week_scheduled_hours: 59.96 }).status).toBe('OUTSIDE_SCOPE');
    expect(hw({ four_week_scheduled_hours: 60 }).status).toBe('MATCH');
  });
  it('without the full-time days it asks instead of guessing', () => {
    const r = hw({ full_time_scheduled_days_4w: null });
    expect(r.status).toBe('NEEDS_CONFIRMATION');
    expect(r.expected_amount).toBeNull();
    expect(r.required_question).toContain('통상 근로자의 소정근로일수');
  });
  it('attendance not confirmed → asks for the timesheet', () => {
    expect(hw({ all_scheduled_days_attended: false }).reasons).toEqual(['FACT_UNCONFIRMED:attendance']);
  });
  it('a month item covering 4 weeks is compared as 4 weeks', () => {
    const r = hw({ holiday_weeks: 4, payslip_weekly_holiday_pay: 120000 });
    expect([r.status, r.expected_amount]).toEqual(['MATCH', 120000]);
  });
});

describe("rounding is the company's, never the core's", () => {
  const leave = (rounding?: string) =>
    check({
      scenario: 'MID_LEAVE',
      policy_id: 'DAY_30',
      confirmed: { employment_end: '2026-04-10', monthly_base_pay: 2_500_000, eligible_days: 10, payslip_amount: 833_333, calculation_basis_documented: true, ...(rounding ? { rounding } : {}) },
    });
  it('2,500,000 ÷ 30 × 10 is not a whole 원 → asks for the rounding rule', () => {
    const r = leave();
    expect(r.status).toBe('NEEDS_CONFIRMATION');
    expect(r.reasons).toEqual(['ROUNDING_RULE_NOT_CONFIRMED']);
    expect(r.expected_amount).toBeNull();
  });
  it('with a confirmed FLOOR it compares 833,333', () => {
    expect([leave('FLOOR').status, leave('FLOOR').expected_amount]).toEqual(['MATCH', 833333]);
    expect([leave('CEIL').status, leave('CEIL').difference]).toEqual(['POTENTIAL_MISMATCH', 1]);
  });
});

describe('scope and sign', () => {
  it('a deduction printed as −80,000 is compared by its size', () => {
    const r = check({
      scenario: 'ABSENCE_DEDUCTION',
      policy_id: 'ABSENCE_HOUR',
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: -80000, scheduled_workday_confirmed: true, calculation_basis_documented: true },
    });
    expect([r.status, r.difference]).toEqual(['MATCH', 0]);
  });
  it('over-deduction has the same polarity as under-payment (positive)', () => {
    const r = check({
      scenario: 'ABSENCE_DEDUCTION',
      policy_id: 'ABSENCE_HOUR',
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 100000, scheduled_workday_confirmed: true, calculation_basis_documented: true },
    });
    expect([r.status, r.difference]).toEqual(['POTENTIAL_MISMATCH', 20000]);
  });
  it('a day confirmed as paid leave is not compared as an absence', () => {
    const r = check({
      scenario: 'ABSENCE_DEDUCTION',
      policy_id: 'ABSENCE_HOUR',
      confirmed: { unpaid_absence_hours: 8, hourly_rate: 10000, payslip_absence_deduction: 80000, scheduled_workday_confirmed: true, paid_leave_or_holiday_confirmed: true, calculation_basis_documented: true },
    });
    expect([r.status, r.expected_amount, r.reasons[0]]).toEqual(['NEEDS_CONFIRMATION', null, 'DAY_IS_PAID_LEAVE_OR_HOLIDAY']);
  });
  it('a policy from another exception is not used', () => {
    const r = check({ scenario: 'MID_JOIN', policy_id: 'ABSENCE_HOUR', confirmed: { employment_start: '2026-04-16', hourly_rate: 1, unpaid_absence_hours: 1, payslip_amount: 1 } });
    expect(r.status).toBe('NEEDS_CONFIRMATION');
    expect(r.reasons).toEqual(['POLICY_NOT_FOR_SCENARIO:ABSENCE_HOUR']);
  });
  it('leaving the day after the period ends is not a mid-month leave', () => {
    const r = check({ scenario: 'MID_LEAVE', policy_id: 'DAY_30', confirmed: { pay_period_start: '2026-04-01', pay_period_end: '2026-04-30', employment_end: '2026-05-01' } });
    expect(r.status).toBe('OUTSIDE_SCOPE');
  });
});
