import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcNoticePay } from '@/lib/calc/notice-pay';
import { noticePayView } from '@/app/tools/notice-pay/result';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

// 261126 G4 검수(PR #298) — 해고예고수당 단시간 근로자.
//   I6(O1·F7): 단시간 산식이 「그렇다」를 골라야만 돌고 기본값이 「아니다」라, 주 24시간 근로자가 기본 경로에서 1일 8시간으로 2,304,000원을 받았다.
//     웹은 미리 고르지 않고 고르라고 멈춘다. 「아니다」인데 주 소정이 40시간보다 짧거나, MCP 가 partTime 을 빼면 알린다(금액은 그대로).
//   I13(A5): 통상 근로자의 1주 소정근로일 수를 정수로만 받아 4주 교대(5·4·5·4일)를 별표 2 제2호나목대로 넣을 수 없었다.
//     4주 합계 ÷ 4 = 4.5 를 받는다. 시급 12,000 · 본인 4주 96시간 · 통상 근로자 18일 → 12,000 × 96 ÷ 18 × 30 = 1,920,000.
// 값은 모두 합성.

const base = { hireDate: '2025-01-02', dismissalDate: '2026-11-30', dailyHours: 8 };

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function mcp(): Handler {
  const hs: Record<string, Handler> = {};
  registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
  return hs.calc_notice_pay!;
}
const call = async (a: Record<string, unknown>) => JSON.parse((await mcp()(a)).content[0]!.text);

describe('I6 — 단시간인지 고르지 않았거나 주 소정이 40시간보다 짧으면 알린다', () => {
  it('엔진: partTime 없이 주 24시간이면 partTimeCheck = true, 금액은 그대로 2,304,000', () => {
    const r = calcNoticePay({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24 });
    expect(r.amount).toBe(2_304_000);
    expect(r.partTimeCheck).toBe(true);
  });
  it('엔진: 주 40시간·단시간 산식을 쓴 경우·주 시간이 없는 시급은 false', () => {
    expect(calcNoticePay({ ...base, unit: 'month', amount: 2_156_880, weeklyHours: 40 }).partTimeCheck).toBe(false);
    expect(calcNoticePay({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24, partTime: {} }).partTimeCheck).toBe(false);
    expect(calcNoticePay({ ...base, unit: 'hour', amount: 10_320 }).partTimeCheck).toBe(false);
  });
  it('결과 블록: 「아니다」인데 주 24시간이면 단시간 근로자인지 다시 보라는 줄을 싣는다', () => {
    const r = calcNoticePay({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24 });
    const v = noticePayView({ r, partTime: false, hire: base.hireDate, dismissal: base.dismissalDate });
    expect(v.warnings?.join(' ')).toMatch(/40시간보다 짧습니다/);
    expect(v.warnings?.join(' ')).toMatch(/별표 2/);
    const ok = calcNoticePay({ ...base, unit: 'month', amount: 2_156_880, weeklyHours: 40 });
    expect(noticePayView({ r: ok, partTime: false, hire: base.hireDate, dismissal: base.dismissalDate }).warnings ?? []).toEqual([]);
  });
  it('웹: 단시간 질문을 미리 고르지 않고, 고르기 전에는 금액 대신 고르라고 한다', () => {
    const src = readFileSync(resolve('src/app/tools/notice-pay/NoticePayClient.tsx'), 'utf8');
    expect(src).toMatch(/useState<boolean \| null>\(null\)/);
    expect(src).toMatch(/checked=\{partTime === false\}/);
    expect(src).toMatch(/checked=\{partTime === true\}/);
    expect(src).toMatch(/단시간 근로자인지 골라 주세요/);
  });
  it('MCP: partTime 을 빼고 주 24시간이면 headline 에 알림, 금액은 그대로', async () => {
    const out = await call({ ...base, unit: 'month', amount: 1_200_000, weeklyHours: 24 });
    expect(out.ok).toBe(true);
    expect(out.amount).toBe(2_304_000);
    expect(out.partTimeCheck).toBe(true);
    expect(out.headline.join(' ')).toMatch(/40시간보다 짧/);
    expect(out.notice).toMatch(/partTime/);
  });
  it('MCP: 시급에 주 시간도 partTime 도 없으면 단시간인지 보지 않았다고 알린다', async () => {
    const out = await call({ ...base, unit: 'hour', amount: 10_320 });
    expect(out.amount).toBe(2_476_800);
    expect(out.notice).toMatch(/단시간/);
  });
  it('MCP: 주 40시간이면 알림 없음', async () => {
    const out = await call({ ...base, unit: 'month', amount: 2_156_880, weeklyHours: 40 });
    expect(out.notice).toBeUndefined();
    expect(out.headline.join(' ')).not.toMatch(/짧/);
  });
});

describe('I13 — 통상 근로자 1주 소정근로일 수는 4주 평균(소수)도 받는다', () => {
  it('5·4·5·4일(4주 18일) → 4.5, 본인 4주 96시간 → 1일 96 ÷ 18 시간, 시급 12,000 → 1,920,000', () => {
    const r = calcNoticePay({ ...base, unit: 'hour', amount: 12_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: 4.5 } });
    expect(r.appliedDailyHours).toBeCloseTo(96 / 18, 10);
    expect(r.amount).toBe(1_920_000);
  });
  it('정수만 받던 때의 두 값(5 → 1,728,000 · 4 → 2,160,000)은 그대로', () => {
    expect(calcNoticePay({ ...base, unit: 'hour', amount: 12_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: 5 } }).amount).toBe(1_728_000);
    expect(calcNoticePay({ ...base, unit: 'hour', amount: 12_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: 4 } }).amount).toBe(2_160_000);
  });
  it('1 미만·7 초과·숫자가 아니면 오류', () => {
    for (const d of [0, 0.5, 7.5, Number.NaN]) {
      expect(() => calcNoticePay({ ...base, unit: 'hour', amount: 12_000, weeklyHours: 24, partTime: { fullTimeWeeklyDays: d } })).toThrow(/소정근로일 수/);
    }
  });
  it('MCP 입력 스키마와 웹 칸이 소수를 받는다', () => {
    const calc = readFileSync(resolve('tools/k-labor/groups/calc.mjs'), 'utf8');
    const from = calc.indexOf("    'calc_notice_pay',");
    const block = calc.slice(from, calc.indexOf("    'calc_leave_pay',", from));
    expect(block).toMatch(/fullTimeWeeklyDays: z\.number\(\)\.optional\(\)/);
    expect(block).not.toMatch(/fullTimeWeeklyDays: z\.number\(\)\.int\(\)/);
    const src = readFileSync(resolve('src/app/tools/notice-pay/NoticePayClient.tsx'), 'utf8');
    expect(src).toMatch(/<input inputMode="decimal"[^>]*value=\{fullDays\}/);
  });
});
