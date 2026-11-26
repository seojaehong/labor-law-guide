import { describe, expect, it } from 'vitest';
import { settleOnTermination, type SettlementInput } from '@/lib/leave/leave-ledger';
import { calcLeavePay, OLD_60_3_LAST_ACCRUAL } from '@/lib/calc/leave-pay';
import { bannedHits } from '@/lib/tool-kit/banned';

// 퇴직 연차 정산 — 입사 첫해 월 단위 연차(최대 11일)는 법정 발생 원장의 일부다. 화면 선택으로 늘거나 줄지 않는다.
// 규칙(연차수당 계산기 leave-pay 와 같은 규칙):
//   · 근속 1년 미만 → 월 단위 연차만
//   · 1년차 15일 발생일 ≤ 2018-05-29 → 구 제60조제3항: 첫해 월 연차는 그 15일 안에 포함(따로 더하지 않음, 법제처 18-0067)
//   · 그 뒤 → 월 단위 연차 + 15일을 따로 센다(대법원 2021다227100)
// 입력은 전부 합성 값이다.

const base = (o: Partial<SettlementInput>): SettlementInput => ({
  hireDate: '2025-01-01', endDate: '2026-01-01', fiscalGrantedTotal: 15, usedOrPaidTotal: 15, ...o,
});

describe('신법 — 선택이 법정 11일을 없애지 못한다', () => {
  for (const opt of [true, false, undefined]) {
    it(`입사 2025-01-01 · 마지막 재직 2026-01-01 · 선택 ${String(opt)} → 발생 26, 정산 11`, () => {
      const r = settleOnTermination(base({ includeFirstYearMonthly: opt }));
      expect(r.hireDateTotal).toBe(26);
      expect(r.shortfallDays).toBe(11);
      expect(r.verdict).toBe('shortfall');
    });
  }
  it('마지막 재직 2025-12-31(1년 근로 후 바로 종료) → 발생 11', () => {
    const r = settleOnTermination(base({ endDate: '2025-12-31', fiscalGrantedTotal: 0, usedOrPaidTotal: 0 }));
    expect(r.hireDateTotal).toBe(11);
  });
});

describe('구법(1년차 발생 ≤ 2018-05-29) — 선택이 11일을 부풀리지 못한다', () => {
  for (const opt of [true, false, undefined]) {
    it(`입사 2016-01-04 · 마지막 재직 2026-11-20 · 선택 ${String(opt)} → 누계 170, 정산 20`, () => {
      const r = settleOnTermination({ hireDate: '2016-01-04', endDate: '2026-11-20', fiscalGrantedTotal: 160, usedOrPaidTotal: 150, includeFirstYearMonthly: opt });
      expect(r.hireDateTotal).toBe(170);
      expect(r.shortfallDays).toBe(20);
    });
  }
});

describe('경계일 양쪽', () => {
  it('상수는 leave-pay 와 같은 2018-05-29', () => expect(OLD_60_3_LAST_ACCRUAL).toBe('2018-05-29'));
  it('입사 2017-05-29(1년차 발생 2018-05-29, 구법) → 15+15 = 30', () => {
    const r = settleOnTermination({ hireDate: '2017-05-29', endDate: '2019-06-30', fiscalGrantedTotal: 0, usedOrPaidTotal: 0, includeFirstYearMonthly: true });
    expect(r.hireDateTotal).toBe(30);
  });
  it('입사 2017-05-30(1년차 발생 2018-05-30, 신법) → 11+15+15 = 41', () => {
    const r = settleOnTermination({ hireDate: '2017-05-30', endDate: '2019-06-30', fiscalGrantedTotal: 0, usedOrPaidTotal: 0, includeFirstYearMonthly: false });
    expect(r.hireDateTotal).toBe(41);
  });
  it('구법 시기라도 1년을 못 채우면 월 단위 연차만 센다', () => {
    const r = settleOnTermination({ hireDate: '2017-01-01', endDate: '2017-12-31', fiscalGrantedTotal: 0, usedOrPaidTotal: 0 });
    expect(r.hireDateTotal).toBe(11);
  });
});

describe('근거 문장', () => {
  it('구법·신법 문장 모두 금지어가 없다', () => {
    const oldNote = settleOnTermination({ hireDate: '2016-01-04', endDate: '2026-11-20', fiscalGrantedTotal: 160, usedOrPaidTotal: 150 }).groundNote;
    const newNote = settleOnTermination(base({})).groundNote;
    expect(oldNote).toContain('제60조제3항');
    expect(newNote).toContain('11일');
    expect(bannedHits(oldNote + newNote)).toEqual([]);
  });
});

describe('연차수당 계산기와 같은 원장', () => {
  const pairs: [string, string][] = [
    ['2016-01-04', '2026-11-20'], ['2017-05-29', '2019-06-30'], ['2017-05-30', '2019-06-30'],
    ['2025-01-01', '2026-01-01'], ['2025-01-01', '2025-12-31'], ['2024-07-01', '2025-01-31'],
  ];
  for (const [hireDate, lastWorkDate] of pairs) {
    it(`${hireDate} ~ ${lastWorkDate}`, () => {
      const s = settleOnTermination({ hireDate, endDate: lastWorkDate, fiscalGrantedTotal: 0, usedOrPaidTotal: 0 });
      const p = calcLeavePay({
        timing: 'termination', fivePlus: true, weeklyHours: 40, dailyHours: 8, asOf: '2026-11-24',
        rate: { basis: 'ordinary-wage', unit: 'hour', amount: 12_000 },
        days: { source: 'ledger', hireDate, lastWorkDate, usedDays: 0 },
      });
      expect(s.hireDateTotal).toBe(p.ledger!.total);
    });
  }
});
