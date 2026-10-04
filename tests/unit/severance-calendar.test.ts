import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const file = resolve('public/tools/severance.html');
const script = readFileSync(file, 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
const dates = [
  ['2023-01-01', '2026-01-01'],
  ['2020-02-29', '2024-03-01'],
  ['2023-03-12', '2024-03-12'],
  ['2023-11-05', '2024-11-05'],
  ['2024-01-31', '2025-05-31'],
];
function evaluate(tz: string, expression: string) {
  const program = `const vm = require('node:vm'); const context = vm.createContext({document:{addEventListener(){}}}); vm.runInContext(${JSON.stringify(script)}, context); console.log(JSON.stringify(vm.runInContext(${JSON.stringify(expression)}, context)));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', program], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
}
const expression = `${JSON.stringify(dates)}.map(([startDate,endDate])=>({days:dateDiffDays(startDate,endDate),years:calcServiceYears(startDate,endDate),fraction:calcPreciseServiceFraction(startDate,endDate),periods:calc3MonthPeriod(endDate),result:calculateSeverance({...createDefaultWorker(),startDate,endDate,wage1:'3000000',wage2:'3000000',wage3:'3000000'})}))`;

describe('date-only retirement calendar', () => {
  const expected = evaluate('Asia/Seoul', expression);
  it.each(['UTC', 'America/Los_Angeles', 'America/New_York'])('preserves all calendar and calculation outputs in %s', tz => {
    expect(evaluate(tz, expression)).toEqual(expected);
  });
  it('retains the exact January first boundary', () => {
    expect(expected[0].days).toBe(1096);
    expect(expected[0].periods.map((p: {periodText:string}) => p.periodText)).toEqual(['10.1~10.31', '11.1~11.30', '12.1~12.31']);
  });
  it('rejects impossible dates instead of silently rolling into next month', () => {
    expect(evaluate('America/Los_Angeles', `['2026-02-30','2025-02-29','2026-13-01','2026-1-01',''].map(value=>Number.isNaN(parseDateOnlyUTC(value).getTime()))`)).toEqual([true,true,true,true,true]);
    expect(evaluate('UTC', `calculateSeverance({...createDefaultWorker(),startDate:'2026-02-30',endDate:'2027-01-01'})`)).toBeNull();
  });
  it('formats report dates using the same UTC calendar', () => {
    expect(script).toContain('const startDate = parseDateOnlyUTC(w.startDate)');
    expect(script).toContain('d.getUTCFullYear()');
    expect(script).not.toMatch(/\.get(?:FullYear|Month|Date)\(/);
  });
});
