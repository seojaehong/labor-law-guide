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

  // 261124 검수 P2 #12 — 「알렸다」를 골랐는데 날짜가 비면 예고 없음(30일분 2,880,000)으로 바뀌었다. 판정할 수 없는 입력이라 멈춘다.
  describe('예고했다 + 빈 날짜 = 입력 오류', () => {
    const q = { hireDate: '2025-01-02', dismissalDate: '2026-10-31', unit: 'hour' as const, amount: 12_000, dailyHours: 8 };
    it('noticed: true 에 날짜가 없으면 멈춘다', () => {
      expect(() => calcNoticePay({ ...q, noticed: true })).toThrow(/알린 날/);
      expect(() => calcNoticePay({ ...q, noticed: true, noticeDate: '' })).toThrow(/알린 날/);
    });
    it('빈 문자열 날짜도 「예고 없음」으로 읽지 않는다', () => {
      expect(() => calcNoticePay({ ...q, noticeDate: '' })).toThrow(/알린 날/);
    });
    it('「알리지 않았다」인데 날짜가 있으면 모순이라 멈춘다', () => {
      expect(() => calcNoticePay({ ...q, noticed: false, noticeDate: '2026-10-01' })).toThrow(/알리지 않았다/);
    });
    it('예고하지 않았다(noticed: false·생략)는 그대로 30일분', () => {
      expect(calcNoticePay({ ...q, noticed: false }).amount).toBe(2_880_000);
      expect(calcNoticePay(q).amount).toBe(2_880_000);
    });
    it('날짜가 있으면 그대로 판정 — 10.1 = 30일 전 없음, 10.2 = 29일 전 30일분', () => {
      expect(calcNoticePay({ ...q, noticed: true, noticeDate: '2026-10-01' }).status).toBe('noticed');
      expect(calcNoticePay({ ...q, noticed: true, noticeDate: '2026-10-02' }).amount).toBe(2_880_000);
    });
  });

  // 261124 검수 P2 #12 — 단시간 근로자의 1일 소정근로시간은 4주 소정 ÷ 통상 근로자 4주 소정근로일 수(시행령 §9 별표2 제2호가목·나목).
  describe('단시간 근로자 1일 소정근로시간', () => {
    it('주 24시간 월급 1,200,000 — 1일 8시간을 넣어도 24 ÷ 5 = 4.8시간 → 9,600 × 4.8 × 30 = 1,382,400', () => {
      // 월 기준시간 = (24 + 4.8) × 365 ÷ 84 = 125.14 → 125, 시간급 9,600
      const r = calcNoticePay({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24, partTime: {} });
      expect(r.appliedDailyHours).toBe(4.8);
      expect(r.hourly).toBe(9_600);
      expect(r.amount).toBe(1_382_400);
    });
    it('단시간을 고르지 않으면 넣은 1일 시간 그대로(종전) — 2,304,000', () => {
      const r = calcNoticePay({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24 });
      expect(r.appliedDailyHours).toBe(8);
      expect(r.amount).toBe(2_304_000);
    });
    it('통상 근로자가 주 6일이면 ÷ 6 — 시급 10,000 주 24시간 → 4시간 × 30 = 1,200,000', () => {
      const r = calcNoticePay({ ...base, unit: 'hour', amount: 10_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: 6 } });
      expect(r.appliedDailyHours).toBe(4);
      expect(r.amount).toBe(1_200_000);
    });
    it('일급은 시간급을 그날 시간으로 구한 뒤 별표2 시간을 곱한다 — 일급 80,000(8시간) 주 24시간 → 10,000 × 4.8 × 30 = 1,440,000', () => {
      const r = calcNoticePay({ ...base, unit: 'day', amount: 80_000, weeklyHours: 24, partTime: {} });
      expect(r.hourly).toBe(10_000);
      expect(r.amount).toBe(1_440_000);
    });
    it('주 15시간 미만이면 주휴가 없어 월 기준시간에 넣지 않는다 — 주 12시간 월 600,000 → 12 × 365 ÷ 84 = 52시간, 2.4시간 × 30 = 830,770', () => {
      // 주휴를 넣으면 (12 + 2.4) × 365 ÷ 84 = 63시간이 된다(근로기준법 제18조 제3항 — 제55조 적용 없음)
      const r = calcNoticePay({ ...base, unit: 'month', amount: 600_000, weeklyHours: 12, partTime: {} });
      expect(r.appliedDailyHours).toBe(2.4);
      expect(r.hourly).toBeCloseTo(600_000 / 52, 6);
      expect(r.amount).toBe(830_770);
    });
    it('주 15시간이면 주휴를 넣는다 — 15 + 3 = 18시간 × 365 ÷ 84 = 78시간', () => {
      const r = calcNoticePay({ ...base, unit: 'month', amount: 780_000, weeklyHours: 15, partTime: {} });
      expect(r.hourly).toBe(10_000);
      expect(r.amount).toBe(900_000);
    });
    it('단시간인데 1주 소정근로시간이 없거나 통상 근로자(40시간) 이상이면 오류', () => {
      expect(() => calcNoticePay({ ...base, unit: 'hour', amount: 10_000, partTime: {} })).toThrow(/1주 소정근로시간/);
      expect(() => calcNoticePay({ ...base, unit: 'hour', amount: 10_000, weeklyHours: 40, partTime: {} })).toThrow(/통상 근로자/);
      expect(() => calcNoticePay({ ...base, unit: 'hour', amount: 10_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: 0 } })).toThrow();
    });
  });
});
