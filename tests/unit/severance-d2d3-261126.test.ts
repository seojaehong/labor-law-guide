// 261126 재홍님 결정 — G4 판정표 D2·D3(PR #298).
//   D2(I7) 챗봇·/api/tools/calc 의 calc_severance 가 eligible = 1년만이라 주 10시간 근로자도 「지급 대상」이었고, 제외기간을 받지 않았다.
//     → 웹 엔진과 같은 status·eligible(1년 그리고 4주 평균 주 15시간). 시간을 받지 않으면 hours-unknown·eligible false
//       (「판정 보류 — 1주 소정근로시간을 알려 주세요」). 1년 여부는 one_year 로 따로 둔다. excluded_days·excluded_wage 를 받는다.
//   D3(I9) 4주 평균 15시간 이상·미만 기간이 섞이면 시간 한 값으로는 자격·금액이 모두 틀린다 — 계산하지 않는다.
//     웹·MCP·챗봇에 「1주 소정근로시간이 바뀐 적 있음」 입력을 두고, 켜면 멈추고 4주 단위 안내(고용노동부 퇴직연금복지과-5254,
//     2019. 12. 9. — 2025. 12. 4. 고용노동부 고객상담센터 회신이 인용). 정밀 계산은 후속.
// 값은 모두 합성.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { calcSeverance as engine } from '@/lib/calc/severance';
import { calcSeverance as chat } from '@/lib/labor-calc';
import { executeTool } from '@/lib/chat/tools/execute';
import { TOOLS } from '@/lib/chat/tools/definitions';
import { severanceCalculatorLink } from '@/lib/chat/severance-link';
import { POST } from '@/app/api/tools/calc/route';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

const BASE = { hire_date: '2023-01-01', last_work_date: '2025-12-31', wages_3months: [3_000_000, 3_000_000, 3_000_000] as [number, number, number] };
const HOURS_CHANGED = /4주 단위로 나눠 4주 평균 1주 소정근로시간이 15시간 미만인 4주는 계속근로기간에서 뺍니다\(고용노동부 퇴직연금복지과-5254/;

describe('D2 — 챗봇·API calc_severance 지급 대상', () => {
  it('주 40시간 → eligible·status eligible·one_year·hours_15', () => {
    const r = chat({ ...BASE, weekly_hours: 40 });
    expect(r).toMatchObject({ eligible: true, status: 'eligible', one_year: true, hours_15: true, severance_pay: 8_812_389 });
  });
  it('주 10시간 → 종전 eligible true 였다 → false·under-15h, 근거에 15시간 미만', () => {
    const r = chat({ ...BASE, weekly_hours: 10 });
    expect(r).toMatchObject({ eligible: false, status: 'under-15h', one_year: true, hours_15: false });
    expect(r.legal_basis).toMatch(/15시간 미만/);
  });
  // 261127 needs — 종전 「판정 보류 + 금액 8,812,389원」을 뒤집었다. 금액을 내지 않고 needs 로 묻는다. 「판정 보류」는 금지어라 쓰지 않는다
  it('시간을 받지 않으면 hours-unknown·eligible false, 금액 null, needs = weekly_hours', () => {
    const r = chat(BASE);
    expect(r).toMatchObject({ eligible: false, status: 'hours-unknown', one_year: true, hours_15: null, severance_pay: null });
    expect(r.needs.map((n: { key: string }) => n.key)).toEqual(['weekly_hours']);
    expect(r.legal_basis).toContain('1주 소정근로시간을 몰라 금액을 내지 않았다');
    expect(r.legal_basis).not.toContain('판정 보류');
  });
  it('1년 미만은 시간과 상관없이 under-1y, one_year false', () => {
    const r = chat({ hire_date: '2026-01-01', last_work_date: '2026-06-30', wages_3months: [3_000_000, 3_000_000, 3_000_000], weekly_hours: 40 });
    expect(r).toMatchObject({ eligible: false, status: 'under-1y', one_year: false });
  });
  it('제외기간을 받는다 — 92일 중 30일·그 기간 임금 0 → 3,000,000원(빼지 않으면 2,021,739원)', () => {
    const plain = chat({ hire_date: '2025-01-01', last_work_date: '2025-12-31', wages_3months: [6_200_000, 0, 0], weekly_hours: 40 });
    expect(plain.severance_pay).toBe(2_021_739);
    expect(plain).not.toHaveProperty('excluded_days');
    const r = chat({ hire_date: '2025-01-01', last_work_date: '2025-12-31', wages_3months: [6_200_000, 0, 0], weekly_hours: 40, excluded_days: 30, excluded_wage: 0 });
    expect(r.severance_pay).toBe(3_000_000);
    expect(r).toMatchObject({ excluded_days: 30, excluded_wage: 0, average_days: 62, total_days_3m: 92 });
    expect(r.legal_basis).toMatch(/제외기간 30일/);
  });
  it('제외 일수만 넣으면 오류를 돌려준다(챗봇 executeTool)', async () => {
    const out = await executeTool('calc_severance', { ...BASE, weekly_hours: 40, excluded_days: 30 });
    expect(out).toEqual({ error: expect.stringMatching(/그 기간에 받은 임금/) });
  });
  it('/api/tools/calc 도 같은 응답', async () => {
    const post = async (args: Record<string, unknown>) => {
      const res = await POST(new Request('http://localhost/api/tools/calc', { method: 'POST', body: JSON.stringify({ tool: 'calc_severance', args }) }) as never);
      return { status: res.status, body: await res.json() };
    };
    const ok = await post({ ...BASE, weekly_hours: 10 });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ eligible: false, status: 'under-15h', one_year: true });
    const bad = await post({ ...BASE, weekly_hours: 40, hours_changed: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(HOURS_CHANGED);
  });
  it('도구 정의 — weekly_hours 가 계산에 쓰이고, 제외기간·시간 변경 인자가 있다', () => {
    const fn = TOOLS.find((t) => t.function.name === 'calc_severance')!.function;
    const props = fn.parameters.properties as unknown as Record<string, { type?: string; description?: string }>;
    expect(props.weekly_hours.type).toBe('number');
    expect(props.weekly_hours.description).not.toMatch(/계산 결과는 바뀌지 않는다/);
    expect(props.weekly_hours.description).toMatch(/15시간/);
    expect(props.excluded_days.type).toBe('integer');
    expect(props.excluded_wage.type).toBe('integer');
    expect(props.hours_changed.type).toBe('boolean');
    expect(fn.description).toMatch(/hours-unknown/);
    expect(fn.description).not.toMatch(/계속근로 1년 미만이면 eligible=false\)/);
    expect((fn.parameters as unknown as { required: string[] }).required).toEqual(['hire_date', 'last_work_date', 'wages_3months']);
  });
  it('계산기 링크도 제외기간·시간 변경을 싣는다', () => {
    const p = new URL(severanceCalculatorLink({ ...BASE, weekly_hours: 40, excluded_days: 30, excluded_wage: 0, hours_changed: true })!).searchParams;
    expect(p.get('excludedDays')).toBe('30');
    expect(p.get('excludedWage')).toBe('0');
    expect(p.get('hoursChanged')).toBe('1');
    const plain = new URL(severanceCalculatorLink(BASE)!).searchParams;
    expect(plain.has('excludedDays') || plain.has('excludedWage') || plain.has('hoursChanged')).toBe(false);
  });
});

describe('D3 — 1주 소정근로시간이 15시간 이상·미만 사이에서 바뀐 적 있으면 계산하지 않는다', () => {
  const E = { hireDate: '2025-01-01', lastWorkDate: '2026-02-24', wageTotal: 8_400_000, weeklyHours: 20 };
  it('엔진: hoursChanged true → 멈추고 4주 단위 안내', () => {
    expect(() => engine({ ...E, hoursChanged: true })).toThrow(HOURS_CHANGED);
    expect(engine({ ...E, hoursChanged: false }).amount).toBe(engine(E).amount);
  });
  it('챗봇: hours_changed true → 오류', async () => {
    expect(() => chat({ ...BASE, weekly_hours: 20, hours_changed: true })).toThrow(HOURS_CHANGED);
    expect(await executeTool('calc_severance', { ...BASE, weekly_hours: 20, hours_changed: true })).toEqual({ error: expect.stringMatching(HOURS_CHANGED) });
  });
  it('MCP: hoursChanged true → ok false, 입력 설명이 있다', async () => {
    type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
    const hs: Record<string, Handler> = {};
    registerCalc({ registerTool: (n: string, _c: unknown, h: Handler) => { hs[n] = h; } });
    const out = JSON.parse((await hs.calc_severance!({ ...E, hoursChanged: true })).content[0]!.text);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(HOURS_CHANGED);
    const calc = readFileSync(resolve('tools/k-labor/groups/calc.mjs'), 'utf8');
    expect(calc).toMatch(/hoursChanged: z\.boolean\(\)\.optional\(\)\.describe\('[^']*15시간 이상과 미만/);
  });

  const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const run = (expression: string) => {
    const program = `const vm = require('node:vm'); const context = vm.createContext({document:{addEventListener(){}}}); vm.runInContext(${JSON.stringify(script)}, context); console.log(JSON.stringify(vm.runInContext(${JSON.stringify(expression)}, context)));`;
    return JSON.parse(execFileSync(process.execPath, ['-'], { input: program, encoding: 'utf8' }));
  };
  const W = `{...createDefaultWorker(), startDate:'2025-01-01', endDate:'2026-02-24', wage1:'3,000,000', wage2:'3,000,000', wage3:'2,400,000', weeklyHours:'20'`;
  it('웹: 체크 칸이 있고 기본은 꺼짐, 켜면 그 칸에서 멈춘다', () => {
    expect(html).toMatch(/<input type="checkbox" id="hoursChanged"/);
    expect(run(`createDefaultWorker().hoursChanged`)).toBe(false);
    expect(run(`validateWorkerInput(${W}})`)).toBeNull();
    const p = run(`validateWorkerInput(${W}, hoursChanged:true})`);
    expect(p.field).toBe('hoursChanged');
    expect(p.message).toMatch(HOURS_CHANGED);
  });
  it('웹: 검증을 거치지 않고 계산해도 엔진이 멈춘다 · 켜고 끄면 입력이 바뀐 것으로 본다 · 링크 ?hoursChanged=1', () => {
    const msg = run(`(() => { try { calculateSeverance(${W}, hoursChanged:true}); return 'calculated'; } catch (e) { return e.message; } })()`);
    expect(msg).toMatch(HOURS_CHANGED);
    expect(run(`workerInputSignature(${W}, hoursChanged:true}) === workerInputSignature(${W}, hoursChanged:false})`)).toBe(false);
    expect(script).toMatch(/params\.get\('hoursChanged'\)/);
  });
});
