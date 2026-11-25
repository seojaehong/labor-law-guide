// 261124 도구 검수 「① 날짜 기준」 묶음(P3 #8·#9·#4, P2 #17) — 날짜를 무엇 기준으로 잡느냐의 결함.
// 값은 모두 합성이다.
import { describe, expect, it } from 'vitest';
import { addDays, annualLeaveCoverage, annualLeaveTimeline, type HeadcountInput } from '@/lib/headcount';
import { answerPlan, type Plan } from '@/lib/headcount-plan';
import { rateOn } from '@/content/rates';
import { calcTakeHomePay, takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';

// ── #8 상시인원 월말 개업 — 시행령 제7조의2 제3항 「발생일 전 1년 동안 계속하여」 ──
const ALL = [0, 1, 2, 3, 4, 5, 6];
const shop = (open: string): HeadcountInput => ({
  operatingWeekdays: ALL,
  closedDates: [],
  threshold: 5,
  businessStart: open,
  workers: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, start: open, workWeekdays: ALL, kind: 'regular' as const })),
});
const anniversary = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;

describe('#8 연차 상시인원 — 1주년 당일에 직전 1년을 채운다', () => {
  for (const open of ['2025-01-29', '2025-01-30', '2025-01-31', '2025-03-29', '2025-03-30', '2025-03-31', '2025-05-31', '2025-08-31', '2025-03-15']) {
    it(`${open} 개업 → 1주년 당일 해당, 전날 해당 안 함`, () => {
      const day = anniversary(open);
      const on = annualLeaveCoverage(shop(open), day);
      expect(on.covered).toBe(true);
      expect(on.months[0].periodStart).toBe(open);
      expect(on.months.at(-1)!.periodEnd).toBe(addDays(day, -1));
      expect(annualLeaveCoverage(shop(open), addDays(day, -1)).covered).toBe(false);
    });
  }

  it('열두 달이 빈틈없이 이어진다(2026-03-31 기준: 3-31, 4-30, …, 2-28 경계)', () => {
    const r = annualLeaveCoverage(shop('2025-03-31'), '2026-03-31');
    expect(r.months.map((m) => m.periodStart)).toEqual([
      '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30', '2025-07-31', '2025-08-31',
      '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28',
    ]);
    for (let i = 1; i < 12; i++) expect(addDays(r.months[i - 1].periodEnd, 1)).toBe(r.months[i].periodStart);
  });

  it('한 달이라도 5명 미만이면 해당하지 않는다', () => {
    const input = shop('2025-01-31');
    input.workers[4] = { ...input.workers[4], end: '2025-06-10' };
    input.workers.push({ name: 'F', start: '2025-07-20', workWeekdays: ALL, kind: 'regular' });
    expect(annualLeaveCoverage(input, '2026-01-31').covered).toBe(false);
  });

  for (const open of ['2025-01-29', '2025-01-31', '2025-03-31']) {
    it(`타임라인도 ${open} 개업이면 1주년 당일부터 시작한다`, () => {
      const day = anniversary(open);
      const spans = annualLeaveTimeline(shop(open), addDays(day, -5), addDays(day, 40));
      expect(spans).toEqual([{ from: day, to: addDays(day, 40) }]);
    });
  }
});

describe('#8 화면·MCP 경로(answerPlan) — 연차 적용 시작일 = 개업 1주년', () => {
  for (const open of ['2025-01-31', '2025-03-31', '2025-03-15']) {
    it(`${open} 개업, 매일 5명 → 연차 ${anniversary(open)}부터`, () => {
      const plan: Plan = {
        site: { openDays: ALL, closedDates: [], businessStart: open },
        crews: [{ id: 'c1', count: 5, from: open, days: 'site', kind: 'regular' }],
      };
      const ans = answerPlan(plan, open);
      expect(ans.leave).toEqual({ kind: 'from', date: anniversary(open) });
    });
  }
});

// ── #17 rates — 2025. 7.~2026. 6. 국민연금 상·하한(보건복지부고시 제2025-24호) ──
describe('#17 rates — 2026년 상반기', () => {
  it('국민연금 기준소득월액 2025. 7.~2026. 6. 40만·637만, 2026. 7.부터 41만·659만', () => {
    expect(rateOn('npsIncomeFloor', '2026-06-30')?.value).toBe(400_000);
    expect(rateOn('npsIncomeCap', '2026-06-30')?.value).toBe(6_370_000);
    expect(rateOn('npsIncomeCap', '2025-07-01')?.value).toBe(6_370_000);
    expect(rateOn('npsIncomeCap', '2026-07-01')?.value).toBe(6_590_000);
    expect(rateOn('npsIncomeCap', '2025-06-30')).toBeNull();
  });

  it('간이세액표(2026. 2. 27. 개정)는 2026. 3. 1. 이후 원천징수분부터 — 그 전 날짜는 요율 없음으로 멈춘다', () => {
    expect(takeHomeRatesOn('2026-02-28')).toBeNull();
    expect(takeHomeRatesOn('2026-01-15')).toBeNull();
    expect(takeHomeRatesOn('2025-11-01')).toBeNull();
    expect(takeHomeRatesOn('2026-03-01')).not.toBeNull();
  });

  it('월 701만원 국민연금 근로자 몫 — 6월 302,570원, 7월 313,020원', () => {
    const june = calcTakeHomePay({ pay: 7_010_000, family: 1 }, takeHomeRatesOn('2026-06-30')!);
    const july = calcTakeHomePay({ pay: 7_010_000, family: 1 }, takeHomeRatesOn('2026-07-01')!);
    if (june.status !== 'ok' || july.status !== 'ok') throw new Error('계산되지 않음');
    expect(june.nps).toBe(302_570);
    expect(july.nps).toBe(313_020);
  });
});

// ── #9 계약작성 — 실수령액 역산은 계약 시작일 요율로, 없으면 오늘 값으로 바꾸지 않고 멈춘다 ──
const NET: WriteState = {
  ...INITIAL,
  workplaceName: '합성상사',
  employeeName: '합성근로자',
  duty: '사무',
  location: '본점',
  payType: 'monthly',
  amountMode: 'net',
  netPay: '5,800,000',
  family: '1',
  writtenDate: '2026-05-20',
};

describe('#9 계약작성 실수령 역산 — 계약 시작일 기준', () => {
  it('6월 계약을 11월에 작성해도 6월 요율(연금 상한 637만)로 역산하고 기준일을 밝힌다', () => {
    const june = toWriteForm({ ...NET, startDate: '2026-06-01' }, '2026-11-24');
    const july = toWriteForm({ ...NET, startDate: '2026-07-01' }, '2026-11-24');
    expect(june.error).toBeUndefined();
    expect(july.error).toBeUndefined();
    // 같은 실수령액이라도 연금 상한이 낮은 6월 총액이 더 작다
    expect(june.form!.monthlyTotal!).toBeLessThan(july.form!.monthlyTotal!);
    expect(june.netNote).toContain('2026-06-01');
  });

  for (const start of ['2026-02-01', '2027-07-01']) {
    it(`요율이 없는 시작일(${start})은 오늘 값으로 바꾸지 않고 멈춘다`, () => {
      const r = toWriteForm({ ...NET, startDate: start }, '2026-11-24');
      expect(r.form).toBeNull();
      expect(r.error).toContain(start);
      expect(r.error).toContain('월 임금 총액');
    });
  }
});

// ── #4 주휴 금요일 퇴사 — 근로관계가 주휴일까지 이어지는지(퇴사일 = 재직 마지막 날) ──
describe('#4 주휴 퇴사 주', () => {
  const base = { hourlyWage: 10_320, weeklyHours: 40, fullAttendance: true };
  it('주휴일 전에 근로관계가 끝나면(금요일 퇴사일) 0원', () => {
    const r = calcWeeklyHoliday({ ...base, endsBeforeRestDay: true });
    expect(r.status).toBe('ended');
    expect(r.amount).toBe(0);
  });
  it('주휴일까지 이어지면(퇴사일 일요일) 82,560원', () => {
    expect(calcWeeklyHoliday({ ...base, endsBeforeRestDay: false }).amount).toBe(82_560);
  });
  it('묻지 않으면 평상 주 — 82,560원', () => {
    expect(calcWeeklyHoliday(base).amount).toBe(82_560);
  });
  it('15시간 미만이면 퇴사 여부와 상관없이 under15', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 14, endsBeforeRestDay: true }).status).toBe('under15');
  });
});
