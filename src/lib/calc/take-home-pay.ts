// 실수령액 — 월 급여에서 4대보험 근로자 몫과 근로소득세(간이세액표)·지방소득세를 뺀다.
//
// 과세 급여 T = 월 급여 − 비과세 근로소득. 네 계산이 모두 T 를 쓴다.
//   소득세: 별표2 제6호 「월급여액 [비과세 및 학자금 제외]」 · 국민연금: 법 §3①3호·시행령 §3①2호
//   건강보험: 법 §70③·시행령 §33①3호 · 고용보험: 징수법 §2 3호·시행령 §2의2.
//   식대는 소득세법 §12 3호 러목 「월 20만원 이하의 식사대」 — 20만원까지 비과세, 넘는 부분은 과세로 본다.
//   그 밖의 비과세(보육수당 머목 2)·자가운전보조금 시행령 §12 3호 등)는 넣은 금액을 그대로 뺀다.
//
// 끝수 — 모두 0 이상 정수 원 단위로 셈하고 10원 미만은 버린다.
//   국민연금: 기준소득월액은 천원 미만 버림(시행령 §5①), 기여금은 법 §117 → 국고금관리법 §47①.
//   건강보험: 법 §107(국고금관리법 §47 끝수 계산 안 함). 총액을 버린 뒤 절반을 다시 버린다
//     — floor10(floor10(x)/2) = floor10(x/2) 라 근로자 몫에 바로 3.595% 를 곱한 것과 같다.
//   장기요양: 법 §64 가 국민건강보험법 §107 을 준용. 고용보험: 고용보험기금(국고금관리법 §2 1호·§3①2호) → §47①.
//   지방소득세: 지방회계법 §55 는 「10원 미만은 계산하지 아니할 수 있고」(임의) — 실무대로 버린다.
//   원천징수 비율(80·120%)을 곱한 소득세도 국고금관리법 §47① 로 10원 미만을 버린다.
//
// 금액이 커도 곱이 2^53 안에 들도록 월 급여를 10억원까지만 받는다(T × 71,900 ≤ 7.2e13). BigInt 는 쓰지 않는다.
import { rateOn } from '@/content/rates';
import { WITHHOLDING_ROWS } from './wage-withholding-2026-02-27';

export interface TakeHomeInput {
  /** 월 급여(세전, 비과세 포함 지급 총액, 원) */
  pay: number;
  /** 식대(식사를 따로 제공받지 않는 경우) */
  meal?: number;
  /** 그 밖의 비과세 금액 — 한도 안의 금액 */
  otherNonTax?: number;
  /** 공제대상가족 수(본인·배우자 각각 1명, 별표2 제2호) */
  family: number;
  /** 공제대상가족 중 8세 이상 20세 이하 자녀 수(별표2 제3호) */
  children?: number;
  /** 원천징수 비율 — 근로자가 신청하면 80·120%(시행령 §194①) */
  ratio?: 80 | 100 | 120;
  /** 국민연금 공제 대상이 아님(만 60세 이상 등 — 법 §8①·§12①4호) */
  npsExempt?: boolean;
  /** 만 65세 이후 새로 고용됨 — 실업급여 보험료를 걷지 않는다(징수법 §13③) */
  employmentExempt?: boolean;
}

/** 날짜에 맞는 요율 묶음(rates.ts). 요율은 정수 「100만분의 n」 */
export interface TakeHomeRates {
  npsPerMillion: number;
  npsFloor: number;
  npsCap: number;
  /** 건강보험 근로자 몫(보험료율의 절반) */
  healthPerMillion: number;
  /** 장기요양 근로자 몫(보험료율의 절반) — 건강보험료에 곱하는 비율 = ltcPerMillion ÷ healthPerMillion */
  ltcPerMillion: number;
  /** 월 보험료 총액 하한·상한 */
  healthPremiumFloor: number;
  healthPremiumCap: number;
  employmentPerMillion: number;
  mealNonTaxCap: number;
}

export interface TakeHomeCommon {
  pay: number;
  /** 식대 중 비과세 */
  mealNonTax: number;
  /** 비과세 합계 */
  nonTax: number;
  /** 과세 급여 T */
  taxable: number;
  /** 국민연금 기준소득월액. 공제 대상이 아니면 null */
  npsBase: number | null;
  nps: number;
  /** 건강보험료 총액(근로자 + 사업주, 상·하한 적용) */
  healthTotal: number;
  health: number;
  /** 장기요양보험료 총액 */
  ltcTotal: number;
  ltc: number;
  employment: number;
  /** 만 65세 이후 새로 고용됨으로 골랐는지 */
  employmentExempt: boolean;
  /** 4대보험 근로자 몫 합계 */
  insurance: number;
}

export interface IncomeTaxDetail {
  /** 찾은 표의 행 [이상, 미만]. 770천원 미만이면 null, 정확히 1,000만원이면 [10,000,000, 10,000,000] */
  row: readonly [number, number] | null;
  family: number;
  /** 가족 수 칸의 세액(11명 초과는 제4호) */
  tableTax: number;
  childDeduction: number;
  ratio: 80 | 100 | 120;
  incomeTax: number;
  localTax: number;
}

/** ok = 표 안 · aboveTable = 과세 급여 1,000만원 초과 — 소득세를 계산하지 않는다(별표2 초과 공식은 아직 쓰지 않는다) */
export type TakeHomeResult =
  | (TakeHomeCommon & { status: 'ok'; tax: IncomeTaxDetail; deduction: number; takeHome: number })
  | (TakeHomeCommon & { status: 'aboveTable' });

const MAX_PAY = 1_000_000_000;
const TABLE_TOP = 10_000_000;
const TABLE_BOTTOM = 770_000;

/** 0 이상 정수의 몫(나머지 버림) */
const div = (a: number, d: number) => (a - (a % d)) / d;
/** 10원 미만 버림 */
const f10 = (n: number) => n - (n % 10);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const isWon = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n >= 0;

/**
 * 별표2 제3호 — 8세 이상 20세 이하 자녀 공제. 1명 20,830원 · 2명 45,830원 · 3명 이상 45,830원 + 2명 초과 1명당 33,330원.
 * 표와 같은 개정(2026. 2. 27.)의 금액이다. 표를 바꿀 때 함께 확인한다.
 */
export function childDeduction(children: number): number {
  if (children <= 0) return 0;
  if (children === 1) return 20_830;
  return 45_830 + 33_330 * (children - 2);
}

/**
 * 간이세액표에서 세액을 찾는다. 행은 「이상~미만」.
 * - 770천원 미만은 표에 행이 없다. 첫 행이 전 가족 수에서 「-」이고 급여가 줄면 세액이 늘지 않으므로 0으로 본다(해석).
 * - 정확히 1,000만원은 「10,000천원」 행. 넘으면 null(표 밖).
 * - 가족 11명 초과는 제4호: 11명 세액 − (10명 세액 − 11명 세액) × 초과 인원. 음수가 되면 0
 *   (원천징수세액은 음수가 될 수 없다 — 제3호 단서와 같은 처리. 원문에 0 처리 문구는 없다).
 */
export function withholdingTableTax(taxable: number, family: number): { row: readonly [number, number] | null; tax: number } | null {
  if (taxable < TABLE_BOTTOM) return { row: null, tax: 0 };
  if (taxable > TABLE_TOP) return null;
  const r = WITHHOLDING_ROWS.find(([lo, hi]) => (lo < hi ? lo <= taxable && taxable < hi : taxable === lo))!;
  const col = (n: number) => r[1 + n];
  const tax = family <= 11 ? col(family) : Math.max(0, col(11) - (col(10) - col(11)) * (family - 11));
  return { row: [r[0], r[1]], tax };
}

/** date(YYYY-MM-DD)에 맞는 요율 묶음. 하나라도 없으면 null — 다른 해 값으로 대신하지 않는다 */
export function takeHomeRatesOn(date: string): TakeHomeRates | null {
  const v = {
    npsPerMillion: rateOn('npsEmployeePerMillion', date)?.value,
    npsFloor: rateOn('npsIncomeFloor', date)?.value,
    npsCap: rateOn('npsIncomeCap', date)?.value,
    healthPerMillion: rateOn('healthEmployeePerMillion', date)?.value,
    ltcPerMillion: rateOn('ltcEmployeePerMillion', date)?.value,
    healthPremiumFloor: rateOn('healthPremiumFloor', date)?.value,
    healthPremiumCap: rateOn('healthPremiumCap', date)?.value,
    employmentPerMillion: rateOn('employmentEmployeePerMillion', date)?.value,
    mealNonTaxCap: rateOn('mealNonTaxMonthly', date)?.value,
  };
  return Object.values(v).every((x) => x !== undefined) ? (v as TakeHomeRates) : null;
}

export function calcTakeHomePay(input: TakeHomeInput, rates: TakeHomeRates): TakeHomeResult {
  const { pay, family } = input;
  const meal = input.meal ?? 0;
  const otherNonTax = input.otherNonTax ?? 0;
  const children = input.children ?? 0;
  const ratio = input.ratio ?? 100;
  if (!isWon(pay) || pay === 0 || pay > MAX_PAY) throw new Error('월 급여를 확인해 주세요(원 단위, 10억원까지)');
  if (!isWon(meal)) throw new Error('식대를 확인해 주세요');
  if (!isWon(otherNonTax)) throw new Error('그 밖의 비과세 금액을 확인해 주세요');
  if (!Number.isInteger(family) || family < 1) throw new Error('공제대상가족 수를 확인해 주세요(본인 포함 1명 이상)');
  if (!Number.isInteger(children) || children < 0) throw new Error('8세 이상 20세 이하 자녀 수를 확인해 주세요');
  if (children > family - 1) throw new Error('자녀 수는 공제대상가족 수에서 본인을 뺀 수보다 많을 수 없습니다');
  if (ratio !== 80 && ratio !== 100 && ratio !== 120) throw new Error('원천징수 비율은 80·100·120% 가운데 하나입니다');

  const mealNonTax = Math.min(meal, rates.mealNonTaxCap);
  const nonTax = mealNonTax + otherNonTax;
  if (nonTax >= pay) throw new Error('비과세 금액이 월 급여와 같거나 많습니다');
  const T = pay - nonTax;

  // 국민연금 — 기준소득월액(천원 미만 버림, 고시 하한·상한) × 근로자 요율(법 §88③·부칙 제4조①)
  const npsBase = input.npsExempt ? null : clamp(T - (T % 1000), rates.npsFloor, rates.npsCap);
  const nps = npsBase === null ? 0 : f10(div(npsBase * rates.npsPerMillion, 1_000_000));

  // 건강보험 — 보수월액 × 보험료율(근로자 몫의 두 배)을 10원 미만 버리고, 월 보험료 상·하한(시행령 §32) 뒤 절반(법 §76①)
  const healthTotal = clamp(f10(div(T * rates.healthPerMillion * 2, 1_000_000)), rates.healthPremiumFloor, rates.healthPremiumCap);
  const health = f10(div(healthTotal, 2));

  // 장기요양 — 건강보험료 총액 × 장기요양보험료율 ÷ 건강보험료율(법 §9①), 절반(§11 → 국민건강보험법 §76 준용)
  const ltcTotal = f10(div(healthTotal * rates.ltcPerMillion, rates.healthPerMillion));
  const ltc = f10(div(ltcTotal, 2));

  // 고용보험 — 보수 × 실업급여 보험료율의 절반(징수법 §13②). 65세 이후 새로 고용되면 걷지 않는다(§13③)
  const employment = input.employmentExempt ? 0 : f10(div(T * rates.employmentPerMillion, 1_000_000));

  const insurance = nps + health + ltc + employment;
  const common: TakeHomeCommon = {
    pay, mealNonTax, nonTax, taxable: T, npsBase, nps, healthTotal, health, ltcTotal, ltc, employment,
    employmentExempt: Boolean(input.employmentExempt), insurance,
  };

  const found = withholdingTableTax(T, family);
  if (!found) return { ...common, status: 'aboveTable' };

  // 소득세 — 표 세액 − 자녀 공제(음수면 0, 제3호 단서) → 원천징수 비율(시행령 §194①, 「해당란 세액」에 곱한다)
  const cd = childDeduction(children);
  const incomeTax = f10(div(Math.max(0, found.tax - cd) * ratio, 100));
  // 지방소득세 — 소득세의 100분의 10(지방세법 §103조의13①)
  const localTax = f10(div(incomeTax, 10));
  const deduction = insurance + incomeTax + localTax;
  return {
    ...common,
    status: 'ok',
    tax: { row: found.row, family, tableTax: found.tax, childDeduction: cd, ratio, incomeTax, localTax },
    deduction,
    takeHome: pay - deduction,
  };
}
