import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));

import * as build from '../../scripts/build-severance-engine.mjs';
import { calcRetirementTax as engineTax, serviceMonths, serviceYears } from '@/lib/calc/retirement-tax';
import * as chat from '@/lib/labor-calc';
import { executeTool } from '@/lib/chat/tools/execute';
import { POST } from '@/app/api/tools/calc/route';

// 퇴직소득세 엔진 한 벌 — 퇴직금 계산기(public/tools/severance.html)와 챗봇·/api/tools/calc(src/lib/labor-calc.ts)가
// 정본 엔진(src/lib/calc/retirement-tax.ts)을 부른다. 숫자는 엔진이 내고 두 곳은 입력 날짜와 응답 모양만 잇는다.
// 날짜 뜻: 계산기 칸 = 퇴직일(마지막 근무일 다음 날, 임금근로시간과-844), 엔진·챗봇 = 마지막 근무일(국세청 프로그램 「퇴사일」).
// 기대값은 조문 식(소득세법 §48①·②, §14⑥, §55①·②, 국고금 관리법 §47, 지방세법 §103의13①)을 분수·정수로 푼 값이다(합성 입력).

const html = readFileSync(build.HTML, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(script, context);
const run = <T,>(expr: string): T => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));
const htmlFn = <F,>(name: string): F => vm.runInContext(name, context) as F;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const plusDay = (s: string) => iso(Date.parse(`${s}T00:00:00Z`) + DAY);

/** 국세청 「퇴직소득 세액계산 프로그램」(2026 하반기 D251229) T25 = DATEDIF(기산일, 퇴사일, "M") + 1, 근속연수 = 올림(÷12) */
function datedifM(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}
const ntsYears = (hire: string, last: string) => Math.ceil((datedifM(hire, last) + 1) / 12);

type HtmlTax = {
  severancePay: number; serviceYears: number; svcDeduction: number; afterDeduction: number; convertedWage: number;
  cwDeduction: number; taxBase: number; convertedTax: number; incomeTax: number; localTax: number; totalTax: number;
  skipped?: string;
};
type ChatTax = ReturnType<typeof chat.calcRetirementTax>;
const htmlTax = htmlFn<(pay: number, start: string, end: string) => HtmlTax>('calcRetirementTax');
const htmlYears = htmlFn<(start: string, end: string) => number | null>('calcServiceYears');

// 세 곳이 같은 칸을 같은 값으로 내는가 — 엔진 값이 기대값이다
function expectSame(pay: number, hire: string, last: string) {
  const e = engineTax({ pay, hireDate: hire, lastWorkDate: last });
  const h = htmlTax(pay, hire, plusDay(last));
  const c = chat.calcRetirementTax(pay, hire, last);
  const want = {
    years: e.years, svc: e.serviceDeductionTable, after: pay - e.serviceDeduction, conv: e.converted, convDed: e.convertedDeduction,
    base: e.taxBase, convTax: e.convertedTax, income: e.incomeTax, local: e.localTax, total: e.total,
  };
  expect({
    years: h.serviceYears, svc: h.svcDeduction, after: h.afterDeduction, conv: h.convertedWage, convDed: h.cwDeduction,
    base: h.taxBase, convTax: h.convertedTax, income: h.incomeTax, local: h.localTax, total: h.totalTax,
  }, `html ${pay} ${hire}~${last}`).toEqual(want);
  expect({
    years: c.service_years, svc: c.svc_deduction, after: c.after_deduction, conv: c.converted_wage, convDed: c.cw_deduction,
    base: c.tax_base, convTax: c.converted_tax, income: c.income_tax, local: c.local_tax, total: c.total_tax,
  }, `chat ${pay} ${hire}~${last}`).toEqual(want);
  return e;
}

// ─────────────────────────────────────────────────────────────
// 1. 지금 출력 고정(스냅샷) — 엔진을 바꾸기 전 코드로 받은 값이다. 바꾼 뒤에도 같아야 한다.
//    tax.legal_basis 만 빼고 본다 — 인용 조문을 고쳤다(아래 4절).
// ─────────────────────────────────────────────────────────────
const SEV_BASIS =
  '근로자퇴직급여 보장법 제8조 + 시행령 제3조 / 퇴직금 = 1일평균임금 × 30 × 재직일수 ÷ 365 (고용노동부 퇴직금 계산기와 같은 끝수: 평균임금 소수 둘째 자리 올림, 퇴직금 원 단위 반올림) / 평균임금 = 퇴직 직전 3개월 임금총액 / 총일수 (상여금·연차수당 가산) / 통상임금이 더 높으면 통상임금 사용';

describe('응답 모양 그대로 — 챗봇·/api/tools/calc 의 calc_severance(include_tax)', () => {
  it('S1 3년 · 8,812,389원 — 키 순서와 값이 바꾸기 전과 같다', () => {
    const r = chat.calcSeverance({ hire_date: '2023-01-01', last_work_date: '2025-12-31', wages_3months: [3_000_000, 3_000_000, 3_000_000], include_tax: true });
    expect(Object.keys(r)).toEqual([
      'hire_date', 'last_work_date', 'retirement_date', 'service_days', 'eligible', 'three_months_start', 'total_days_3m', 'wage_total',
      'bonus_addition', 'annual_leave_addition', 'avg_wage_base', 'daily_avg_wage', 'applied_daily_wage', 'wage_type', 'severance_pay',
      'legal_basis', 'tax', 'net_severance',
    ]);
    expect(Object.keys(r.tax!)).toEqual([
      'severance_pay', 'service_years', 'svc_deduction', 'after_deduction', 'converted_wage', 'cw_deduction', 'tax_base',
      'converted_tax', 'income_tax', 'local_tax', 'total_tax', 'legal_basis',
    ]);
    expect(r).toEqual({
      hire_date: '2023-01-01', last_work_date: '2025-12-31', retirement_date: '2026-01-01', service_days: 1096, eligible: true,
      three_months_start: '2025-10-01', total_days_3m: 92, wage_total: 9_000_000, bonus_addition: 0, annual_leave_addition: 0,
      avg_wage_base: 9_000_000, daily_avg_wage: 97826.09, applied_daily_wage: 97826.09, wage_type: '평균임금', severance_pay: 8_812_389,
      legal_basis: SEV_BASIS,
      tax: {
        severance_pay: 8_812_389, service_years: 3, svc_deduction: 3_000_000, after_deduction: 5_812_389, converted_wage: 23_249_556,
        cw_deduction: 17_149_733, tax_base: 6_099_823, converted_tax: 365_989, income_tax: 91_490, local_tax: 9_140, total_tax: 100_630,
        legal_basis: expect.any(String),
      },
      net_severance: 8_711_759,
    });
  });

  it('S2 §48② 상한 — svc_deduction 은 예전처럼 표 값 3,000,000(상한 적용값 아님), after_deduction 0', () => {
    const r = chat.calcSeverance({ hire_date: '2023-07-03', last_work_date: '2026-07-02', wages_3months: [700_000, 700_000, 700_000], include_tax: true });
    expect(r.severance_pay).toBe(2_078_820);
    expect(r.tax).toEqual({
      severance_pay: 2_078_820, service_years: 3, svc_deduction: 3_000_000, after_deduction: 0, converted_wage: 0, cw_deduction: 0,
      tax_base: 0, converted_tax: 0, income_tax: 0, local_tax: 0, total_tax: 0, legal_basis: expect.any(String),
    });
    expect(r.net_severance).toBe(2_078_820);
  });

  it('S3 17년 · 상여 가산 — 128,928,086원', () => {
    const r = chat.calcSeverance({ hire_date: '2010-01-04', last_work_date: '2026-10-27', wages_3months: [7_000_000, 7_000_000, 7_000_000], annual_bonus: 10_000_000, include_tax: true });
    expect(r.tax).toEqual({
      severance_pay: 128_928_086, service_years: 17, svc_deduction: 32_500_000, after_deduction: 96_428_086, converted_wage: 68_066_884,
      cw_deduction: 44_040_130, tax_base: 24_026_754, converted_tax: 2_344_013, income_tax: 3_320_680, local_tax: 332_060, total_tax: 3_652_740,
      legal_basis: expect.any(String),
    });
    expect(r.net_severance).toBe(125_275_346);
  });
});

describe('응답 모양 그대로 — 계산기 calculateSeverance', () => {
  const H1_TAX = {
    severancePay: 8_812_389, serviceYears: 3, svcDeduction: 3_000_000, afterDeduction: 5_812_389, convertedWage: 23_249_556,
    cwDeduction: 17_149_733, taxBase: 6_099_823, convertedTax: 365_989, incomeTax: 91_490, localTax: 9_140, totalTax: 100_630,
  };

  it('H1 입사 2023-01-01 · 퇴직일 2026-01-01 · 9,000,000원', () => {
    const r = run<Record<string, unknown>>(`calculateSeverance({...createDefaultWorker(),startDate:'2023-01-01',endDate:'2026-01-01',wage1:'9000000'})`);
    expect(r).toMatchObject({ serviceDays: 1096, serviceYears: 3, severancePay: 8_812_389, priorSev: 0, retirementTax: 91_490, localTax: 9_140, totalTax: 100_630, netSeverance: 8_711_759 });
    expect(r.taxResult).toEqual(H1_TAX);
  });

  // 조건 4 — 중간정산 칸은 지급액에서만 뺀다. 세금은 전체 퇴직금으로 센다(예전 동작 그대로)
  it('H3 중간정산 5,000,000원 — 세액은 퇴직금 전액으로, 실수령에서만 뺀다', () => {
    const r = run<{ severancePay: number; priorSev: number; retirementTax: number; localTax: number; netSeverance: number; taxResult: HtmlTax }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'2010-01-04',endDate:'2026-10-28',wage1:'21000000',bonusTotal:'10000000',priorSeverance:'5000000'})`,
    );
    expect(r.severancePay).toBe(128_928_086);
    expect(r.priorSev).toBe(5_000_000);
    expect(r.taxResult).toEqual({
      severancePay: 128_928_086, serviceYears: 17, svcDeduction: 32_500_000, afterDeduction: 96_428_086, convertedWage: 68_066_884,
      cwDeduction: 44_040_130, taxBase: 24_026_754, convertedTax: 2_344_013, incomeTax: 3_320_680, localTax: 332_060, totalTax: 3_652_740,
    });
    const e = engineTax({ pay: 128_928_086, hireDate: '2010-01-04', lastWorkDate: '2026-10-27' });
    expect([r.retirementTax, r.localTax]).toEqual([e.incomeTax, e.localTax]);
    expect(r.netSeverance).toBe(128_928_086 - 3_320_680 - 332_060 - 5_000_000);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. 날짜 — 계산기는 퇴직일을 받아 하루 빼서 엔진에 넘긴다(조건 1). 챗봇은 마지막 근무일을 그대로 넘긴다.
// ─────────────────────────────────────────────────────────────
describe('근속연수 — 계산기 calcServiceYears(입사, 퇴직일) = 엔진 serviceYears(입사, 마지막 근무일)', () => {
  // [id, 입사, 마지막 근무일, 근속월수, 근속연수]
  const D: [string, string, string, number, number][] = [
    ['D1 5년 꽉 참(기념일 전날)', '2021-08-01', '2026-07-31', 60, 5],
    ['D2 기념일 당일 → 6년', '2021-08-01', '2026-08-01', 61, 6],
    ['D3 2/29 입사 · 2/28 마지막 근무', '2020-02-29', '2025-02-28', 60, 5],
    ['D4 2/29 입사 · 3/1 마지막 근무', '2020-02-29', '2025-03-01', 61, 6],
    ['D5 월말 입사 · 하루 전', '2021-08-31', '2026-08-30', 60, 5],
    ['D6 월말 입사 · 기념일', '2021-08-31', '2026-08-31', 61, 6],
    ['D7 같은 날 하루', '2023-03-15', '2023-03-15', 1, 1],
    ['D8 1/31 입사 · 2/29', '2024-01-31', '2024-02-29', 1, 1],
  ];
  it.each(D)('%s', (_id, hire, last, months, years) => {
    expect(serviceMonths(hire, last)).toBe(months);
    expect(serviceYears(hire, last)).toBe(years);
    expect(ntsYears(hire, last)).toBe(years);
    expect(htmlYears(hire, plusDay(last))).toBe(years);
    expect(chat.calcRetirementTax(20_000_000, hire, last).service_years).toBe(years);
  });

  it('N1 하루를 빼지 않으면 6년이 되어 216,000원이 나온다 — 계산기는 280,000원(T3)을 낸다', () => {
    const wrong = engineTax({ pay: 20_000_000, hireDate: '2021-08-01', lastWorkDate: '2026-08-01' });
    expect([wrong.years, wrong.incomeTax, wrong.localTax]).toEqual([6, 216_000, 21_600]);
    const h = htmlTax(20_000_000, '2021-08-01', '2026-08-01');
    expect([h.serviceYears, h.incomeTax, h.localTax]).toEqual([5, 280_000, 28_000]);
  });

  it('입사일이 1900년 전이면(연도 오타) 근속연수 칸은 null — 엔진이 거부하는 날짜로 계산하지 않는다', () => {
    expect(htmlYears('0202-01-01', '2026-07-02')).toBeNull();
    expect(htmlYears('2021-08-01', '2026-08-01')).toBe(5);
  });

  // 리드 증명(blast-radius 261029)을 정식 시험으로 — 2019~2024 입사 전 일자 × 마지막 근무일 0~2200일 = 4,824,592쌍
  it('전수 — 국세청 DATEDIF 식 = 엔진 = 계산기(퇴직일 −1)', { timeout: 900_000 }, () => {
    // 날짜 글자와 [연, 월, 일]은 한 번만 만든다(쌍마다 만들면 그것만으로 수 분이 걸린다)
    const t0 = Date.UTC(2019, 0, 1);
    const hires = (Date.UTC(2024, 11, 31) - t0) / DAY + 1;
    const days = Array.from({ length: hires + 2202 }, (_, i) => iso(t0 + i * DAY));
    const ymd = days.map((s) => s.split('-').map(Number));
    let n = 0;
    const bad: string[] = [];
    for (let h = 0; h < hires; h++) {
      const [y1, m1, d1] = ymd[h];
      for (let k = 0; k <= 2200; k++) {
        const [y2, m2, d2] = ymd[h + k];
        const want = Math.ceil(((y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0) + 1) / 12);
        n++;
        const e = serviceYears(days[h], days[h + k]);
        const w = htmlYears(days[h], days[h + k + 1]);
        if ((e !== want || w !== want) && bad.length < 10) bad.push(`${days[h]}~${days[h + k]} nts=${want} engine=${e} html=${w}`);
      }
    }
    expect(n).toBe(4_824_592);
    expect(bad).toEqual([]);
  });

  it('챗봇 calcSeverance(include_tax) 의 service_years 도 같다 — 경계 표본', () => {
    const bad: string[] = [];
    for (const hire of ['2023-01-01', '2023-01-15', '2023-01-31', '2024-02-29', '2023-03-01', '2022-12-31']) {
      const h = Date.parse(`${hire}T00:00:00Z`);
      for (let k = 300; k <= 1500; k += 7) {
        const last = iso(h + k * DAY);
        const r = chat.calcSeverance({ hire_date: hire, last_work_date: last, wages_3months: [3_000_000, 3_000_000, 3_000_000], include_tax: true });
        if (r.tax?.service_years !== ntsYears(hire, last) && bad.length < 10) bad.push(`${hire}~${last} chat=${r.tax?.service_years}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. 세액 — 계산기·챗봇·엔진 세 곳이 같다
// ─────────────────────────────────────────────────────────────
describe('세액 — 리서치 사례(조문 식 분수 계산)', () => {
  // [id, 퇴직급여, 입사, 마지막 근무일, 근속연수, 표 공제, 적용 공제, 환산급여, 환산급여공제, 과세표준, 환산산출세액, 소득세, 지방소득세]
  const T: [string, number, string, string, number, number, number, number, number, number, number, number, number][] = [
    ['T1 §48② 상한', 2_500_000, '2023-07-03', '2026-07-02', 3, 3_000_000, 2_500_000, 0, 0, 0, 0, 0, 0],
    ['T2 환산급여 800만 이하', 8_000_000, '2021-08-01', '2026-07-31', 5, 5_000_000, 5_000_000, 7_200_000, 7_200_000, 0, 0, 0, 0],
    ['T3 6%', 20_000_000, '2021-08-01', '2026-07-31', 5, 5_000_000, 5_000_000, 36_000_000, 24_800_000, 11_200_000, 672_000, 280_000, 28_000],
    ['T4 15% · 10원 절사', 123_456_789, '2014-03-02', '2026-03-01', 12, 20_000_000, 20_000_000, 103_456_789, 63_255_555, 40_201_234, 4_770_185, 4_770_180, 477_010],
    ['T5 45% 공제 · 35% · 20년 초과', 400_000_000, '2006-01-02', '2026-06-30', 21, 43_000_000, 43_000_000, 204_000_000, 108_500_000, 95_500_000, 17_985_000, 31_473_750, 3_147_370],
    ['T6 35% 공제 · 42% · 10년 이하 경계', 900_000_000, '2016-05-01', '2026-04-30', 10, 15_000_000, 15_000_000, 1_062_000_000, 418_400_000, 643_600_000, 234_372_000, 195_310_000, 19_531_000],
    ['T7 45%', 3_000_000_000, '2024-11-01', '2026-10-30', 2, 2_000_000, 2_000_000, 17_988_000_000, 6_342_500_000, 11_645_500_000, 5_174_535_000, 862_422_500, 86_242_250],
    ['T8 25년', 150_000_000, '2001-09-01', '2026-08-31', 25, 55_000_000, 55_000_000, 45_600_000, 30_560_000, 15_040_000, 996_000, 2_075_000, 207_500],
    ['T9 2023 경계 안쪽', 60_000_000, '2018-01-02', '2023-01-01', 5, 5_000_000, 5_000_000, 132_000_000, 76_100_000, 55_900_000, 7_656_000, 3_190_000, 319_000],
  ];
  it.each(T)('%s', (_id, pay, hire, last, years, table, svc, conv, convDed, base, convTax, income, local) => {
    const e = expectSame(pay, hire, last);
    expect([e.years, e.serviceDeductionTable, e.serviceDeduction, e.converted, e.convertedDeduction, e.taxBase, e.convertedTax, e.incomeTax, e.localTax])
      .toEqual([years, table, svc, conv, convDed, base, convTax, income, local]);
  });
});

// R16 — 옛 계산기·챗봇은 환산급여공제를 151,700,000 + (환산급여 − 3억) × 0.35 로 부동소수 계산했다.
// 0.35 의 double 상대오차(−6.34e-17)가 2^-54 보다 커서, 정수가 되어야 할 곱이 1원 낮게 버려졌다(초과분 5,368,709,140 부터).
// 엔진(정수식) = 국세청 프로그램 식을 엑셀로 평가한 값 = 정확값. 옛 값은 주석으로만 남긴다.
describe('세액 — 숫자가 바뀌는 구간(환산급여 3억 초과분 × 35% 부동소수)', () => {
  // [id, 퇴직급여, 입사, 마지막 근무일, 환산급여공제, 과세표준, 소득세, 지방소득세]  // 옛 값
  const F: [string, number, string, string, number, number, number, number][] = [
    ['F1', 1_444_464_205, '2023-10-01', '2026-09-30', 2_064_749_887, 3_701_106_933, 399_889_520, 39_988_950], // 옛 …886 · …934 · 399,889,530 · 39,988,950
    ['F2', 1_499_319_145, '2023-10-01', '2026-09-30', 2_141_546_803, 3_843_729_777, 415_934_590, 41_593_450], // 옛 …802 · …778 · 415,934,600 · 41,593,460
    ['F3', 2_379_524_342, '2021-10-01', '2026-09-30', 2_041_300_447, 3_657_557_973, 658_317_110, 65_831_710], // 옛 …446 · …974 · 658,317,120 · 65,831,710
    ['F4', 1_420_177_285, '2023-10-01', '2026-09-30', 2_030_748_199, 3_637_960_941, 392_785_600, 39_278_560], // 옛 …198 · …942 · 392,785,600 · 39,278,560
  ];
  it.each(F)('%s — 엔진 정수식 값을 세 곳이 낸다', (_id, pay, hire, last, convDed, base, income, local) => {
    const e = expectSame(pay, hire, last);
    expect([e.convertedDeduction, e.taxBase, e.incomeTax, e.localTax]).toEqual([convDed, base, income, local]);
  });
});

describe('세액 격자 — 근속 1~40년 × 퇴직급여 10만~30억(+F 구간) 세 곳 일치', () => {
  // 157 개 금액: 10만~30억 등비 153개 + F1~F4. 마지막 근무일 2026-06-30, 입사 (2026−n)-07-01 → 근속월수 12n
  const pays = [...Array.from({ length: 153 }, (_, i) => Math.round(100_000 * 30_000 ** (i / 152))), 1_444_464_205, 1_499_319_145, 2_379_524_342, 1_420_177_285];
  it('6,280칸', () => {
    let cells = 0;
    for (let n = 1; n <= 40; n++) {
      const hire = `${2026 - n}-07-01`;
      expect(serviceYears(hire, '2026-06-30')).toBe(n);
      for (const pay of pays) {
        expectSame(pay, hire, '2026-06-30');
        cells++;
      }
    }
    expect(cells).toBe(6_280);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. 엔진이 계산하지 않는 경우 — 2022. 12. 31. 이전 퇴사(법률 제19196호 부칙 제13조·제14조, 조건 5)
//    다른 표로 대신하지 않는다. 퇴직금은 그대로 내고 세액은 이유와 함께 비운다.
// ─────────────────────────────────────────────────────────────
describe('2023. 1. 1. 이전 퇴사 — 세액을 내지 않고 이유를 적는다', () => {
  it('B1 엔진은 마지막 근무일 2022-12-31 을 거부한다', () => {
    expect(() => engineTax({ pay: 50_000_000, hireDate: '2012-01-02', lastWorkDate: '2022-12-31' })).toThrow(/2023/);
  });

  it('P1 계산기 — 퇴직일 2023-01-01 이면 세액 칸 대신 이유, 퇴직금은 그대로(예전엔 603,990원을 조용히 냈다)', () => {
    expect(htmlTax(50_000_000, '2012-01-02', '2023-01-01')).toEqual({ skipped: expect.stringMatching(/부칙 제13조·제14조/) });
    const r = run<{ severancePay: number; taxResult: unknown; retirementTax: number; localTax: number; netSeverance: number; taxNotice: string }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'2012-01-02',endDate:'2023-01-01',wage1:'15000000'})`,
    );
    expect(r.severancePay).toBe(53_831_150);
    expect(r.taxResult).toBeNull();
    expect([r.retirementTax, r.localTax]).toEqual([0, 0]);
    expect(r.taxNotice).toMatch(/2022\. 12\. 31\./);
    expect(r.taxNotice).toMatch(/부칙 제13조·제14조/);
    expect(r.taxNotice).toMatch(/「자동」을 끄고 직접/);
    expect(r.netSeverance).toBe(53_831_150);
  });

  it('T9 경계 — 계산기 퇴직일 2023-01-02(마지막 근무 2023-01-01)는 계산한다', () => {
    const r = run<{ taxResult: HtmlTax | null; taxNotice: string }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'2018-01-02',endDate:'2023-01-02',wage1:'15000000'})`,
    );
    expect(r.taxResult).not.toBeNull();
    expect(r.taxNotice).toBe('');
  });

  it('자동 계산을 끄고 넣은 세액은 2022년 퇴사도 그대로 쓴다(직접 입력 경로)', () => {
    const r = run<{ retirementTax: number; localTax: number; taxNotice: string }>(
      `calculateSeverance({...createDefaultWorker(),startDate:'2012-01-02',endDate:'2023-01-01',wage1:'15000000',autoCalcTax:false,retirementTax:'1,281,990'})`,
    );
    expect([r.retirementTax, r.localTax, r.taxNotice]).toEqual([1_281_990, 128_190, '']);
  });

  it('P1 챗봇 — tax·net_severance 없이 퇴직금을 내고 legal_basis 에 이유를 붙인다', () => {
    const r = chat.calcSeverance({ hire_date: '2012-01-02', last_work_date: '2022-12-31', wages_3months: [5_000_000, 5_000_000, 5_000_000], include_tax: true });
    expect(r.severance_pay).toBe(53_831_150);
    expect(r).not.toHaveProperty('tax');
    expect(r).not.toHaveProperty('net_severance');
    expect(r.legal_basis).toMatch(/퇴직소득세는 계산하지 않았다/);
    expect(r.legal_basis).toMatch(/부칙 제13조·제14조/);
    expect(() => chat.calcRetirementTax(50_000_000, '2012-01-02', '2022-12-31')).toThrow(/2023/);
  });

  it('P2 챗봇 도구·공개 API 도 오류가 아니라 퇴직금을 돌려준다', async () => {
    const args = { hire_date: '2017-07-01', last_work_date: '2022-06-30', wages_3months: [3_000_000, 3_000_000, 3_000_000], include_tax: true };
    const t = (await executeTool('calc_severance', args)) as { error?: string; severance_pay?: number; tax?: unknown };
    expect(t.error).toBeUndefined();
    expect(t.severance_pay).toBeGreaterThan(0);
    expect(t.tax).toBeUndefined();
    const res = await POST(new NextRequest('http://localhost/api/tools/calc', { method: 'POST', body: JSON.stringify({ tool: 'calc_severance', args }) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tax?: unknown; legal_basis: string } };
    expect(body.result.tax).toBeUndefined();
    expect(body.result.legal_basis).toMatch(/부칙 제13조·제14조/);
  });
});

describe('근거 문구 — 없는 조문을 인용하지 않는다', () => {
  // 소득세법 시행령 제203조의5 는 삭제, 제203조의6 은 없는 조문이다(korean-law 원문, 2026-10-29). 근거는 법 제48조·제55조다.
  it('챗봇 tax.legal_basis', () => {
    const b = chat.calcRetirementTax(20_000_000, '2021-08-01', '2026-07-31').legal_basis;
    expect(b).not.toMatch(/제203조의[56]/);
    expect(b).toMatch(/소득세법 제48조 제1항 제1호/);
    expect(b).toMatch(/제48조 제2항/);
    expect(b).toMatch(/제55조 제1항·제2항/);
    expect(b).toMatch(/지방세법 제103조의13 제1항/);
  });

  it('계산기 화면 글자', () => {
    expect(html).not.toMatch(/제203조의[56]|203조의5\/6/);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. 한 벌 — html 에 엔진을 주입하는 두 블록이 원본과 같고 import/export 가 남지 않는다
// ─────────────────────────────────────────────────────────────
// 블록마다 생성 결과와 같은지·import/export 가 없는지는 severance-engine-sync.test.ts 가 본다
describe('주입 블록', () => {
  it('퇴직금·퇴직소득세 두 블록이 있다', () => {
    expect(build.BLOCKS.map((x) => x.id)).toEqual(['severance-engine', 'retirement-tax-engine']);
    for (const { id } of build.BLOCKS) expect(build.currentBlockOf(html, id)).toBe(build.buildBlock(id));
  });

  it('계산기와 챗봇에 세율표·공제표 사본이 남지 않는다', () => {
    const labor = readFileSync('src/lib/labor-calc.ts', 'utf8');
    for (const src of [labor, html.replace(/\/\* @@retirement-tax-engine:start[\s\S]*?@@retirement-tax-engine:end \*\//, '')]) {
      expect(src).not.toMatch(/384_?060_?000|151_?700_?000|0\.35\b/);
    }
  });
});
