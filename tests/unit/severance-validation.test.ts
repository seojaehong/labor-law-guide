import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// /tools/severance.html — 잘못 넣은 값은 사라지는 토스트가 아니라 버튼 옆 글(aria-live)로 알린다(261112 운영 실측:
// 빈칸·abc·날짜 순서·2023-13-45 는 2.5초 토스트만 뜨고, -100 은 그대로 계산됐다).
const html = readFileSync(resolve('public/tools/severance.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function run(expression: string) {
  const program = `const vm = require('node:vm'); const context = vm.createContext({document:{addEventListener(){}}}); vm.runInContext(${JSON.stringify(script)}, context); console.log(JSON.stringify(vm.runInContext(${JSON.stringify(expression)}, context)));`;
  return JSON.parse(execFileSync(process.execPath, ['-'], { input: program, encoding: 'utf8' }));
}
const check = (patch: Record<string, unknown>) =>
  run(`validateWorkerInput({...createDefaultWorker(), startDate:'2023-01-01', endDate:'2025-12-31', wage1:'3,000,000', ...${JSON.stringify(patch)}})`);

describe('severance.html input validation', () => {
  it('accepts a normal input (commas allowed)', () => {
    expect(check({})).toBeNull();
  });

  it.each([
    ['all blank', { startDate: '', endDate: '', wage1: '' }, 'startDate', /입사일.*입력해 주세요/],
    ['blank last working day', { endDate: '' }, 'endDate', /마지막 근무일.*입력해 주세요/],
    ['impossible end date', { endDate: '2023-13-45' }, 'endDate', /올바른 날짜가 아닙니다/],
    ['impossible start date', { startDate: '2023-02-30' }, 'startDate', /올바른 날짜가 아닙니다/],
    ['last working day before start', { startDate: '2026-01-01', endDate: '2023-01-01' }, 'endDate', /입사일보다 앞섭니다/],
    ['wage abc', { wage1: 'abc' }, 'wage1', /0 이상의 숫자/],
    ['negative wage', { wage1: '-100' }, 'wage1', /0 이상의 숫자/],
    ['negative wage next to a valid one', { wage1: '-100', wage2: '3,000,000' }, 'wage1', /0 이상의 숫자/],
    ['negative bonus', { bonusTotal: '-5' }, 'bonusTotal', /상여금.*0 이상의 숫자/],
    ['all wages zero', { wage1: '0' }, 'wage1', /월급여를 1개 구간 이상/],
  ])('%s → message on the offending field', (_name, patch, field, message) => {
    const problem = check(patch);
    expect(problem.field).toBe(field);
    expect(problem.message).toMatch(message);
  });

  it('ignores the hidden 4th period when the retirement date is the 1st (3 periods)', () => {
    expect(check({ wage4: 'abc' })).toBeNull();
    expect(check({ endDate: '2026-01-14', wage4: 'abc' }).field).toBe('wage4');
  });

  it('accepts a last working day equal to the hire date (one day of work, as /exit does)', () => {
    expect(check({ startDate: '2025-12-31', endDate: '2025-12-31' })).toBeNull();
  });

  it('checks the manual retirement tax only when 자동 is off', () => {
    expect(check({ autoCalcTax: true, retirementTax: 'x' })).toBeNull();
    expect(check({ autoCalcTax: false, retirementTax: '-1' }).field).toBe('retirementTax');
  });

  // 261124 도구 전수 검수(3모델 합의) — 강제 선택은 낮은 쪽을 적용했다. 칸을 없애고 늘 높은 쪽(근로기준법 §2②)
  it('has no forced average/ordinary choice', () => {
    expect(html).not.toContain('id="wageType"');
    expect(script).not.toContain("getElementById('wageType')");
    expect(check({ wageType: 'ordinary', dailyOrdinaryWage: '' })).toBeNull();
  });

  it('the MCP twin has no forced choice either and asks for the day after 중간정산 as hireDate', () => {
    const calc = readFileSync(resolve('tools/k-labor/groups/calc.mjs'), 'utf8');
    const from = calc.indexOf("    'calc_severance',");
    const sev = calc.slice(from, calc.indexOf("    'calc_holiday_pay',", from));
    expect(sev).toContain('inputSchema');
    expect(sev).not.toContain('wageType');
    expect(sev).toMatch(/hireDate: z\.string\(\)\.describe\('[^']*중간정산[^']*다음 날/);
  });

  // 261124 — 중간정산 금액만 빼면 전 근속을 최종 임금으로 다시 세어 과다(퇴직급여법 §8②: 정산 시점부터 새로 계산)
  it('stops when a 중간정산 amount is entered and points to the day after settlement as the start date', () => {
    const problem = check({ priorSeverance: '10,000,000' });
    expect(problem.field).toBe('priorSeverance');
    expect(problem.message).toMatch(/다음 날/);
    expect(problem.message).toMatch(/입사일/);
    expect(problem.message).toMatch(/제8조/);
    expect(check({ priorSeverance: '0' })).toBeNull();
  });

  it('shows the message inline in a polite live region next to the 계산하기 button', () => {
    const area = html.match(/<p id="calcStatus"[^>]*>/)?.[0] ?? '';
    expect(area).toContain('aria-live="polite"');
    expect(html.indexOf('id="calcStatus"')).toBeLessThan(html.indexOf('onclick="onCalculate()"'));
    expect(html.indexOf('id="calcStatus"')).toBeGreaterThan(html.indexOf('id="dailyOrdinaryWage"'));
    // onCalculate 는 검증을 거치고, 검증 실패를 토스트로만 알리지 않는다
    const body = script.slice(script.indexOf('function onCalculate()'), script.indexOf('function onCalculate()') + 1500);
    expect(body).toContain('validateWorkerInput(w)');
    expect(body).not.toMatch(/showToast\('입사일과 퇴사일을 입력해 주세요/);
  });

  it('leaves non-numeric money text as typed instead of turning it into 0 on blur', () => {
    expect(run(`['abc','-100','12abc','3,000,000','', '0'].map(isMoneyText)`)).toEqual([false, false, false, true, true, true]);
    // master 가 계산하던 「3,000,000원」·앞뒤 빈칸은 그대로 받는다. 가운데 빈칸은 parseMoney 가 앞자리(3)만 읽으므로 막는다
    expect(run(`['3,000,000원',' 3,000,000 ','3000000 원','3 000 000'].map(isMoneyText)`)).toEqual([true, true, true, false]);
  });
});

describe('severance.html head and retirement-date hint', () => {
  it('declares the canonical URL and a single og:image', () => {
    expect(html).toContain('<link rel="canonical" href="https://yellowenvelope.kr/tools/severance.html">');
    expect(html.match(/property="og:image"/g)).toHaveLength(1);
  });

  it('asks for the last working day and says the retirement date is the next day', () => {
    expect(html).toMatch(/<label for="endDate">마지막 근무일<\/label>/);
    expect(html).toMatch(/<input[^>]*id="endDate"[^>]*aria-describedby="endDateHint"/);
    const hint = html.match(/<p id="endDateHint"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(hint).toContain('마지막으로 일한 날');
    expect(hint).toContain('퇴직일(산정사유발생일)은 그다음 날');
    expect(html).toMatch(/<label for="retireDate">퇴직일\(산정사유발생일\)<\/label>\s*<input[^>]*id="retireDate"[^>]*readonly/);
  });
});

// 261124 결정 변경 — v3·v4 는 칸을 고칠 때마다 저절로 저장되던 값이라 [저장]으로 남긴 값과 구별할 수 없다.
// 종전에는 v3 을 하루 빼서 v4 로 옮겼으나(261112), 이제 옛 값은 복원하지 않고 첫 로드 때 지운다. 자세한 시험은 severance-design-261124.test.ts.
describe('severance.html saved data from before the [저장]-only switch (v3·v4)', () => {
  it('does not restore or migrate unmarked v3·v4 values and removes them on load', () => {
    const v3 = JSON.stringify({ currentIndex: 0, workers: [{ startDate: '2023-03-01', endDate: '2026-11-01' }] });
    const v4 = JSON.stringify({ currentIndex: 0, workers: [{ startDate: '2023-03-01', endDate: '2026-10-31' }] });
    const out = run(`(() => {
      const store = { severanceCalcData_v3: ${JSON.stringify(v3)}, severanceCalcData_v4: ${JSON.stringify(v4)} };
      globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
      const restored = loadFromStorage();
      return { restored, endDate: state.workers[0].endDate, keys: Object.keys(store) };
    })()`);
    expect(out).toEqual({ restored: false, endDate: '', keys: [] });
    expect(script).toContain("const STORAGE_KEY = 'severanceCalcData_v5'");
    expect(script).not.toContain('migrateLegacyState');
  });
});

describe('severance.html theme follows the site rule', () => {
  // layout.tsx 와 같은 판정식: saved === 'dark' || (!saved && prefersDark)
  const init = html.match(/<script id="tool-theme-init">([\s\S]*?)<\/script>/)?.[1] ?? '';
  const dark = (saved: string | null, prefersDark: boolean, storageThrows = false) => {
    const classes = new Set<string>();
    const ctx = {
      localStorage: { getItem: () => { if (storageThrows) throw new Error('blocked'); return saved; } },
      matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && prefersDark }),
      document: { body: { classList: { add: (c: string) => classes.add(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } } },
    };
    new Function('localStorage', 'matchMedia', 'document', init)(ctx.localStorage, ctx.matchMedia, ctx.document);
    return classes.has('dark');
  };

  it('runs right after <body> opens, before the page paints', () => {
    expect(init).not.toBe('');
    expect(html.indexOf('<script id="tool-theme-init">')).toBeLessThan(html.indexOf('<nav class="work-nav"'));
    expect(html.indexOf('<script id="tool-theme-init">')).toBeGreaterThan(html.indexOf('<body>'));
  });
  it.each([
    [null, true, true],
    [null, false, false],
    ['light', true, false],
    ['dark', false, true],
  ] as const)('saved=%s prefersDark=%s → dark=%s', (saved, prefersDark, expected) => {
    expect(dark(saved, prefersDark)).toBe(expected);
  });
  it('stays light when storage is blocked (same as layout.tsx)', () => {
    expect(dark(null, true, true)).toBe(false);
  });
});

// 261124 검수 P2 #13 — 1주 소정근로시간(4주 평균)과 평균임금 제외기간(근로기준법 시행령 제2조제1항)
describe('severance.html 주 15시간·제외기간', () => {
  const w = `{...createDefaultWorker(), startDate:'2025-01-01', endDate:'2025-12-31', wage1:'6,200,000', wage2:'0', wage3:'0'`;
  it('validates the new fields', () => {
    expect(check({ weeklyHours: '' })).toBeNull();
    expect(check({ weeklyHours: '14.5' })).toBeNull();
    expect(check({ weeklyHours: 'abc' }).field).toBe('weeklyHours');
    expect(check({ weeklyHours: '169' }).field).toBe('weeklyHours');
    expect(check({ excludedDays: '1.5' }).field).toBe('excludedDays');
    expect(check({ excludedDays: '92' }).message).toMatch(/전부/);
    expect(check({ excludedDays: '0', excludedWage: '100' }).field).toBe('excludedDays');
    expect(check({ excludedDays: '10', excludedWage: '9,000,000' }).field).toBe('excludedWage');
  });
  it('subtracts the excluded days: 6,200,000 ÷ (92 − 30) × 30 = 3,000,000 (2,021,739 without)', () => {
    expect(run(`calculateSeverance(${w}}).severancePay`)).toBe(2_021_739);
    const r = run(`calculateSeverance(${w}, excludedDays:'30', excludedWage:'0'})`);
    expect(r.severancePay).toBe(3_000_000);
    expect(r.averageDays).toBe(62);
    // 261126 G4 I8 — 일수를 넣으면 그 기간 임금(없으면 0)도 직접 넣는다
    const html = run(`resultBlockHtml(calculateSeverance(${w}, excludedDays:'30', excludedWage:'0', weeklyHours:'40'}), ${w}})`);
    expect(html).toContain('(92일 − 빼는 기간 30일)');
    expect(html).not.toContain('result-eligibility');
  });
  it('says 지급 대상 아님 under 15 hours and 판정하지 않음 when blank', () => {
    const under = run(`resultBlockHtml(calculateSeverance(${w}, weeklyHours:'14'}), ${w}})`);
    expect(under).toMatch(/15시간 미만이라 퇴직금 지급 대상이 아닙니다/);
    expect(under).not.toMatch(/14일째 되는 날까지 지급/);
    const blank = run(`resultBlockHtml(calculateSeverance(${w}}), ${w}})`);
    expect(blank).toMatch(/지급 대상인지는 따지지 않았습니다/);
    const ok = run(`resultBlockHtml(calculateSeverance(${w}, weeklyHours:'15'}), ${w}})`);
    expect(ok).not.toContain('result-eligibility');
    expect(ok).toMatch(/14일째 되는 날까지 지급/);
  });
});
