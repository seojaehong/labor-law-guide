// 261127 재홍님 승인 — 대화형 방향 판정표 1단계: 계산 도구가 빠진 사실(needs)·가정한 값(assumptions)을 공통 형식으로 돌려주고,
// needs 가 남으면 금액을 내지 않는다(「같은 식으로 세면 ○○원」 같은 동반 금액도 내지 않는다). 설계 = docs/engine-needs-assumptions-261127.md
// 첫 조각: 퇴직금(웹·MCP·챗봇·/api/tools/calc) · 주휴(입사 주·퇴사 주·개근 미입력) · 연차수당(회사 지급액 빈칸과 0).
// 공통 결함: 통상임금 월 209시간 → assumptions, 최저임금 주 40시간 → needs, 금지어(labor-calc 「판정 보류」·ai/prompt 「자문」).
// 값은 모두 합성.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { calcSeverance as engine } from '@/lib/calc/severance';
import { calcSeverance as chat, checkMinWage, calcOrdinaryWage, calcOvertime } from '@/lib/labor-calc';
import { POST } from '@/app/api/tools/calc/route';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { weekSpanInput, weeklyHolidayView } from '@/app/tools/weekly-holiday-pay/result';
import { calcLeavePay, type LeavePayInput } from '@/lib/calc/leave-pay';
import { headline as lpHeadline } from '@/app/tools/leave-pay/copy';
import { estimateSeverance } from '@/app/exit/exit-calc';
import { SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { bannedHits } from '@/lib/tool-kit/banned';
import type { Need } from '@/lib/calc/needs';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const hs: Record<string, Handler> = {};
registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
const mcp = async (name: string, a: Record<string, unknown>) => JSON.parse((await hs[name](a)).content[0].text);

const won = /\d{1,3}(,\d{3})+원/;
const needText = (ns: Need[]) => ns.flatMap((n) => [n.question, n.why]).join(' ');

// ── 퇴직금 ──
const E = { hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000 };
const BASE = { hire_date: '2023-01-01', last_work_date: '2025-12-31', wages_3months: [3_000_000, 3_000_000, 3_000_000] as [number, number, number] };

describe('퇴직금 — 1주 소정근로시간을 모르면 금액을 내지 않는다', () => {
  it('엔진: 시간 없음 → hours-unknown, amount null, needs = weeklyHours', () => {
    const r = engine(E);
    expect(r.status).toBe('hours-unknown');
    expect(r.amount).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['weeklyHours']);
    expect(r.needs[0].question).toMatch(/1주 근로시간/);
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: 시간을 넣으면 종전 금액 그대로(8,812,389원), needs 없음', () => {
    const r = engine({ ...E, weeklyHours: 40 });
    expect(r).toMatchObject({ status: 'eligible', amount: 8_812_389, needs: [] });
  });
  it('엔진: 1년 미만은 시간과 상관없이 대상 아님 — needs 가 아니고 참고 금액은 그대로', () => {
    const r = engine({ hireDate: '2025-06-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000 });
    expect(r.status).toBe('under-1y');
    expect(r.needs).toEqual([]);
    expect(typeof r.amount).toBe('number');
  });
  it('챗봇: weekly_hours 없음 → severance_pay null, needs, 세금도 계산하지 않음, 근거에 금지어 없음', () => {
    const r = chat({ ...BASE, include_tax: true });
    expect(r.severance_pay).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['weekly_hours']);
    expect(r.assumptions).toEqual([]);
    expect(r.tax).toBeUndefined();
    expect(r.net_severance).toBeUndefined();
    expect(bannedHits(r.legal_basis)).toEqual([]);
    expect(r.legal_basis).not.toMatch(won);
  });
  it('챗봇: weekly_hours 40 → 종전 금액·세금 그대로, needs 없음', () => {
    const r = chat({ ...BASE, weekly_hours: 40, include_tax: true });
    expect(r.severance_pay).toBe(8_812_389);
    expect(r.needs).toEqual([]);
    expect(r.tax).toBeDefined();
  });
  it('/api/tools/calc: 같은 입력 → severance_pay null·needs', async () => {
    const req = new Request('http://x/api/tools/calc', { method: 'POST', body: JSON.stringify({ tool: 'calc_severance', args: BASE }) });
    const j = await (await POST(req as never)).json();
    expect(j.result.severance_pay).toBeNull();
    expect(j.result.needs[0].key).toBe('weekly_hours');
  });
  it('챗봇 상태별 근거 문장 전부 금지어 0', () => {
    for (const weekly_hours of [undefined, 10, 40]) {
      expect(bannedHits(chat({ ...BASE, ...(weekly_hours === undefined ? {} : { weekly_hours }) }).legal_basis)).toEqual([]);
    }
  });
  it('MCP: 시간 없는 호출(스키마 밖) → 머리글에 금액 없음, needs 최상위', async () => {
    const r = await mcp('calc_severance', { hireDate: E.hireDate, lastWorkDate: E.lastWorkDate, wageTotal: E.wageTotal });
    expect(r.result.amount).toBeNull();
    expect(r.headline.join(' ')).not.toMatch(won);
    expect(r.needs.map((n: Need) => n.key)).toEqual(['weeklyHours']);
    expect(r.assumptions).toEqual([]);
  });
  it('MCP: 주 40시간 → 종전 금액·needs 없음', async () => {
    const r = await mcp('calc_severance', { ...E, weeklyHours: 40 });
    expect(r.result.amount).toBe(8_812_389);
    expect(r.needs).toEqual([]);
  });
  it('/exit 추정은 입력한 주 시간을 넘긴다 — 금액 그대로', () => {
    expect(estimateSeverance('2023-01-01', '2025-12-31', 3_000_000, 40).amount).toBe(8_812_389);
  });
  it('웹(severance.html): 시간 칸을 비우면 금액 없이 묻는다(1년 미만은 묻지 않는다), 안내문에 「금액만 계산」 없음', () => {
    const html = readFileSync(resolve(__dirname, '../../public/tools/severance.html'), 'utf8');
    expect(html).not.toContain('비워 두면 지급 대상인지는 따지지 않고 금액만 계산합니다');
    expect(html).toMatch(/!weekly && !isUnderOneYear\(w\.startDate, w\.endDate\)\) return \{ field: 'weeklyHours', message: weeklyHoursNeedMessage\(\) \}/);
  });
});

// ── 주휴 ──
const W = { hourlyWage: 10_320, weeklyHours: 40 };
const ALL = { fullAttendance: true, joinedMidWeek: false, endsBeforeWeekEnd: false };

describe('주휴 — 입사 주·퇴사 주·개근을 말하지 않으면 금액을 내지 않는다', () => {
  it('엔진: 셋 다 비움 → needs-input, amount·monthly null, needs 3개', () => {
    const r = calcWeeklyHoliday(W);
    expect(r).toMatchObject({ status: 'needs-input', amount: null, monthly: null });
    expect(r.needs.map((n) => n.key).sort()).toEqual(['endsBeforeWeekEnd', 'fullAttendance', 'joinedMidWeek']);
    expect(bannedHits(needText(r.needs))).toEqual([]);
  });
  it('엔진: 셋 다 말함 → 종전 82,560원, needs 없음, 통상근로자 5일은 assumptions', () => {
    const r = calcWeeklyHoliday({ ...W, ...ALL });
    expect(r).toMatchObject({ status: 'paid', amount: 82_560, needs: [] });
    expect(r.assumptions.map((a) => [a.key, a.value])).toEqual([['fullTimeDays', 5]]);
    expect(calcWeeklyHoliday({ ...W, ...ALL, fullTimeDays: 5 }).assumptions).toEqual([]);
  });
  it('엔진: 어느 답이든 0원인 경우는 묻지 않는다(15시간 미만·7일째 전 퇴사·결근)', () => {
    expect(calcWeeklyHoliday({ ...W, weeklyHours: 14 })).toMatchObject({ status: 'under15', needs: [] });
    expect(calcWeeklyHoliday({ ...W, endsBeforeWeekEnd: true })).toMatchObject({ status: 'ended', needs: [] });
    expect(calcWeeklyHoliday({ ...W, fullAttendance: false })).toMatchObject({ status: 'absent', needs: [] });
  });
  it('엔진: 그 주 첫날보다 늦게 입사(true) = 해석 갈림 — needs 가 아니라 joined-unclear 그대로', () => {
    const r = calcWeeklyHoliday({ ...W, ...ALL, joinedMidWeek: true });
    expect(r).toMatchObject({ status: 'joined-unclear', amount: null, needs: [] });
  });
  it('웹 체크는 해제도 false 로 넘긴다 — 웹 기본 화면이 needs 로 멈추지 않는다', () => {
    expect(weekSpanInput({ joined: false, endsBefore: false })).toEqual({ joinedMidWeek: false, endsBeforeWeekEnd: false });
    const r = calcWeeklyHoliday({ ...W, fullAttendance: true, ...weekSpanInput({ joined: false, endsBefore: false }) });
    expect(r.amount).toBe(82_560);
  });
  it('웹 결과 블록: needs-input 이 와도 금액 칸 없이 멈춤 띠와 질문', () => {
    const v = weeklyHolidayView({ r: calcWeeklyHoliday(W), hourlyWage: 10_320, weeklyHours: 40, fullTimeDays: 5, minWage: null });
    expect(v.amounts).toEqual([]);
    expect(v.verdict.join(' ')).not.toMatch(won);
  });
  it('MCP: 비우면 needs-input·금액 없음(종전 fullAttendance 기본 true·평상 주 82,560원)', async () => {
    const r = await mcp('calc_weekly_holiday_pay', W);
    expect(r).toMatchObject({ status: 'needs-input', amount: null, monthly: null });
    expect(r.needs.length).toBe(3);
    expect(r.headline.join(' ')).not.toMatch(won);
  });
  it('MCP: 셋 다 주면 82,560원', async () => {
    const r = await mcp('calc_weekly_holiday_pay', { ...W, ...ALL });
    expect(r).toMatchObject({ status: 'paid', amount: 82_560, needs: [] });
  });
});

// ── 연차수당 ──
const L: LeavePayInput = {
  timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8,
  rate: { basis: 'ordinary-wage', unit: 'hour', amount: 12_500 }, days: { source: 'unused', unusedDays: 12 }, asOf: '2026-11-27',
};

describe('연차수당 — 회사 지급액 빈칸과 0원을 구분하고, 차이를 「더 줄 돈」으로 쓰지 않는다', () => {
  it('빈칸 → 총액 그대로, 차이 null, needs 없음(총액은 지급액과 상관없다)', () => {
    const r = calcLeavePay(L);
    expect(r).toMatchObject({ amount: 1_200_000, alreadyPaid: null, difference: null, needs: [] });
  });
  it('0원 → 「지급한 돈이 없을 때만 맞는 비교」를 함께 말한다', () => {
    const h = lpHeadline(calcLeavePay({ ...L, alreadyPaid: 0 })).join(' ');
    expect(h).toMatch(/0원으로 넣었습니다/);
    expect(h).toMatch(/지급한 돈이 없을 때만/);
  });
  it('30만 원 → 산술 차이로만 말하고 같은 일수·기간의 돈인지는 보지 않았다고 적는다', () => {
    const h = lpHeadline(calcLeavePay({ ...L, alreadyPaid: 300_000 })).join(' ');
    expect(h).toMatch(/회사 지급액 300,000원보다 900,000원 많습니다/);
    expect(h).toMatch(/같은 연차 일수.*보지 않았습니다/);
    expect(h).not.toMatch(/더 지급|추가 지급|더 줘야|받을 수 있는/);
  });
  it('MCP: needs·assumptions 최상위, alreadyPaid 설명이 「모르면 비운다」·「0 은 지급한 돈이 없을 때만」', async () => {
    const r = await mcp('calc_leave_pay', { ...L, asOf: undefined });
    expect(r.needs).toEqual([]);
    expect(r.assumptions).toEqual([]);
    const src = readFileSync(resolve(__dirname, '../../tools/k-labor/groups/calc.mjs'), 'utf8');
    expect(src).toMatch(/alreadyPaid: z\.number\(\)\.optional\(\)\.describe\('[^']*모르거나 구분되지 않으면 비운다[^']*0 은[^']*지급한 돈이 없을 때만/);
  });
});

// ── 공통 결함 ──
describe('조용한 기본값 — 결론을 바꾸면 needs, 아니면 assumptions', () => {
  it('최저임금(챗봇): 주 시간 없음 → 비교하지 않음(ok·shortfall null), needs = weekly_hours', () => {
    const r = checkMinWage({ base_pay: 2_000_000, year: 2026 });
    expect(r.ok).toBeNull();
    expect(r.shortfall).toBeNull();
    expect(r.needs.map((n) => n.key)).toEqual(['weekly_hours']);
    expect(r.message).not.toMatch(won);
  });
  it('최저임금(챗봇): 주 40시간 → 종전 결과, needs 없음 · 해를 비우면 올해를 assumptions 로', () => {
    const r = checkMinWage({ base_pay: 2_000_000, year: 2026, weekly_hours: 40 });
    expect(r).toMatchObject({ ok: false, shortfall: 156_880, needs: [], assumptions: [] });
    expect(checkMinWage({ base_pay: 2_000_000, weekly_hours: 40 }).assumptions.map((a) => a.key)).toEqual(['year']);
  });
  it('통상임금(챗봇): 월 시간 없음 → 209 를 assumptions 로 드러낸다', () => {
    const r = calcOrdinaryWage({ monthly_fixed_pay: 3_000_000 });
    expect(r.assumptions).toEqual([expect.objectContaining({ key: 'monthly_hours', value: 209 })]);
    expect(calcOrdinaryWage({ monthly_fixed_pay: 3_000_000, monthly_hours: 174 }).assumptions).toEqual([]);
  });
  it('연장수당(챗봇): 월 통상임금으로 셀 때만 209 를 assumptions 로', () => {
    expect(calcOvertime({ monthly_fixed_pay: 3_000_000, overtime_hours: 10 }).assumptions.map((a) => a.key)).toEqual(['monthly_hours']);
    expect(calcOvertime({ ordinary_hourly: 15_000, overtime_hours: 10 }).assumptions).toEqual([]);
  });
  it('assumptions note·needs 문장 금지어 0', () => {
    const texts = [
      ...calcOrdinaryWage({ monthly_fixed_pay: 3_000_000 }).assumptions.map((a) => a.note),
      ...checkMinWage({ base_pay: 2_000_000 }).assumptions.map((a) => a.note),
      needText(checkMinWage({ base_pay: 2_000_000, year: 2026 }).needs),
    ];
    expect(bannedHits(texts.join(' '))).toEqual([]);
  });
  it('금지어 잔존 — /api/sanction 프롬프트 첫 문장에 「자문」 없음', () => {
    expect(SYSTEM_PROMPT.split('\n')[0]).not.toMatch(/자문|노무사/);
  });
});
