import { describe, expect, it } from 'vitest';
import { calcLeavePay, type LeavePayInput } from '@/lib/calc/leave-pay';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

// P3 #7(261124 검수) — 통상근로자가 주 6일인 사업장의 단시간 근로자 연차수당. 입력은 합성 값이다.
// 별표2 제2호나목: 1일 소정근로시간 = 4주 소정근로시간 ÷ 통상근로자 4주 총 소정근로일 수 = 96 ÷ 24 = 4시간.
// 주급 302,400 ÷ (24 + 4) = 10,800원. 연차 시간 = 15 × 24/36 × 8 = 80시간(제4호나목) → 864,000원.

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function mcp(): Handler {
  const hs: Record<string, Handler> = {};
  registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
  return hs.calc_leave_pay!;
}
const call = async (a: Record<string, unknown>) => JSON.parse((await mcp()(a)).content[0]!.text);

describe('#7 연차수당 — 통상근로자 1주 소정근로일', () => {
  const base: LeavePayInput = {
    timing: 'employed', fivePlus: true, weeklyHours: 24, dailyHours: 4,
    rate: { basis: 'ordinary-wage', unit: 'week', amount: 302_400 },
    partTime: { fullTimeWeeklyHours: 36, fullTimeDays: 15, usedHours: 0 },
    asOf: '2026-11-25',
  };
  const withDays = (d?: number): LeavePayInput => ({ ...base, partTime: { ...base.partTime!, ...(d === undefined ? {} : { fullTimeWeeklyDays: d }) } } as LeavePayInput);

  it('통상근로자 주 6일 → 분모 28시간, 시간급 10,800원, 864,000원', () => {
    const r = calcLeavePay(withDays(6));
    expect(r.hours).toBe(28);
    expect(r.hourly).toBe(10_800);
    expect(r.partTime!.grantHours).toBe(80);
    expect(r.amount).toBe(864_000);
  });
  it('통상근로자 주 5일 → 분모 28.8시간, 840,000원', () => {
    expect(calcLeavePay(withDays(5)).amount).toBe(840_000);
  });
  it('입력하지 않으면 주 5일(종전 값 840,000원)', () => {
    expect(calcLeavePay(withDays()).amount).toBe(840_000);
  });
  it('1~7 정수가 아니면 막는다', () => {
    expect(() => calcLeavePay(withDays(8))).toThrow('통상근로자 소정근로일 수를 확인해 주세요');
    expect(() => calcLeavePay(withDays(5.5))).toThrow('통상근로자 소정근로일 수를 확인해 주세요');
  });

  it('MCP calc_leave_pay — 주 6일 864,000원 / 생략 840,000원', async () => {
    const six = await call({ ...base, partTime: { ...base.partTime, fullTimeWeeklyDays: 6 } });
    expect(six.ok).toBe(true);
    expect(six.result.amount).toBe(864_000);
    const none = await call({ ...base });
    expect(none.result.amount).toBe(840_000);
  });
});
