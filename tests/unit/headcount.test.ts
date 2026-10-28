import { describe, expect, it } from 'vitest';
import {
  computeHeadcount,
  annualLeaveCoverage,
  coverageTimeline,
  type HeadcountInput,
} from '@/lib/headcount';

const WEEKDAYS = [1, 2, 3, 4, 5];
const regular = (name: string) => ({ name, start: '2025-01-01', workWeekdays: WEEKDAYS, kind: 'regular' as const });

// 4명 상시 + 2026-11-02~11-30 한 달 계약직 1명, 월~금 영업
const daewon: HeadcountInput = {
  operatingWeekdays: WEEKDAYS,
  closedDates: [],
  threshold: 5,
  workers: [
    regular('A'), regular('B'), regular('C'), regular('D'),
    { name: '계약직', start: '2026-11-02', end: '2026-11-30', workWeekdays: WEEKDAYS, kind: 'regular' },
  ],
};

describe('computeHeadcount — 시행령 제7조의2 ①②', () => {
  it('미달일이 가동일의 절반 이상이면 해당하지 않는다 (11-16)', () => {
    const r = computeHeadcount(daewon, '2026-11-16');
    expect(r.periodStart).toBe('2026-10-16');
    expect(r.periodEnd).toBe('2026-11-15');
    expect(r.operatingDays).toBe(21);
    expect(r.belowDays).toBe(11);
    expect(r.covered).toBe(false);
  });

  it('평균이 5명 미만이어도 미달일이 절반 미만이면 해당한다 (11-17)', () => {
    const r = computeHeadcount(daewon, '2026-11-17');
    expect(r.operatingDays).toBe(21);
    expect(r.personDays).toBe(95);
    expect(r.average).toBeCloseTo(95 / 21, 5);
    expect(r.average).toBeLessThan(5);
    expect(r.belowDays).toBe(10);
    expect(r.covered).toBe(true);
    expect(r.basis).toBe('rule2-1');
  });

  it('계약 종료 뒤에도 미달일이 절반 미만인 동안은 해당한다 (12-15 해당, 12-16 해당 안 함)', () => {
    expect(computeHeadcount(daewon, '2026-12-15').covered).toBe(true);
    const r = computeHeadcount(daewon, '2026-12-16');
    expect(r.operatingDays).toBe(22);
    expect(r.belowDays).toBe(11);
    expect(r.covered).toBe(false);
  });

  it('평균이 5명 이상이어도 미달일이 절반 이상이면 해당하지 않는다 (제2항 제2호)', () => {
    // 10명이 가동일 일부에만 몰려 근무: 평균은 5 이상, 미달일은 절반 이상
    const input: HeadcountInput = {
      operatingWeekdays: WEEKDAYS, closedDates: [], threshold: 5,
      workers: [
        regular('A'), regular('B'),
        ...Array.from({ length: 10 }, (_, i) => ({ name: `단기${i}`, start: '2026-11-02', end: '2026-11-11', workWeekdays: WEEKDAYS, kind: 'regular' as const })),
      ],
    };
    const r = computeHeadcount(input, '2026-11-17');
    expect(r.average).toBeGreaterThanOrEqual(5);
    expect(r.belowDays * 2).toBeGreaterThanOrEqual(r.operatingDays);
    expect(r.covered).toBe(false);
    expect(r.basis).toBe('rule2-2');
  });

  it('근무 요일이 아닌 날은 그 근로자를 세지 않는다 (대법원 2023다275998)', () => {
    const input: HeadcountInput = {
      operatingWeekdays: WEEKDAYS, closedDates: [], threshold: 5,
      workers: [{ name: '파트', start: '2026-01-01', workWeekdays: [1, 3, 5], kind: 'regular' }],
    };
    const r = computeHeadcount(input, '2026-11-17');
    // 10-17~11-16 월·수·금 = 10-19,21,23,26,28,30, 11-2,4,6,9,11,13,16 = 13일
    expect(r.personDays).toBe(13);
  });

  it('파견근로자는 빼고, 동거친족은 다른 근로자가 있는 날에만 센다 (제4항)', () => {
    const base = { start: '2026-01-01', workWeekdays: WEEKDAYS };
    const onlyFamily = computeHeadcount({
      operatingWeekdays: WEEKDAYS, closedDates: [], threshold: 5,
      workers: [{ name: '배우자', kind: 'family', ...base }, { name: '파견', kind: 'dispatched', ...base }],
    }, '2026-11-17');
    expect(onlyFamily.personDays).toBe(0);
    const withRegular = computeHeadcount({
      operatingWeekdays: WEEKDAYS, closedDates: [], threshold: 5,
      workers: [{ name: '배우자', kind: 'family', ...base }, { name: '직원', kind: 'regular', ...base }],
    }, '2026-11-17');
    expect(withRegular.personDays).toBe(2 * withRegular.operatingDays);
  });

  it('휴무일로 지정한 날은 가동일에서 뺀다', () => {
    const r = computeHeadcount({ ...daewon, closedDates: ['2026-11-02'] }, '2026-11-17');
    expect(r.operatingDays).toBe(20);
  });

  it('사업 성립 1개월 미만이면 성립일부터 센다', () => {
    const r = computeHeadcount({ ...daewon, businessStart: '2026-11-02' }, '2026-11-17');
    expect(r.periodStart).toBe('2026-11-02');
    expect(r.operatingDays).toBe(11);
    expect(r.belowDays).toBe(0);
    expect(r.covered).toBe(true);
  });

  it('말일 기준일은 앞 달 말일로 맞춘다', () => {
    expect(computeHeadcount(daewon, '2026-03-31').periodStart).toBe('2026-02-28');
  });

  it('기준 인원 10명(제93조 취업규칙)도 같은 방식으로 센다', () => {
    expect(computeHeadcount({ ...daewon, threshold: 10 }, '2026-11-17').covered).toBe(false);
  });
});

describe('coverageTimeline — 해당 구간', () => {
  it('대원산업 사례: 11-17부터 12-15까지 5인 이상 규정이 적용된다', () => {
    const spans = coverageTimeline(daewon, '2026-10-01', '2027-01-31');
    expect(spans).toEqual([{ from: '2026-11-17', to: '2026-12-15' }]);
  });
});

describe('annualLeaveCoverage — 시행령 제7조의2 ③', () => {
  it('한 달만 5명이면 1년 계속 요건을 채우지 못한다', () => {
    const r = annualLeaveCoverage(daewon, '2026-12-01');
    expect(r.covered).toBe(false);
    expect(r.months.filter((m) => m.covered).length).toBeLessThan(12);
  });

  it('1년 내내 5명이면 채운다', () => {
    const five: HeadcountInput = { ...daewon, workers: ['A', 'B', 'C', 'D', 'E'].map(regular) };
    const r = annualLeaveCoverage(five, '2026-12-01');
    expect(r.months).toHaveLength(12);
    expect(r.covered).toBe(true);
  });
});
