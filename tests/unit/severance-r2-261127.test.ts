// 261127 G4 2차 검수(PR #298) — 퇴직금 반영분의 남은 결함. 판정표 G4_판정표_R2_261127.md #298 R11~R20. 값은 모두 합성.
//   R11(A1)  /api/tools/calc excluded_wage:null 을 0 으로 보아 16,898,116원 — null 은 빈칸이라 멈춘다.
//   R12(A8)  hours_changed:"true"(문자열)를 「변경 없음」으로 계산 — 인자 형을 본다.
//   R13(A2)  정적 계산기를 링크로 열면 저장된 앞 사람 값(빼는 기간·임금·시간 변경 체크)을 이어받았다 — 기본값 + 주소 값만.
//   R15(O8)  옛 저장본의 기본값 excludedWage '0' 이 복원돼 I8 을 우회 — 옛 기본 0 은 빈칸으로 읽는다.
//   R16(F7·A) D3 안내에 4주를 나누는 방향(퇴직일부터 거슬러)이 없었다 — 엔진 상수 한 곳에서 웹·MCP·챗봇·/exit 가 같이 쓴다.
//   R17(F8)  빼는 기간 안내에 가족돌봄 등을 위한 근로시간 단축 기간(남녀고용평등법 제22조의4 제4항)이 없었다.
//   R18(O9)  1년 미만을 상태줄은 「아닙니다」, 다음 할 일·확인창은 「아닐 수 있습니다」로 달리 적었다 — 단정으로 맞춘다.
//   R19(O10) /exit 시간 변경 체크를 켜면 1년 미만 확정이어도 「14일 안에」 안내가 사라졌다.
//   R20(O11·A13) 챗봇은 주 0시간을 under-15h 로 답하는데 링크는 0 을 빼서 계산기가 hours-unknown 으로 열렸다.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import { HOURS_CHANGED_MESSAGE } from '@/lib/calc/severance';
import { calcSeverance as chat } from '@/lib/labor-calc';
import { TOOLS } from '@/lib/chat/tools/definitions';
import { severanceCalculatorLink } from '@/lib/chat/severance-link';
import { POST } from '@/app/api/tools/calc/route';
import { estimateSeverance, severanceCheck } from '@/app/exit/exit-calc';
import { exitResultView } from '@/app/exit/result';
import { registerCalc } from '../../tools/k-labor/groups/calc.mjs';

const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
/** severance.html 첫 스크립트를 vm 에서 돌린다. store = localStorage 처음 내용 */
function run(expression: string, store: Record<string, string> = {}) {
  const ls = `{ _d: ${JSON.stringify(store)}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } }`;
  const program = `const vm = require('node:vm'); const context = vm.createContext({document:{addEventListener(){}}, localStorage: ${ls}}); vm.runInContext(${JSON.stringify(script)}, context); console.log(JSON.stringify(vm.runInContext(${JSON.stringify(expression)}, context)));`;
  return JSON.parse(execFileSync(process.execPath, ['-'], { input: program, encoding: 'utf8' }));
}

// 아스트라 A1 재현 입력 — 2024-01-01 입사, 2025-12-31 마지막 근무일, 3개월 900만, 주 40시간, 빼는 기간 60일
const NO_DAYS = { hire_date: '2024-01-01', last_work_date: '2025-12-31', wages_3months: [3_000_000, 3_000_000, 3_000_000] as [number, number, number], weekly_hours: 40 };
const A1 = { ...NO_DAYS, excluded_days: 60 };
const api = async (args: Record<string, unknown>) => {
  const res = await POST(new Request('http://localhost/api/tools/calc', { method: 'POST', body: JSON.stringify({ tool: 'calc_severance', args }) }) as never);
  return { status: res.status, body: await res.json() };
};

describe('R11 — excluded_wage: null 은 빈칸이다(0 이 아니다)', () => {
  it('챗봇 계산: 일수 60·임금 null → 멈춘다(종전 16,898,116원)', () => {
    expect(() => chat({ ...A1, excluded_wage: null as never })).toThrow(/그 기간에 받은 임금/);
  });
  it('API: 400 과 같은 안내, 숫자 0 을 넣으면 200·16,898,116원', async () => {
    const blank = await api({ ...A1, excluded_wage: null });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toMatch(/그 기간에 받은 임금/);
    const zero = await api({ ...A1, excluded_wage: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.result.severance_pay).toBe(16_898_116);
  });
  it('빼는 기간이 없으면 null 은 넣지 않은 것과 같다', () => {
    expect(chat({ ...NO_DAYS, excluded_wage: null as never, weekly_hours: null as never }).status).toBe('hours-unknown');
  });
});

describe('R12 — /api/tools/calc calc_severance 인자 형을 본다', () => {
  it('hours_changed:"true"(문자열) → 400(종전 200·5,877,606원)', async () => {
    const r = await api({ ...NO_DAYS, hours_changed: 'true' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/hours_changed/);
  });
  it.each([
    ['weekly_hours', '40'],
    ['excluded_days', '60'],
    ['excluded_days', 1.5],
    ['excluded_wage', '0'],
    ['annual_bonus', '1000000'],
    ['include_tax', 'yes'],
    ['hire_date', 20240101],
    ['wages_3months', ['3000000', '3000000', '3000000']],
    ['wages_3months', [3_000_000, 3_000_000]],
  ])('%s = %j → 그 인자 이름을 담아 멈춘다', (key, value) => {
    expect(() => chat({ ...A1, excluded_wage: 0, [key]: value } as never)).toThrow(new RegExp(String(key)));
  });
  it('맞는 형은 그대로 계산한다(불리언 true 는 D3 안내로 멈춤)', () => {
    expect(chat({ ...A1, excluded_wage: 0 }).severance_pay).toBe(16_898_116);
    expect(() => chat({ ...A1, excluded_wage: 0, hours_changed: true })).toThrow(HOURS_CHANGED_MESSAGE);
  });
});

describe('R13 — 링크로 열면 저장본을 복원하지 않는다', () => {
  it.each([
    ['?start=2024-01-01&end=2026-01-01&w1=3000000&run=1', true],
    ['?weeklyHours=40', true],
    ['?hoursChanged=1', true],
    ['?excludedDays=30&excludedWage=0', true],
    ['?last=2025-12-31', true],
    ['', false],
    ['?utm_source=chat', false],
  ])('%s → 링크 입력 %s', (q, expected) => {
    // vm 맥락에는 URLSearchParams 가 없어 has 만 가진 대역을 넘긴다(이름 목록은 여기서 실제 URLSearchParams 로 뽑는다)
    const keys = [...new URLSearchParams(q).keys()];
    expect(run(`openedFromLink({ has: (k) => ${JSON.stringify(keys)}.includes(k) })`)).toBe(expected);
  });
  it('init 은 링크로 열었을 때 loadFromStorage 를 부르지 않는다', () => {
    // 링크로 열어도 표식 없는 옛 자동 저장값(v4·v3) 지우기는 건너뛰지 않는다
    expect(script).toMatch(/if \(openedFromLink\(params\)\) removeOldStorage\(\);\s*else loadFromStorage\(\);/);
  });
});

describe('R15 — 옛 저장본의 기본값 0 은 빈칸으로 읽는다', () => {
  const worker = { startDate: '2023-01-01', endDate: '2025-12-31', wage1: '3,000,000', excludedDays: '60', excludedWage: '0' };
  const legacy = { severanceCalcData_v5: JSON.stringify({ savedAt: '2026-11-01T00:00:00.000Z', state: { currentIndex: 0, workers: [worker] } }) };
  it('형식 표시가 없는 저장본(빼는 기간 임금 기본값이 0 이던 때) → 빈칸, 그래서 계산 전에 멈춘다', () => {
    expect(run(`(loadFromStorage(), state.workers[0].excludedWage)`, legacy)).toBe('');
    expect(run(`(loadFromStorage(), validateWorkerInput(state.workers[0]).field)`, legacy)).toBe('excludedWage');
  });
  it('지금 형식으로 저장한 0 은 0 그대로(직접 넣은 0)', () => {
    const store = run(`(state.workers = [{...createDefaultWorker(), ...${JSON.stringify(worker)}}], saveToStorage(), localStorage._d)`);
    expect(JSON.parse(store.severanceCalcData_v5).format).toBe(2);
    expect(run(`(loadFromStorage(), state.workers[0].excludedWage)`, store)).toBe('0');
  });
});

describe('R16 — 4주는 퇴직일부터 거슬러 나눈다(엔진 상수 한 곳)', () => {
  const CORE = '재직기간을 퇴직일부터 거슬러 4주 단위로 나눠 4주 평균 1주 소정근로시간이 15시간 미만인 4주는 계속근로기간에서 뺍니다';
  it('엔진 문장', () => {
    expect(HOURS_CHANGED_MESSAGE).toContain(CORE);
    expect(HOURS_CHANGED_MESSAGE).toMatch(/퇴직연금복지과-5254, 2019\. 12\. 9\. 회신 취지/);
  });
  it('웹 체크 칸 설명도 같은 방향', () => {
    const hint = html.match(/<p id="hoursChangedHint"[^>]*>([^<]*)<\/p>/)![1];
    expect(hint).toContain('퇴직일부터 거슬러 4주 단위로 나눠');
  });
  it('MCP hoursChanged 설명과 챗봇 hours_changed 설명은 엔진 문장을 그대로 싣는다', () => {
    let schema: Record<string, { description?: string }> = {};
    registerCalc({ registerTool: (n: string, c: { inputSchema: typeof schema }) => { if (n === 'calc_severance') schema = c.inputSchema; } });
    expect(schema.hoursChanged.description).toContain(HOURS_CHANGED_MESSAGE);
    const fn = TOOLS.find((t) => t.function.name === 'calc_severance')!.function;
    const props = fn.parameters.properties as unknown as Record<string, { description: string }>;
    expect(props.hours_changed.description).toContain(HOURS_CHANGED_MESSAGE);
  });
  it('/exit 멈춤 문장도 같다', () => {
    const v = exitResultView({ check: severanceCheck('2023-03-02', '2026-11-30', 40), sev: null, lv: null, ent: null, hoursChanged: true });
    expect(v.verdict[0]).toContain(CORE);
  });
});

describe('R17 — 빼는 기간에 가족돌봄 등을 위한 근로시간 단축 기간', () => {
  const ITEM = /가족돌봄 등을 위한 근로시간 단축 기간\(남녀고용평등과 일·가정 양립 지원에 관한 법률 제22조의4 제4항\)/;
  it('웹 안내', () => {
    expect(html.match(/<p id="excludedHint"[^>]*>([^<]*)<\/p>/)![1]).toMatch(ITEM);
  });
  it('MCP 설명·excludedDays, 챗봇 excluded_days', () => {
    let desc = '';
    let schema: Record<string, { description?: string }> = {};
    registerCalc({ registerTool: (n: string, c: { description: string; inputSchema: typeof schema }) => { if (n === 'calc_severance') { desc = c.description; schema = c.inputSchema; } } });
    expect(desc).toMatch(/제22조의4제4항의 가족돌봄 등을 위한 근로시간 단축 기간/);
    expect(schema.excludedDays.description).toMatch(/남녀고용평등법 제22조의4제4항: 가족돌봄 등을 위한 근로시간 단축 기간/);
    const props = TOOLS.find((t) => t.function.name === 'calc_severance')!.function.parameters.properties as unknown as Record<string, { description: string }>;
    expect(props.excluded_days.description).toMatch(/가족돌봄 등을 위한 근로시간 단축 기간\(남녀고용평등법 제22조의4제4항\)/);
  });
});

describe('R18 — 1년 미만은 한 화면에서 같은 말(단정)', () => {
  it('「아닐 수 있습니다」가 없고, 다음 할 일·확인창도 「아닙니다」·제4조제1항 단서', () => {
    expect(html).not.toMatch(/지급 대상이 아닐 수 있습니다/);
    expect(html).toContain('<p>계속근로기간이 1년 미만이라 퇴직금 지급 대상이 아닙니다(근로자퇴직급여 보장법 제4조제1항 단서). 위 금액은 입력값으로 계산만 한 것입니다.</p>');
    expect(html).toContain('1년 미만입니다.\\n퇴직금 지급 대상이 아닙니다.\\n계속 계산하시겠습니까?');
  });
});

describe('R19 — /exit 시간 변경 체크를 켜도 1년 미만이면 14일 안내를 남긴다', () => {
  const view = (hire: string) => exitResultView({ check: severanceCheck(hire, '2026-11-30', 40), sev: estimateSeverance(hire, '2026-11-30', 3_000_000), lv: null, ent: null, weeklyHours: 40, hoursChanged: true });
  it('1년 미만(2026-06-01 입사) → 멈춤 문장 + 「14일 안에」', () => {
    const v = view('2026-06-01');
    expect(v.verdict[0]).toBe(HOURS_CHANGED_MESSAGE);
    expect(v.nextNote).toMatch(/퇴직일부터 14일 안에 받아야 합니다\(근로기준법 제36조\)/);
  });
  it('1년 이상이면 지급 대상인지 모르므로 그 안내를 붙이지 않는다(종전 그대로)', () => {
    expect(view('2023-03-02').nextNote).toBeUndefined();
  });
});

describe('R20 — 주 0시간도 링크에 싣는다', () => {
  const ARGS = { hire_date: '2024-01-01', last_work_date: '2025-12-31', wages_3months: [3_000_000, 3_000_000, 3_000_000] };
  it('챗봇 링크 weekly_hours 0 → &weeklyHours=0(챗봇 답 under-15h 와 같은 입력)', () => {
    expect(chat({ ...ARGS, wages_3months: ARGS.wages_3months as [number, number, number], weekly_hours: 0 }).status).toBe('under-15h');
    expect(severanceCalculatorLink({ ...ARGS, weekly_hours: 0 })).toMatch(/[?&]weeklyHours=0(&|$)/);
  });
  it('음수·168 초과는 싣지 않는다(엔진이 받지 않는 값)', () => {
    expect(severanceCalculatorLink({ ...ARGS, weekly_hours: -1 })).not.toMatch(/weeklyHours/);
    expect(severanceCalculatorLink({ ...ARGS, weekly_hours: 169 })).not.toMatch(/weeklyHours/);
  });
  it('/exit 계산기 링크도 0 을 싣는다(같은 규칙)', () => {
    const v = exitResultView({ check: severanceCheck('2023-03-02', '2026-11-30', 0), sev: null, lv: null, ent: null, weeklyHours: 0, hoursChanged: true });
    expect(v.next[0].href).toBe('/tools/severance.html?weeklyHours=0&hoursChanged=1');
  });
});
