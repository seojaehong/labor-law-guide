// 261124 도구 검수 「① 날짜 기준」 묶음(P3 #8·#9·#4, P2 #17) — 날짜를 무엇 기준으로 잡느냐의 결함.
// 값은 모두 합성이다.
import { describe, expect, it } from 'vitest';
import { addDays, annualLeaveCoverage, annualLeaveTimeline, computeHeadcount, type HeadcountInput } from '@/lib/headcount';
import { answerPlan, explainLeave, type Plan } from '@/lib/headcount-plan';
import { LEAVE_MONTHS_NOTE, leaveMonthLine } from '@/app/tools/headcount/copy';
import { rateOn } from '@/content/rates';
import { WITHHOLDING_UNTIL, calcTakeHomePay, takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import {
  ENDED_BASIS, ENDED_VERDICT, EXIT_DAY_DEFINITION, JOINED_BASIS, JOINED_VERDICT, STATUS_STOP, WEEK_NOTE, WEEK_SPANS, weekSpanInput,
  weeklyHolidayView, type WeekSpan,
} from '@/app/tools/weekly-holiday-pay/result';
import { bannedHits } from '@/lib/tool-kit/banned';
import { readFileSync } from 'node:fs';

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

  // G4 I3(261126)로 기대값을 바꿨다 — 종전 「3-31, 4-30, …, 1-31, 2-28 시작·겹침 없음」. 이제 각 달은 그 달 기준일
  // (4-30, 5-31, …, 2-28, 3-31)의 1개월 산정 구간이라 짧은 달 뒤에서 앞 달과 겹친다. 빈틈은 여전히 없다.
  it('열두 달이 빈틈없이 1년을 덮는다(2026-03-31 기준 — 각 달 = 그 달 기준일의 1개월 산정, 겹침 허용)', () => {
    const r = annualLeaveCoverage(shop('2025-03-31'), '2026-03-31');
    expect(r.months.map((m) => m.periodStart)).toEqual([
      '2025-03-31', '2025-04-30', '2025-05-30', '2025-06-30', '2025-07-31', '2025-08-30',
      '2025-09-30', '2025-10-30', '2025-11-30', '2025-12-31', '2026-01-28', '2026-02-28',
    ]);
    expect(r.months[0].periodStart).toBe('2025-03-31');
    expect(r.months.at(-1)!.periodEnd).toBe('2026-03-30');
    for (let i = 1; i < 12; i++) {
      expect(r.months[i].periodStart <= addDays(r.months[i - 1].periodEnd, 1)).toBe(true);
      expect(r.months[i].periodEnd > r.months[i - 1].periodEnd).toBe(true);
    }
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

// ── G4 I3(261126) 연차 월별 판정의 각 달 = 그 달 기준일의 날짜별 1개월 산정(「날짜별 계산 보기」와 같은 구간) ──
// 시행령 제7조의2 제3항 「제1항 및 제2항에 따라 월 단위로」 — 달마다 ①의 「그날 전 1개월」 구간을 쓴다.
describe('G4 I3 연차 월 경계 = 날짜별 1개월 산정', () => {
  // astra A14 재현: 2025-03-31 개업, 매일 4명 + 다섯째는 2026-01-28~02-12 부재
  const gap = (): HeadcountInput => {
    const input = shop('2025-03-31');
    input.workers[4] = { ...input.workers[4], end: '2026-01-27' };
    input.workers.push({ name: 'F', start: '2026-02-13', workWeekdays: ALL, kind: 'regular' });
    return input;
  };

  it('2026-02-28 날짜별 산정 — 1-28~2-27, 5명 미만 16일/31일 → 5인 이상으로 보지 않음', () => {
    const r = computeHeadcount(gap(), '2026-02-28');
    expect([r.periodStart, r.periodEnd, r.belowDays, r.operatingDays, r.covered]).toEqual(['2026-01-28', '2026-02-27', 16, 31, false]);
  });

  it('2026-03-31 연차 판정의 2월 달도 같은 구간·같은 결론 → 연차 해당 안 함(종전 1-31~2-27, 13일/28일로 해당)', () => {
    const r = annualLeaveCoverage(gap(), '2026-03-31');
    const feb = r.months.find((m) => m.periodEnd === '2026-02-27')!;
    expect([feb.periodStart, feb.covered]).toEqual(['2026-01-28', false]);
    expect(r.covered).toBe(false);
    // 화면·MCP 경로(answerPlan)도 2026-03-31 을 연차 적용일로 넣지 않는다
    const leave = answerPlan({
      site: { openDays: ALL, closedDates: [], businessStart: '2025-03-31' },
      crews: [
        { id: 'c1', count: 4, from: '2025-03-31', days: 'site', kind: 'regular' },
        { id: 'c2', count: 1, from: '2025-03-31', to: '2026-01-27', days: 'site', kind: 'regular' },
        { id: 'c3', count: 1, from: '2026-02-13', days: 'site', kind: 'regular' },
      ],
    }, '2026-03-01').leave;
    const on = (d: string) =>
      leave.kind === 'always' || (leave.kind === 'from' && d >= leave.date) || (leave.kind === 'spans' && leave.spans.some((s) => s.from <= d && d <= s.to));
    expect(on('2026-03-31')).toBe(false);
  });

  for (const base of ['2026-03-31', '2026-01-31', '2026-05-31', '2026-03-30', '2026-03-15', '2028-02-29', '2027-02-28']) {
    it(`${base} 연차 판정 — 둘째~열두째 달은 그 달 기준일(끝 다음 날)의 날짜별 산정과 구간·평균·결론이 같다`, () => {
      const input = { ...gap(), businessStart: undefined };
      const r = annualLeaveCoverage(input, base);
      for (const m of r.months.slice(1)) {
        const one = computeHeadcount(input, addDays(m.periodEnd, 1));
        expect([m.periodStart, m.periodEnd, m.average, m.covered]).toEqual([one.periodStart, one.periodEnd, one.average, one.covered]);
      }
    });
  }

  it('첫 달만 1년 밖으로 나가지 않게 기준일 12개월 전에서 자른다 — 그 달은 날짜별 산정보다 짧을 수 있다', () => {
    const input = { ...gap(), businessStart: undefined };
    // 2026-01-31 기준: 첫 달 기준일 2025-02-28 의 날짜별 산정은 2025-01-28~, 연차 첫 달은 2025-01-31~
    const r = annualLeaveCoverage(input, '2026-01-31');
    expect([r.months[0].periodStart, r.months[0].periodEnd]).toEqual(['2025-01-31', '2025-02-27']);
    expect(computeHeadcount(input, '2025-02-28').periodStart).toBe('2025-01-28');
  });

  it('타임라인도 같은 달 구간으로 판단한다 — 날짜마다 annualLeaveCoverage 와 같다', () => {
    const input = gap();
    const from = '2026-03-25';
    const to = '2026-05-10';
    const slow: { from: string; to: string }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!annualLeaveCoverage(input, d).covered) continue;
      const last = slow.at(-1);
      if (last && addDays(last.to, 1) === d) last.to = d;
      else slow.push({ from: d, to: d });
    }
    expect(annualLeaveTimeline(input, from, to)).toEqual(slow);
  });
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

// ── G4 I5(261126) 간이세액표 재확인 기한 — 별표 2 에는 끝나는 날이 없어 다음 개정 시기(3. 1.) 전날까지만 쓴다 ──
describe('G4 I5 간이세액표 재확인 기한', () => {
  it('2027-02-28 까지는 요율 묶음이 있고 2027-03-01 부터는 null(옛 표로 조용히 계산하지 않는다)', () => {
    expect(WITHHOLDING_UNTIL).toBe('2027-02-28');
    expect(takeHomeRatesOn('2027-02-28')).not.toBeNull();
    expect(takeHomeRatesOn('2027-03-01')).toBeNull();
    expect(takeHomeRatesOn('2027-06-30')).toBeNull();
  });

  it('계약작성 실수령 역산도 2027-03-01 이후 시작이면 멈춘다(종전 2027-06-30 → 7,397,720원)', () => {
    const late = toWriteForm({ ...NET, startDate: '2027-06-30' }, '2026-11-24');
    expect(late.form).toBeNull();
    expect(late.error).toContain('2027-06-30');
    expect(late.error).toContain('월 임금 총액');
    expect(toWriteForm({ ...NET, startDate: '2027-02-28' }, '2026-11-24').error).toBeUndefined();
  });
});

// ── #4 주휴 퇴사 주 — G4 D1(261126)로 기준을 바꿨다: 「퇴사일이 주휴일 전인가」 → 「그 주(연속 7일) 7일째 전인가」 ──
describe('#4 주휴 퇴사 주', () => {
  const base = { hourlyWage: 10_320, weeklyHours: 40, fullAttendance: true };
  it('그 주 7일째 전에 근로관계가 끝나면(월~일 주, 금요일 퇴사일) 0원', () => {
    const r = calcWeeklyHoliday({ ...base, endsBeforeWeekEnd: true });
    expect(r.status).toBe('ended');
    expect(r.amount).toBe(0);
  });
  it('7일째까지 이어지면(퇴사일 일요일) 82,560원', () => {
    expect(calcWeeklyHoliday({ ...base, endsBeforeWeekEnd: false }).amount).toBe(82_560);
  });
  it('묻지 않으면 평상 주 — 82,560원', () => {
    expect(calcWeeklyHoliday(base).amount).toBe(82_560);
  });
  it('15시간 미만이면 퇴사 여부와 상관없이 under15', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 14, endsBeforeWeekEnd: true }).status).toBe('under15');
  });
});

// ── G4 D1(261126 재홍님 결정) 퇴사 주 = 1주(연속 7일)의 마지막 날(7일째)까지 근로관계가 이어져야 생긴다 ──
// 주휴일 요일과 상관없다. 입사 주는 E1(아래)로 바뀌었다 — 0원으로 단정하지 않고 금액 없이 「확인 필요」.
// 근거: 임금근로시간과-1736(2021. 8. 4.) 「최소한 1주 동안의 근로관계 존속을 전제로 한다고 봄이 타당」(첫 근거, G4 R1),
// 고용노동부 1350 답변(2025. 9. 15.) 「1주 7일의 마지막날(7일째가 되는 날)…」(보조).
describe('G4 D1 주휴 1주(연속 7일) 존속 기준', () => {
  const NONE: WeekSpan = { joined: false, endsBefore: false };
  const JOINED: WeekSpan = { joined: true, endsBefore: false };
  const BEFORE: WeekSpan = { joined: false, endsBefore: true };
  const at = (weeklyHours: number, span: WeekSpan) =>
    calcWeeklyHoliday({ hourlyWage: 10_320, weeklyHours, fullAttendance: true, ...weekSpanInput(span) });

  it('화면 체크 → 엔진 입력: 둘 다 안 고르면 생기고, 7일째 전 퇴사는 0원, 주중 입사는 금액 없음(E1), 둘 다면 0원(R7)', () => {
    expect(WEEK_SPANS.map((s) => [s.joined, s.endsBefore, at(40, s).status, at(40, s).amount])).toEqual([
      [false, false, 'paid', 82_560],
      [true, false, 'joined-unclear', null],
      [false, true, 'ended', 0],
      [true, true, 'ended', 0],
    ]);
  });

  it('반례 1 — 월~일 주, 수요일 주휴, 목요일 퇴사: 7일째(일요일) 전이라 0원(종전 「주휴일이거나 그 뒤」로 82,560원)', () => {
    const r = at(40, BEFORE);
    expect([r.status, r.amount]).toEqual(['ended', 0]);
  });

  it('반례 2 — 수요일 입사·일요일 종료(같은 주): 종전 주 24시간 49,536원 → 금액 없음·확인 필요(E1)', () => {
    expect(at(24, NONE).amount).toBe(49_536); // 종전 값 확인 — 10,320 × 24 ÷ 5
    const r = at(24, JOINED);
    expect([r.status, r.amount, r.monthly]).toEqual(['joined-unclear', null, null]);
  });

  it('7일째(일요일)까지 재직하고 퇴사하면 생긴다 — 8일째 근로가 예정되지 않아도', () => {
    expect(at(40, NONE).amount).toBe(82_560);
  });

  const view = (span: WeekSpan, weeklyHours = 40) =>
    weeklyHolidayView({
      r: at(weeklyHours, span), hourlyWage: 10_320, weeklyHours, fullTimeDays: 5, minWage: rateOn('minWageHourly', '2026-11-26'),
    });

  it('퇴사(ended) 화면 — 7일째 기준 문장, 근거 줄(1736 첫 근거 · 1350 보조), 1주 정의 조문 링크', () => {
    const v = view(BEFORE);
    expect(v.verdict).toEqual(ENDED_VERDICT);
    expect(ENDED_VERDICT.join(' ')).toContain('7일');
    expect(ENDED_VERDICT.join(' ')).not.toContain('주휴일 전');
    expect(v.amounts).toEqual([]);
    expect(v.meta).toEqual([ENDED_BASIS]);
    expect(ENDED_BASIS).toContain('「1주 7일의 마지막날(7일째가 되는 날)」');
    expect(ENDED_BASIS).not.toContain('6551');
    expect(v.basis.map((b) => b.label)).toContain('근로기준법 제2조(정의)');
  });

  it('화면 — 입사·퇴사 체크 둘, 옛 「주휴일 전」 문구 없음, 설명은 7일째 기준과 금/일·수요일 예시', () => {
    const src = readFileSync('src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx', 'utf8');
    expect(src).toContain('weekSpanInput(');
    expect(src).toContain('{WEEK_NOTE}');
    expect(src).not.toMatch(/주휴일 전|주휴일이거나|endsBeforeRestDay/);
    expect(WEEK_NOTE).toContain('7일째');
    expect(WEEK_NOTE).toContain('수요일');
  });
});

// ── G4 E1(261126 재홍님 결정) 입사 주는 0원으로 단정하지 않는다 — 금액을 내지 않고 「확인 필요」로 멈춘다 ──
// 입사 주를 직접 다룬 행정해석을 찾지 못했고, 임금근로시간과-1743 은 근로를 시작한 뒤 어느 시점에서 과거 1주를 보라고 해
// 「입사일부터 7일을 채우면 생긴다」로 읽힐 수 있다(일용근로자 사안). 퇴사 주(D1)는 그대로.
describe('G4 E1 주휴 입사 주 — 금액 없이 확인 필요', () => {
  const base = { hourlyWage: 10_320, weeklyHours: 40, fullAttendance: true };
  const view = (input: Parameters<typeof calcWeeklyHoliday>[0]) =>
    weeklyHolidayView({
      r: calcWeeklyHoliday(input), hourlyWage: input.hourlyWage, weeklyHours: input.weeklyHours, fullTimeDays: 5,
      minWage: rateOn('minWageHourly', '2026-11-26'),
    });

  it('반례 — 수요일 입사(주 40시간): 0원도 82,560원도 아닌 금액 없음·joined-unclear', () => {
    const r = calcWeeklyHoliday({ ...base, joinedMidWeek: true });
    expect([r.status, r.amount, r.monthly]).toEqual(['joined-unclear', null, null]);
  });

  it('0원이 확실한 쪽이 앞선다 — 15시간 미만, 같은 주에 7일째 전 퇴사, 결근은 입사 주여도 0원', () => {
    expect(calcWeeklyHoliday({ ...base, weeklyHours: 14, joinedMidWeek: true }).status).toBe('under15');
    // 수요일 입사·금요일 퇴사 — 어느 해석으로도 7일이 차지 않는다
    expect(calcWeeklyHoliday({ ...base, joinedMidWeek: true, endsBeforeWeekEnd: true })).toMatchObject({ status: 'ended', amount: 0 });
    expect(calcWeeklyHoliday({ ...base, joinedMidWeek: true, fullAttendance: false })).toMatchObject({ status: 'absent', amount: 0 });
  });

  it('화면 — 멈춤 상태 띠, 금액 칸 없음, 「확인 필요」 문장, 근거 줄 = 1743 원문 구절 + 제2조', () => {
    const v = view({ ...base, joinedMidWeek: true });
    expect(v.status).toBe(STATUS_STOP);
    expect(v.amounts).toEqual([]);
    expect(v.verdict).toEqual(JOINED_VERDICT);
    const said = [...JOINED_VERDICT, v.nextNote ?? ''].join(' ');
    expect(said).toContain('확인 필요');
    expect(said).toContain('입사한 주의 주휴는 직접 다룬 행정해석을 찾지 못했습니다');
    expect(said).toContain('근로를 시작한 날부터 7일을 채우면 생긴다고 보는 해석(임금근로시간과-1743 취지)');
    expect(said).toContain('근로계약·취업규칙과 노동부 해석을 확인하세요');
    expect(said).not.toMatch(/0원|없습니다\./); // 「없다」로 단정하지 않는다
    expect(v.meta).toEqual([JOINED_BASIS]);
    // 「」 안은 법제처 DRF 16858(임금근로시간과-1743) 회답 글자 그대로
    expect(JOINED_BASIS).toContain('「유급 주휴일의 기산 시점은 해당 사업장에서 근로를 시작한이후에 특정 시점에서 과거 1주간의 주휴일 부여 요건이 충족하는지를 판단」');
    expect(JOINED_BASIS).toContain('임금근로시간과-1743, 2021. 8. 5.');
    expect(JOINED_BASIS).toContain('제2조 제1항 제7호');
    expect(v.basis.map((b) => b.label)).toContain('근로기준법 제2조(정의)');
  });

  it('화면 설명도 입사 주를 「없다」로 말하지 않는다', () => {
    expect(WEEK_NOTE).not.toContain('입사한 주도 없습니다');
    expect(WEEK_NOTE).toContain('금액을 내지 않습니다');
  });

  it('새 문장에 금지어가 없다', () => {
    const v = view({ ...base, joinedMidWeek: true });
    const ended = view({ ...base, endsBeforeWeekEnd: true });
    expect(bannedHits([...ENDED_VERDICT, ...JOINED_VERDICT, ENDED_BASIS, JOINED_BASIS, WEEK_NOTE, ended.nextNote ?? '', v.nextNote ?? ''].join(' '))).toEqual([]);
  });
});

// ── G4 I2(261126) 퇴사 주 — 0원(ended)의 근거 줄과 퇴사일 뜻(상실일은 그다음 날) ──
// 존속 요건은 조문에 없다(시행령 제30조 제1항은 개근만). 원문 확인한 해석 = 임금근로시간과-1736(2021. 8. 4., 고용노동부 정책자료
// bbs_seq=20210802167 첨부 — G4 R1 에서 1743 을 바꿨다).
describe('G4 I2 퇴사 주 근거·퇴사일 설명', () => {
  const view = (endsBeforeWeekEnd?: boolean) =>
    weeklyHolidayView({
      r: calcWeeklyHoliday({ hourlyWage: 10_320, weeklyHours: 40, fullAttendance: true, endsBeforeWeekEnd }),
      hourlyWage: 10_320, weeklyHours: 40, fullTimeDays: 5, minWage: rateOn('minWageHourly', '2026-11-26'),
    });

  it('ended 화면에 존속 요건의 근거를 밝힌다 — 조문에 없음, 임금근로시간과-1736 원문 구절(G4 R1)', () => {
    expect(view(true).meta).toEqual([ENDED_BASIS]);
    expect(ENDED_BASIS).toContain('시행령 제30조 제1항은 개근');
    expect(ENDED_BASIS).toContain('임금근로시간과-1736, 2021. 8. 4.');
  });

  it('평상 주(paid)에는 퇴사 주 근거 줄을 붙이지 않는다', () => {
    expect(view(false).meta ?? []).not.toContain(ENDED_BASIS);
    expect(view().meta ?? []).not.toContain(ENDED_BASIS);
  });

  it('퇴사일 = 근로관계가 이어진 마지막 날, 인사기록·4대보험의 상실일은 그다음 날 — 화면 설명과 0원 안내가 같은 뜻', () => {
    expect(EXIT_DAY_DEFINITION).toContain('근로관계가 이어진 마지막 날');
    expect(EXIT_DAY_DEFINITION).toContain('상실일은 그다음 날');
    expect(EXIT_DAY_DEFINITION).not.toContain('인사기록의 날짜');
    const next = view(true).nextNote ?? '';
    expect(next).toContain('상실일은 그다음 날');
    expect(next).not.toContain('사직서·인사기록에 적힌');
    // 주휴 화면·MCP 에는 날짜 칸이 없다(라디오·참거짓) — 「넣은 날짜」류로 말하지 않는다
    expect(`${EXIT_DAY_DEFINITION} ${next}`).not.toMatch(/넣은 날짜|넣으면/);
    // 화면 라디오 아래 설명이 같은 상수를 쓴다
    expect(readFileSync('src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx', 'utf8')).toContain('{EXIT_DAY_DEFINITION}');
  });

  it('새 문장에 금지어가 없다', () => {
    expect(bannedHits([ENDED_BASIS, EXIT_DAY_DEFINITION, view(true).nextNote ?? ''].join(' '))).toEqual([]);
  });
});

// ── G4 2차(R1~R9, 261127) — 판정표 G4_판정표_R2_261127.md #297 ──
describe('G4 R2 #297 반영', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  const whpMcp = () => {
    const s = src('tools/k-labor/groups/calc.mjs');
    const from = s.indexOf("title: '주휴수당 계산'");
    expect(from).toBeGreaterThan(0);
    return s.slice(from, s.indexOf('// ── 상시 근로자 수', from));
  };
  const base = { hourlyWage: 10_320, weeklyHours: 40, fullAttendance: true };
  const view = (input: Parameters<typeof calcWeeklyHoliday>[0]) =>
    weeklyHolidayView({
      r: calcWeeklyHoliday(input), hourlyWage: input.hourlyWage, weeklyHours: input.weeklyHours, fullTimeDays: 5,
      minWage: rateOn('minWageHourly', '2026-11-26'),
    });

  it('R1 퇴사 주 첫 근거 = 임금근로시간과-1736(고용노동부 정책자료 첨부 원문 구절), 1350 은 보조 — 일할계산과 같은 번호', () => {
    // 「」 안 = 고용노동부 정책자료(bbs_seq=20210802167) 첨부 「주휴수당 및 연차휴가 산정 관련 행정해석 변경(8.4.) 안내」 글자 그대로
    expect(ENDED_BASIS).toContain('「최소한 1주 동안의 근로관계 존속을 전제로 한다고 봄이 타당」');
    expect(ENDED_BASIS).toContain('「법령상 그 다음주까지 근로관계가 유지되어야 한다는 내용은 없으며」');
    expect(ENDED_BASIS.indexOf('1736')).toBeLessThan(ENDED_BASIS.indexOf('1350'));
    expect(whpMcp()).toMatch(/임금근로시간과-1736\(2021\. 8\. 4\.\)/);
    const pp = src('src/app/tools/pay-proration/copy.ts');
    expect(pp).not.toContain('언론 보도');
    expect(pp).toContain('임금근로시간과-1736, 2021. 8. 4.');
  });

  it('R2 엔진 주석 — 1350 은 실시간 상담 목록, 6551 은 1736 으로 폐기된 종전 해석', () => {
    const s = src('src/lib/calc/weekly-holiday.ts');
    expect(s).not.toContain('문답 셋');
    expect(s).toContain('실시간 상담 목록');
    expect(s).toMatch(/6551[^]*?폐기/);
  });

  it('R3 입사 주 문구는 「찾지 못해」로 통일 — 「없어/없고」 단정 없음(화면 설명·MCP)', () => {
    expect(WEEK_NOTE).toContain('찾지 못해');
    expect(WEEK_NOTE).not.toMatch(/행정해석이 없/);
    expect(whpMcp()).not.toMatch(/행정해석이 없/);
  });

  it('R4 입사 주 확인 안내 — 1350 답변(첫 지정 주휴일·입사일 기준 사후 정산)과 법적 효력 없음, 금액 보류는 그대로', () => {
    const v = view({ ...base, joinedMidWeek: true });
    expect([v.status, v.amounts]).toEqual([STATUS_STOP, []]);
    const next = v.nextNote ?? '';
    // 「」 안 = 1350 실시간 상담 2026. 5. 29.·9. 7. 답변 글자 그대로(id=1000236183)
    expect(next).toContain('「입사일을 기준으로 1주일에 평균 1회 이상의 주휴일을 부여하지 않았다면 이후에 이를 정산하여 추가로 유급 휴일을 부여하여야 할 것」');
    expect(next).toContain('「입사 후 1주간(7일)을 채우지 못하였으므로 이를 무급으로 부여하더라도 법 위반이라고 할 수는 없으며」');
    expect(next).toContain('2026. 5. 29.');
    expect(next).toContain('법적 효력이 있는 해석이 아닙니다');
    expect(next).toContain('근로계약·취업규칙과 노동부 해석을 확인하세요');
    expect(bannedHits(next)).toEqual([]);
    expect(whpMcp()).toContain('JOINED_NEXT');
  });

  it('R5 「상실일(퇴직일)」 괄호 없음 — 4대보험 서식은 퇴직일과 상실일을 나눠 적는다', () => {
    for (const s of [EXIT_DAY_DEFINITION, view({ ...base, endsBeforeWeekEnd: true }).nextNote ?? '', whpMcp(), src('src/lib/calc/weekly-holiday.ts'),
      src('.claude/skills/verify-llg/features/weekly-holiday-pay.md')]) {
      expect(s).not.toContain('상실일(퇴직일)');
    }
  });

  it('R6 「마지막 근무일이 아니다」 → 「마지막으로 출근한 날이 아니다」(#299 의 「마지막 근무일 = 근로관계 마지막 날」과 부딪히지 않게)', () => {
    expect(EXIT_DAY_DEFINITION).toContain('마지막으로 출근한 날');
    expect(whpMcp()).toContain('마지막으로 출근한 날이 아니다');
    for (const s of [EXIT_DAY_DEFINITION, view({ ...base, endsBeforeWeekEnd: true }).nextNote ?? '', whpMcp(), src('src/lib/calc/weekly-holiday.ts')]) {
      expect(s).not.toContain('마지막 근무일');
    }
  });

  it('R7 웹은 입사·퇴사를 둘 다 고를 수 있다 — 수요일 입사·금요일 종료는 MCP 와 같은 0원(ended)', () => {
    const c = src('src/app/tools/weekly-holiday-pay/WeeklyHolidayClient.tsx');
    expect((c.match(/<input type="checkbox"/g) ?? []).length).toBe(2);
    expect(c).not.toMatch(/setSpan\(/);
    const both = calcWeeklyHoliday({ ...base, ...weekSpanInput({ joined: true, endsBefore: true }) });
    expect([both.status, both.amount]).toEqual(['ended', 0]);
    expect(calcWeeklyHoliday({ ...base, joinedMidWeek: true, endsBeforeWeekEnd: true })).toMatchObject({ status: 'ended', amount: 0 });
  });

  // R8 — astra A3 재현: 매일 영업, 2026-02-13부터 5명(그 전 0명), 연차를 볼 날 2027-01-31
  const lateFive: Plan = {
    site: { openDays: ALL, closedDates: [] },
    crews: [{ id: 'c1', count: 5, from: '2026-02-13', days: 'site', kind: 'regular' }],
  };
  it('R8 연차 가장 이른 달 — 근거 보기가 연차가 실제 쓴 구간(01-31~02-27, 28일)을 그대로 보인다', () => {
    const leave = explainLeave(lateFive, '2027-01-31');
    const first = leave.months[0];
    expect([first.periodStart, first.periodEnd, first.operatingDays, first.belowDays, first.covered]).toEqual(['2026-01-31', '2026-02-27', 28, 13, true]);
    expect(leave.months).toHaveLength(12);
    const line = leaveMonthLine(first);
    expect(line).toContain('2026-01-31 ~ 2026-02-27');
    expect(line).toContain('가동 28일');
    expect(line).toContain('5명 미만 13일');
    // 화면 근거 보기가 열두 달을 그대로 그린다
    const c = src('src/app/tools/headcount/HeadcountClient.tsx');
    expect(c).toContain('explainLeave(');
    expect(c).toContain('leaveMonthLine(');
    // 「그 날짜를 넣으면 같은 구간」은 가장 이른 달에 맞지 않아 쓰지 않는다
    expect(LEAVE_MONTHS_NOTE).not.toContain('같은 구간이 나옵니다');
    expect(bannedHits([LEAVE_MONTHS_NOTE, line].join(' '))).toEqual([]);
  });

  it('R9 MCP 옛 입력 endsBeforeRestDay 는 조용히 버리지 않고 거절한다', () => {
    const m = whpMcp();
    expect(m).toContain('endsBeforeRestDay');
    expect(m).toMatch(/endsBeforeRestDay[^]*?throw new Error/);
  });
});
