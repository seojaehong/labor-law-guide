import { describe, expect, it } from 'vitest';
import { ceilDiv, dailyOrdinaryWage, dec2, hourlyOrdinaryWage, payableWon, snapWon } from '@/lib/calc/wage-rounding';
import { calcNoticePay } from '@/lib/calc/notice-pay';
import { calcLeavePay, type LeavePayInput } from '@/lib/calc/leave-pay';
import { calcShutdownAllowance } from '@/lib/calc/shutdown-allowance';
import { calcHolidayPay } from '@/lib/holiday-pay';
import { estimateLeavePay } from '@/app/exit/exit-calc';

// 통상임금 끝수 규칙(261112 재홍님 결정) — 시간급·1일 통상임금은 끝수 그대로, 원 미만은 지급액에서 한 번 올린다.
// 근거와 방향의 이유는 src/lib/calc/wage-rounding.ts 머리말. 입력은 모두 합성 값이다.

const EXACT_HOURLY = 3_000_000 / 209; // 14,354.0669…
const EXACT_DAILY = 24_000_000 / 209; // 114,832.5358…

describe('도우미', () => {
  it('잡음만 지운다 — 참값이 정수인 값의 앞뒤 1e-6 안쪽만', () => {
    expect(snapWon(487_999.99999999994)).toBe(488_000);
    expect(snapWon(488_000.0000001)).toBe(488_000);
    expect(snapWon(488_000.01)).toBe(488_000.01);
  });

  it('지급액은 원 미만 올림 — .5 아래도 위도 올린다, 정수는 그대로', () => {
    expect(payableWon(3_444_976.0766)).toBe(3_444_977);
    expect(payableWon(497_607.6555)).toBe(497_608);
    expect(payableWon(2_400_000)).toBe(2_400_000);
    expect(payableWon(11 * ((1_159_000 * 8) / 209))).toBe(488_000); // 487,999.9999… 잡음 — 올림에서 1원 더 붙이지 않는다
  });

  it('시간급·1일 통상임금은 끝수 그대로, 곱셈 먼저', () => {
    expect(hourlyOrdinaryWage(3_000_000, 209)).toBe(EXACT_HOURLY);
    expect(dailyOrdinaryWage(3_000_000, 8, 209)).toBeCloseTo(114_832.535885, 5);
    expect(dailyOrdinaryWage(2_090_000, 8, 209)).toBe(80_000);
    expect(dailyOrdinaryWage(1_159_000, 8, 209)).toBeCloseTo(44_363.636364, 5);
  });

  it('BigInt 올림 나눗셈', () => {
    expect(ceilDiv(BigInt(10), BigInt(5))).toBe(BigInt(2));
    expect(ceilDiv(BigInt(11), BigInt(5))).toBe(BigInt(3));
    expect(ceilDiv(BigInt(0), BigInt(5))).toBe(BigInt(0));
  });

  it('화면 표시는 소수 둘째 자리까지', () => {
    expect(dec2(EXACT_DAILY)).toBe('114,832.54');
    expect(dec2(EXACT_HOURLY)).toBe('14,354.07');
    expect(dec2(80_000)).toBe('80,000');
  });
});

describe('네 계산기가 같은 1일 통상임금을 쓴다 — 월 3,000,000원 · 209시간 · 1일 8시간', () => {
  const notice = calcNoticePay({ unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
  const leaveInput: LeavePayInput = {
    timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8,
    rate: { basis: 'ordinary-wage', unit: 'month', amount: 3_000_000 },
    days: { source: 'unused', unusedDays: 1 }, asOf: '2026-11-12',
  };
  const leave = calcLeavePay(leaveInput);
  const shutdown = calcShutdownAllowance({
    fivePlus: true, cause: 'employer', average: { source: 'direct', daily: 200_000 },
    ordinary: { unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8 }, days: 10,
  });
  const holiday = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 3_000_000, worked_hours: 8 });

  it('시간급 14,354.0669…·1일 114,832.5358… — 반올림·버림 없이 넷이 같다', () => {
    expect(notice.hourly).toBe(EXACT_HOURLY);
    expect(leave.hourly).toBe(EXACT_HOURLY);
    expect(shutdown.hourly).toBe(EXACT_HOURLY);
    expect(holiday.base_hourly).toBe(EXACT_HOURLY);
    for (const daily of [notice.dailyOrdinary, leave.dailyRate!, shutdown.dailyOrdinary!, estimateLeavePay(3_000_000, 40, 1).daily]) {
      expect(daily).toBeCloseTo(EXACT_DAILY, 6);
    }
  });

  it('해고예고수당 = 3,000,000 × 8 × 30 ÷ 209 = 3,444,976.08 → 3,444,977 (전에는 1일 114,833 × 30 = 3,444,990)', () => {
    expect(notice.amount).toBe(3_444_977);
    expect(notice.amount).not.toBe(3_444_990);
  });

  it('연차수당 1일 = 114,832.54 → 114,833 · /exit 추정도 같다', () => {
    expect(leave.amount).toBe(114_833);
    expect(estimateLeavePay(3_000_000, 40, 1).amount).toBe(114_833);
  });

  it('휴업수당 단서(통상임금 × 10일) = 1,148,325.36 → 1,148,326 · 본문 200,000 × 10 × 0.7 = 1,400,000', () => {
    expect(shutdown.main).toBe(1_400_000);
    expect(shutdown.provisoExact).toBeCloseTo(1_148_325.358852, 5);
    expect(shutdown.proviso).toBe(1_148_326);
  });

  it('휴업수당 단서 26일 = 2,985,645.93 → 2,985,646 — 1일 통상임금을 114,832.54 로 반올림해 곱하던 값(2,985,646.04 → 2,985,647)보다 1원 적다', () => {
    const s26 = calcShutdownAllowance({
      fivePlus: true, cause: 'employer', average: { source: 'direct', daily: 200_000 },
      ordinary: { unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8 }, days: 26,
    });
    expect(s26.provisoExact).toBeCloseTo(2_985_645.933014, 5);
    expect(s26.proviso).toBe(2_985_646);
  });

  it('공휴일 가산(월급제 8시간 × 0.5) = 3,000,000 × 4 ÷ 209 = 57,416.27 → 57,417 (전에는 통상시급 14,354 로 버려 57,416)', () => {
    expect(holiday.total).toBe(57_417);
    expect(holiday.notes.join(' ')).toContain('14,354.07원');
  });
});

describe('정수로 떨어지는 경우는 바뀌지 않는다 — 월 2,090,000원 ÷ 209 = 시간급 10,000원', () => {
  it('해고예고 2,400,000 · 연차 5일 400,000 · 휴업 단서 800,000 · 공휴일 가산 40,000', () => {
    expect(calcNoticePay({ unit: 'month', amount: 2_090_000, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' }).amount).toBe(2_400_000);
    expect(estimateLeavePay(2_090_000, 40, 5).amount).toBe(400_000);
    const s = calcShutdownAllowance({ fivePlus: true, cause: 'employer', average: { source: 'direct', daily: 200_000 }, ordinary: { unit: 'month', amount: 2_090_000, weeklyHours: 40, dailyHours: 8 }, days: 10 });
    expect([s.dailyOrdinary, s.proviso]).toEqual([80_000, 800_000]);
    expect(calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 2_090_000, worked_hours: 8 }).total).toBe(40_000);
  });
});

describe('공휴일 수당 — 일용·시급(주휴 포함) 경로', () => {
  it('시급 10,030원에 주휴 포함 → 통상시급 10,030 × 5 ÷ 6 = 8,358.33…, 줄마다 올림: 66,867 + 33,434 = 100,301 (전에는 8,358 로 버려 100,296)', () => {
    const r = calcHolidayPay({ worker_type: 'hourly', site_size: 'large', holiday_kind: 'labor_day', hourly_wage: 10_030, hourly_includes_weekly: true, weekly_hours: 40, worked_hours: 8 });
    expect(r.base_hourly).toBeCloseTo(8_358.333333, 5);
    expect(r.breakdown.map((b) => b.amount)).toEqual([66_867, 33_434]);
    expect(r.total).toBe(100_301);
    expect(r.total).toBe(r.breakdown.reduce((s, b) => s + b.amount, 0)); // 합계 = 줄의 합
    expect(r.notes.join(' ')).toContain('8,358.33원');
  });

  it('일급 100,000원 · 8시간 → 통상시급 12,500, 8시간 + 2시간 초과 + 야간 2시간', () => {
    const r = calcHolidayPay({ worker_type: 'daily', site_size: 'large', holiday_kind: 'public_holiday', daily_wage: 100_000, worked_hours: 10, night_hours: 2, paid_continuously: true });
    expect(r.base_hourly).toBe(12_500);
    expect(r.breakdown.map((b) => b.amount)).toEqual([125_000, 50_000, 25_000, 12_500]);
    expect(r.total).toBe(212_500);
  });

  it('월 3,000,000원 · 10시간 · 야간 2시간 — 줄마다 올리므로 합계가 정확한 합의 올림보다 1~2원 많을 수 있다', () => {
    const r = calcHolidayPay({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 3_000_000, worked_hours: 10, night_hours: 2 });
    const exact = (3_000_000 * (0.5 * 8 + 1 * 2 + 0.5 * 2)) / 209; // 100,478.47
    expect(r.breakdown.map((b) => b.amount)).toEqual([0, 57_417, 28_709, 14_355]);
    expect(r.total).toBe(100_481);
    expect(r.total - Math.ceil(exact)).toBe(2);
  });
});

describe('1일 7.5시간 — 시간 소수도 끝수 그대로', () => {
  it('월 3,000,000 · 주 37.5시간(기준 196시간) · 1일 7.5시간 → 1일 114,795.92 · 30일 3,443,877.55 → 3,443,878', () => {
    const r = calcNoticePay({ unit: 'month', amount: 3_000_000, weeklyHours: 37.5, dailyHours: 7.5, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
    expect(r.dailyOrdinary).toBeCloseTo(22_500_000 / 196, 6);
    expect(r.amount).toBe(3_443_878);
    expect(r.amount).not.toBe(114_796 * 30); // 1일 통상임금을 원 단위로 반올림한 뒤 곱하던 값
  });

  it('휴업수당 — 시급 12,345원 · 1일 7.5시간 = 92,587.5원, 단서 3일 = 277,762.5 → 277,763', () => {
    const s = calcShutdownAllowance({ fivePlus: true, cause: 'employer', average: { source: 'direct', daily: 200_000 }, ordinary: { unit: 'hour', amount: 12_345, dailyHours: 7.5 }, days: 3 });
    expect(s.dailyOrdinary).toBe(92_587.5);
    expect(s.proviso).toBe(277_763);
  });
});
