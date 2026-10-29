// 일용근로소득 원천징수 — 일용근로자(소득세법 §14③2, 시행령 §20①)에게 일급을 줄 때 떼는 소득세와 지방소득세.
// 식(소득세법 §134③ — 「근로소득공제를 적용한 금액에 원천징수세율을 적용하여 계산한 산출세액에서 근로소득세액공제를 적용」):
//   날마다  과세표준 = max(일급 − 15만원, 0)   §47② 「1일 15만원」, §47③ 급여가 공제액보다 적으면 급여만큼만 공제
//           산출세액 = 과세표준 × 6%           §129①4호 단서
//           세액공제 = 산출세액 × 55%          §59③(①단서가 아니다 — 2014. 1. 1. 개정으로 ③에 따로 있다). §59② 한도는 걸리지 않는다
//           1일 세액 = 산출세액 − 세액공제 = 과세표준 × 2.7%
//   일급이 날마다 다르면 날마다 계산해 더한다. 총액 ÷ 일수 평균을 내지 않고 일수 상한도 없다
//   (§47② 「1일」, 별지 제24호서식(3)(4) 작성방법 「[일급여액 − 근로소득공제금액(1일 15만원)] × 6% × 45% … 월별 합계액」).
// 소액부징수(§86 1호, 원천징수세액 1천원 미만이면 징수하지 않음)는 지급 건마다 본다 — 한 번에 지급하는 날들의 1일 세액 합계.
//   근거: 별지 제24호서식(3)(4) <개정 2023. 3. 20.> 작성방법 「근로소득을 지급할 때마다 계산하는 것이며, 그 세액이 1,000원 미만인 경우에도
//   소득세가 없는 것으로 하여」, 국세청 「일용근로소득」 안내(cntntsId=7863) 「지급금액을 기준으로 소액부징수를 판단」·
//   「5일간 일당을 한번에 지급시 5일 일당에 대한 원천징수세액 합계가 1,000원 이상인 경우 소액부징수를 적용하지 아니함」.
// 끝수:
//   소득세 — 지급 건 합계에서 10원 미만 버림(국고금 관리법 §47① 「10원 미만의 끝수 … 계산하지 아니하고」).
//            1,000원 비교는 버리기 전 합계로 한다. floor10(x) ≥ 1,000 ⇔ x ≥ 1,000 이라 버린 뒤로 해도 같다.
//   지방소득세 — 실제로 떼는 소득세(10원 미만을 버린 뒤)의 10%(지방세법 §103의13①)에서 10원 미만 버림
//            (지방회계법 §55 허용 규정, 서식 예시 「9,450원 … 지방소득세 940원」, 국세청 예시 6,750 → 670).
//   ⚠ 날별 1일 세액의 원 미만을 먼저 버리는지, 합계에서 한 번만 버리는지 정한 조문·서식·예규는 찾지 못했다(리서치 미확정 1).
//     §47①은 「수입」 금액의 10원 미만만, §47②는 과세표준의 1원 미만만 다룬다. 그래서 문언에 가까운 쪽(합계에서 한 번)을 incomeTax 로,
//     날마다 원 미만을 먼저 버린 쪽(사무소 급여대장 식 ROUNDDOWN(…, 0) 후 합산)을 dailyFloor 로 함께 낸다. 둘은 지급 건마다 최대 10원 다르고,
//     과세표준이 1,000원 단위면 같다. 화면은 다를 때 둘 다 보여 준다.
// 정수 연산: 1일 세액을 「1천분의 1원(milli)」 정수로 센다 — 과세표준 × 6 × 45 × 1000 ÷ (100 × 100) = 과세표준 × 27. 부동소수 없음.
//   일급 상한 10억원 × 366일이어도 2^53 안이다.
// 2019. 1. 1. 이후 발생 소득분 기준(1일 15만원 — 법률 제16104호 부칙 §1·§2①). 날짜는 받지 않는다 — 그 전 근로분은 화면이 범위 밖으로 밝힌다.
// 거주자 전제(지방세법 §103의13① 「거주자로부터」). 비과세를 뺀 과세 일급을 받는다 — 비과세를 가리지 않는다.
// ⚠ 이 파일은 import 없이 홀로 선다.

export interface DailyWorkerRule {
  /** 이 숫자가 적용되는 소득의 첫날 */
  from: string;
  /** 근로소득공제 1일 금액(원) — §47② */
  deduction: number;
  /** 원천징수세율 [분자, 분모] — §129①4호 단서 */
  rate: readonly [number, number];
  /** 근로소득세액공제율 [분자, 분모] — §59③ */
  credit: readonly [number, number];
  /** 이 금액 미만이면 징수하지 않는다(원) — §86 1호 */
  minimum: number;
  basis: string;
  checked: string;
}

export const DAILY_WORKER_RULE: DailyWorkerRule = {
  from: '2019-01-01',
  deduction: 150_000,
  rate: [6, 100],
  credit: [55, 100],
  minimum: 1_000,
  basis: '소득세법 제47조 제2항·제3항, 제59조 제3항, 제86조 제1호, 제129조 제1항 제4호 단서, 제134조 제3항',
  checked: '2026-10-29',
};

/** 분수 n/d 원 — 화면이 원 미만까지 그대로 보여 주도록 */
export interface Frac { n: number; d: number }

export interface DayResult {
  /** 과세 일급(비과세를 뺀 금액) */
  wage: number;
  /** 과세표준 = max(일급 − 공제, 0) */
  taxBase: number;
  /** 산출세액 = 과세표준 × 6% */
  computed: Frac;
  /** 근로소득세액공제 = 산출세액 × 55% */
  credit: Frac;
  /** 1일 세액 × 1000(정수) */
  milli: number;
}

export interface PaymentResult {
  days: DayResult[];
  /** 이 지급의 과세 일급 합계 */
  gross: number;
  /** 1일 세액 합계 × 1000 — 끝수를 버리기 전 */
  milli: number;
  /** 소액부징수 — 세액이 있으나 1,000원 미만 */
  small: boolean;
  /** 떼는 소득세(합계에서 10원 미만 버림) */
  incomeTax: number;
  localTax: number;
  /** 날마다 원 미만을 먼저 버리고 더한 방식 */
  dailyFloor: { sum: number; small: boolean; incomeTax: number; localTax: number };
}

export interface DailyWorkerTaxResult {
  payments: PaymentResult[];
  gross: number;
  incomeTax: number;
  localTax: number;
  total: number;
  dailyFloor: { incomeTax: number; localTax: number };
  /** 두 끝수 방식의 값이 한 지급이라도 다른가 */
  differs: boolean;
}

export interface DailyWorkerTaxInput {
  /** 지급 건마다, 그 지급에 든 날들의 과세 일급 — 한 번에 지급한 날들을 한 건으로 묶는다 */
  payments: { days: number[] }[];
}

const R = DAILY_WORKER_RULE;
/** 과세표준 1원당 1일 세액(1천분의 1원) — 6% × 45% × 1000 = 27 */
const MILLI_PER_WON = (R.rate[0] * (R.credit[1] - R.credit[0]) * 1_000) / (R.rate[1] * R.credit[1]);
if (!Number.isInteger(MILLI_PER_WON)) throw new Error('세율·공제율이 1천분의 1원 단위로 떨어지지 않습니다');

const MAX_WAGE = 1_000_000_000;
const MAX_DAYS = 366;
const floor10 = (won: number) => Math.floor(won / 10) * 10;
/** 지방소득세 = 소득세 × 10%, 10원 미만 버림 */
const local = (incomeTax: number) => Math.floor(incomeTax / 100) * 10;

function day(wage: number): DayResult {
  if (!Number.isInteger(wage) || wage < 0 || wage > MAX_WAGE) throw new Error('일급은 0원 이상, 원 단위로 넣어 주세요');
  const taxBase = Math.max(wage - R.deduction, 0);
  return {
    wage,
    taxBase,
    computed: { n: taxBase * R.rate[0], d: R.rate[1] },
    credit: { n: taxBase * R.rate[0] * R.credit[0], d: R.rate[1] * R.credit[1] },
    milli: taxBase * MILLI_PER_WON,
  };
}

/** 세액(원, 버리기 전)에서 떼는 소득세 — 1,000원 미만이면 0, 아니면 10원 미만 버림 */
function settle(won: number, small: boolean) {
  const incomeTax = small ? 0 : floor10(won);
  return { incomeTax, localTax: local(incomeTax) };
}

function payment(wages: number[], i: number): PaymentResult {
  if (!wages.length) throw new Error(`지급 ${i + 1}에 일급을 넣어 주세요`);
  const days = wages.map(day);
  const milli = days.reduce((s, d) => s + d.milli, 0);
  const small = milli > 0 && milli < R.minimum * 1_000;
  // 날마다 원 미만을 먼저 버린 합계
  const sum = days.reduce((s, d) => s + Math.floor(d.milli / 1_000), 0);
  const dailySmall = sum > 0 && sum < R.minimum;
  return {
    days,
    gross: wages.reduce((s, w) => s + w, 0),
    milli,
    small,
    ...settle(Math.floor(milli / 1_000), small),
    dailyFloor: { sum, small: dailySmall, ...settle(sum, dailySmall) },
  };
}

export function calcDailyWorkerTax(input: DailyWorkerTaxInput): DailyWorkerTaxResult {
  if (!input.payments.length) throw new Error('지급을 하나 이상 넣어 주세요');
  const payments = input.payments.map((p, i) => payment(p.days, i));
  const add = (f: (p: PaymentResult) => number) => payments.reduce((s, p) => s + f(p), 0);
  const incomeTax = add((p) => p.incomeTax);
  const localTax = add((p) => p.localTax);
  return {
    payments,
    gross: add((p) => p.gross),
    incomeTax,
    localTax,
    total: incomeTax + localTax,
    dailyFloor: { incomeTax: add((p) => p.dailyFloor.incomeTax), localTax: add((p) => p.dailyFloor.localTax) },
    differs: payments.some((p) => p.incomeTax !== p.dailyFloor.incomeTax || p.localTax !== p.dailyFloor.localTax),
  };
}

/** 「일급 × 일수」 줄을 날별 일급 목록으로 편다 — 화면의 간편 입력용 */
export function expandLines(lines: { dailyWage: number; days: number }[]): number[] {
  return lines.flatMap((l) => {
    if (!Number.isInteger(l.days) || l.days < 1 || l.days > MAX_DAYS) throw new Error('일수는 1일 이상 366일 이하로 넣어 주세요');
    return Array<number>(l.days).fill(l.dailyWage);
  });
}
