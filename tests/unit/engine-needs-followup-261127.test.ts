// 엔진 needs·assumptions 후속(261127) — docs/engine-needs-assumptions-261127.md 「후속」 1번부터.
// 결론(가산 여부·유급휴일 여부)을 바꾸는 기본값은 needs 로 보내고, needs 가 남으면 금액을 내지 않는다.
import { describe, expect, it } from 'vitest';
import { calcHolidayPayChecked, calcHolidayPay } from '@/lib/holiday-pay';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { Need } from '@/lib/calc/needs';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const hs: Record<string, Handler> = {};
registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
const mcp = async (name: string, a: Record<string, unknown>) => JSON.parse((await hs[name](a)).content[0].text);

const won = /\d{1,3}(,\d{3})+원/;
const needText = (ns: Need[]) => ns.flatMap((n) => [n.question, n.why]).join(' ');

// ── 1. 공휴일 근로수당 ──
const HOURLY = { worker_type: 'hourly', site_size: 'large', holiday_kind: 'public_holiday', hourly_wage: 12_000, worked_hours: 8 } as const;
const DAILY = { worker_type: 'daily', site_size: 'large', holiday_kind: 'public_holiday', daily_wage: 120_000, daily_hours: 8, worked_hours: 8 } as const;

describe('공휴일 근로수당 — 결론을 바꾸는 빈칸은 needs', () => {
  it('엔진: 시급제 관공서 공휴일에 주 시간이 없으면 needs-input, 금액 null', () => {
    const r = calcHolidayPayChecked({ ...HOURLY });
    expect(r.status).toBe('needs-input');
    expect(r.total).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['weekly_hours']);
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: 주 시간을 넣으면 종전 계산 그대로 — 주 40시간 1.5배, 주 10시간은 휴일 가산 없음', () => {
    const full = calcHolidayPayChecked({ ...HOURLY, weekly_hours: 40 });
    expect(full).toMatchObject({ status: 'ok', needs: [], total: calcHolidayPay({ ...HOURLY, weekly_hours: 40 }).total });
    expect(full.total).toBe(144_000);
    const part = calcHolidayPayChecked({ ...HOURLY, weekly_hours: 10 });
    expect(part).toMatchObject({ status: 'ok', total: 96_000 });
  });
  it('엔진: 시급제 노동절은 15시간 기준이 결론을 바꾸지 않아 주 시간 없이도 계산한다(유급휴일 1일분만 미계산)', () => {
    const r = calcHolidayPayChecked({ ...HOURLY, holiday_kind: 'labor_day' });
    expect(r.status).toBe('ok');
    expect(r.total).toBe(144_000);
    if (r.status === 'ok') expect(r.paid_holiday_day.amount).toBeNull();
  });
  it('엔진: 시급에 주휴가 들어 있다는데 주 시간이 없으면 통상시급을 못 정해 needs', () => {
    const r = calcHolidayPayChecked({ ...HOURLY, holiday_kind: 'labor_day', hourly_includes_weekly: true });
    expect(r.status).toBe('needs-input');
    expect(r.needs.map((n) => n.key)).toEqual(['weekly_hours']);
  });
  it('엔진: 일용직 계속 근로 여부를 비우면 needs(종전 MCP 는 계속 근로로 봤다)', () => {
    const r = calcHolidayPayChecked({ ...DAILY });
    expect(r.status).toBe('needs-input');
    expect(r.total).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['paid_continuously']);
  });
  it('엔진: 월 소정근로시간·1일 근로시간을 비우면 assumptions(결론은 그대로)', () => {
    const m = calcHolidayPayChecked({ worker_type: 'monthly', site_size: 'large', holiday_kind: 'public_holiday', monthly_pay: 2_090_000, worked_hours: 8 });
    expect(m.status).toBe('ok');
    expect(m.assumptions.map((x) => x.key)).toEqual(['monthly_hours']);
    const d = calcHolidayPayChecked({ ...DAILY, daily_hours: undefined, paid_continuously: true });
    expect(d.assumptions.map((x) => x.key)).toEqual(['daily_hours']);
  });
  it('MCP: 시급제 관공서 공휴일 주 시간 없음 → 금액 문장 없이 needs 최상위', async () => {
    const r = await mcp('calc_holiday_pay', { workerType: 'hourly', fivePlus: true, holidayKind: 'public_holiday', workedHours: 8, hourlyWage: 12_000 });
    expect(r.needs.map((n: Need) => n.key)).toEqual(['weeklyHours']);
    expect(r.result.total).toBeNull();
    expect(JSON.stringify(r.headline)).not.toMatch(won);
  });
  it('MCP: 일용직 paidContinuously 없음 → needs, 넣으면 종전 금액', async () => {
    const base = { workerType: 'daily', fivePlus: true, holidayKind: 'public_holiday', workedHours: 8, dailyWage: 120_000, dailyHours: 8 };
    const r = await mcp('calc_holiday_pay', base);
    expect(r.needs.map((n: Need) => n.key)).toEqual(['paidContinuously']);
    expect(JSON.stringify(r.headline)).not.toMatch(won);
    const ok = await mcp('calc_holiday_pay', { ...base, paidContinuously: true });
    expect(ok.needs).toEqual([]);
    expect(ok.result.total).toBe(180_000);
  });
  it('MCP: 월 소정근로시간을 비우면 assumptions 에 209', async () => {
    const r = await mcp('calc_holiday_pay', { workerType: 'monthly', fivePlus: true, holidayKind: 'public_holiday', workedHours: 8, monthlyPay: 2_090_000 });
    expect(r.assumptions).toEqual([expect.objectContaining({ key: 'monthlyHours', value: 209 })]);
  });
});

// ── 3. 해고예고수당 ──
import { calcNoticePay } from '@/lib/calc/notice-pay';
const NP = { unit: 'month', amount: 2_090_000, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-01', dismissalDate: '2025-12-31' } as const;

describe('해고예고수당 — 예고 여부를 비우면 예고 안 함으로 보지 않는다', () => {
  it('엔진: noticed·noticeDate 둘 다 없음 → needs-input, 금액 null, needs = noticed', () => {
    const r = calcNoticePay({ ...NP });
    expect(r.status).toBe('needs-input');
    expect(r.amount).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['noticed']);
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: noticed false → 종전대로 30일분, needs 없음', () => {
    const r = calcNoticePay({ ...NP, noticed: false });
    expect(r).toMatchObject({ status: 'pay', needs: [] });
    expect(r.amount).toBeGreaterThan(0);
  });
  it('엔진: 예고일만 넣어도 판정한다(noticed 생략)', () => {
    expect(calcNoticePay({ ...NP, noticeDate: '2025-11-01' }).status).toBe('noticed');
  });
  it('엔진: 3개월 미만은 예고 여부와 상관없이 대상 아님 — 묻지 않는다', () => {
    const r = calcNoticePay({ ...NP, hireDate: '2025-11-01' });
    expect(r).toMatchObject({ status: 'under3m', needs: [] });
  });
  it('MCP: 예고 여부 없음 → needs 최상위, 금액 문장 없음', async () => {
    const r = await mcp('calc_notice_pay', { ...NP });
    expect(r.needs.map((n: Need) => n.key)).toEqual(['noticed']);
    expect(r.amount).toBeNull();
    expect(JSON.stringify(r.headline)).not.toMatch(won);
  });
});
