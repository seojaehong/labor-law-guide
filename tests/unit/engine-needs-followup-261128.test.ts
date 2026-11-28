// 엔진 needs·assumptions 후속 2(261128) — docs/engine-needs-assumptions-261127.md 「후속」 4·5·2번.
// 261128 재홍님 결정: 지연이자 = 재직 여부 입력 추가, 출근율 = 일수 미입력이면 되묻기, 통상임금 = 판정을 뒤집는 빈칸만 되묻기.
// 웹은 칸·선택지가 다 보이는 화면이라 그대로 두고, 빈칸이 조용히 기본값이 되던 MCP 를 엔진의 Checked 함수로 바꾼다.
import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, calcWageDelayInterestChecked } from '@/lib/calc/wage-delay-interest';
import { calcAttendanceRate, calcAttendanceRateChecked } from '@/lib/calc/attendance-rate';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { Need } from '@/lib/calc/needs';
import * as delayTool from '../../tools/k-labor/groups/more/calc_wage_delay_interest.mjs';
import * as attendanceTool from '../../tools/k-labor/groups/more/calc_attendance_rate.mjs';
import * as ordinaryTool from '../../tools/k-labor/groups/more/check_ordinary_wage.mjs';
import { ordinaryWageNeeds } from '@/lib/calc/ordinary-wage-check';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const hs: Record<string, Handler> = {};
const fake = { registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } };
delayTool.register(fake);
attendanceTool.register(fake);
ordinaryTool.register(fake);
const mcp = async (name: string, a: Record<string, unknown>) => JSON.parse((await hs[name](a)).content[0].text);
const needText = (ns: Need[]) => ns.flatMap((n) => [n.question, n.why]).join(' ');

// ── 4. 임금 지연이자 ──
// 정기지급일 2026-01-10 임금을 2026-02-10에 지급. 재직 중이면 2호(지급일 다음 날부터), 2025-12-31 퇴직이면 정기지급일이 퇴직 뒤라 1호(마지막 근무일 + 14)
const PERIODIC = { kind: 'periodic' as const, amount: 1_000_000, periodicPayDate: '2026-01-10', paidDate: '2026-02-10' };

describe('임금 지연이자 — 재직 여부를 비우면 재직 중으로 보지 않는다', () => {
  it('엔진: 마지막 근무일도 재직 여부도 없으면 needs-input, 합계 null', () => {
    const r = calcWageDelayInterestChecked({ items: [PERIODIC] });
    expect(r.status).toBe('needs-input');
    expect(r.total).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['employed']);
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: 재직 중이라고 넣으면 종전 「비우면 재직 중」 값 그대로', () => {
    const r = calcWageDelayInterestChecked({ employed: true, items: [PERIODIC] });
    expect(r).toMatchObject({ status: 'ok', needs: [], total: calcWageDelayInterest({ items: [PERIODIC] }).total });
  });
  it('엔진: 퇴직했다는데 마지막 근무일이 없으면 마지막 근무일을 묻는다', () => {
    const r = calcWageDelayInterestChecked({ employed: false, items: [PERIODIC] });
    expect(r.status).toBe('needs-input');
    expect(r.needs.map((n) => n.key)).toEqual(['lastWorkDay']);
  });
  it('엔진: 마지막 근무일을 넣으면 퇴직으로 계산 — 재직 중과 기준일이 달라진다(분기 양쪽)', () => {
    const retired = calcWageDelayInterestChecked({ lastWorkDay: '2025-12-31', items: [PERIODIC] });
    expect(retired.status).toBe('ok');
    if (retired.status !== 'ok') return;
    expect(retired.items[0].basis).toBe('1호');
    expect(retired.total).toBe(calcWageDelayInterest({ lastWorkDay: '2025-12-31', items: [PERIODIC] }).total);
    const employed = calcWageDelayInterestChecked({ employed: true, items: [PERIODIC] });
    if (employed.status !== 'ok') throw new Error('재직 중 계산이 안 됐다');
    expect(employed.items[0].basis).toBe('2호');
    expect(employed.total).not.toBe(retired.total);
  });
  it('엔진: 퇴직 때 정산 항목이 있으면 퇴직한 것이라 마지막 근무일만 묻는다', () => {
    const r = calcWageDelayInterestChecked({ items: [{ kind: 'retirement', amount: 3_000_000, paidDate: '2026-02-10' }] });
    expect(r.status).toBe('needs-input');
    expect(r.needs.map((n) => n.key)).toEqual(['lastWorkDay']);
  });
  it('엔진: 재직 중이라면서 마지막 근무일·퇴직 때 정산 항목을 넣으면 오류', () => {
    expect(() => calcWageDelayInterestChecked({ employed: true, lastWorkDay: '2025-12-31', items: [PERIODIC] })).toThrow();
    expect(() => calcWageDelayInterestChecked({ employed: true, items: [{ kind: 'retirement', amount: 1, paidDate: '2026-02-10' }] })).toThrow();
  });
  it('MCP: 비우면 needs-input(합계 null), 재직 중이라고 넣으면 종전 합계', async () => {
    const asked = await mcp('calc_wage_delay_interest', { items: [PERIODIC] });
    expect(asked).toMatchObject({ ok: true, status: 'needs-input', result: { total: null } });
    expect(asked.needs.map((n: Need) => n.key)).toEqual(['employed']);
    const ok = await mcp('calc_wage_delay_interest', { employed: true, items: [PERIODIC] });
    expect(ok).toMatchObject({ ok: true, status: 'ok', result: { total: calcWageDelayInterest({ items: [PERIODIC] }).total } });
  });
});

// ── 2. 통상임금 점검 ──
// 빈칸을 양쪽 값으로 넣어 보고 판정(들어감·빠짐·보류, 일부 여부)이 달라질 때만 묻는다(261128 재홍님 결정). 금액만 바뀌는 칸은 assumptions
const BONUS = { kind: 'bonus' as const, name: '정기상여금', amount: 1_000_000, timesPerYear: 6 as const, regular: 'yes' as const, uniform: 'yes' as const, forWork: 'yes' as const };

describe('통상임금 점검 — 판정을 뒤집는 빈칸만 되묻는다', () => {
  it('엔진: 종전 기준 기간에 지급일 재직 조건을 비우면 그 항목에 묻는다(들어감 ↔ 빠짐)', () => {
    const r = ordinaryWageNeeds({ date: '2024-06-01', items: [BONUS] }, '2026-11-28');
    expect(r.needs.map((n) => n.key)).toEqual(['items[0].employedOnPayday']);
    expect(r.needs[0].question).toContain('정기상여금');
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: 기준일을 비웠고 두 기준의 판정이 갈리면 기준일을 묻는다, 같으면 오늘로 두고 assumptions', () => {
    const split = ordinaryWageNeeds({ items: [{ ...BONUS, employedOnPayday: true }] }, '2026-11-28');
    expect(split.needs.map((n) => n.key)).toEqual(['date']);
    const same = ordinaryWageNeeds({ items: [{ ...BONUS, employedOnPayday: false }] }, '2026-11-28');
    expect(same.needs).toEqual([]);
    expect(same.assumptions.map((x) => x.key)).toEqual(['date']);
    expect(same.date).toBe('2026-11-28');
  });
  it('엔진: 기준일이 없고 빈칸이 종전 기준에서만 판정을 바꾸면 기준일만 묻는다(항목 칸은 묻지 않고, 「판정이 같다」 가정도 없다)', () => {
    const base = { kind: 'base' as const, name: '기본급', amount: 3_000_000, timesPerYear: 12 as const, regular: 'yes' as const, uniform: 'yes' as const, forWork: 'yes' as const };
    const r = ordinaryWageNeeds({ items: [base] }, '2026-11-28');
    expect(r.needs.map((n) => n.key)).toEqual(['date']);
    expect(r.assumptions).toEqual([]);
  });
  it('엔진: 기준일이 새 기준이면 종전 기준에서만 판정을 바꾸는 빈칸은 묻지 않고 assumptions 로 드러낸다', () => {
    const r = ordinaryWageNeeds({ date: '2025-06-01', items: [BONUS] }, '2026-11-28');
    expect(r.needs).toEqual([]);
    expect(r.assumptions.map((x) => x.key)).toEqual(['items[0].employedOnPayday']);
    expect(r.assumptions[0].note).toContain('종전 기준');
  });
  it('엔진: 성과급 최저 보장액·가족수당 기본금액을 비우면 묻고, 0 을 넣으면 묻지 않는다', () => {
    const perf = { kind: 'performance' as const, name: '성과급', amount: 2_000_000, timesPerYear: 1 as const, regular: 'yes' as const, uniform: 'yes' as const, forWork: 'yes' as const, performanceYear: 'current' as const, employedOnPayday: false };
    const fam = { kind: 'family' as const, name: '가족수당', amount: 100_000, timesPerYear: 12 as const, regular: 'yes' as const, uniform: 'no' as const, forWork: 'yes' as const, employedOnPayday: false };
    const asked = ordinaryWageNeeds({ date: '2025-06-01', items: [perf, fam] }, '2026-11-28');
    expect(asked.needs.map((n) => n.key)).toEqual(['items[0].minimum', 'items[1].baseForAll']);
    expect(ordinaryWageNeeds({ date: '2025-06-01', items: [{ ...perf, minimum: 0 }, { ...fam, baseForAll: 0 }] }, '2026-11-28').needs).toEqual([]);
  });
  it('MCP: 판정을 뒤집는 빈칸이 있으면 needs-input(시간급 null), 다 넣으면 종전 응답 + 지급 횟수·월 기준시간은 assumptions', async () => {
    const asked = await mcp('check_ordinary_wage', { date: '2024-06-01', items: [{ ...BONUS, timesPerYear: undefined }] });
    expect(asked).toMatchObject({ ok: true, status: 'needs-input', result: { current: null, newEra: null, oldEra: null } });
    expect(asked.needs.map((n: Need) => n.key)).toEqual(['items[0].employedOnPayday']);
    const ok = await mcp('check_ordinary_wage', { date: '2024-06-01', items: [{ ...BONUS, timesPerYear: undefined, employedOnPayday: false }] });
    expect(ok).toMatchObject({ ok: true, status: 'ok', needs: [] });
    expect(ok.items[0].direction).toBe('in');
    expect(ok.assumptions.map((x: { key: string }) => x.key).sort()).toEqual(['items[0].timesPerYear', 'unitHours']);
  });
});

// ── 5. 출근율 ──
const ATT = { hireDate: '2024-03-04', accrualDate: '2026-03-04', scheduledDays: 250 };

describe('출근율 — 일수를 넣지 않으면 모두 출근으로 보지 않는다', () => {
  it('엔진: days 가 없거나 비어 있으면 needs-input, 판정 null', () => {
    for (const days of [undefined, {}]) {
      const r = calcAttendanceRateChecked({ ...ATT, days });
      expect(r.status).toBe('needs-input');
      expect(r.primary).toBeNull();
      expect(r.needs.map((n) => n.key)).toEqual(['days']);
      expect(bannedHits(needText(r.needs))).toEqual([]);
    }
  });
  it('엔진: 결근 0 을 넣으면 종전 계산 그대로(전부 출근)', () => {
    const r = calcAttendanceRateChecked({ ...ATT, days: { absence: 0 } });
    expect(r).toMatchObject({ status: 'full', needs: [] });
    expect(r.primary).toEqual(calcAttendanceRate({ ...ATT, days: {} }).primary);
  });
  it('엔진: 1년 미만은 일수와 상관없어 묻지 않는다', () => {
    const r = calcAttendanceRateChecked({ hireDate: '2025-06-01', accrualDate: '2026-03-04', scheduledDays: 250 });
    expect(r).toMatchObject({ status: 'under1y', needs: [] });
  });
  it('MCP: 비우면 needs-input, 결근 60일을 넣으면 80% 미만', async () => {
    const asked = await mcp('calc_attendance_rate', { ...ATT });
    expect(asked).toMatchObject({ ok: true, status: 'needs-input' });
    expect(asked.needs.map((n: Need) => n.key)).toEqual(['days']);
    const low = await mcp('calc_attendance_rate', { ...ATT, days: { absence: 60 } });
    expect(low).toMatchObject({ ok: true, status: 'ok' });
    expect(low.result.primary.meets).toBe(false);
  });
});
