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

  it('keeps the ordinary-wage requirement', () => {
    expect(check({ wageType: 'ordinary', dailyOrdinaryWage: '' }).field).toBe('dailyOrdinaryWage');
  });

  it('shows the message inline in a polite live region next to the 계산하기 button', () => {
    const area = html.match(/<p id="calcStatus"[^>]*>/)?.[0] ?? '';
    expect(area).toContain('aria-live="polite"');
    expect(html.indexOf('id="calcStatus"')).toBeLessThan(html.indexOf('onclick="onCalculate()"'));
    expect(html.indexOf('id="calcStatus"')).toBeGreaterThan(html.indexOf('id="wageType"'));
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

describe('severance.html saved data from before the 마지막 근무일 switch (v3)', () => {
  it('moves the v3 retirement date back one day, drops non-dates, keeps the rest', () => {
    const v3 = {
      currentIndex: 1,
      workers: [
        { workerName: 'A', startDate: '2023-03-01', endDate: '2026-11-01', wage1: '3,000,000' },
        { workerName: 'B', startDate: '2024-01-01', endDate: '2024-03-01' },
        { workerName: 'C', startDate: '2024-01-01', endDate: '' },
        { workerName: 'D', startDate: '2024-01-01', endDate: '2026-1' },
      ],
    };
    const out = run(`migrateLegacyState(${JSON.stringify(v3)})`);
    expect(out.workers.map((w: { endDate: string }) => w.endDate)).toEqual(['2026-10-31', '2024-02-29', '', '']);
    expect(out.workers[0]).toMatchObject({ workerName: 'A', startDate: '2023-03-01', wage1: '3,000,000' });
    expect(out.currentIndex).toBe(1);
  });

  it('reads v4 first and migrates v3 only once (the old key is removed after the move)', () => {
    const load = script.slice(script.indexOf('function loadFromStorage()'), script.indexOf('function loadFromStorage()') + 1400);
    expect(script).toContain("const STORAGE_KEY = 'severanceCalcData_v4'");
    expect(script).toContain("const LEGACY_STORAGE_KEY = 'severanceCalcData_v3'");
    expect(load.indexOf('getItem(STORAGE_KEY)')).toBeLessThan(load.indexOf('getItem(LEGACY_STORAGE_KEY)'));
    expect(load).toContain('migrateLegacyState(JSON.parse(legacy))');
    expect(load).toContain('removeItem(LEGACY_STORAGE_KEY)');
  });

  it('runs the migration end to end against a fake localStorage', () => {
    const v3 = JSON.stringify({ currentIndex: 0, workers: [{ startDate: '2023-03-01', endDate: '2026-11-01' }] });
    const out = run(`(() => {
      const store = { severanceCalcData_v3: ${JSON.stringify(v3)} };
      globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
      const first = loadFromStorage() && state.workers[0].endDate;
      const second = loadFromStorage() && state.workers[0].endDate;
      return { first, second, keys: Object.keys(store) };
    })()`);
    expect(out).toEqual({ first: '2026-10-31', second: '2026-10-31', keys: ['severanceCalcData_v4'] });
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
