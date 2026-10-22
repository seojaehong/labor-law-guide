// /tools/pay-check 화면 입력 → 엔진 입력 변환. 화면에서 누르는 경우가 엔진(@486509a) 결과와 같은지 고정한다.

import { describe, expect, it } from 'vitest';
import { check } from '@/lib/pay-check/check';
import { POLICY_FIELDS, POLICY_NAME, ROUNDING_UNITS } from '@/lib/pay-check/policies';
import { SCENARIOS } from '@/lib/pay-check/types';
import {
  BASES, buildInput, FACT_FIELDS, fieldsFor, parseNumber, ROUNDING_UNIT_OPTIONS, UNKNOWN_DATE, type FormState,
} from '@/app/tools/pay-check/build-input';

const run = (f: FormState) => check(buildInput(f));
const PERIOD = { pay_period_start: '2026-04-01', pay_period_end: '2026-04-30' };
const LEAVE_FACTS = { ...PERIOD, employment_end: '2026-04-15', last_scheduled_workday: '2026-04-15', paid_holiday_treatment: 'paid' };

describe('화면에서 누르는 세 경우', () => {
  it('어긋남 가능성: 중도퇴사 · 30일 기준 · 3,000,000원 · 15일 · 명세서 1,400,000원 → 차이 100,000원', () => {
    const f: FormState = {
      scenario: 'MID_LEAVE',
      values: { ...LEAVE_FACTS, payslip_amount: '1,400,000', monthly_base_pay: '3,000,000', eligible_days: '15' },
      policy: 'DAY_30',
      rounding: 'UNKNOWN',
    };
    expect(buildInput(f)).toEqual({
      scenario: 'MID_LEAVE',
      policy_id: 'DAY_30',
      confirmed: {
        ...PERIOD, employment_end: '2026-04-15', last_scheduled_workday: '2026-04-15', paid_holiday_treatment: 'paid',
        payslip_amount: 1400000, monthly_base_pay: 3000000, eligible_days: 15, calculation_basis_documented: true,
      },
    });
    const r = run(f);
    expect([r.status, r.expected_amount, r.difference]).toEqual(['POTENTIAL_MISMATCH', 1500000, 100000]);
    expect(r.required_question).toBe('명세서가 퇴사월 인정일수를 며칠로, 몇 일 기준으로 계산했는지 확인해 주세요.');
  });

  it('확인 필요: 기준 없음 → 금액을 만들지 않는다', () => {
    const r = run({
      scenario: 'MID_LEAVE',
      values: { ...LEAVE_FACTS, payslip_amount: '1400000', monthly_base_pay: '3000000', eligible_days: '15' },
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

  it('「모름」을 고른 칸은 null 로 넣고, 엔진은 그 칸에서 멈춘다', () => {
    const leave = buildInput({
      scenario: 'MID_LEAVE',
      values: { ...PERIOD, employment_end: '2026-04-15', last_scheduled_workday: UNKNOWN_DATE, paid_holiday_treatment: 'unknown' },
      policy: null,
      rounding: 'UNKNOWN',
    });
    expect(leave.confirmed).toEqual({ ...PERIOD, employment_end: '2026-04-15', last_scheduled_workday: null, paid_holiday_treatment: null });
    expect(check(leave).required_question).toBe('마지막 소정근로일, 유급휴일 처리, 퇴사월 계산 기준을 각각 확인해 주세요.');

    const hw = buildInput({ scenario: 'HOURLY_WEEKLY_HOLIDAY', values: { employment_continued_for_7_days: 'yes', weekly_holiday_designated: 'unknown' }, policy: null, rounding: 'UNKNOWN' });
    expect(hw.confirmed).toEqual({ employment_continued_for_7_days: true, weekly_holiday_designated: null });
    expect(check(hw).reasons).toEqual(['FACT_UNCONFIRMED:continuity_or_holiday']);
  });

  it('비워 둔 필수 칸도 대조를 막는다: 급여기간·마지막 소정근로일·유급휴일 처리', () => {
    const base = { payslip_amount: '1500000', monthly_base_pay: '3000000', eligible_days: '15' };
    const noPeriod = run({ scenario: 'MID_LEAVE', values: { ...base, employment_end: '2026-04-15', last_scheduled_workday: '2026-04-15', paid_holiday_treatment: 'paid' }, policy: 'DAY_30', rounding: 'UNKNOWN' });
    expect([noPeriod.reasons, noPeriod.expected_amount]).toEqual([['FACT_MISSING:pay_period'], null]);
    const noLast = run({ scenario: 'MID_LEAVE', values: { ...base, ...PERIOD, employment_end: '2026-04-15' }, policy: 'DAY_30', rounding: 'UNKNOWN' });
    expect(noLast.reasons).toEqual(['FACT_UNKNOWN:last_scheduled_workday', 'FACT_UNKNOWN:paid_holiday_treatment']);
    expect(run({ scenario: 'MID_LEAVE', values: { ...base, ...LEAVE_FACTS }, policy: 'DAY_30', rounding: 'UNKNOWN' }).status).toBe('MATCH');
  });

  it('끝수: 방법·단위 둘 다 있어야 금액이 나온다. 단위는 숫자로 넣는다', () => {
    const base: FormState = {
      scenario: 'MID_LEAVE',
      values: { ...PERIOD, employment_end: '2026-04-10', last_scheduled_workday: '2026-04-10', paid_holiday_treatment: 'paid', monthly_base_pay: '2500000', eligible_days: '10', payslip_amount: '833333' },
      policy: 'DAY_30',
      rounding: 'UNKNOWN',
    };
    expect('rounding' in buildInput(base).confirmed || 'rounding_unit' in buildInput(base).confirmed).toBe(false);
    expect(run(base).reasons).toEqual(['ROUNDING_RULE_NOT_CONFIRMED']);
    expect(run({ ...base, rounding: 'FLOOR' }).evidence_needed).toEqual(['끝수 처리 단위(1원·10원·100원)']);
    expect(buildInput({ ...base, rounding: 'FLOOR', roundingUnit: 1 }).confirmed.rounding_unit).toBe(1);
    expect(run({ ...base, rounding: 'FLOOR', roundingUnit: 1 }).status).toBe('MATCH');
    const ten = run({ ...base, values: { ...base.values, payslip_amount: '833330' }, rounding: 'FLOOR', roundingUnit: 10 });
    expect([ten.status, ten.expected_amount]).toEqual(['MATCH', 833330]);
    expect(run({ ...base, rounding: 'FLOOR', roundingUnit: null }).reasons).toEqual(['ROUNDING_RULE_NOT_CONFIRMED']);
  });

  it('끝수 단위 선택지는 「모름」과 엔진 ROUNDING_UNITS 이다', () => {
    expect(ROUNDING_UNIT_OPTIONS.map((o) => o.id)).toEqual([null, ...ROUNDING_UNITS]);
  });

  it('결근 「유급휴가·휴일이었는지」: 아니오 → false 로 대조, 예 → true 로 멈춤, 모름 → null 로 멈춤', () => {
    const v = { unpaid_absence_hours: '8', payslip_absence_deduction: '-80,000', scheduled_workday_confirmed: 'yes', hourly_rate: '10000' };
    const no = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...v, paid_leave_or_holiday: 'no' }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect(no.confirmed.paid_leave_or_holiday).toBe(false);
    expect([check(no).status, check(no).difference]).toEqual(['MATCH', 0]);
    const yes = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...v, paid_leave_or_holiday: 'yes' }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect(check(yes).reasons).toEqual(['DAY_IS_PAID_LEAVE_OR_HOLIDAY']);
    const unknown = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...v, paid_leave_or_holiday: 'unknown' }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect(unknown.confirmed.paid_leave_or_holiday).toBeNull();
    expect(check(unknown).reasons).toEqual(['FACT_UNCONFIRMED:scheduled_workday']);
    const blank = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: v, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' });
    expect('paid_leave_or_holiday' in blank.confirmed).toBe(false);
    expect(check(blank).reasons).toEqual(['FACT_UNCONFIRMED:scheduled_workday']);
    expect('paid_leave_or_holiday_confirmed' in no.confirmed).toBe(false);
  });

  it('주휴: 평균 주수를 넣으면 대조, 비우면 FACT_MISSING:averaging_weeks, 2주 근로는 2주로 평균', () => {
    const v = {
      four_week_scheduled_hours: '60', averaging_weeks: '4', employment_continued_for_7_days: 'yes', weekly_holiday_designated: 'yes',
      all_scheduled_days_attended: 'yes', payslip_weekly_holiday_pay: '30000', hourly_rate: '10000', full_time_scheduled_days_4w: '20', holiday_weeks: '1',
    };
    const f: FormState = { scenario: 'HOURLY_WEEKLY_HOLIDAY', values: v, policy: 'WEEKLY_HOLIDAY_FIXED', rounding: 'UNKNOWN' };
    expect(buildInput(f).confirmed.averaging_weeks).toBe(4);
    expect([run(f).status, run(f).expected_amount]).toEqual(['MATCH', 30000]);
    expect(run({ ...f, values: { ...v, averaging_weeks: '' } }).reasons).toEqual(['FACT_MISSING:averaging_weeks']);
    const two = run({ ...f, values: { ...v, four_week_scheduled_hours: '32', averaging_weeks: '2', full_time_scheduled_days_4w: '10', payslip_weekly_holiday_pay: '32000' } });
    expect([two.status, two.expected_amount]).toEqual(['MATCH', 32000]);
  });

  it('주휴일 「지정되지 않음을 확인함」은 false 로 넣는다', () => {
    const c = buildInput({ scenario: 'HOURLY_WEEKLY_HOLIDAY', values: { weekly_holiday_designated: 'no' }, policy: null, rounding: 'UNKNOWN' }).confirmed;
    expect(c.weekly_holiday_designated).toBe(false);
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

  it('화면의 기준 이름은 엔진 결과 카드의 기준 이름(POLICY_NAME)과 같다', () => {
    for (const s of SCENARIOS) {
      for (const b of BASES[s]) expect(b.label, `${s} ${b.id}`).toBe(POLICY_NAME[b.id]);
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

  it('엔진이 멈추는 사실 키가 화면에 있다 (옛 키 paid_leave_or_holiday_confirmed 는 없다)', () => {
    const keys = (s: (typeof SCENARIOS)[number]) => FACT_FIELDS[s].map((f) => f.key);
    expect(keys('MID_JOIN')).toEqual(expect.arrayContaining(['employment_start', 'pay_period_start', 'pay_period_end']));
    expect(keys('MID_LEAVE')).toEqual(expect.arrayContaining(['employment_end', 'pay_period_start', 'pay_period_end', 'last_scheduled_workday', 'paid_holiday_treatment']));
    expect(keys('ABSENCE_DEDUCTION')).toEqual(expect.arrayContaining(['scheduled_workday_confirmed', 'paid_leave_or_holiday']));
    expect(keys('ABSENCE_DEDUCTION')).not.toContain('paid_leave_or_holiday_confirmed');
    expect(keys('HOURLY_WEEKLY_HOLIDAY')).toEqual(expect.arrayContaining(['averaging_weeks', 'weekly_holiday_designated', 'employment_continued_for_7_days', 'all_scheduled_days_attended']));
  });

  it('예외마다 명세서 금액 칸이 있다', () => {
    const payslip = { MID_JOIN: 'payslip_amount', MID_LEAVE: 'payslip_amount', ABSENCE_DEDUCTION: 'payslip_absence_deduction', HOURLY_WEEKLY_HOLIDAY: 'payslip_weekly_holiday_pay' } as const;
    for (const s of SCENARIOS) expect(FACT_FIELDS[s].some((f) => f.key === payslip[s])).toBe(true);
  });
});
