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
  run(`validateWorkerInput({...createDefaultWorker(), startDate:'2023-01-01', endDate:'2026-01-01', wage1:'3,000,000', ...${JSON.stringify(patch)}})`);

describe('severance.html input validation', () => {
  it('accepts a normal input (commas allowed)', () => {
    expect(check({})).toBeNull();
  });

  it.each([
    ['all blank', { startDate: '', endDate: '', wage1: '' }, 'startDate', /입사일.*입력해 주세요/],
    ['blank end date', { endDate: '' }, 'endDate', /산정사유발생일.*입력해 주세요/],
    ['impossible end date', { endDate: '2023-13-45' }, 'endDate', /올바른 날짜가 아닙니다/],
    ['impossible start date', { startDate: '2023-02-30' }, 'startDate', /올바른 날짜가 아닙니다/],
    ['end before start', { startDate: '2026-01-01', endDate: '2023-01-01' }, 'endDate', /입사일보다 뒤/],
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
    expect(check({ endDate: '2026-01-15', wage4: 'abc' }).field).toBe('wage4');
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

  it('explains under the 산정사유발생일 field that it is the day after the last working day', () => {
    expect(html).toMatch(/<input[^>]*id="endDate"[^>]*aria-describedby="endDateHint"/);
    const hint = html.match(/<p id="endDateHint"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(hint).toContain('마지막 근무일 다음 날');
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
