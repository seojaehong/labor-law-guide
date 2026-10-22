// /tools/pay-check 화면 입력 → 엔진 입력 변환. 화면에서 누르는 세 경우가 엔진 결과와 같은지 고정한다.

import { describe, expect, it } from 'vitest';
import { check } from '@/lib/pay-check/check';
import { POLICY_FIELDS } from '@/lib/pay-check/policies';
import { SCENARIOS } from '@/lib/pay-check/types';
import { BASES, buildInput, FACT_FIELDS, fieldsFor, parseNumber, UNKNOWN_DATE, type FormState } from '@/app/tools/pay-check/build-input';

const run = (f: FormState) => check(buildInput(f));

describe('화면에서 누르는 세 경우', () => {
  it('어긋남 가능성: 중도퇴사 · 30일 기준 · 3,000,000원 · 15일 · 명세서 1,400,000원 → 차이 100,000원', () => {
    const f: FormState = {
      scenario: 'MID_LEAVE',
      values: { employment_end: '2026-04-15', payslip_amount: '1,400,000', monthly_base_pay: '3,000,000', eligible_days: '15' },
      policy: 'DAY_30',
      rounding: 'UNKNOWN',
    };
    expect(buildInput(f)).toEqual({
      scenario: 'MID_LEAVE',
      policy_id: 'DAY_30',
      confirmed: { employment_end: '2026-04-15', payslip_amount: 1400000, monthly_base_pay: 3000000, eligible_days: 15, calculation_basis_documented: true },
    });
    const r = run(f);
    expect([r.status, r.expected_amount, r.difference]).toEqual(['POTENTIAL_MISMATCH', 1500000, 100000]);
    expect(r.required_question).toBe('명세서에 적용된 퇴사월 인정일수와 30일 기준이 같은지 확인해 주세요.');
  });

  it('확인 필요: 기준 없음 → 금액을 만들지 않는다', () => {
    const r = run({
      scenario: 'MID_LEAVE',
      values: { employment_end: '2026-04-15', payslip_amount: '1400000', monthly_base_pay: '3000000', eligible_days: '15' },
      policy: null,
      rounding: 'UNKNOWN',
    });
    expect([r.status, r.expected_amount, r.reasons[0]]).toEqual(['NEEDS_CONFIRMATION', null, 'COMPANY_BASIS_NOT_CONFIRMED']);
    expect(r.required_question).toBe('퇴사월 급여를 일수·시간 중 어떤 기준으로 계산하는지 적힌 계약/규정을 확인해 주세요.');
  });

  it('범위 밖: 결근 0 · 공제 0 (0 은 빈 칸이 아니다)', () => {
    const f: FormState = { scenario: 'ABSENCE_DEDUCTION', values: { unpaid_absence_hours: '0', payslip_absence_deduction: '0' }, policy: null, rounding: 'UNKNOWN' };
    expect(buildInput(f).confirmed).toEqual({ unpaid_absence_hours: 0, payslip_absence_deduction: 0 });
    const r = run(f);
    expect([r.status, r.required_question]).toEqual(['OUTSIDE_SCOPE', null]);
  });
});

describe('빈 칸·모름', () => {
  it('빈 칸은 키를 뺀다 (null 로 넣지 않는다)', () => {
    const c = buildInput({ scenario: 'MID_JOIN', values: { employment_start: '2026-04-16', payslip_amount: '  ' }, policy: 'HOUR_ACTUAL', rounding: 'UNKNOWN' }).confirmed;
    expect(c).toEqual({ employment_start: '2026-04-16', calculation_basis_documented: true });
    expect('hourly_rate' in c).toBe(false);
  });

  it('unknown() 으로 읽는 칸만 「모름」을 null 로 넣는다', () => {
    const leave = buildInput({
      scenario: 'MID_LEAVE',
      values: { employment_end: '2026-04-15', last_scheduled_workday: UNKNOWN_DATE, paid_holiday_treatment: 'unknown' },
      policy: null,
      rounding: 'UNKNOWN',
    });
    expect(leave.confirmed).toEqual({ employment_end: '2026-04-15', last_scheduled_workday: null, paid_holiday_treatment: null });
    expect(check(leave).required_question).toBe('마지막 소정근로일, 유급휴일 처리, 퇴사월 계산 기준을 각각 확인해 주세요.');

    const hw = buildInput({ scenario: 'HOURLY_WEEKLY_HOLIDAY', values: { employment_continued_for_7_days: 'yes', weekly_holiday_designated: 'unknown' }, policy: null, rounding: 'UNKNOWN' });
    expect(hw.confirmed).toEqual({ employment_continued_for_7_days: true, weekly_holiday_designated: null });
    expect(check(hw).reasons).toEqual(['FACT_UNCONFIRMED:continuity_or_holiday']);
  });

  it('손대지 않은 모름 칸은 키가 없어 대조를 막지 않는다', () => {
    const c = buildInput({ scenario: 'MID_LEAVE', values: { employment_end: '2026-04-15' }, policy: null, rounding: 'UNKNOWN' }).confirmed;
    expect('last_scheduled_workday' in c || 'paid_holiday_treatment' in c).toBe(false);
  });

  it('끝수 「모름」은 키를 빼고, 고르면 그대로 넣는다', () => {
    const base: FormState = { scenario: 'MID_LEAVE', values: { employment_end: '2026-04-10', monthly_base_pay: '2500000', eligible_days: '10', payslip_amount: '833333' }, policy: 'DAY_30', rounding: 'UNKNOWN' };
    expect('rounding' in buildInput(base).confirmed).toBe(false);
    expect(run(base).reasons).toEqual(['ROUNDING_RULE_NOT_CONFIRMED']);
    expect(run({ ...base, rounding: 'FLOOR' }).status).toBe('MATCH');
  });

  it('결근 「유급휴가·휴일 아님 확인」은 키를 빼고, 「확인 못 함」은 false 로 넣는다', () => {
    const v = { unpaid_absence_hours: '8', payslip_absence_deduction: '-80,000', scheduled_workday_confirmed: 'yes', hourly_rate: '10000' };
    const not = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...v, paid_leave_or_holiday_confirmed: 'not' }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect('paid_leave_or_holiday_confirmed' in not.confirmed).toBe(false);
    expect([check(not).status, check(not).difference]).toEqual(['MATCH', 0]);
    const no = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...v, paid_leave_or_holiday_confirmed: 'no' }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect(no.confirmed.paid_leave_or_holiday_confirmed).toBe(false);
    expect(check(no).reasons).toEqual(['FACT_UNCONFIRMED:scheduled_workday']);
  });

  it('숫자 읽기', () => {
    expect(parseNumber('1,400,000')).toBe(1400000);
    expect(parseNumber('−80,000원')).toBe(-80000);
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('화면 칸 = 엔진 키', () => {
  it('화면이 고르게 하는 기준은 엔진이 그 예외에 쓰는 기준이다', () => {
    for (const s of SCENARIOS) {
      for (const b of BASES[s]) {
        const r = check({ scenario: s, policy_id: b.id, confirmed: {} });
        expect(r.reasons.some((x) => x.startsWith('POLICY_NOT_FOR_SCENARIO'))).toBe(false);
      }
    }
  });

  it('기준을 고르면 그 기준의 POLICY_FIELDS 가 모두 화면에 있다', () => {
    for (const s of SCENARIOS) {
      for (const b of BASES[s]) {
        const { facts, basis } = fieldsFor(s, b.id);
        const keys = new Set([...facts, ...basis].map((f) => f.key));
        for (const k of POLICY_FIELDS[b.id]) expect(keys.has(k)).toBe(true);
      }
    }
  });

  it('예외마다 명세서 금액 칸이 있다', () => {
    const payslip = { MID_JOIN: 'payslip_amount', MID_LEAVE: 'payslip_amount', ABSENCE_DEDUCTION: 'payslip_absence_deduction', HOURLY_WEEKLY_HOLIDAY: 'payslip_weekly_holiday_pay' } as const;
    for (const s of SCENARIOS) expect(FACT_FIELDS[s].some((f) => f.key === payslip[s])).toBe(true);
  });
});
