import { describe, expect, it } from 'vitest';
import { calcHolidayPay, validateHolidayHours } from '@/lib/holiday-pay';

// 2026-11-22 원격 MCP 전수 점검에서 확인된 결함(P0·P1·P2) 회귀 시험
// 통상시급 = 2,508,000 ÷ 209 = 12,000

describe('P0 — 월급제가 유급휴일에 일하면 월급 외에 휴일근로 임금 1.0배 + 가산을 더 준다', () => {
  it('5명 이상 관공서 공휴일 8시간 → 12,000 × 1.5 × 8 = 144,000', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 2_508_000, monthly_hours: 209, worked_hours: 8 });
    expect(r.breakdown.map((b) => b.amount)).toEqual([96_000, 48_000]);
    expect(r.total).toBe(144_000);
    expect(r.regular_pay_equivalent).toBe(96_000);
    expect(r.gross_holiday_pay).toBe(144_000);
    expect(r.paid_holiday_day.status).toBe('in_monthly_pay');
  });

  it('5명 이상 노동절 10시간 → 1.5 × 8 + 2.0 × 2 = 16시간분 192,000', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'labor_day', monthly_pay: 2_508_000, monthly_hours: 209, worked_hours: 10 });
    expect(r.total).toBe(192_000);
  });

  it('같은 8시간이면 월급제와 시급제(주휴 별도)의 일한 대가가 같다', () => {
    const m = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 2_508_000, worked_hours: 8 });
    const h = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 8 });
    expect(m.total).toBe(h.total);
  });

  it('4명 이하 노동절도 유급휴일 — 일한 시간 1.0배(가산 없음) 96,000', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'small', holiday_kind: 'labor_day', monthly_pay: 2_508_000, worked_hours: 8 });
    expect(r.total).toBe(96_000);
  });

  it('4명 이하 관공서 공휴일은 유급휴일이 아니어서 월급 외 추가는 0', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'small', holiday_kind: 'public_holiday', monthly_pay: 2_508_000, worked_hours: 8 });
    expect(r.total).toBe(0);
    expect(r.warning).toBeTruthy();
    expect(r.paid_holiday_day.status).toBe('not_paid_holiday');
  });

  it('월급에 들어 있다는 안내는 「유급휴일 1일분」이지 일한 시간의 1.0배가 아니다', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 2_508_000, worked_hours: 8 });
    const text = [...r.notes, ...r.breakdown.map((b) => b.formula)].join(' ');
    expect(text).not.toContain('월급에 이미 포함됨');
    expect(text).not.toMatch(/가산분\(8h 이내 0\.5배 \/ 8h 초과 1\.0배\)만 추가/);
  });
});

describe('P1 — 시급·일용제의 유급휴일 1일분은 일한 대가와 따로, 조건과 함께 낸다', () => {
  it('5명 이상 관공서 공휴일 · 주 40시간 → 1일분 8시간 × 12,000 = 96,000, 소정근로일 조건부', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, hourly_includes_weekly: false, weekly_hours: 40, worked_hours: 10, night_hours: 2 });
    expect(r.total).toBe(204_000); // 일한 대가 = 120,000 + 48,000 + 24,000 + 12,000
    expect(r.paid_holiday_day).toMatchObject({ status: 'separate', hours: 8, amount: 96_000 });
    expect(r.paid_holiday_day.note).toContain('소정근로일');
    expect(r.notes.join(' ')).toContain('96,000');
  });

  it('4명 이하 노동절 · 주 40시간 → 일한 대가 96,000 + 유급휴일 1일분 96,000 따로', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'small', holiday_kind: 'labor_day', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 8 });
    expect(r.total).toBe(96_000);
    expect(r.paid_holiday_day).toMatchObject({ status: 'separate', hours: 8, amount: 96_000 });
  });

  it('주 20시간 단시간 → 1일분 = 20 ÷ 5 = 4시간', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'labor_day', hourly_wage: 12_000, weekly_hours: 20, worked_hours: 4 });
    expect(r.paid_holiday_day).toMatchObject({ status: 'separate', hours: 4, amount: 48_000 });
  });

  it('주 15시간 미만은 관공서 공휴일 유급휴일이 없다(제18조 제3항)', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, weekly_hours: 10, worked_hours: 4 });
    expect(r.paid_holiday_day.status).toBe('not_paid_holiday');
  });

  it('4명 이하 관공서 공휴일은 유급휴일이 아니다', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'small', holiday_kind: 'public_holiday', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 8 });
    expect(r.paid_holiday_day.status).toBe('not_paid_holiday');
    expect(r.total).toBe(96_000);
  });

  it('주 소정근로시간을 모르면 1일분 금액은 비우고 조건만 알린다', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'labor_day', hourly_wage: 12_000, worked_hours: 8 });
    expect(r.paid_holiday_day).toMatchObject({ status: 'separate', hours: null, amount: null });
  });

  it('계속 일해 온 일용직 → 1일분 = 통상시급 × 1일 근로시간(8시간 한도)', () => {
    const r = calcHolidayPay({ worker_type: 'daily', site_size: 'large', holiday_kind: 'public_holiday', daily_wage: 100_000, worked_hours: 8, paid_continuously: true });
    expect(r.paid_holiday_day).toMatchObject({ status: 'separate', hours: 8, amount: 100_000 });
  });

  it('4명 이하 노동절 안내가 「근무 시 100% 추가가 원칙」이라며 1일분을 말없이 빼지 않는다', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'small', holiday_kind: 'labor_day', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 8 });
    expect(r.notes.join(' ')).not.toContain('근무 시 통상임금 100% 추가 지급이 원칙');
  });
});

describe('P2 — 야간 시간은 일한 시간을 넘을 수 없다', () => {
  it('nightHours > workedHours 이면 오류 문구', () => {
    expect(validateHolidayHours(4, 6)).toMatch(/야간/);
    expect(() => calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 4, night_hours: 6 })).toThrow(/야간/);
  });
  it('같으면 받는다', () => {
    expect(validateHolidayHours(4, 4)).toBeNull();
    expect(calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, weekly_hours: 40, worked_hours: 4, night_hours: 4 }).total).toBe(96_000);
  });
});
