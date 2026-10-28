// 중도퇴사 연말정산(고정형) — 퇴직하는 달 급여를 줄 때 하는 연말정산(소득세법 §137①).
// 고정형 = 공제를 이용자가 고르지 않는다. 본인 기본공제 150만원(§50①1) + 국민연금 연금보험료공제(§51의3)
//   + 근로소득공제(§47) + 근로소득세액공제(§59)에 더해, 아래 두 경로를 다 계산한다.
//   A = 건강·장기요양·고용보험료 특별소득공제(§52①), 표준세액공제 없음
//   B = 표준세액공제 13만원(§59의4⑨1호), 보험료 소득공제 없음
//   ⑨1호는 「제52조제8항 … 에 따른 소득공제 … 신청을 하지 아니한 경우」에만 13만원을 준다 — 둘을 함께 더하지 않는다.
//   국민연금(§51의3)은 ⑨1호의 배제 목록에 없어 두 경로 모두에 들어간다.
//   어느 쪽인지는 근로자가 보험료 공제를 신청했는지로 정해지고, 법은 「작은 쪽」을 정하지 않는다.
//   답(method·decided)은 결정세액이 작은 쪽 = 근로자에게 유리한 쪽으로 가정한 값이고, 화면은 A·B 정산액을 다 보여 준다.
//   §137③(신고서를 내지 않으면 본인 기본공제·표준세액공제만) 문언과의 관계는 제품 결정 대기(PR #112 미확정 1).
// 차감징수 = 결정세액 − 퇴직월 전 달까지 낸 소득세. 퇴직월 간이세액은 답에 쓰지 않고,
//   회사가 그것을 먼저 떼고 기납부(§137①3호)로 넣어 정산한 경우의 영수증 값(settleWithSimple)만 따로 낸다.
// 범위 밖(멈춤): 기준을 넣지 않은 해 · 총급여 1.2억원 이상 · 차감 소득세 1천원 미만 추징(소득세법 §86 1호 소액부징수).
//   지방소득세는 「원천징수하는 소득세의 100분의 10 … 을 소득세 원천징수와 동시에」 특별징수한다(지방세법 §103의13①).
//   지방소득세 자체의 1천원 기준은 조문·해석례에서 찾지 못해(§103의13④ 준용은 추론, §103의60 은 고지서 기준) 멈추지 않고
//   계산한 금액을 보여 준다 — 사무소 게이트와 실수령액 계산기(take-home-pay)도 같다(PR #112 사후 검토 2·11).
//   부양가족·종전 근무지·감면(조특법 §30) 등 숫자로 알 수 없는 것은 화면이 먼저 묻는다.
//
// 정수 연산: 비율은 분자/분모 정수로 두고 버림은 floorDiv 하나로 한다(부동소수 누적 없음).
//   중간값 최대 ≈ 1.2억 × 1,000 이라 Number 안전 정수(2^53) 안이다 — floorDiv 가 넘으면 던진다.
// 원 미만 버림 지점은 다섯 곳 — 근로소득공제 · 과세표준 · 산출세액 · 근로소득세액공제 · 결정세액.
//   조문 근거가 있는 것은 과세표준(국고금 관리법 §47② 「1원 미만의 끝수 … 계산하지 아니한다」)뿐이다.
//   나머지는 근로소득 원천징수영수증 서식이 칸마다 원 단위로 적는 방식과, 국세청 영수증 4건으로 맞춘
//   사무소 게이트(verify_leaver_tax.py — 사무소 로컬 도구, 이 저장소에는 없다)를 따른 것이다.
//   끝에서 한 번만 버리면 1원이 갈려 차감이 10원 어긋날 수 있다(시험 S9).

/** 「over 초과분 × num/den + base」 한 구간 */
interface Bracket { over: number; base: number; num: number; den: number }

/** 근로소득세액공제 한도 한 구간 — base − (총급여 − over) × num/den, 아래로 floor 까지 */
interface LimitBracket { over: number; base: number; num: number; den: number; floor: number }

export interface MidyearRules {
  /** 귀속연도 */
  year: number;
  personal: number;
  standardCredit: number;
  earnedDeduction: Bracket[];
  earnedDeductionCap: number;
  taxRates: Bracket[];
  credit: Bracket[];
  creditLimit: LimitBracket[];
  /** 총급여가 이 금액 이상이면 범위 밖 */
  grossStop: number;
  basis: string;
  checked: string;
}

// 법정 숫자 — 해(귀속연도)마다 한 줄. 그해 줄이 없으면 null 이고 계산하지 않는다(다른 해 값으로 대신하지 않는다).
// 세율·공제표는 rates.ts 의 「값 하나」 모양에 맞지 않아 여기에 둔다. 새 해는 원문을 확인해 줄을 더한다.
const RULES: MidyearRules[] = [
  {
    year: 2026,
    personal: 1_500_000, // §50①1 본인 1명당 연 150만원
    standardCredit: 130_000, // §59의4⑨1호 연 13만원
    // §47① — 500만 이하 70% · 1,500만 이하 350만 + 40% · 4,500만 이하 750만 + 15% · 1억 이하 1,200만 + 5% · 초과 1,475만 + 2%
    earnedDeduction: [
      { over: 0, base: 0, num: 70, den: 100 },
      { over: 5_000_000, base: 3_500_000, num: 40, den: 100 },
      { over: 15_000_000, base: 7_500_000, num: 15, den: 100 },
      { over: 45_000_000, base: 12_000_000, num: 5, den: 100 },
      { over: 100_000_000, base: 14_750_000, num: 2, den: 100 },
    ],
    earnedDeductionCap: 20_000_000, // §47① 단서 — 2천만원 초과면 2천만원
    // §55① 기본세율
    taxRates: [
      { over: 0, base: 0, num: 6, den: 100 },
      { over: 14_000_000, base: 840_000, num: 15, den: 100 },
      { over: 50_000_000, base: 6_240_000, num: 24, den: 100 },
      { over: 88_000_000, base: 15_360_000, num: 35, den: 100 },
      { over: 150_000_000, base: 37_060_000, num: 38, den: 100 },
      { over: 300_000_000, base: 94_060_000, num: 40, den: 100 },
      { over: 500_000_000, base: 174_060_000, num: 42, den: 100 },
      { over: 1_000_000_000, base: 384_060_000, num: 45, den: 100 },
    ],
    // §59① — 산출세액 130만원 이하 55% · 초과 71만5천원 + 초과분 30%
    credit: [
      { over: 0, base: 0, num: 55, den: 100 },
      { over: 1_300_000, base: 715_000, num: 30, den: 100 },
    ],
    // §59② — 1호 3,300만 이하 74만 · 2호 7천만 이하 74만 − 초과분 × 8/1000(하한 66만) · 3호 1.2억 이하 66만 − 초과분 × 1/2(하한 50만)
    //   · 4호 1.2억 초과 50만 − 초과분 × 1/2(하한 20만). 4호는 grossStop(1.2억 이상 멈춤) 때문에 지금은 쓰이지 않는다.
    creditLimit: [
      { over: 0, base: 740_000, num: 0, den: 1, floor: 740_000 },
      { over: 33_000_000, base: 740_000, num: 8, den: 1000, floor: 660_000 },
      { over: 70_000_000, base: 660_000, num: 1, den: 2, floor: 500_000 },
      { over: 120_000_000, base: 500_000, num: 1, den: 2, floor: 200_000 },
    ],
    // 작업 지시 「1.2억 이상은 범위 밖」 — 조문상 정확히 1.2억은 3호 안이라 계산할 수 있다(제품 결정, PR 미확정 7)
    grossStop: 120_000_000,
    basis: '소득세법(2026. 7. 1. 시행본) 제47조·제50조·제51조의3·제52조·제55조·제59조·제59조의4·제61조·제137조',
    checked: '2026-10-29',
  },
];

/** 그해 기준. 없으면 null */
export function rulesFor(year: number): MidyearRules | null {
  return RULES.find((r) => r.year === year) ?? null;
}

/** 화면이 미리 골라 둘 퇴사 연도 — 그해 기준이 있을 때만. 없으면 null(이용자가 직접 고른다, 다른 해로 대신 고르지 않는다) */
export function defaultYear(thisYear: number): number | null {
  return rulesFor(thisYear) ? thisYear : null;
}

/** 분자/분모로 둔 값의 원 미만 버림(아래 쪽). 정수 나머지로 계산한다 */
export function floorDiv(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) throw new Error('계산 범위를 넘었습니다');
  const r = ((n % d) + d) % d;
  return (n - r) / d;
}

/** 10원 미만 버림, 0 쪽으로(국고금 관리법 §47① — 수입·지출 모두. −74,896 → −74,890) */
export function trunc10(x: number): number {
  const t = Math.abs(x) - (Math.abs(x) % 10);
  return x < 0 && t > 0 ? -t : t;
}

/** 구간표 적용 후 원 미만 버림 */
function bracket(table: Bracket[], x: number): number {
  const b = [...table].reverse().find((r) => x > r.over) ?? table[0];
  return floorDiv(b.base * b.den + (x - b.over) * b.num, b.den);
}

/** 근로소득세액공제 한도(§59②) — 원 미만 버림. floor(max(하한, v)) = max(하한, floor(v)) */
function creditLimit(table: LimitBracket[], gross: number): number {
  const b = [...table].reverse().find((r) => gross > r.over) ?? table[0];
  return Math.max(b.floor, floorDiv(b.base * b.den - (gross - b.over) * b.num, b.den));
}

export interface MidyearInput {
  /** 퇴사한 해(귀속연도) */
  year: number;
  /** 그해 받은 급여 합계(비과세 포함, 퇴직월까지) */
  totalPay: number;
  /** 비과세 급여 합계 */
  nonTaxable: number;
  /** 국민연금 근로자 부담 합계 */
  pension: number;
  health: number;
  longTermCare: number;
  employment: number;
  /** 퇴직월 전 달까지 원천징수된 소득세 합계 */
  paidIncomeTax: number;
  /** 퇴직월 간이세액 — 답에는 쓰지 않는다. 회사가 먼저 뗀 경우의 영수증 값(settleWithSimple)에만 쓴다 */
  lastMonthSimpleTax?: number;
  /** 퇴직월 전 달까지 특별징수된 지방소득세 합계 */
  paidLocalTax: number;
}

export interface MidyearPath {
  /** 과세표준 */
  taxBase: number;
  /** 산출세액 */
  computed: number;
  /** 근로소득세액공제 공제액(한도 적용 전, 원 미만 버림) */
  creditRaw: number;
  creditLimit: number;
  /** 근로소득세액공제(한도 적용 후) */
  credit: number;
  /** 표준세액공제(B 만) */
  standard: number;
  /** 결정세액 */
  decided: number;
  /** 이 경로로 정산했을 때의 차감 소득세(+ 더 냄 / − 돌려받음) */
  settleIncomeTax: number;
  decidedLocal: number;
  settleLocalTax: number;
}

export interface MidyearDetail {
  rules: MidyearRules;
  /** 총급여액(§20②) = 받은 급여 − 비과세 */
  gross: number;
  earnedDeduction: number;
  earnedIncome: number;
  pension: number;
  /** 건강 + 장기요양 + 고용 */
  insurance: number;
  a: MidyearPath;
  b: MidyearPath;
  /** 결정세액이 작은 쪽(근로자에게 유리한 쪽으로 가정). 같으면 same */
  method: 'A' | 'B' | 'same';
  decided: number;
  paidIncomeTax: number;
  lastMonthSimpleTax: number;
  /** + 더 냄 / − 돌려받음 */
  settleIncomeTax: number;
  /** 회사가 퇴직월 간이세액을 먼저 떼고 기납부로 넣어 정산한 경우의 차감 소득세. 간이세액 칸이 0 이면 null */
  settleWithSimple: number | null;
  decidedLocal: number;
  paidLocalTax: number;
  settleLocalTax: number;
}

export type MidyearOutcome =
  | { kind: 'ok'; detail: MidyearDetail }
  | { kind: 'out'; reason: 'year'; year: number }
  | { kind: 'out'; reason: 'high-pay'; gross: number; stop: number }
  | { kind: 'out'; reason: 'small-amount'; which: 'income'; detail: MidyearDetail };

const FIELDS: [keyof MidyearInput, string][] = [
  ['totalPay', '받은 급여 합계'],
  ['nonTaxable', '비과세 급여 합계'],
  ['pension', '국민연금'],
  ['health', '건강보험료'],
  ['longTermCare', '장기요양보험료'],
  ['employment', '고용보험료'],
  ['paidIncomeTax', '이미 낸 소득세'],
  ['lastMonthSimpleTax', '퇴직월 간이세액'],
  ['paidLocalTax', '이미 낸 지방소득세'],
];

type PathTax = Omit<MidyearPath, 'settleIncomeTax' | 'decidedLocal' | 'settleLocalTax'>;

function path(r: MidyearRules, gross: number, earnedIncome: number, pension: number, insurance: number, useInsurance: boolean): PathTax {
  // §50·§51의3·§52 — 공제가 종합소득금액을 넘으면 넘는 부분은 없는 것(§51의3③·§52⑧) → 과세표준 하한 0
  const taxBase = Math.max(0, earnedIncome - r.personal - pension - (useInsurance ? insurance : 0)); // 정수끼리라 버릴 끝수 없음
  const computed = bracket(r.taxRates, taxBase); // §55① 산출세액, 원 미만 버림
  const creditRaw = bracket(r.credit, computed); // §59① 공제액, 원 미만 버림
  const limit = creditLimit(r.creditLimit, gross); // §59② 한도
  const credit = Math.min(creditRaw, limit);
  const standard = useInsurance ? 0 : r.standardCredit;
  // §61②·③ — 세액공제 합계가 산출세액을 넘으면 넘는 금액은 없는 것 → 결정세액 하한 0
  const decided = Math.max(0, computed - credit - standard);
  return { taxBase, computed, creditRaw, creditLimit: limit, credit, standard, decided };
}

export function calcMidyear(input: MidyearInput): MidyearOutcome {
  for (const [k, label] of FIELDS) {
    const v = input[k] ?? 0;
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${label}을(를) 원 단위 숫자로 확인해 주세요`);
  }
  if (input.nonTaxable > input.totalPay) throw new Error('비과세 급여가 받은 급여 합계보다 큽니다');

  const r = rulesFor(input.year);
  if (!r) return { kind: 'out', reason: 'year', year: input.year };

  const gross = input.totalPay - input.nonTaxable; // §20② 총급여액 — 비과세소득은 뺀다
  if (gross >= r.grossStop) return { kind: 'out', reason: 'high-pay', gross, stop: r.grossStop };

  // §47①·③ 근로소득공제 — 한도 2천만원, 총급여보다 크면 총급여
  const earnedDeduction = Math.min(bracket(r.earnedDeduction, gross), r.earnedDeductionCap, gross);
  const earnedIncome = gross - earnedDeduction;
  const insurance = input.health + input.longTermCare + input.employment;

  const settle = (p: PathTax): MidyearPath => {
    // 지방세법 §103의13① 원천징수 소득세의 100분의 10 — 원 미만 버림(원천징수영수증 실물 기준, 조문 아님)
    const decidedLocal = floorDiv(p.decided, 10);
    return {
      ...p,
      // 국고금 관리법 §47① — 10원 미만 버림, 0 쪽으로. 기납부 = 퇴직월 전 달까지
      settleIncomeTax: trunc10(p.decided - input.paidIncomeTax),
      decidedLocal,
      // 지방세기본법 §59 → 국고금 관리법 §47 준용, 10원 미만 버림
      settleLocalTax: trunc10(decidedLocal - input.paidLocalTax),
    };
  };
  const a = settle(path(r, gross, earnedIncome, input.pension, insurance, true));
  const b = settle(path(r, gross, earnedIncome, input.pension, insurance, false));
  // 답은 결정세액이 작은 쪽(근로자에게 유리한 쪽으로 가정). 같으면 정산액도 같다
  const method = a.decided < b.decided ? 'A' : b.decided < a.decided ? 'B' : 'same';
  const pick = method === 'A' ? a : b;

  const simple = input.lastMonthSimpleTax ?? 0;
  // §137①3호 — 회사가 퇴직월 간이세액을 먼저 원천징수했다면 그것도 기납부세액이다
  const settleWithSimple = simple > 0 ? trunc10(pick.decided - input.paidIncomeTax - simple) : null;

  const detail: MidyearDetail = {
    rules: r, gross, earnedDeduction, earnedIncome, pension: input.pension, insurance, a, b, method, decided: pick.decided,
    paidIncomeTax: input.paidIncomeTax, lastMonthSimpleTax: simple, settleIncomeTax: pick.settleIncomeTax, settleWithSimple,
    decidedLocal: pick.decidedLocal, paidLocalTax: input.paidLocalTax, settleLocalTax: pick.settleLocalTax,
  };
  // 소득세법 §86 1호 — 원천징수세액 1천원 미만은 징수하지 않는다. 더 내는 경우만(돌려받는 것은 대상 아님).
  // 지방소득세 1천원 미만 추징은 멈추지 않는다 — 위 머리 주석.
  if (detail.settleIncomeTax > 0 && detail.settleIncomeTax < 1_000) return { kind: 'out', reason: 'small-amount', which: 'income', detail };
  return { kind: 'ok', detail };
}
