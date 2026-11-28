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

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const hs: Record<string, Handler> = {};
const fake = { registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } };
delayTool.register(fake);
attendanceTool.register(fake);
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
