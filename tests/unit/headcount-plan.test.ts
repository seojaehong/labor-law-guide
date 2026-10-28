import { describe, expect, it } from 'vitest';
import { computeHeadcount, type HeadcountInput } from '@/lib/headcount';
import { answerPlan, defaultPlan, editPlan, explainDate, type Plan } from '@/lib/headcount-plan';
import { allCopy } from '@/app/tools/headcount/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

const WEEKDAYS = [1, 2, 3, 4, 5];
const TODAY = '2026-10-28';

// 4명 원래부터 + 계약직 1명 2026-11-02~11-30, 월~금
const daewon: Plan = {
  site: { openDays: WEEKDAYS, closedDates: [] },
  crews: [
    { id: 'c1', count: 4, days: 'site', kind: 'regular' },
    { id: 'c2', count: 1, from: '2026-11-02', to: '2026-11-30', days: 'site', kind: 'regular' },
  ],
};

// 같은 사업장을 엔진 입력으로 직접 쓴 것 — 한 경로 증명용
const daewonInput: HeadcountInput = {
  operatingWeekdays: WEEKDAYS, closedDates: [], threshold: 5,
  workers: [
    ...[1, 2, 3, 4].map((i) => ({ name: `n${i}`, start: '1900-01-01', workWeekdays: WEEKDAYS, kind: 'regular' as const })),
    { name: '계약직', start: '2026-11-02', end: '2026-11-30', workWeekdays: WEEKDAYS, kind: 'regular' },
  ],
};

describe('answerPlan — 대원 사례', () => {
  const a = answerPlan(daewon, TODAY);

  it('11-17부터 12-15까지 5인 이상이고 양 끝에 근거가 붙는다', () => {
    expect(a.five.kind).toBe('spans');
    if (a.five.kind !== 'spans') return;
    expect(a.five.spans).toHaveLength(1);
    const [s] = a.five.spans;
    if (s.start === 'open' || s.end === 'open') throw new Error('edges should be dates');
    expect(s.start.date).toBe('2026-11-17');
    expect(s.start.why.basis).toBe('rule2-1');
    expect(s.start.why.operatingDays).toBe(21);
    expect(s.start.why.belowDays).toBe(10);
    expect(s.end.date).toBe('2026-12-15');
    expect(s.end.why.baseDate).toBe('2026-12-16');
    expect(s.end.why.operatingDays).toBe(22);
    expect(s.end.why.belowDays).toBe(11);
  });

  it('연차(③)는 생기지 않고, 10명 기간은 없다', () => {
    expect(a.leave.kind).toBe('none');
    expect(a.ten).toEqual([]);
  });

  it('원래부터 일하는 인원을 가정했다고 알린다', () => {
    expect(a.notes.map((n) => n.kind)).toContain('staff-assumed');
  });

  it('explainDate 는 엔진에 직접 넣은 결과와 같다', () => {
    for (const d of ['2026-11-16', '2026-11-17', '2026-12-15', '2026-12-16']) {
      const mine = explainDate(daewon, d);
      const direct = computeHeadcount(daewonInput, d);
      expect({ ...mine, days: mine.days.length }).toEqual({ ...direct, days: direct.days.length });
      expect(mine.days.map((x) => x.count)).toEqual(direct.days.map((x) => x.count));
    }
  });
});

describe('answerPlan — 다른 모양', () => {
  it('5명이 원래부터면 내내 5인 이상, 연차도 적용된다', () => {
    const plan: Plan = { site: daewon.site, crews: [{ id: 'c1', count: 5, days: 'site', kind: 'regular' }] };
    const a = answerPlan(plan, TODAY);
    expect(a.five.kind).toBe('always');
    expect(a.leave.kind).toBe('always');
  });

  it('4명 + 12-01부터 계속 1명이면 연차는 2027-11-17부터 적용된다', () => {
    const plan: Plan = {
      site: daewon.site,
      crews: [daewon.crews[0], { id: 'c2', count: 1, from: '2026-12-01', days: 'site', kind: 'regular' }],
    };
    const a = answerPlan(plan, TODAY);
    expect(a.five.kind).toBe('spans');
    if (a.five.kind === 'spans') expect(a.five.spans[0].end).toBe('open');
    expect(a.leave).toEqual({ kind: 'from', date: '2027-11-17' });
  });

  it('4명뿐이면 해당 기간이 없고 가장 가까운 날을 준다', () => {
    const plan: Plan = { site: daewon.site, crews: [daewon.crews[0]] };
    const a = answerPlan(plan, TODAY);
    expect(a.five.kind).toBe('none');
  });

  it('10명을 넘는 기간이 있으면 ten 에 담긴다', () => {
    const plan: Plan = {
      site: daewon.site,
      crews: [daewon.crews[0], { id: 'c2', count: 7, from: '2026-11-02', to: '2026-11-30', days: 'site', kind: 'regular' }],
    };
    const a = answerPlan(plan, TODAY);
    expect(a.ten.length).toBe(1);
  });

  it("'site' 요일은 영업 요일을 따른다", () => {
    const sat = editPlan(daewon, { type: 'site', patch: { openDays: [1, 2, 3, 4, 5, 6] } });
    expect(sat.crews).toBe(daewon.crews);
    expect(explainDate(sat, '2026-11-17').operatingDays).toBeGreaterThan(explainDate(daewon, '2026-11-17').operatingDays);
  });

  it('기간이 뒤집힌 묶음은 세지 않고 알린다', () => {
    const plan = editPlan(daewon, { type: 'period', id: 'c2', from: '2026-12-01', to: '2026-11-01' });
    const a = answerPlan(plan, TODAY);
    expect(a.notes).toContainEqual({ kind: 'period-reversed', crewId: 'c2' });
    expect(a.five.kind).toBe('none');
  });
});

describe('editPlan', () => {
  it('인원은 1~99 정수로 맞춘다', () => {
    expect(editPlan(daewon, { type: 'count', id: 'c1', count: 0 }).crews[0].count).toBe(1);
    expect(editPlan(daewon, { type: 'count', id: 'c1', count: 250 }).crews[0].count).toBe(99);
  });

  it("날짜 칸을 비우면 '원래부터'·'계속'이 된다", () => {
    const p = editPlan(daewon, { type: 'period', id: 'c2', from: '', to: '' });
    expect(p.crews[1].from).toBeUndefined();
    expect(p.crews[1].to).toBeUndefined();
  });

  it('잘못된 날짜는 무시한다', () => {
    const p = editPlan(daewon, { type: 'period', id: 'c2', from: '2026-02-30' });
    expect(p.crews[1].from).toBe('2026-11-02');
  });
});

describe('defaultPlan', () => {
  it('원래부터 4명 + 다음 달 1일~말일 1명', () => {
    const p = defaultPlan(TODAY);
    expect(p.crews.map((c) => [c.count, c.from, c.to])).toEqual([
      [4, undefined, undefined],
      [1, '2026-11-01', '2026-11-30'],
    ]);
  });
});

describe('문구', () => {
  it('어떤 답에도 금지어가 없다', () => {
    const plans: Plan[] = [
      daewon,
      { site: daewon.site, crews: [{ id: 'c1', count: 5, days: 'site', kind: 'regular' }] },
      { site: daewon.site, crews: [daewon.crews[0]] },
      { site: daewon.site, crews: [daewon.crews[0], { id: 'c2', count: 7, from: '2026-11-02', to: '2026-11-30', days: 'site', kind: 'regular' }] },
    ];
    for (const p of plans) {
      const lines = allCopy(answerPlan(p, TODAY), p, TODAY);
      expect(lines.length).toBeGreaterThan(3);
      for (const line of lines) expect(bannedHits(line), line).toEqual([]);
    }
  });
});
