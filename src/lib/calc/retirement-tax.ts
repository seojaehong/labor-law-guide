// 퇴직소득세 정본 엔진 — 퇴직급여·입사일·퇴사일(마지막 근무일)로 퇴직소득세와 지방소득세를 낸다.
// 순서(소득세법 §48·§55②, 서식 별지 제24호서식(2)과 같은 칸 순서):
//   퇴직소득금액(§22③, 비과세 없음으로 본다) − 근속연수공제(§48①1, 상한 §48②)
//   → × 12 ÷ 근속연수 = 환산급여(§48① 본문) − 환산급여공제(§48①2) = 과세표준(§14⑥)
//   → 기본세율(§55①) = 환산산출세액 → × 근속연수 ÷ 12 = 산출세액(§55②)
//   → 10원 미만 버림 = 소득세 → 그 10%를 다시 10원 미만 버림 = 지방소득세(지방세법 §103의13①).
// 근거의 층위가 셋이라 끝수 처리마다 어느 층위인지 적는다.
//   [조문]   국고금관리법 §47① 납부세액 10원 미만 버림 · §47② 과세표준 1원 미만 버림(지방세기본법 §59 준용)
//   [프로그램] 국세청 「퇴직소득 세액계산 프로그램」(2022~2026 판 식 동일)의 ROUNDDOWN(…, 0) — 환산급여·환산급여공제·환산산출세액·산출세액
//   [행정 실무] 근속월수 = DATEDIF(입사일, 퇴사일, "M") + 1 — 법령·서식 문구에는 없고 프로그램 영수증 T25 식이 유일한 근거
// 정수 연산: 곱셈을 먼저 하고 나눈다. 프로그램 식은 ROUNDDOWN(S34/12*n, 0)처럼 나눗셈이 먼저지만 엑셀은 정확값을 냈고,
//   JS 로 같은 순서를 쓰면 n=15·27·30 에서 1원 모자라 10원 절사 뒤 10원 적다(tests/unit/calc-retirement-tax.test.ts E1~E3).
// 2023. 1. 1. 이전 퇴사는 계산하지 않는다 — 종전 공제표·세율 대상이다(법률 제19196호 부칙 §13·§14). 다른 표로 대신하지 않는다.
// ⚠ 이 파일은 import 없이 홀로 선다.

export interface RetirementTaxInput {
  /** 퇴직급여 합계(원). 비과세 소득은 빼고 넣는다 */
  pay: number;
  /** 입사일 — 근로를 제공하기 시작한 날(시행령 §105①) */
  hireDate: string;
  /** 퇴사일 = 마지막 근무일(서식 「퇴직한 날」). 근로관계가 끝난 다음 날(상실일·노동법상 퇴직일)이 아니다 */
  lastWorkDate: string;
}

export interface RetirementTaxResult {
  /** 근속월수(DATEDIF + 1) */
  months: number;
  /** 근속연수(1년 미만 올림, §48① 괄호) */
  years: number;
  /** 근속연수공제 표 값(§48①1) */
  serviceDeductionTable: number;
  /** 적용한 근속연수공제 = min(표 값, 퇴직급여)(§48②) */
  serviceDeduction: number;
  serviceDeductionCapped: boolean;
  /** 환산급여 */
  converted: number;
  /** 환산급여공제 */
  convertedDeduction: number;
  /** 퇴직소득 과세표준 */
  taxBase: number;
  /** 환산산출세액 = 과세표준 × 기본세율 */
  convertedTax: number;
  /** 산출세액 = 환산산출세액 × 근속연수 ÷ 12 */
  calculatedTax: number;
  /** 소득세(10원 미만 버림) */
  incomeTax: number;
  /** 지방소득세(소득세의 10%, 10원 미만 버림) */
  localTax: number;
  total: number;
  /** 적용한 표의 줄 — 화면이 산식을 그대로 보여 주도록. [기본액, 1년당 또는 초과분 %, 기준(연수·하한)] */
  brackets: {
    service: readonly [number, number, number];
    converted: readonly [number, number, number];
    rate: readonly [number, number, number];
  };
}

/** 계산하는 퇴사일의 첫날 */
export const RETIREMENT_TAX_FROM = '2023-01-01';

/** 퇴직급여 상한(원) — 정수 연산이 Number 안전 범위(약 9 × 10^15)를 넘지 않게 한다 */
const MAX_PAY = 1_000_000_000_000;

/**
 * 공제표·세율 — 날짜 축. 퇴사일에 맞는 줄이 없으면 계산하지 않는다(rates.ts 와 같은 원칙).
 * 근거: 소득세법(법률 제21221호, 시행 2026-07-01) §48①1·2·§55①. 2023-01-01 개정(법률 제19196호) 뒤 같은 표.
 */
const TABLES = [
  {
    from: RETIREMENT_TAX_FROM,
    basis: '소득세법 제48조제1항제1호·제2호, 제55조제1항(법률 제19196호 부칙 제1조·제13조·제14조, 현행 법률 제21221호 같은 표)',
    checked: '2026-10-28',
    /** 근속연수공제 — [근속연수 상한, 기본액, 1년당, 기준 연수] */
    service: [
      [5, 0, 1_000_000, 0],
      [10, 5_000_000, 2_000_000, 5],
      [20, 15_000_000, 2_500_000, 10],
      [Infinity, 40_000_000, 3_000_000, 20],
    ],
    /** 환산급여공제 — [환산급여 상한, 기본액, 초과분 %, 하한] */
    converted: [
      [8_000_000, 0, 100, 0],
      [70_000_000, 8_000_000, 60, 8_000_000],
      [100_000_000, 45_200_000, 55, 70_000_000],
      [300_000_000, 61_700_000, 45, 100_000_000],
      [Infinity, 151_700_000, 35, 300_000_000],
    ],
    /** 기본세율 — [과세표준 상한, 누진 누계, 초과분 %, 하한] */
    rates: [
      [14_000_000, 0, 6, 0],
      [50_000_000, 840_000, 15, 14_000_000],
      [88_000_000, 6_240_000, 24, 50_000_000],
      [150_000_000, 15_360_000, 35, 88_000_000],
      [300_000_000, 37_060_000, 38, 150_000_000],
      [500_000_000, 94_060_000, 40, 300_000_000],
      [1_000_000_000, 174_060_000, 42, 500_000_000],
      [Infinity, 384_060_000, 45, 1_000_000_000],
    ],
  },
] as const;

type Table = (typeof TABLES)[number];

function tableOn(date: string): Table | null {
  return TABLES.find((t) => t.from <= date) ?? null;
}

function parse(s: string, what: string): [number, number, number] {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const t = ok ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
}

/**
 * 근속월수 — DATEDIF(입사일, 퇴사일, "M") + 1. [행정 실무] 국세청 프로그램 영수증 T25 식(2022~2026 판 같음).
 * 퇴사일의 일자가 입사일의 일자보다 작으면 그 달은 채우지 못한 것으로 본다. 「연월 양끝 포함」으로 세지 않는다.
 */
export function serviceMonths(hireDate: string, lastWorkDate: string): number {
  if (lastWorkDate < hireDate) throw new Error('퇴사일이 입사일보다 앞섭니다');
  const [y1, m1, d1] = parse(hireDate, '입사일');
  const [y2, m2, d2] = parse(lastWorkDate, '퇴사일');
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0) + 1;
}

/** 근속연수 — 근속월수 ÷ 12, 1년 미만은 1년(§48① 괄호). 최소 1 */
export function serviceYears(hireDate: string, lastWorkDate: string): number {
  return Math.floor((serviceMonths(hireDate, lastWorkDate) + 11) / 12);
}

export function calcRetirementTax(input: RetirementTaxInput): RetirementTaxResult {
  const { pay, hireDate, lastWorkDate } = input;
  if (!Number.isSafeInteger(pay) || pay < 0 || pay > MAX_PAY) throw new Error('퇴직급여를 원 단위로 확인해 주세요');
  parse(hireDate, '입사일');
  parse(lastWorkDate, '퇴사일');
  if (lastWorkDate < hireDate) throw new Error('퇴사일이 입사일보다 앞섭니다');
  const t = tableOn(lastWorkDate);
  if (!t) throw new Error('2023년 1월 1일 이후 퇴사만 계산합니다. 그 전 퇴사는 종전 공제표·세율을 적용합니다(법률 제19196호 부칙 제13조·제14조).');

  const months = serviceMonths(hireDate, lastWorkDate);
  const n = Math.floor((months + 11) / 12);

  // 근속연수공제 — 정수 표. 퇴직급여보다 크면 퇴직급여까지(§48②)
  const [, sBase, sPer, sFrom] = t.service.find(([upTo]) => n <= upTo)!;
  const serviceDeductionTable = sBase + sPer * (n - sFrom);
  const serviceDeduction = Math.min(serviceDeductionTable, pay);

  // 환산급여 = (퇴직급여 − 근속연수공제) × 12 ÷ 근속연수 — [프로그램] 원 미만 버림
  const converted = Math.floor(((pay - serviceDeduction) * 12) / n);

  // 환산급여공제 — 기본액 + 초과분 × % — [프로그램] 원 미만 버림
  const [, cBase, cPct, cFrom] = t.converted.find(([upTo]) => converted <= upTo)!;
  const convertedDeduction = cBase + Math.floor(((converted - cFrom) * cPct) / 100);

  // 과세표준 = 환산급여 − 환산급여공제 — [조문] 국고금관리법 §47② 1원 미만 버림(정수라 이미 원 단위)
  const taxBase = converted - convertedDeduction;

  // 환산산출세액 = 누진 누계 + 초과분 × 세율 — [프로그램] 원 미만 버림. 구간은 「이하」 포함(§55①)
  const [, rBase, rPct, rFrom] = t.rates.find(([upTo]) => taxBase <= upTo)!;
  const convertedTax = taxBase > 0 ? rBase + Math.floor(((taxBase - rFrom) * rPct) / 100) : 0;

  // 산출세액 = 환산산출세액 × 근속연수 ÷ 12(§55②) — 곱셈 먼저, [프로그램] 원 미만 버림
  const calculatedTax = Math.floor((convertedTax * n) / 12);

  // 소득세 — [조문] 국고금관리법 §47① 10원 미만 버림
  const incomeTax = Math.floor(calculatedTax / 10) * 10;
  // 지방소득세 = 소득세의 10%(지방세법 §103의13①)를 다시 10원 미만 버림 — [조문] 지방세기본법 §59 → 국고금관리법 §47①
  const localTax = Math.floor(incomeTax / 100) * 10;

  return {
    months,
    years: n,
    serviceDeductionTable,
    serviceDeduction,
    serviceDeductionCapped: serviceDeduction < serviceDeductionTable,
    converted,
    convertedDeduction,
    taxBase,
    convertedTax,
    calculatedTax,
    incomeTax,
    localTax,
    total: incomeTax + localTax,
    brackets: { service: [sBase, sPer, sFrom], converted: [cBase, cPct, cFrom], rate: [rBase, rPct, rFrom] },
  };
}
