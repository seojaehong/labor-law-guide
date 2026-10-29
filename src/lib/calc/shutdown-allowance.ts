// 휴업수당 — 사용자의 귀책사유로 휴업하면 휴업기간 동안 평균임금의 100분의 70 이상(근로기준법 §46① 본문).
//   단서: 평균임금의 70%가 통상임금을 「초과」하면 통상임금을 휴업수당으로 「지급할 수 있다」 — 사용자가 고르는 것이라
//     두 값을 나란히 낸다(서울고법 2016. 7. 22. 선고 2015나26148. 대법원 2019. 4. 23. 선고 2016다37167 은 일부 파기환송이고
//     휴업수당 부분은 상고 기각으로 유지 — 대법원은 선택권을 따로 말하지 않았다).
//     「초과」는 엄격한 부등호다. 0.7A = O 이면 단서가 아니다. 비교는 정수(7A > 10O, 전 단위)로 한다.
//   §2②: 평균임금이 통상임금보다 적으면 통상임금을 평균임금으로 — 휴업수당에도 적용(대법원 2016다37167 이유 2.가
//     「통상임금액을 평균임금으로 하여 퇴직금과 휴업수당을 산정」한 원심을 정당하다고 봄. 근로개선정책과-4026 은 퇴직금 해석).
//     그러면 A = O 라 0.7A < O, 단서는 나올 수 없다.
//   시행령 §26: 휴업기간 중 임금 일부를 받았으면 (평균임금 − 받은 임금) × 70% 이상, 단서면 통상임금 − 받은 임금(70%를 곱하지 않는다).
//     기간 합계로 셈한다: (A × 휴업일수 − 받은 임금 합계) × 0.7 — 단서 문언이 「휴업한 기간 중에 지급받은 임금」이다.
//     평균임금이 1일 금액이라 날마다 빼는 읽기도 있다. 어느 하루에 받은 임금이 그날 기준 금액을 넘지 않으면 두 읽기가 같고,
//     넘으면 합계 식이 더 적다(넘친 몫이 다른 날을 깎는다). 원문으로 닫히지 않아 화면에 밝힌다(PR #123 미확정).
//     일부 시간만 쉰 날도 휴업일수에 넣어야 이 식이 맞는다.
//   §46②(노동위원회 승인)·불가항력·상시 4명 이하(시행령 §7 별표1에 §46 없음)는 금액을 내지 않는다.
// 평균임금(§2①6): 휴업이 실제로 시작된 날 전 3개월(근로개선정책과-3190). 기간은 퇴직금 엔진의 periodSegments 를 그대로 쓴다
//   (사유 발생일 = 휴업 시작일). 시행령 §2① 제외기간은 퇴직금 엔진에 없어 여기서 뺀다 — 사용자가 일수와 그 임금을 넣는다.
//   상여금: 12개월 합계의 3/12을 더한다(임금68207-513 · 근기01254-15508 — 퇴직금이 아니라 평균임금 산정사유 일반). 3개월 임금
//     총액에는 넣지 않는다. severance.ts 와 같이 12배 해 정수로 셈한다(뺄 기간이 없으면 calcSeverance().dailyAverage 와 같다).
//   1일 평균임금 끝수 = 소수 둘째 자리 올림(severance.ts calcSeverance 와 같은 식, 고용노동부 퇴직금 계산기 관행 — 법령 규정 아님).
// 통상임금: 시간급(시행령 §6②, ./min-wage unitHours) × 1일 소정근로시간(시행령 §6③), 소수 둘째 자리 반올림
//   (severance.ts 가 dailyOrdinaryWage 를 전 단위로 반올림하는 것과 같다).
//   1일 소정근로시간은 8시간 범위(법 §2①8 「제50조 … 근로시간의 범위에서」, 근기68207-865 「통상임금 산정을 위한 1일
//     소정근로시간이란 1일 8시간 범위내에서 노사가 정한 시간」) — 넘으면 오류.
//   주휴(월급·주급): 1일 소정근로시간분(8시간까지, 법 §55①) — leave-pay.ts 와 같다. 주 6일 × 7시간이면 7시간이지 42 ÷ 5 → 8시간이 아니다.
//     단시간 근로자는 화면이 별표2의 1일 소정(4주 소정 ÷ 20일)을 넣게 하므로 unitHours 기본값(1주 ÷ 5)과 같은 값이 된다.
// 최종 원 미만: 법령에 정함이 없다. §46①이 「100분의 70 이상」이라 못 미치지 않게 올린다(설계 선택 — 연차수당 계산기는 버림).
//   단서 금액(통상임금 − 받은 임금)도 같은 방식으로 올린다.
// 계산은 정수(BigInt, 1일 임금은 전 단위)로 한다. BigInt 리터럴(12n)은 쓰지 않는다 — BigInt(12).
import { periodSegments, type Segment } from './severance';
import { unitHours, type MinWageInput } from './min-wage';

export type WageUnit = MinWageInput['unit'];

export type AverageWageInput =
  /** 휴업 시작일 전 3개월 임금총액으로 산정 */
  | {
      source: 'period';
      hireDate: string;
      /** 휴업을 시작한 날 = 평균임금 산정사유 발생일 */
      startDate: string;
      /** 산정기간(3개월) 동안 받은 임금 총액 — 뺄 기간의 임금까지 포함한 금액 */
      wageTotal: number;
      /** 시행령 §2① 각 호의 기간(앞선 휴업기간 등) 일수 */
      excludedDays?: number;
      /** 그 기간에 받은 임금 */
      excludedWages?: number;
      /** 휴업 시작일 전 12개월 동안 받은 상여금 합계 — 3/12을 더한다. wageTotal 에는 넣지 않는다 */
      annualBonus?: number;
    }
  /** 1일 평균임금을 안다 */
  | { source: 'direct'; daily: number };

export interface ShutdownAllowanceInput {
  /** 상시 근로자 5명 이상 */
  fivePlus: boolean;
  /** employer = 사용자 귀책사유 휴업 · force-majeure = 천재지변 등 불가항력 · commission = §46② 노동위원회 승인 */
  cause: 'employer' | 'force-majeure' | 'commission';
  average: AverageWageInput;
  /** 통상임금 — 단위 기간 금액과 소정근로시간 */
  ordinary: { unit: WageUnit; amount: number; weeklyHours?: number; dailyHours: number };
  /** 휴업일수 — 휴업기간 안의 유급휴일 포함, 무급 휴무일 제외(사용자가 센다) */
  days: number;
  /** 휴업한 기간에 받은 임금 합계(일부 시간 일한 날의 임금 등) */
  paidDuring?: number;
}

export interface ShutdownAllowanceResult {
  /** calculated · under5 = 상시 4명 이하 · force-majeure = 불가항력 · commission = 노동위원회 승인 */
  status: 'calculated' | 'under5' | 'force-majeure' | 'commission';
  averageSource: AverageWageInput['source'] | null;
  /** 산정기간(달마다) — period 일 때 */
  segments: Segment[] | null;
  /** 산정기간 총일수 */
  periodDays: number | null;
  excludedDays: number;
  excludedWages: number;
  /** 뺀 뒤 일수·임금총액(상여금 가산 전) */
  baseDays: number | null;
  baseTotal: number | null;
  /** 12개월 상여금(입력)과 그 3/12(원 미만 포함) */
  annualBonus: number;
  bonusAdd: number;
  /** 1일 평균임금(산정값 또는 넣은 값, 소수 둘째 자리) */
  dailyAverage: number | null;
  unit: WageUnit | null;
  /** 통상임금 단위 기간 금액(입력) */
  ordinaryAmount: number | null;
  /** 단위 기간 시간 수(시급 1 · 일급 1일 소정 · 주급 주 소정 + 주휴 · 월급 그 × 365 ÷ 84 반올림) */
  hours: number | null;
  /** 1주 소정 + 주휴(주급·월급) */
  weekPaidHours: number | null;
  weeklyHours: number | null;
  dailyHours: number | null;
  /** 시간급(소수 그대로) */
  hourly: number | null;
  /** 1일 통상임금(소수 둘째 자리 반올림) */
  dailyOrdinary: number | null;
  /** §2② — 평균임금이 통상임금보다 적어 통상임금을 평균임금으로 했다 */
  ordinaryAsAverage: boolean;
  /** 계산에 쓴 1일 평균임금 */
  dailyApplied: number | null;
  days: number;
  paidDuring: number;
  /** 본문 — (A × 휴업일수 − 받은 임금) × 0.7, 올리기 전 */
  mainExact: number | null;
  /** 본문 금액(원 미만 올림) */
  main: number | null;
  /** 받은 임금이 A × 휴업일수 이상이라 0으로 묶었다 */
  mainClamped: boolean;
  /** 단서 — 0.7A > O 일 때만. 통상임금 × 휴업일수 − 받은 임금, 올리기 전 */
  provisoExact: number | null;
  /** 단서 금액(원 미만 올림). 단서에 해당하지 않으면 null */
  proviso: number | null;
  provisoClamped: boolean;
}

const DAY = 86_400_000;

function parse(s: string, what: string): number {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return t;
}

const isWhole = (n: number) => Number.isInteger(n) && n >= 0;

/** 달력 나누기 — 휴업일수를 셀 때 돕는 값. 월~금 · 토 · 일 */
export function calendarBreakdown(from: string, to: string): { total: number; weekdays: number; saturdays: number; sundays: number } {
  const a = parse(from, '휴업 시작일');
  const b = parse(to, '휴업 마지막 날');
  if (b < a) throw new Error('휴업 마지막 날이 시작일보다 앞섭니다');
  const out = { total: 0, weekdays: 0, saturdays: 0, sundays: 0 };
  for (let t = a; t <= b; t += DAY) {
    const w = new Date(t).getUTCDay();
    out.total += 1;
    if (w === 0) out.sundays += 1;
    else if (w === 6) out.saturdays += 1;
    else out.weekdays += 1;
  }
  return out;
}

/** 올림 나눗셈(음이 아닌 정수) */
const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;

function empty(status: ShutdownAllowanceResult['status'], input: ShutdownAllowanceInput): ShutdownAllowanceResult {
  return {
    status, averageSource: null, segments: null, periodDays: null, excludedDays: 0, excludedWages: 0, baseDays: null, baseTotal: null, annualBonus: 0, bonusAdd: 0,
    dailyAverage: null, unit: null, ordinaryAmount: null, hours: null, weekPaidHours: null, weeklyHours: null, dailyHours: null, hourly: null, dailyOrdinary: null,
    ordinaryAsAverage: false, dailyApplied: null, days: input.days, paidDuring: input.paidDuring ?? 0,
    mainExact: null, main: null, mainClamped: false, provisoExact: null, proviso: null, provisoClamped: false,
  };
}

export function calcShutdownAllowance(input: ShutdownAllowanceInput): ShutdownAllowanceResult {
  // 적용 범위 먼저 — 4명 이하면 §46이 없고, 불가항력·노동위 승인은 금액을 내지 않는다(입력이 비어도 답한다)
  if (!input.fivePlus) return empty('under5', input);
  if (input.cause === 'force-majeure') return empty('force-majeure', input);
  if (input.cause === 'commission') return empty('commission', input);

  const days = input.days;
  if (!Number.isInteger(days) || days < 1 || days > 3_660) throw new Error('휴업일수를 확인해 주세요(1일 이상 정수)');
  const paid = input.paidDuring ?? 0;
  if (!isWhole(paid)) throw new Error('휴업 중 받은 임금을 확인해 주세요');

  // 1일 평균임금(전 단위)
  const av = input.average;
  let segments: Segment[] | null = null;
  let periodDays: number | null = null;
  let excludedDays = 0;
  let excludedWages = 0;
  let baseDays: number | null = null;
  let baseTotal: number | null = null;
  let annualBonus = 0;
  let avgCents: bigint;
  if (av.source === 'period') {
    const hire = parse(av.hireDate, '입사일');
    const start = parse(av.startDate, '휴업 시작일');
    if (hire > start) throw new Error('입사일이 휴업 시작일보다 뒤입니다');
    if (!isWhole(av.wageTotal) || av.wageTotal === 0) throw new Error('3개월 임금 총액을 확인해 주세요(원 단위)');
    excludedDays = av.excludedDays ?? 0;
    excludedWages = av.excludedWages ?? 0;
    annualBonus = av.annualBonus ?? 0;
    if (!isWhole(excludedDays)) throw new Error('뺄 기간의 일수를 확인해 주세요');
    if (!isWhole(excludedWages)) throw new Error('뺄 기간의 임금을 확인해 주세요');
    if (!isWhole(annualBonus)) throw new Error('12개월 상여금 합계를 확인해 주세요(원 단위)');
    segments = periodSegments(av.hireDate, av.startDate);
    periodDays = segments.reduce((a, s) => a + s.days, 0);
    if (periodDays === 0) throw new Error('입사한 날 휴업을 시작해 산정할 기간이 없습니다. 1일 평균임금을 직접 넣어 주세요');
    if (excludedDays >= periodDays) throw new Error('뺄 기간이 산정기간보다 길거나 같습니다. 1일 평균임금을 직접 넣어 주세요');
    // 같아도 막는다 — 남는 임금이 0원이면 1일 평균임금 0원이 §2②에 조용히 덮인다
    if (excludedWages >= av.wageTotal) throw new Error('뺄 기간의 임금이 3개월 임금 총액보다 많거나 같습니다. 1일 평균임금을 직접 넣어 주세요');
    baseDays = periodDays - excludedDays;
    baseTotal = av.wageTotal - excludedWages;
    // 12배 해 두면 상여금 3/12 가산도 정수로 남는다. 소수 둘째 자리 올림 = ceil(base12 × 100 ÷ (12 × 일수)) — severance.ts 와 같은 식
    const base12 = BigInt(baseTotal) * BigInt(12) + BigInt(annualBonus) * BigInt(3);
    avgCents = ceilDiv(base12 * BigInt(100), BigInt(12) * BigInt(baseDays));
  } else {
    if (!(av.daily > 0) || !Number.isFinite(av.daily)) throw new Error('1일 평균임금을 확인해 주세요');
    avgCents = BigInt(Math.round(av.daily * 100));
  }

  // 1일 통상임금(전 단위) — 시간급 × 1일 소정근로시간, 소수 둘째 자리 반올림
  const o = input.ordinary;
  if (!(o.amount > 0) || !Number.isFinite(o.amount)) throw new Error('통상임금을 확인해 주세요');
  if (!(o.dailyHours > 0) || !Number.isFinite(o.dailyHours)) throw new Error('1일 소정근로시간을 확인해 주세요');
  if (o.dailyHours > 8) {
    throw new Error('통상임금을 셀 1일 소정근로시간은 1일 8시간 범위에서 정한 시간입니다(근로기준법 제2조제1항제8호, 근기68207-865). 8시간 이하로 넣어 주세요');
  }
  // 주휴 = 1일 소정근로시간분(위 검사로 8시간 이하) — unitHours 기본값(1주 ÷ 5)을 쓰지 않는다
  const holiday = o.dailyHours;
  const hours = unitHours(o.unit, o.weeklyHours, o.unit === 'day' ? o.dailyHours : undefined, holiday);
  const weekPaidHours = o.unit === 'week' || o.unit === 'month' ? unitHours('week', o.weeklyHours, undefined, holiday) : null;
  const hourly = o.amount / hours;
  const ordCents = BigInt(Math.round((o.amount * o.dailyHours * 100) / hours));

  // §2② — 평균임금이 통상임금보다 「적으면」 통상임금
  const ordinaryAsAverage = ordCents > avgCents;
  const applied = ordinaryAsAverage ? ordCents : avgCents;

  // 본문 = (A × N − P) × 0.7. D = A(전) × N − P × 100 → 원 = 7D ÷ 1000
  const N = BigInt(days);
  const P = BigInt(paid) * BigInt(100);
  const zero = BigInt(0);
  const d = applied * N - P;
  const mainClamped = d <= zero;
  const mainNum = mainClamped ? zero : BigInt(7) * d;
  const mainExact = Number(mainNum) / 1000;
  const main = Number(ceilDiv(mainNum, BigInt(1000)));

  // 단서 — 0.7A > O(엄격), 정수로: 7A > 10O. 통상임금 × N − P(70%를 곱하지 않는다)
  let provisoExact: number | null = null;
  let proviso: number | null = null;
  let provisoClamped = false;
  if (BigInt(7) * applied > BigInt(10) * ordCents) {
    const e = ordCents * N - P;
    provisoClamped = e <= zero;
    const eNum = provisoClamped ? zero : e;
    provisoExact = Number(eNum) / 100;
    proviso = Number(ceilDiv(eNum, BigInt(100)));
  }

  return {
    status: 'calculated',
    averageSource: av.source,
    segments,
    periodDays,
    excludedDays,
    excludedWages,
    baseDays,
    baseTotal,
    annualBonus,
    bonusAdd: (annualBonus * 3) / 12,
    dailyAverage: Number(avgCents) / 100,
    unit: o.unit,
    ordinaryAmount: o.amount,
    hours,
    weekPaidHours,
    weeklyHours: o.unit === 'week' || o.unit === 'month' ? (o.weeklyHours ?? null) : null,
    dailyHours: o.dailyHours,
    hourly,
    dailyOrdinary: Number(ordCents) / 100,
    ordinaryAsAverage,
    dailyApplied: Number(applied) / 100,
    days,
    paidDuring: paid,
    mainExact,
    main,
    mainClamped,
    provisoExact,
    proviso,
    provisoClamped,
  };
}
