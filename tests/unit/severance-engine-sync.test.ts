import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEngineBlock, currentBlock, HTML } from '../../scripts/build-severance-engine.mjs';
import { calcSeverance } from '@/lib/calc/severance';
import { estimateSeverance } from '@/app/exit/exit-calc';

// 퇴직금은 한 엔진으로 센다 — /tools/severance.html 은 엔진을 생성 스크립트로 넣고, /exit·/api/tools/calc 는 import 한다.
// 금액은 고용노동부 퇴직금 계산기(moel.go.kr/retirementpayCal.do)에 같은 합성 입력을 넣어 받은 값이다(2026-10-28 확인).

const html = readFileSync(HTML, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(script, context);
const run = <T,>(expr: string): T => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));

// [입사일, 마지막 근무일, 3개월 임금총액, 상여, 연차수당, 1일 통상임금, 고용노동부 계산기 퇴직금]
const MOEL: [string, string, number, number, number, number, number][] = [
  ['2023-01-01', '2025-12-31', 9_000_000, 0, 0, 0, 8_812_389],
  ['2020-03-15', '2026-10-14', 10_500_000, 0, 0, 0, 22_560_305],
  ['2021-06-01', '2026-05-30', 8_700_000, 4_000_000, 0, 0, 15_989_012],
  ['2019-02-10', '2026-07-30', 12_345_678, 0, 1_500_000, 0, 31_002_391],
  ['2024-02-29', '2025-02-28', 7_800_000, 0, 0, 0, 2_607_123],
  ['2018-11-20', '2026-12-31', 9_300_000, 6_000_000, 900_000, 0, 29_194_253],
  ['2022-04-04', '2026-05-28', 6_600_000, 0, 0, 0, 9_240_204],
  ['2015-09-30', '2026-03-30', 15_000_000, 0, 0, 0, 52_534_248],
  ['2023-07-17', '2026-09-16', 6_000_000, 0, 0, 80_000, 7_614_247],
  ['2010-01-04', '2026-10-27', 21_000_000, 10_000_000, 0, 0, 128_928_086],
  ['2024-08-20', '2028-05-30', 9_900_000, 0, 0, 0, 12_339_606],
];

describe('퇴직금 엔진 — 한 벌', () => {
  it('severance.html 안 엔진 블록이 src/lib/calc/severance.ts 와 같다 (다르면 node scripts/build-severance-engine.mjs)', () => {
    expect(currentBlock(html)).toBe(buildEngineBlock());
  });

  it.each(MOEL)('고용노동부 계산기와 같다 — %s ~ %s', (hire, last, total, bonus, leave, ord, expected) => {
    expect(calcSeverance({ hireDate: hire, lastWorkDate: last, wageTotal: total, annualBonus: bonus, annualLeavePay: leave, dailyOrdinaryWage: ord }).amount).toBe(expected);
    // html 은 퇴직일(마지막 근무일 다음 날)을 받고 임금을 달마다 나눠 받는다 — 합계만 같으면 된다
    const retire = calcSeverance({ hireDate: hire, lastWorkDate: last, wageTotal: 1 }).retirementDate;
    const r = run<{ severancePay: number }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'${hire}',endDate:'${retire}',wage1:'${total}',bonusTotal:'${bonus}',annualLeave:'${leave}',dailyOrdinaryWage:'${ord || ''}'})`,
    );
    expect(r.severancePay).toBe(expected);
  });

  it('/exit 추정도 같은 엔진이다', () => {
    expect(estimateSeverance('2023-01-01', '2025-12-31', 3_000_000).amount).toBe(8_812_389);
  });
});
