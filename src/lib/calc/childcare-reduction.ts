// 육아기 근로시간 단축 — 근로자 급여(고용보험법 제73조의2·시행령 제104조의2)와 사업주 출산육아기 고용안정장려금(시행령 제29조·고시 별표 5).
// 원문 대조 2026-11-27(법제처 국가법령정보 Open API·고용노동부 고시 원문):
//   · 시행령 제104조의2제2항 = [월 통상임금(상한·하한) × min(단축시간, 10) ÷ 단축 전 소정근로시간]
//                           + [월 통상임금 × 80%(상한·하한) × (단축 전 − 단축 후 − 10, 0 이상) ÷ 단축 전 소정근로시간].
//     하한은 곱하기 전 「월 통상임금에 해당하는 금액」에 붙는다. 지급대상 기간이 1개월을 채우지 못하면 ÷ 그 달 일수 × 사용 일수.
//   · 상한은 판마다 다르다 — 2024. 7. 1.(대통령령 제34601호) 200만·150만, 2025. 1. 1.(제35100호) 220만·150만, 2026. 1. 1.(제35934호) 250만·160만.
//     두 부칙(제35100호 제5조·제35934호 제3조)이 「시행 전에 개시한 단축의 시행 뒤 남은 기간에도 적용」이라 상한은
//     개시일이 아니라 지급대상 기간이 속한 날로 고른다. 2024. 7. 1. 전에 개시한 단축은 그 전 판을 확인하지 않아 계산하지 않는다.
//   · 남녀고용평등법 제19조의2제3항(단축 후 주 15~35시간)·제4항(1년 이내, 쓰지 않은 육아휴직 기간의 두 배 가산)·제19조의4제2항(나눠 쓰면 1회 1개월 이상).
//   · 장려금 = 고시 「고용창출장려금·고용안정장려금의 신청 및 지급에 관한 규정」(2026. 7. 1. 시행) 별표 5 제2호·제4호, 제16조·제17조.
//     신청 시기 = 고용보험법 시행규칙 제51조제2항제1호·제3호, 제3항.
// 공통 형식(./needs.ts) — 통상임금·단축 전·후 시간·개시일이 없으면 금액을 내지 않는다(needs). 요건은 충족·미충족·확인 필요로 나누고,
// 넣지 않은 사실은 확인 필요로 둔다(충족으로 보지 않는다). 상태어 표 = docs/engine-needs-assumptions-261127.md.
import { addDays as dAddDays, fmtDate, parseYmd, periodLastDay, spanDays as dSpanDays, toYmd } from '@/lib/hr-forms/dates';
import type { Assumption, Need } from './needs';

export interface ReductionPayRule {
  /** 이 날부터 시행(YYYY-MM-DD) */
  from: string;
  /** 앞 10시간분의 월 통상임금 상한 */
  firstCap: number;
  /** 나머지 시간분(월 통상임금 80%)의 상한 */
  restCap: number;
  /** 두 구간 공통 하한 */
  floor: number;
  source: string;
}

/** 시행령 제104조의2제2항 상한·하한 — 시행일 순서 */
export const REDUCTION_PAY_RULES: readonly ReductionPayRule[] = [
  { from: '2024-07-01', firstCap: 2_000_000, restCap: 1_500_000, floor: 500_000, source: '고용보험법 시행령 제104조의2제2항(대통령령 제34601호, 2024. 7. 1. 시행)' },
  { from: '2025-01-01', firstCap: 2_200_000, restCap: 1_500_000, floor: 500_000, source: '고용보험법 시행령 제104조의2제2항(대통령령 제35100호, 2025. 1. 1. 시행)' },
  { from: '2026-01-01', firstCap: 2_500_000, restCap: 1_600_000, floor: 500_000, source: '고용보험법 시행령 제104조의2제2항(대통령령 제35934호, 2026. 1. 1. 시행)' },
];

export interface ReductionSubsidyRule {
  from: string;
  /** 육아기 근로시간 단축 지원금 1개월 */
  monthly: number;
  /** 단축을 처음 허용한 사업장의 세 번째 허용 사례까지 1개월 추가 */
  firstGrantBonus: number;
  /** 업무분담 지원금(육아기 근로시간 단축) 1개월 최대 */
  sharingCap: number;
  /** 업무분담 지원금 — 단축된 근로시간이 주 이 시간 이상(시행령 제29조제1항제4호가목 단서) */
  sharingMinReducedHours: number;
  /** 지원 제외 — 신고한 월평균 보수가 이 금액 미만(고시 제16조제3호, 단시간 근로자는 근무시간에 비례해 다시 센다) */
  reportedPayFloor: number;
  source: string;
}

/** 고시 별표 5 — 시행일 순서. 고시는 매년 정한다(시행령 제29조제3항) */
export const REDUCTION_SUBSIDY_RULES: readonly ReductionSubsidyRule[] = [
  {
    from: '2026-07-01', monthly: 300_000, firstGrantBonus: 100_000, sharingCap: 200_000, sharingMinReducedHours: 10, reportedPayFloor: 1_240_000,
    source: '고용창출장려금·고용안정장려금의 신청 및 지급에 관한 규정(고용노동부 고시, 2026. 7. 1. 시행) 별표 5 제2호·제4호, 제16조',
  },
];

/** 위 두 표(시행령·고시)를 법제처·고용노동부 원문과 대조한 날 — 그 뒤 개정은 반영되지 않았다 */
export const RULES_CHECKED_ON = '2026-11-27';

/** 자녀 나이·분할 최소기간·기간 가산을 바꾼 남녀고용평등법 개정 시행일 */
const REFORM_2025 = '2025-02-23';
/** 단축 후 1주 소정근로시간 범위(남녀고용평등법 제19조의2제3항) */
const AFTER_MIN = 15;
const AFTER_MAX = 35;
/** 앞 구간(100%)으로 보는 단축 시간 */
const FIRST_HOURS = 10;
const REST_RATE = 0.8;

export const CHILDCARE_REDUCTION_NEEDS: Record<'monthlyOrdinaryWage' | 'weeklyHoursBefore' | 'weeklyHoursAfter' | 'startDate' | 'priorityFirm', Need> = {
  monthlyOrdinaryWage: {
    key: 'monthlyOrdinaryWage',
    question: '단축을 시작하는 날을 기준으로, 단축 전 근로시간으로 받던 월 통상임금(임금명세서·근로계약서로 확인한 금액)은 얼마인가요?',
    why: '급여는 단축 개시일 기준 월 통상임금에 줄어든 시간의 비율을 곱해 셉니다. 앞 10시간분과 나머지 시간분에 상한·하한이 따로 있습니다(고용보험법 시행령 제104조의2제2항).',
  },
  weeklyHoursBefore: {
    key: 'weeklyHoursBefore',
    question: '단축 전 근로계약서에 적힌 1주 소정근로시간은 몇 시간인가요?',
    why: '줄어든 시간은 단축 전 시간에서 단축 후 시간을 뺀 값이고, 단축 전 시간이 계산식의 분모입니다(고용보험법 시행령 제104조의2제2항).',
  },
  weeklyHoursAfter: {
    key: 'weeklyHoursAfter',
    question: '단축 후 1주 소정근로시간(사업주와 서면으로 정한 시간)은 몇 시간인가요?',
    why: '단축 후 시간은 주 15시간 이상 35시간 이하여야 하고(남녀고용평등법 제19조의2제3항), 줄어든 시간 중 10시간까지와 그 나머지를 나눠 셉니다.',
  },
  startDate: {
    key: 'startDate',
    question: '육아기 근로시간 단축을 시작하는(또는 시작한) 날은 언제인가요?',
    why: '통상임금은 단축 개시일을 기준으로 정하고 급여 신청 기간도 이 날부터 셉니다(고용보험법 제73조의2제2항). 상한은 지급대상 기간이 속한 날의 판을 씁니다(시행령 제104조의2제2항 부칙).',
  },
  priorityFirm: {
    key: 'priorityFirm',
    question: '회사가 우선지원대상기업(고용보험법 시행령 제12조 — 업종별 상시 근로자 수 기준 이하 기업)인가요? 모르면 업종과 상시 근로자 수를 알려 주세요.',
    why: '출산육아기 고용안정장려금은 우선지원대상기업 사업주에게만 지급합니다(고용보험법 시행령 제29조제1항제2호·제4호).',
  },
};

export interface ChildcareReductionInput {
  /** 단축 개시일 기준 월 통상임금(단축 전 근로시간 기준, 원) */
  monthlyOrdinaryWage?: number;
  /** 단축 전 1주 소정근로시간 */
  weeklyHoursBefore?: number;
  /** 단축 후 1주 소정근로시간 */
  weeklyHoursAfter?: number;
  /** 단축 개시일 YYYY-MM-DD */
  startDate?: string;
  /** 단축 끝나는 날 YYYY-MM-DD(그날 포함). 없으면 월액만 낸다 */
  endDate?: string;
  /** 개시일 전 피보험 단위기간 합산 180일 이상(고용보험법 제73조의2제1항) */
  insuredDays180?: boolean;
  /** 대상 자녀가 만 12세 이하 또는 초등학교 6학년 이하(남녀고용평등법 제19조의2제1항) */
  childEligible?: boolean;
  /** 단축 기간 중 출산전후휴가와 겹친 일수(없으면 0) — 30일을 셀 때 뺀다 */
  maternityOverlapDays?: number;
  /** 같은 자녀로 앞서 쓴 육아기 근로시간 단축 일수(처음이면 0) — 1년 한도는 나눠 쓴 기간의 합이다 */
  priorUseDays?: number;
  /** 우선지원대상기업 */
  priorityFirm?: boolean;
  /** 육아기 근로시간 단축을 한 번도 허용하지 않은 사업장이 처음 허용했고 이 근로자가 첫~세 번째 허용 사례다 */
  firstTimeGrant?: boolean;
  /** 사업주(법인은 대표이사)의 배우자·직계 존비속 */
  ownerRelative?: boolean;
  /** 거주(F-2)·영주(F-5)·결혼이민자(F-6)가 아닌 외국인 */
  foreignNonResident?: boolean;
  /** 고시 제17조·시행령 제29조제2항의 지원 제외 사업주(공공기관·지방공기업·제외 업종·근로기준법 제43조의2 명단 공개 중 등) */
  employerExcluded?: boolean;
  /** 사업주가 신고한 월평균 보수(원, 고용산재보험료징수법 제16조의10) */
  monthlyReportedPay?: number;
  /** 단축 기간 중 사업주가 매월 지급하는 임금과 단축을 이유로 주는 금품의 합계(원) — 급여 감액(시행령 제104조의4)을 셀 때 쓴다 */
  employerPaidMonthly?: number;
  /** 단축 시작일 직전 월을 기준으로 한 월 통상임금(원) — 감액 비교 기준(시행령 제104조의4제1호). 비우면 monthlyOrdinaryWage 로 본다 */
  wageBeforeStartMonth?: number;
  /** 단축 근로자가 단축 당시 이 사업장의 고용보험 피보험자인가(법 제73조의2·시행령 제29조제1항) — 개시 전 180일 이력과 별개 */
  currentlyInsured?: boolean;
  /** 업무분담자를 지정해 금전 지원을 했으면 */
  workSharing?: {
    /** 업무분담자에게 업무분담을 사유로 매월 지급한 금액(원) */
    paidMonthly: number;
    /** 업무분담을 시작한 날(기본 = 단축 개시일) */
    startDate?: string;
    /** 업무분담자가 다른 근로시간 단축·대체인력 지원금(육아기 근로시간 단축 급여·워라밸일자리 장려금·대체인력지원금 등)의 지원 대상 */
    otherSupport?: boolean;
    /** 같은 업무분담 지정·대체인력으로 사업주가 매월 받은 다른 지원금(원) — 뺀다(시행령 제29조제5항) */
    otherSupportMonthly?: number;
    /** 업무분담을 끝낸 날(기본 = 단축 종료일) */
    endDate?: string;
    /** 업무분담자 본인이 고시 제16조 지원 제외 근로자(사업주 배우자·직계 존비속, 고용보험 미가입, 신고 월평균 보수 기준 미만) */
    sharerExcluded?: boolean;
  };
}

export type CheckStatus = 'met' | 'unmet' | 'check';
export interface EligibilityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** 충족 · 미충족 · 확인 필요 */
  statusLabel: string;
  note: string;
  basis: string;
}

export interface SchedulePeriod {
  from: string;
  to: string;
  /** 한 달을 다 채웠나 */
  full: boolean;
  days: number;
  /** 다 채우지 못한 기간을 나눈 달의 일수(그 기간이 시작하는 달) */
  monthDays: number | null;
  /** 그 기간 시작일 판의 월액(10원 미만 버림) */
  monthly: number;
  /** 기간 금액(10원 미만 버림). 출산전후휴가와 겹쳐 어느 달이 빠지는지 모르면 null */
  amount: number | null;
  ruleFrom: string;
  /** 상한이 바뀌는 시행일에 걸친 기간 — 시행일 앞뒤 일수로 나눠 각 판 월액을 합했다(업무편람 281쪽) */
  crossesRuleChange: boolean;
}

export interface WorkerPart {
  reducedHours: number;
  firstHours: number;
  restHours: number;
  /** 상한·하한을 붙인 월 통상임금 해당 금액(앞 10시간분) */
  firstBase: number;
  /** 상한·하한을 붙인 월 통상임금 80% 해당 금액(나머지 시간분) */
  restBase: number;
  firstCapped: boolean;
  restCapped: boolean;
  firstFloored: boolean;
  restFloored: boolean;
  /** 소수 둘째 자리 */
  firstPart: number;
  restPart: number;
  /** 월 급여 — 10원 미만 버림(개시일이 속한 판) */
  monthly: number;
  rule: ReductionPayRule;
  /** 종료일이 있을 때만(법정 최대를 넘으면 그날까지). total = 산식 합계(감액·수급 판정 전), 출산전후휴가와 겹치면 null */
  schedule: { periods: SchedulePeriod[]; total: number | null } | null;
  /** 실제 지급액 — 수급 판정(미충족이면 0)과 감액(시행령 제104조의4)을 거친 값. 회사 지급액을 모르면 null */
  payable: {
    monthly: number | null;
    deduction: number | null;
    total: number | null;
    /** 단축 기간에 적용되는 상한 판마다 산식 월액·감액·지급액(판이 하나면 한 줄) */
    byRule: { from: string; monthly: number; deduction: number | null; payable: number | null }[];
    note: string;
  };
  eligibility: EligibilityCheck[];
  /** eligible = 확인한 요건을 모두 갖춤 · check = 확인 필요가 남음 · not-eligible = 미충족이 있음 */
  verdict: 'eligible' | 'check' | 'not-eligible';
  apply: { from: string; until: string | null; note: string };
}

export interface ChildcareReductionResult {
  /** ok = 근로자 급여 계산함 · needs-input = 급여에 필요한 사실이 빠짐(worker = null) */
  status: 'ok' | 'needs-input';
  needs: Need[];
  assumptions: Assumption[];
  worker: WorkerPart | null;
  employer: {
    /** 사업주 장려금 금액을 정하는 데 빠진 사실 — 남으면 사업주 금액은 null */
    needs: Need[];
    subsidy: {
      monthly: number | null;
      base: number | null;
      bonus: number | null;
      total: number | null;
      firstHalf: number | null;
      rest: number | null;
      /** 사업주 금액을 내지 않은 이유(확인한 고시보다 앞선 개시 등). 없으면 null */
      withheld: string | null;
      rule: ReductionSubsidyRule;
      eligibility: EligibilityCheck[];
      apply: { firstFrom: string | null; until: string | null; restFrom: string | null; restUntil: string | null; note: string };
    };
    workSharing: {
      monthly: number | null;
      cap: number;
      total: number | null;
      eligibility: EligibilityCheck[];
      apply: { firstFrom: string | null; until: string | null; note: string };
    } | null;
  };
}

// ── 날짜(YYYY-MM-DD 문자열) — 계산은 서식 날짜 도우미(hr-forms/dates, UTC 자정)를 쓴다 ──
const D = (s: string) => parseYmd(s) as Date;
function parse(s: string, what: string): void {
  if (!parseYmd(s || '')) throw new Error(`${what}을 YYYY-MM-DD 로 넣어 주세요`);
}
const addDays = (s: string, n: number) => toYmd(dAddDays(D(s), n));
const daysIn = (s: string) => { const d = D(s); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };
/** s 부터 n 개월인 기간의 마지막 날(민법 제160조) */
const periodEnd = (s: string, n: number) => toYmd(periodLastDay(D(s), n));
const dotDate = (s: string) => fmtDate(D(s));
const nextMonthFirst = (s: string) => { const d = D(s); return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))); };
const spanDays = (a: string, b: string) => dSpanDays(D(a), D(b));

const ruleAt = <T extends { from: string }>(rules: readonly T[], day: string): T | null => [...rules].reverse().find((r) => r.from <= day) ?? null;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const dec2 = (v: number) => Math.round(v * 100) / 100;

const LABEL: Record<CheckStatus, string> = { met: '충족', unmet: '미충족', check: '확인 필요' };
const chk = (key: string, label: string, status: CheckStatus, note: string, basis: string): EligibilityCheck => ({ key, label, status, statusLabel: LABEL[status], note, basis });
const byBool = (v: boolean | undefined, good: boolean): CheckStatus => (v === undefined ? 'check' : v === good ? 'met' : 'unmet');
/** 예/아니오 사실 하나의 판정 — 넣지 않음·좋은 쪽·나쁜 쪽 문구 */
const boolChk = (key: string, label: string, v: boolean | undefined, good: boolean, notes: [string, string, string], basis: string) =>
  chk(key, label, byBool(v, good), v === undefined ? notes[0] : v === good ? notes[1] : notes[2], basis);
const verdictOf = (cs: EligibilityCheck[]) => (cs.some((c) => c.status === 'unmet') ? 'not-eligible' : cs.some((c) => c.status === 'check') ? 'check' : 'eligible');

/** 10원 미만 버림 — 업무편람(2025) 281쪽 사례 「원 단위 절사」 */
const floor10 = (v: number) => Math.floor((v + 1e-6) / 10) * 10;
/** 소수점 여섯째 자리에서 버림 — 같은 사례의 중간 계산 */
const trunc5 = (v: number) => Math.floor(v * 1e5 + 1e-6) / 1e5;

/**
 * 한 달 단위 기간 — 개시일부터 n 개월째 기간의 마지막 날로 자르고, 종료일에서 끝난다.
 * rateAt(날) = 그날 적용하는 월액(버림 전). boundaries = 월액이 바뀌는 날(그날부터 새 월액).
 * 기간 안에서 월액이 바뀌면 바뀌는 날 앞뒤 일수를 나눠 각 월액에 곱해 합한다(업무편람 281쪽 사례 — 한 달 기간은 그 기간 일수로,
 * 1개월이 안 되는 기간은 그 기간이 시작하는 달의 일수로 나눈다). 금액은 마지막에 10원 미만을 버린다.
 */
function periods(start: string, end: string, rateAt: (day: string) => { exact: number; ruleFrom: string }, boundaries: readonly string[]): SchedulePeriod[] {
  const out: SchedulePeriod[] = [];
  let from = start;
  for (let k = 1; from <= end; k++) {
    const pe = periodEnd(start, k);
    const full = pe <= end;
    const to = full ? pe : end;
    const days = spanDays(from, to);
    const monthDays = full ? null : daysIn(from);
    const denom = full ? days : (monthDays as number);
    const cuts = boundaries.filter((b) => b > from && b <= to);
    const { exact, ruleFrom } = rateAt(from);
    let amount: number;
    if (!cuts.length) {
      amount = full ? floor10(exact) : floor10((exact * days) / denom);
    } else {
      let sum = 0;
      let segFrom = from;
      for (const c of [...cuts, addDays(to, 1)]) {
        sum += trunc5((rateAt(segFrom).exact * spanDays(segFrom, addDays(c, -1))) / denom);
        segFrom = c;
      }
      amount = floor10(sum);
    }
    out.push({ from, to, full, days, monthDays, monthly: floor10(exact), amount, ruleFrom, crossesRuleChange: cuts.length > 0 });
    from = addDays(to, 1);
  }
  return out;
}

function workerMonthly(wage: number, before: number, after: number, rule: ReductionPayRule) {
  const reducedHours = before - after;
  const firstHours = Math.min(reducedHours, FIRST_HOURS);
  const restHours = Math.max(reducedHours - FIRST_HOURS, 0);
  const firstBase = clamp(wage, rule.floor, rule.firstCap);
  const restBase = clamp(wage * REST_RATE, rule.floor, rule.restCap);
  const first = trunc5((firstBase * firstHours) / before);
  const rest = trunc5((restBase * restHours) / before);
  return {
    reducedHours, firstHours, restHours, firstBase, restBase,
    firstCapped: wage > rule.firstCap, restCapped: wage * REST_RATE > rule.restCap,
    firstFloored: wage < rule.floor, restFloored: wage * REST_RATE < rule.floor,
    firstPart: dec2(first), restPart: dec2(rest), exact: first + rest, monthly: floor10(first + rest),
  };
}

const EXCLUDED_NOTE = '국가·지방자치단체·공공기관·지방공기업, 제외 업종(유흥주점 등), 근로기준법 제43조의2 명단 공개 중·같은 법 제43조의4 상습 사업주, 산업안전보건법 제10조 명단 공표 중 등 고시 제17조의 지원 제외 사업주인지 넣지 않았습니다.';

// ── 넣은 값 검사 — 틀린 값은 needs 가 아니라 오류 ──
function validate(input: ChildcareReductionInput): void {
  const { monthlyOrdinaryWage: wage, weeklyHoursBefore: before, weeklyHoursAfter: after, startDate, endDate } = input;
  const nonNeg = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0);
  const nonNegInt = (v: number | undefined) => v === undefined || (Number.isInteger(v) && v >= 0);
  if (wage !== undefined && !(Number.isFinite(wage) && wage > 0)) throw new Error('월 통상임금을 확인해 주세요');
  if (after !== undefined && !(Number.isFinite(after) && after >= AFTER_MIN && after <= AFTER_MAX)) {
    throw new Error('단축 후 1주 소정근로시간은 15시간 이상 35시간 이하여야 합니다(남녀고용평등법 제19조의2제3항)');
  }
  if (before !== undefined && !(Number.isFinite(before) && before > 0)) throw new Error('단축 전 1주 소정근로시간을 확인해 주세요');
  if (before !== undefined && before > 40) throw new Error('소정근로시간은 1주 40시간을 넘을 수 없습니다(근로기준법 제50조제1항). 연장근로를 뺀 시간을 넣어 주세요');
  if (before !== undefined && after !== undefined && !(after < before)) throw new Error('단축 후 시간이 단축 전보다 줄어야 합니다');
  if (startDate !== undefined) {
    parse(startDate, '단축 개시일');
    if (startDate < REDUCTION_PAY_RULES[0].from) throw new Error('2024. 7. 1. 전에 시작한 단축은 계산하지 않습니다(그 전 판의 상한을 확인하지 않았습니다)');
  }
  if (endDate !== undefined) {
    parse(endDate, '단축 종료일');
    if (startDate !== undefined && endDate < startDate) throw new Error('단축 종료일이 개시일보다 앞섭니다');
    if (startDate !== undefined && periodEnd(startDate, 120) < endDate) throw new Error('단축 기간이 10년을 넘습니다. 개시일·종료일을 확인해 주세요');
  }
  const overlap = input.maternityOverlapDays;
  if (!nonNegInt(overlap)) throw new Error('출산전후휴가와 겹친 일수를 0 이상 정수로 넣어 주세요');
  if (overlap !== undefined && startDate && endDate && overlap > spanDays(startDate, endDate)) throw new Error('출산전후휴가와 겹친 일수가 단축 기간보다 깁니다');
  if (!nonNegInt(input.priorUseDays)) throw new Error('같은 자녀로 앞서 쓴 단축 일수를 0 이상 정수로 넣어 주세요');
  if (!nonNeg(input.monthlyReportedPay)) throw new Error('월평균 보수를 확인해 주세요');
  if (!nonNeg(input.employerPaidMonthly)) throw new Error('단축 중 회사가 매월 주는 금액을 확인해 주세요');
  if (input.wageBeforeStartMonth !== undefined && !(Number.isFinite(input.wageBeforeStartMonth) && input.wageBeforeStartMonth > 0)) throw new Error('단축 시작 직전 월의 통상임금을 확인해 주세요');
  const ws = input.workSharing;
  if (ws) {
    if (!(Number.isFinite(ws.paidMonthly) && ws.paidMonthly >= 0)) throw new Error('업무분담자에게 매월 지급한 금액을 확인해 주세요');
    if (ws.startDate !== undefined) parse(ws.startDate, '업무분담 시작일');
    if (ws.endDate !== undefined) parse(ws.endDate, '업무분담 종료일');
    if (ws.startDate && ws.endDate && ws.endDate < ws.startDate) throw new Error('업무분담 종료일이 시작일보다 앞섭니다');
    if (!nonNeg(ws.otherSupportMonthly)) throw new Error('같은 일로 받은 다른 지원금 월액을 확인해 주세요');
  }
}

/** 계산 내내 함께 쓰는 사실 — 입력을 한 번 읽어 둔다 */
interface Ctx {
  input: ChildcareReductionInput;
  startDate?: string;
  endDate?: string;
  overlap?: number;
  prior?: number;
  /** 2025. 2. 23. 전 개시(종전 남녀고용평등법) */
  preReform: boolean;
  /** 출산전후휴가와 겹침 — 단축이 휴가 개시 전날 끝나 기간별 금액·합계·마감을 내지 않는다 */
  overlapping: boolean;
  /** 급여·장려금을 세는 마지막 날 — 법정 최대를 넘으면 잘리고, 다 썼으면 없다 */
  payEnd?: string;
  assumptions: Assumption[];
}

// ── 기간 한도 — 같은 자녀로 나눠 쓴 기간 합산(남녀고용평등법 제19조의2제4항·제19조의4제2항) ──
// 1년(쓰지 않은 육아휴직 기간 가산, 최대 3년)을 넘는 날은 사업주가 임의로 허용한 기간이라 급여를 주지 않는다(업무편람 「초과하는 기간은 지급하지 않음」).
// 넘는 날만 빼고 한도 안 기간은 센다. 2025. 2. 23. 전 개시분도 종전 법에 가산 단서가 있었고 부칙(법률 제20521호 제5조)이 남은 기간에 새 가산을 적용하므로
// 1년 초과는 확인 필요로 두고, 절대 상한은 3년으로 같이 본다. payEnd 를 정한다.
function periodLimitCheck(c: Ctx): EligibilityCheck {
  const { startDate, endDate, prior } = c;
  const basis = '남녀고용평등법 제19조의2제4항·제19조의4제2항';
  const label = '기간 1년 이내(나눠 쓴 기간 합산, 쓰지 않은 육아휴직 기간 가산 시 최대 3년)';
  if (!startDate || !endDate) return chk('periodLimit', label, 'check', '종료일을 넣으면 기간을 봅니다.', basis);
  const span = spanDays(startDate, endDate);
  const used = span + (prior ?? 0);
  const year = spanDays(startDate, periodEnd(startDate, 12));
  const max = spanDays(startDate, periodEnd(startDate, 36));
  const left = max - (prior ?? 0);
  if (left <= 0) {
    c.payEnd = undefined;
    return chk('periodLimit', label, 'unmet', `앞서 쓴 기간(${prior}일)만으로 법정 최대(${max}일)를 다 썼습니다.`, basis);
  }
  if (span > left) {
    const payEnd = addDays(startDate, left - 1);
    c.payEnd = payEnd;
    c.assumptions.push({ key: 'periodCapped', value: payEnd, note: `앞서 쓴 기간을 더해 법정 최대(3년, ${max}일)를 넘어 ${dotDate(payEnd)}까지만 셉니다. 그 뒤는 사업주가 임의로 허용한 기간이라 급여·장려금 대상이 아닙니다.` });
    return chk('periodLimit', label, 'check', `앞서 쓴 기간을 더해 ${used}일로 최대 3년(${max}일)을 넘어 ${dotDate(payEnd)}까지만 셉니다. 1년을 넘는 부분은 쓰지 않은 육아휴직 기간(두 배 가산)으로 채워지는지 확인합니다.`, basis);
  }
  if (used > year) {
    return chk('periodLimit', label, 'check', `앞서 쓴 기간을 더해 ${used}일로 1년(${year}일)을 넘습니다. 쓰지 않은 육아휴직 기간이 있으면 늘어나므로(${c.preReform ? '2025. 2. 23. 전 개시 — 종전 법 가산과 부칙 제5조' : '두 배 가산, 최대 3년'}) 그 기간을 확인합니다. 한도를 넘는 날은 급여를 주지 않습니다.`, basis);
  }
  if (prior === undefined) return chk('periodLimit', label, 'check', `이번 기간은 ${used}일로 1년 이내입니다. 같은 자녀로 앞서 쓴 단축 기간이 있으면 더해 봅니다(넣지 않았습니다).`, basis);
  return chk('periodLimit', label, 'met', `앞서 쓴 기간을 더해 ${used}일로 1년 이내입니다.`, basis);
}

function thirtyDaysCheck({ startDate, endDate, overlap, prior }: Ctx): EligibilityCheck {
  const basis = '고용보험법 제73조의2제1항·시행령 제29조제1항제2호(30일 이상, 출산전후휴가와 겹친 기간 제외)';
  const label = '단축 30일 이상';
  if (!startDate || !endDate) return chk('thirtyDays', label, 'check', '종료일을 넣으면 일수를 셉니다.', basis);
  const days = spanDays(startDate, endDate) - (overlap ?? 0);
  if (days < 30) {
    // 나눠 쓴 앞 기간과 합해 보는지는 고용센터 판단이라, 처음 쓰는 경우(0일)만 미충족으로 단정한다
    return prior === 0
      ? chk('thirtyDays', label, 'unmet', `출산전후휴가와 겹친 날을 빼고 ${days}일입니다(같은 자녀로 앞서 쓴 단축 없음).`, basis)
      : chk('thirtyDays', label, 'check', `이번 기간은 겹친 날을 빼고 ${days}일입니다. 같은 자녀로 나눠 쓴 앞 기간이 ${prior === undefined ? '있는지 넣지 않았고' : `${prior}일 있고`}, 앞 기간과 합해 보는지는 고용센터에 확인합니다.`, basis);
  }
  if (overlap === undefined) return chk('thirtyDays', label, 'check', `${days}일입니다. 출산전후휴가와 겹친 날이 있으면 그 날을 빼고 다시 셉니다.`, basis);
  return chk('thirtyDays', label, 'met', `출산전후휴가와 겹친 날을 빼고 ${days}일입니다.`, basis);
}

function childAgeCheck({ input, preReform }: Ctx): EligibilityCheck {
  const basis = '남녀고용평등법 제19조의2제1항';
  if (preReform) {
    return chk('childAge', '자녀 만 8세 이하 또는 초등학교 2학년 이하(2025. 2. 23. 전 개시)', input.childEligible === false ? 'unmet' : 'check',
      input.childEligible === false ? '해당하지 않는다고 넣었습니다.' : '2025. 2. 23. 전에 개시한 단축은 그 전 기준(만 8세 이하·초등학교 2학년 이하)으로 봅니다. 지금 기준(만 12세·초6)으로 넣은 「해당」은 그대로 쓰지 않습니다.', basis);
  }
  return boolChk('childAge', '자녀 만 12세 이하 또는 초등학교 6학년 이하', input.childEligible, true, ['자녀 나이·학년을 넣지 않았습니다.', '해당한다고 넣었습니다.', '해당하지 않는다고 넣었습니다.'], basis);
}

/** 근로자·사업주 판정이 함께 쓰는 요건 */
interface Shared {
  periodLimit: EligibilityCheck;
  thirtyDays: EligibilityCheck;
  childAge: EligibilityCheck;
  insured: EligibilityCheck;
}
/** 두 사업주 지원금이 함께 쓰는 요건 */
interface Grant extends Shared {
  priority: EligibilityCheck;
  allowed30: EligibilityCheck;
  excluded: EligibilityCheck;
}

// ── 근로자 — 육아기 근로시간 단축 급여 ──
function buildWorker(c: Ctx, s: Shared): WorkerPart {
  const { input, overlapping, payEnd, endDate, assumptions } = c;
  const start = c.startDate as string;
  const w = input.monthlyOrdinaryWage as number;
  const before = input.weeklyHoursBefore as number;
  const after = input.weeklyHoursAfter as number;
  const rule = ruleAt(REDUCTION_PAY_RULES, start) as ReductionPayRule;
  const m = workerMonthly(w, before, after, rule);
  const rateAt = (day: string) => {
    const r = ruleAt(REDUCTION_PAY_RULES, day) as ReductionPayRule;
    return { exact: workerMonthly(w, before, after, r).exact, ruleFrom: r.from };
  };

  let schedule: WorkerPart['schedule'] = null;
  if (endDate && payEnd) {
    let ps = periods(start, payEnd, rateAt, REDUCTION_PAY_RULES.map((r) => r.from));
    const crossed = ps.filter((p) => p.crossesRuleChange);
    if (crossed.length) {
      assumptions.push({
        key: 'ruleChangeInsidePeriod',
        value: crossed.map((p) => `${p.from}~${p.to}`).join(', '),
        note: '이 기간은 상한이 바뀌는 시행일에 걸쳐 있어 시행일 앞뒤 일수를 그 기간 일수로 나눠 각 판의 월액을 곱해 합했습니다(부칙 — 시행 전 개시분의 남은 기간에도 새 상한, 업무편람 281쪽 사례와 같은 방식).',
      });
    }
    if (overlapping) {
      ps = ps.map((p) => ({ ...p, amount: null }));
      assumptions.push({
        key: 'maternityOverlap',
        value: c.overlap as number,
        note: '단축 중 출산전후휴가를 시작하면 단축은 휴가 개시일 전날 끝난 것으로 봅니다(남녀고용평등법 시행령 제15조의3제4항). 겹친 날이 어느 달인지 몰라 기간별 금액·합계·신청 마감은 내지 않습니다. 실제 단축 종료일(휴가 개시 전날)을 종료일로 넣어 다시 셉니다.',
      });
    }
    if (ps.some((p) => !p.full)) {
      assumptions.push({
        key: 'partialMonthDays',
        value: ps.filter((p) => !p.full).map((p) => `${p.from}~${p.to}: ${p.days}일 ÷ ${p.monthDays}일`).join(', '),
        note: '1개월을 채우지 못한 기간은 그 기간이 시작하는 달의 일수로 나눴습니다(시행령 제104조의2제2항 단서 「그 달의 일수」, 고시 별표 5 비고의 「잔여일이 시작하는 날이 속하는 월」과 같은 방식).',
      });
    }
    schedule = { periods: ps, total: overlapping ? null : ps.reduce((a, p) => a + (p.amount as number), 0) };
  }
  assumptions.push({ key: 'rounding', value: '10원 미만 버림', note: '업무편람 281쪽 사례대로 중간 계산은 소수점 여섯째 자리에서 버리고 금액은 10원 미만을 버렸습니다. 실제 지급액은 고용센터 산정액으로 확인합니다.' });
  assumptions.push({
    key: 'payRuleCheckedOn',
    value: RULES_CHECKED_ON,
    note: `상한·하한은 ${RULES_CHECKED_ON}에 확인한 시행령 판(시행 예정 개정 없음)으로 셉니다. 그 뒤 시행령이 바뀌면 바뀐 날 이후 기간의 금액이 달라집니다.`,
  });

  const eligibility: EligibilityCheck[] = [
    chk('reducedHoursRange', '단축 후 주 15~35시간', 'met', `단축 후 ${after}시간입니다.`, '남녀고용평등법 제19조의2제3항'),
    boolChk('insured180', '개시일 전 피보험 단위기간 180일 이상', input.insuredDays180, true,
      ['고용보험 피보험 단위기간(보수를 받은 날)을 합해 180일이 되는지 넣지 않았습니다.', '180일 이상이라고 넣었습니다.', '180일이 안 된다고 넣었습니다.'], '고용보험법 제73조의2제1항·제41조'),
    ...(input.currentlyInsured === undefined ? [] : [s.insured]),
    s.childAge,
    s.thirtyDays,
    s.periodLimit,
    splitMinCheck(c),
  ];
  const verdict = verdictOf(eligibility);
  const payable = workerPayable(c, w, before, after, rule, verdict);
  const { exact: _exact, ...shown } = m;
  return {
    ...shown,
    rule,
    schedule,
    payable,
    eligibility,
    verdict,
    apply: {
      from: addDays(periodEnd(start, 1), 1),
      until: endDate && !overlapping ? periodEnd(addDays(endDate, 1), 12) : null,
      note: `단축을 시작한 날 이후 1개월부터 끝난 날 이후 12개월 이내에 신청합니다(고용보험법 제73조의2제2항 본문, 일반 신청기한). 천재지변·본인이나 배우자의 질병 등 시행령 제94조의 사유로 그 안에 신청하지 못하면 그 사유가 끝난 뒤 30일 이내에 신청합니다(같은 항 단서). ${!endDate ? '종료일을 넣으면 마감일을 셉니다. ' : overlapping ? '출산전후휴가로 단축이 휴가 개시 전날 끝나므로 그 날을 종료일로 넣어야 마감일을 셉니다. ' : ''}${rule.source} 기준입니다.`,
    },
  };
}

function splitMinCheck({ startDate, endDate, preReform }: Ctx): EligibilityCheck {
  const basis = '남녀고용평등법 제19조의4제2항';
  const n = preReform ? 3 : 1;
  const label = `나눠 쓰면 1회 ${n}개월 이상${preReform ? '(2025. 2. 23. 전 개시)' : ''}`;
  if (!endDate) return chk('splitMin', label, 'check', '종료일을 넣으면 봅니다.', basis);
  return periodEnd(startDate as string, n) <= endDate
    ? chk('splitMin', label, 'met', `${n}개월 이상입니다.`, basis)
    : chk('splitMin', label, 'check', `${n}개월이 안 됩니다. 근로계약기간이 끝나 ${n}개월을 쓸 수 없는 기간제근로자는 남은 계약기간이면 됩니다.`, basis);
}

// 지급액 — 미충족이면 0, 회사 지급액을 알면 시행령 제104조의4 감액을 뺀다. 상한 판이 여럿이면 판마다 낸다
function workerPayable(c: Ctx, w: number, before: number, after: number, rule: ReductionPayRule, verdict: WorkerPart['verdict']): WorkerPart['payable'] {
  const { input, assumptions } = c;
  const start = c.startDate as string;
  const paid = input.employerPaidMonthly;
  const baseWage = input.wageBeforeStartMonth ?? w;
  if (paid !== undefined && input.wageBeforeStartMonth === undefined) {
    assumptions.push({ key: 'deductionBaseWage', value: w, note: '감액은 단축 시작일 직전 월을 기준으로 한 월 통상임금과 비교합니다(시행령 제104조의4제1호). 그 값을 넣지 않아 단축 개시일 기준 통상임금으로 봤습니다. 둘이 다르면(개시일에 맞춘 인상 등) wageBeforeStartMonth 를 넣습니다.' });
  }
  const lastDay = c.payEnd ?? c.endDate ?? '9999-12-31';
  const rulesUsed = REDUCTION_PAY_RULES.filter((r) => r.from === rule.from || (r.from > start && r.from <= lastDay));
  const byRule = rulesUsed.map((r) => {
    const mm = workerMonthly(w, before, after, r).monthly;
    if (verdict === 'not-eligible') return { from: r.from, monthly: mm, deduction: null, payable: 0 };
    if (paid === undefined) return { from: r.from, monthly: mm, deduction: null, payable: null };
    const deduction = Math.max(0, Math.min(mm, paid + mm - baseWage));
    return { from: r.from, monthly: mm, deduction, payable: mm - deduction };
  });
  const note104_4 = '단축 중 회사가 주는 임금·금품과 이 급여의 합이 단축 시작일 직전 월 기준 월 통상임금(단축 중 오르면 오른 날부터 오른 금액)을 넘으면 넘는 만큼 급여에서 뺍니다(고용보험법 시행령 제104조의4).';
  if (verdict === 'not-eligible') return { monthly: 0, deduction: null, total: 0, byRule, note: '미충족 요건이 있어 급여를 받지 못합니다. 위 월액은 산식으로 센 참고값입니다.' };
  if (paid === undefined) return { monthly: null, deduction: null, total: null, byRule, note: `회사가 단축 중 매월 주는 금액(employerPaidMonthly)을 넣으면 감액을 반영한 지급액을 셉니다. ${note104_4}` };
  return {
    monthly: byRule[0].payable,
    deduction: byRule[0].deduction,
    total: null,
    byRule,
    note: `${note104_4} 감액은 달마다 회사 지급액으로 다시 세므로 기간 합계는 내지 않습니다.${byRule.length > 1 ? ' 상한이 바뀌는 판이 있어 판마다 지급액을 byRule 에 냈습니다.' : ''}${verdict === 'check' ? ' 확인 필요 요건이 남아 있어 그 요건을 갖춘다는 전제의 금액입니다.' : ''}`,
  };
}

/** 장려금 기간 합계 — 1개월이 안 되는 남은 기간은 그 기간이 시작하는 달의 일수로 나눈다(고시 별표 5 비고). 출산전후휴가와 겹치면 내지 않는다 */
function sumOver(c: Ctx, rateAt: (day: string) => { exact: number; ruleFrom: string }, boundaries: readonly string[], from: string | undefined, to: string | undefined): number | null {
  if (!from || !c.endDate || c.overlapping) return null;
  if (!to || to < from) return 0;
  return periods(from, to, rateAt, boundaries).reduce((a, p) => a + (p.amount as number), 0);
}

// ── 사업주 — 육아기 근로시간 단축 지원금 ──
// 고시 별표 5 개정은 「그 뒤 단축을 허용(개시)한 사업주부터」 적용해 왔으므로(부칙 2022. 1. 1. 제2조제3항 등) 판은 개시일로 고른다
function buildSubsidy(c: Ctx, s: Grant, employerNeeds: Need[], rule: ReductionSubsidyRule, withheld: string | null) {
  const { input, startDate, endDate, overlapping } = c;
  const pay = input.monthlyReportedPay;
  const reportedPay = pay === undefined
    ? chk('reportedPay', `신고한 월평균 보수 ${won(rule.reportedPayFloor)} 이상`, 'check', '넣지 않았습니다.', '고시 제16조제3호')
    : pay >= rule.reportedPayFloor
      ? chk('reportedPay', `신고한 월평균 보수 ${won(rule.reportedPayFloor)} 이상`, 'met', `${won(rule.reportedPayFloor)} 이상입니다.`, '고시 제16조제3호')
      : chk('reportedPay', `신고한 월평균 보수 ${won(rule.reportedPayFloor)} 이상`, 'check', `${won(rule.reportedPayFloor)} 미만입니다. 단시간 근로자는 월 근무시간에 비례해 기준 금액을 다시 세므로(제16조제3호 단서) 고용센터에서 확인합니다.`, '고시 제16조제3호');
  const eligibility: EligibilityCheck[] = [
    s.priority, s.allowed30, s.childAge, s.periodLimit, s.insured,
    boolChk('ownerRelative', '사업주의 배우자·직계 존비속이 아님', input.ownerRelative, false, ['넣지 않았습니다.', '아니라고 넣었습니다.', '배우자·직계 존비속이라고 넣었습니다(지원 제외).'], '고시 제16조제1호'),
    boolChk('foreign', '외국인이면 거주(F-2)·영주(F-5)·결혼이민자(F-6)', input.foreignNonResident, false, ['넣지 않았습니다.', '해당 없다고 넣었습니다.', '그 밖의 외국인이라고 넣었습니다(지원 제외).'], '고시 제16조제4호'),
    reportedPay,
    s.excluded,
    chk('keepSixMonths', '나머지 50% — 끝난 뒤 6개월 이상 계속 고용', 'check', '단축이 끝난 뒤 6개월 이상 피보험자로 계속 고용해야 나머지 50%를 받습니다(근로자 자기 사정으로 그만둔 경우 포함).', '고용보험법 시행령 제29조제6항제1호'),
  ];
  const unmet = eligibility.some((x) => x.status === 'unmet');
  const ready = !employerNeeds.length && withheld === null;
  const base = ready ? (unmet ? 0 : rule.monthly) : null;
  const bonus = ready ? (unmet || !input.firstTimeGrant ? 0 : rule.firstGrantBonus) : null;
  const monthly = base === null || bonus === null ? null : base + bonus;
  const total = monthly === null ? null : monthly === 0 ? (startDate && endDate && !overlapping ? 0 : null) : sumOver(c, () => ({ exact: monthly, ruleFrom: rule.from }), [], startDate, c.payEnd);
  const firstHalf = total === null ? null : Math.floor(total / 2);
  const restFrom = endDate && !overlapping ? addDays(periodEnd(addDays(endDate, 1), 6), 1) : null;
  return {
    monthly,
    withheld,
    base,
    bonus,
    total,
    firstHalf,
    rest: total === null || firstHalf === null ? null : total - firstHalf,
    rule,
    eligibility,
    apply: {
      firstFrom: startDate ? nextMonthFirst(startDate) : null,
      until: endDate && !overlapping ? periodEnd(addDays(endDate, 1), 12) : null,
      restFrom,
      restUntil: restFrom ? periodEnd(restFrom, 12) : null,
      note: '절반은 단축을 시작한 날이 속하는 달의 다음 달부터 3개월마다, 나머지는 단축이 끝난 뒤 6개월이 지난 날부터 한꺼번에 신청합니다(고용보험법 시행규칙 제51조제2항제1호). 신청 기간은 종료일부터 12개월 이내, 나머지 금액은 6개월이 지난 날부터 12개월 이내입니다(같은 조 제3항). 다만 근로자 자기 사정으로 6개월을 계속 고용하지 못했으면 나머지 금액은 그 근로자가 이직한 날의 다음 날부터 12개월 이내에 신청합니다(같은 조 제2항제1호나목 단서·제3항제1호 단서) — restFrom·restUntil 은 6개월 계속 고용을 전제로 한 날짜입니다. 기간 중 신청하지 못한 금액은 끝난 다음 날부터 신청할 수 있습니다(같은 조 제2항제4호).',
    },
  };
}

// ── 사업주 — 업무분담 지원금 ──
// 업무분담지원금 개정은 「지정이 그 전이어도 시행일 뒤 금전 지원을 한 기간」에 적용한다(고시 부칙 2026. 1. 1. 제3조제8항) — 기간마다 그 날의 판으로 센다
function buildWorkSharing(c: Ctx, s: Grant, employerNeeds: Need[]): NonNullable<ChildcareReductionResult['employer']['workSharing']> {
  const { input, startDate, endDate, payEnd, assumptions } = c;
  const ws = input.workSharing!;
  const R = REDUCTION_SUBSIDY_RULES;
  // 단축 기간 안에서 업무분담자를 지정하고 보상한 기간만 센다(시행령 제29조제5항제1호) — 두 기간의 겹친 부분
  const wsStart = ws.startDate && startDate && ws.startDate < startDate ? startDate : ws.startDate ?? startDate;
  const wsEnd = ws.endDate && payEnd && ws.endDate < payEnd ? ws.endDate : payEnd;
  if (!ws.startDate) assumptions.push({ key: 'workSharingStart', value: startDate ?? '', note: '업무분담 시작일을 넣지 않아 단축 개시일에 시작한 것으로 봤습니다.' });
  else if (wsStart !== ws.startDate) assumptions.push({ key: 'workSharingStart', value: wsStart ?? '', note: '업무분담 시작일이 단축 개시일보다 앞서 단축 기간 안(개시일)부터 셌습니다.' });
  if (!ws.endDate && endDate) assumptions.push({ key: 'workSharingEnd', value: payEnd ?? endDate, note: '업무분담 종료일을 넣지 않아 단축이 끝날 때까지 업무분담과 보상이 이어진 것으로 봤습니다. 먼저 끝났으면 그 날을 넣어야 합니다.' });
  if (ws.otherSupportMonthly === undefined) assumptions.push({ key: 'workSharingOtherSupport', value: 0, note: '같은 업무분담 지정·대체인력으로 받은 다른 지원금이 없다고 보고 셌습니다. 있으면 otherSupportMonthly 에 넣어 뺍니다(시행령 제29조제5항).' });
  const outside = (ws.startDate && endDate && ws.startDate > endDate) || (ws.endDate && startDate && ws.endDate < startDate);
  const rule = (wsStart ? ruleAt(R, wsStart) : null) ?? R[0];
  const checks: EligibilityCheck[] = [
    s.priority, s.allowed30, s.childAge, s.periodLimit, s.insured, s.excluded,
    outside
      ? chk('withinReduction', '업무분담이 단축 기간 안', 'unmet', '업무분담 기간이 단축 기간과 겹치지 않습니다.', '고용보험법 시행령 제29조제5항제1호')
      : chk('withinReduction', '업무분담이 단축 기간 안', 'met', '단축 기간과 겹치는 기간만 셉니다.', '고용보험법 시행령 제29조제5항제1호'),
    reducedTenHours(input, rule),
    boolChk('otherSupport', '업무분담자가 다른 근로시간 단축·대체인력 지원금의 지원 대상이 아님', ws.otherSupport, false, ['넣지 않았습니다.', '아니라고 넣었습니다.', '지원 대상이라고 넣었습니다(지원 제외).'], '고시 별표 5 제4호'),
    // 업무분담 동료근로자도 고시 제16조의 「지원 대상 근로자」다 — 제4호 단서가 외국인 업무분담자를 따로 포함시키는 것이 그 전제
    boolChk('sharerExcluded', '업무분담자 본인이 지원 제외 근로자가 아님(사업주 배우자·직계 존비속, 고용보험 미가입, 신고 월평균 보수 기준 미만)', ws.sharerExcluded, false,
      ['업무분담자 본인이 고시 제16조제1호~제3호에 해당하는지 넣지 않았습니다. 외국인 업무분담자는 고용보험에 가입했으면 체류자격과 관계없이 대상입니다(제4호 단서 가목).', '해당하지 않는다고 넣었습니다.', '해당한다고 넣었습니다(지원 제외).'],
      '고시 제16조제1호~제4호(제4호 단서 가목)'),
  ];
  const unmet = checks.some((x) => x.status === 'unmet');
  // 고시 금액에서 같은 지정·대체인력으로 받은 다른 지원금을 뺀 뒤, 업무분담자에게 지급한 금액을 넘지 않게(시행령 제29조제5항 — 문언 순서)
  const amountAt = (r: ReductionSubsidyRule) => (unmet ? 0 : Math.min(Math.max(0, r.sharingCap - (ws.otherSupportMonthly ?? 0)), ws.paidMonthly));
  const ready = !employerNeeds.length;
  const monthly = ready ? amountAt(rule) : null;
  // 확인한 첫 고시보다 앞선 업무분담 기간은 그 판 금액을 몰라 합계를 내지 않는다
  const beforeRule = !!wsStart && wsStart < R[0].from;
  if (beforeRule) {
    assumptions.push({ key: 'workSharingBeforeRule', value: R[0].from, note: `업무분담 기간 중 ${dotDate(R[0].from)} 전 부분은 그 전 고시 금액을 확인하지 않아 업무분담 지원금 합계를 내지 않습니다. 월액은 ${dotDate(R[0].from)} 시행 고시 금액입니다.` });
  }
  const total = !ready || beforeRule ? null
    : sumOver(c, (day) => { const r = ruleAt(R, day) ?? R[0]; return { exact: amountAt(r), ruleFrom: r.from }; }, R.map((r) => r.from), wsStart, wsEnd);
  return {
    monthly,
    cap: rule.sharingCap,
    total,
    eligibility: checks,
    apply: {
      firstFrom: wsStart ? nextMonthFirst(wsStart) : null,
      until: endDate && !c.overlapping ? periodEnd(addDays(endDate, 1), 12) : null,
      note: '업무분담을 시작한 날이 속하는 달의 다음 달부터 3개월마다 신청하고(고용보험법 시행규칙 제51조제2항제3호가목), 신청 기간은 단축 종료일부터 12개월 이내입니다(같은 조 제3항). 기간 중 신청하지 못한 금액은 끝난 다음 날부터 신청할 수 있습니다(같은 조 제2항제4호). 사업주가 업무분담자에게 지급한 금액을 넘지 않고, 같은 일로 받은 다른 지원금은 뺍니다(시행령 제29조제5항).',
    },
  };
}

function reducedTenHours(input: ChildcareReductionInput, rule: ReductionSubsidyRule): EligibilityCheck {
  const { weeklyHoursBefore: before, weeklyHoursAfter: after } = input;
  const label = `단축된 근로시간 주 ${rule.sharingMinReducedHours}시간 이상`;
  const basis = '고용보험법 시행령 제29조제1항제4호가목 단서';
  if (before === undefined || after === undefined) return chk('reducedTenHours', label, 'check', '단축 전·후 시간을 넣으면 봅니다.', basis);
  const h = before - after;
  return chk('reducedTenHours', label, h >= rule.sharingMinReducedHours ? 'met' : 'unmet', `주 ${h}시간 줄었습니다.`, basis);
}

export function calcChildcareReduction(input: ChildcareReductionInput): ChildcareReductionResult {
  validate(input);
  const { startDate, endDate } = input;
  const N = CHILDCARE_REDUCTION_NEEDS;
  const needs: Need[] = [];
  if (input.monthlyOrdinaryWage === undefined) needs.push(N.monthlyOrdinaryWage);
  if (input.weeklyHoursBefore === undefined) needs.push(N.weeklyHoursBefore);
  if (input.weeklyHoursAfter === undefined) needs.push(N.weeklyHoursAfter);
  if (startDate === undefined) needs.push(N.startDate);

  const c: Ctx = {
    input,
    startDate,
    endDate,
    overlap: input.maternityOverlapDays,
    prior: input.priorUseDays,
    preReform: startDate !== undefined && startDate < REFORM_2025,
    overlapping: (input.maternityOverlapDays ?? 0) > 0,
    payEnd: endDate,
    assumptions: [],
  };
  const subsidyRule = ruleAt(REDUCTION_SUBSIDY_RULES, startDate ?? '9999-12-31') ?? REDUCTION_SUBSIDY_RULES[0];
  c.assumptions.push({
    key: 'subsidyNotice',
    value: subsidyRule.from,
    note: `사업주 장려금은 ${subsidyRule.source} 금액으로 셉니다. 고시는 매년 정하는 금액이라(고용보험법 시행령 제29조제3항) 그 뒤 고시가 바뀌면 달라집니다.`,
  });
  // 확인한 고시보다 앞서 개시하면 단축 지원금을 내지 않는다(급여 상한이 확인 안 된 판을 거절하는 것과 같은 기준)
  const withheld = startDate !== undefined && startDate < subsidyRule.from
    ? `개시일이 ${dotDate(subsidyRule.from)} 전이라 사업주 금액을 내지 않습니다. 그 전에 시행된 고시 금액을 확인하지 않았습니다.`
    : null;

  const periodLimit = periodLimitCheck(c);
  const thirtyDays = thirtyDaysCheck(c);
  const shared: Shared = {
    periodLimit,
    thirtyDays,
    childAge: childAgeCheck(c),
    insured: boolChk('insured', '단축 근로자가 단축 당시 이 사업장의 고용보험 피보험자', input.currentlyInsured, true,
      ['단축 당시 피보험자인지 넣지 않았습니다(개시 전 180일 이력과는 다른 사실입니다).', '피보험자라고 넣었습니다.', '피보험자가 아니라고 넣었습니다.'],
      '고용보험법 제73조의2제1항·시행령 제29조제1항제2호·제4호가목'),
  };
  const worker = needs.length ? null : buildWorker(c, shared);

  // 사업주 금액에 필요한 사실은 개시일(고시 판·신청일)과 우선지원대상기업 여부다 — 통상임금·시간이 빠져도 막지 않는다
  const employerNeeds: Need[] = [];
  if (startDate === undefined) employerNeeds.push(N.startDate);
  if (input.priorityFirm === undefined) employerNeeds.push(N.priorityFirm);
  if (input.priorityFirm !== undefined && input.firstTimeGrant === undefined) {
    c.assumptions.push({ key: 'firstTimeGrant', value: false, note: '단축을 처음 허용한 사업장의 세 번째 허용 사례까지 붙는 월 추가 지원(고시 별표 5 제2호)은 넣지 않아 빼고 셌습니다.' });
  }
  // 두 지원금이 함께 쓰는 판정 — 피보험자인 근로자에게 법정 육아기 단축(자녀 요건·법정 기간 안)을 30일 이상 허용(시행령 제29조제1항제2호·제4호가목)
  const grant: Grant = {
    ...shared,
    priority: boolChk('priorityFirm', '우선지원대상기업', input.priorityFirm, true, ['넣지 않았습니다.', '해당한다고 넣었습니다.', '해당하지 않는다고 넣었습니다.'], '고용보험법 시행령 제29조제1항제2호'),
    allowed30: { ...thirtyDays, label: '30일 이상 허용' },
    excluded: input.employerExcluded === undefined
      ? chk('employerExcluded', '지원 제외 사업주가 아님', 'check', EXCLUDED_NOTE, '고용보험법 시행령 제29조제2항·고시 제17조')
      : boolChk('employerExcluded', '지원 제외 사업주가 아님', input.employerExcluded, false, ['', '아니라고 넣었습니다.', '지원 제외 사업주라고 넣었습니다.'], '고용보험법 시행령 제29조제2항·고시 제17조'),
  };
  const subsidy = buildSubsidy(c, grant, employerNeeds, subsidyRule, withheld);
  const workSharing = input.workSharing ? buildWorkSharing(c, grant, employerNeeds) : null;

  return {
    status: needs.length ? 'needs-input' : 'ok',
    needs,
    assumptions: c.assumptions,
    worker,
    employer: { needs: employerNeeds, subsidy, workSharing },
  };
}
