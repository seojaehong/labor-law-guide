import { describe, expect, it } from 'vitest';
import { calcNoticePay } from '@/lib/calc/notice-pay';

// 해고예고수당 — 30일 전에 예고하지 않으면 30일분 이상의 통상임금(근로기준법 §26 본문).
// 1일 통상임금 = 시간급 × 1일 소정근로시간(시행령 §6③). 계속 근로 3개월 미만이면 적용하지 않는다(§26 단서 1호).
// 기대값은 손으로 곱한 것이다.

const base = { hireDate: '2025-01-02', dismissalDate: '2026-11-30', dailyHours: 8 };

describe('해고예고수당', () => {
  it('예고 없이 — 시급 10,320 × 8시간 × 30일 = 2,476,800', () => {
    const r = calcNoticePay({ ...base, unit: 'hour', amount: 10_320 });
    expect(r.status).toBe('pay');
    expect(r.dailyOrdinary).toBe(82_560);
    expect(r.amount).toBe(2_476_800);
  });

  it('월급은 시간급으로 바꾼 뒤 곱한다 — 2,156,880 ÷ 209 × 8 × 30 = 2,476,800', () => {
    expect(calcNoticePay({ ...base, unit: 'month', amount: 2_156_880, weeklyHours: 40 }).amount).toBe(2_476_800);
  });

  it('1일 소정근로시간이 8시간보다 짧으면 그만큼 — 시급 12,000 × 5시간 × 30 = 1,800,000', () => {
    expect(calcNoticePay({ ...base, unit: 'hour', amount: 12_000, dailyHours: 5 }).amount).toBe(1_800_000);
  });

  it('30일 전에 예고했으면 없다 — 30일 경계 양쪽', () => {
    expect(calcNoticePay({ ...base, unit: 'hour', amount: 10_320, noticeDate: '2026-10-31' }).status).toBe('noticed'); // 30일 전
    const short = calcNoticePay({ ...base, unit: 'hour', amount: 10_320, noticeDate: '2026-11-01' }); // 29일 전
    expect(short.status).toBe('short');
    expect(short.noticeDays).toBe(29);
    expect(short.amount).toBe(2_476_800);
  });

  it('계속 근로 3개월 미만이면 적용하지 않는다 — 경계 양쪽', () => {
    expect(calcNoticePay({ ...base, hireDate: '2026-09-01', unit: 'hour', amount: 10_320 }).status).toBe('pay'); // 9.1 ~ 11.30 해고 = 3개월
    const r = calcNoticePay({ ...base, hireDate: '2026-09-02', unit: 'hour', amount: 10_320 });
    expect(r.status).toBe('under3m');
    expect(r.amount).toBe(0);
  });

  it('잘못된 날짜·입력은 오류', () => {
    expect(() => calcNoticePay({ ...base, hireDate: '2026-02-30', unit: 'hour', amount: 10_320 })).toThrow();
    expect(() => calcNoticePay({ ...base, dismissalDate: '2024-12-31', unit: 'hour', amount: 10_320 })).toThrow();
    expect(() => calcNoticePay({ ...base, noticeDate: '2026-12-01', unit: 'hour', amount: 10_320 })).toThrow();
    expect(() => calcNoticePay({ ...base, dailyHours: 0, unit: 'hour', amount: 10_320 })).toThrow();
  });
});
