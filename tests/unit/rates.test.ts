import { describe, expect, it } from 'vitest';
import { RATES, rateOn, type RateKey } from '@/content/rates';
import { todayKst } from '@/lib/tool-kit';

// 법정 숫자는 날짜 축으로 둔다. 기준일에 맞는 값이 없으면 null — 다른 해 값으로 조용히 대신하지 않는다.
// 끝나는 날이 정해진 값(고시로 1년씩 정하는 것)은 끝나기 60일 전부터 이 시험이 실패한다.
// 실패하면 다음 고시를 원문으로 확인해 줄을 더한다.

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('rates — 값 고르기', () => {
  it('최저임금은 해마다 고시 값', () => {
    expect(rateOn('minWageHourly', '2026-12-31')?.value).toBe(10_320);
    expect(rateOn('minWageHourly', '2027-01-01')?.value).toBe(10_700);
  });

  it('고시가 없는 해는 null — 앞 해 값으로 대신하지 않는다', () => {
    expect(rateOn('minWageHourly', '2028-01-01')).toBeNull();
    expect(rateOn('minWageHourly', '2025-12-31')).toBeNull();
  });

  it('국민연금 근로자 몫은 부칙 제4조대로 해마다 오른다', () => {
    expect(rateOn('npsEmployeePerMillion', '2026-06-30')?.value).toBe(47_500);
    expect(rateOn('npsEmployeePerMillion', '2027-01-01')?.value).toBe(50_000);
    expect(rateOn('npsEmployeePerMillion', '2032-12-31')?.value).toBe(62_500);
    expect(rateOn('npsEmployeePerMillion', '2033-01-01')?.value).toBe(65_000);
  });

  it('국민연금 기준소득월액 상·하한은 7월에 바뀐다', () => {
    expect(rateOn('npsIncomeFloor', '2026-07-01')?.value).toBe(410_000);
    expect(rateOn('npsIncomeCap', '2027-06-30')?.value).toBe(6_590_000);
    expect(rateOn('npsIncomeCap', '2026-06-30')).toBeNull();
  });

  it('건강·장기요양·고용보험 근로자 몫', () => {
    expect(rateOn('healthEmployeePerMillion', '2026-10-28')?.value).toBe(35_950);
    expect(rateOn('ltcEmployeePerMillion', '2026-10-28')?.value).toBe(4_724);
    expect(rateOn('employmentEmployeePerMillion', '2026-10-28')?.value).toBe(9_000);
  });

  it('건강보험 월 보험료 상·하한은 해마다 다시 고시한다(시행령 제32조) — 2026년분만 있다', () => {
    expect(rateOn('healthPremiumFloor', '2026-12-31')?.value).toBe(20_160);
    expect(rateOn('healthPremiumCap', '2026-12-31')?.value).toBe(9_183_480);
    expect(rateOn('healthPremiumFloor', '2027-01-01')).toBeNull();
    expect(rateOn('healthPremiumCap', '2027-01-01')).toBeNull();
  });

  it('임금 지연이자율은 2005. 7. 1. 시행분부터 연 100분의 20 — 그 전은 null', () => {
    expect(rateOn('wageDelayInterestPerMillion', '2005-06-30')).toBeNull();
    expect(rateOn('wageDelayInterestPerMillion', '2005-07-01')?.value).toBe(200_000);
    expect(rateOn('wageDelayInterestPerMillion', '2026-10-29')?.value).toBe(200_000);
  });
});

describe('rates — 장부 규칙', () => {
  const keys = Object.keys(RATES) as RateKey[];

  it('줄마다 근거와 확인한 날이 있다', () => {
    for (const k of keys) for (const r of RATES[k]) {
      expect(r.basis.length, k).toBeGreaterThan(5);
      expect(r.checked, k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('기간이 겹치거나 비지 않는다', () => {
    for (const k of keys) {
      const rows = RATES[k];
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].until, `${k} ${rows[i - 1].from}`).toBeDefined();
        expect(addDays(rows[i - 1].until!, 1), `${k} ${rows[i].from}`).toBe(rows[i].from);
      }
    }
  });

  it('끝나는 날이 정해진 값은 60일 넘게 남아 있다 — 다음 고시를 미리 넣는다', () => {
    const limit = addDays(todayKst(), 60);
    const soon = keys.filter((k) => {
      const last = RATES[k][RATES[k].length - 1];
      return last.until !== undefined && last.until < limit;
    });
    expect(soon, '다음 고시를 원문으로 확인해 rates.ts 에 더하세요').toEqual([]);
  });
});
