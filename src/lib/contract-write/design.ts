// 근로계약서 작성 — 임금 구성 설계(월급 정직원).
// 월 총액과 근무형태로 항목별 시간을 내고, 총액을 그 가중시간으로 나눠 통상시급과 항목 금액을 만든다.
// 정본 공식 = _e-contract/요구_U02_포괄설계_역산_계약서자동작성_261026.md (사무소 실무 양식과 같은 식).
// 회귀 표본 = 수원(U02)·의정부 주4(261103 교정) — tests/unit/contract-write-design.test.ts.
// 시급·일급 파트는 part.ts — 같은 DesignResult 모양을 돌려준다(period 만 다르다).
// ★ 브라우저 안에서만 쓴다. 이 파일과 그 의존에 네트워크 호출이 없어야 한다.

export type ItemKey = 'base' | 'weeklyHoliday' | 'overtime' | 'night' | 'holiday' | 'leave';

/** 흡수하지 않는 항목의 금액 단위. won = 원 단위 반올림(기본), floor10·floor100 = 그 단위 아래 버림 */
export type Rounding = 'won' | 'floor10' | 'floor100';

export interface DesignInput {
  monthlyTotal: number;
  daysPerWeek: number;
  /** 하루 실근로시간(휴게 제외) */
  dailyWorkHours: number;
  /** 하루 중 22:00~06:00 에 걸친 근로시간(실시간). 없으면 0 */
  nightHoursPerDay?: number;
  /** 연간 공휴일 근로 예정 일수(주5 기준). 주4 이하면 주근무일/5 비례 */
  holidayDaysPerYear: number;
  /** 상시 5명 이상(기본 true). 5명 미만이면 연장·야간 가산, 공휴일 유급휴일, 연차를 넣지 않는다(근로기준법 시행령 제7조 별표 1) */
  fivePlus?: boolean;
  /** 계약서에 박힌 시간이 있으면 그 값을 쓴다(수원: 연장 65.2·휴일 25·연차 10) */
  overrides?: { baseHours?: number; overtimeHours?: number; holidayHours?: number; leaveHours?: number };
  rounding?: Rounding;
  /** 잔액을 받는 항목. 기본 = 기본급(재홍님 261103) */
  absorbInto?: ItemKey;
  /** 비교할 최저시급. 없으면 검사 결과 ok = null */
  minimumWage?: number;
}

export interface DesignItem {
  key: ItemKey;
  label: string;
  /** 기간(월·일) 인정시간(가산 반영) */
  hours: number;
  amount: number;
  /** 단위 맞추기 전 금액(총액 × 시간 ÷ 시간 합) */
  exact: number;
  absorbs: boolean;
}

export interface DesignResult {
  /** month = 월 임금 총액을 나눈 것, day = 일 지급액을 나눈 것(시급·일급 파트) */
  period: 'month' | 'day';
  /** 나눈 총액(월 총액 또는 일 지급액) */
  total: number;
  hours: Record<ItemKey, number>;
  totalHours: number;
  /** 계산 시급(내리지 않음). 항목 금액은 이 값으로 낸다 */
  rate: number;
  /** 화면 표시·최저임금 비교용 = 계산 시급 원 단위 내림 */
  displayRate: number;
  items: DesignItem[];
  checks: {
    minimumWage: { ok: boolean | null; minimum: number | null };
    /** 근로기준법 제53조 제1항 — 1주 연장 12시간 */
    weeklyOvertime: { ok: boolean; hours: number };
  };
}

export const ITEM_LABEL: Record<ItemKey, string> = {
  base: '기본급(주휴 포함)',
  weeklyHoliday: '주휴수당',
  overtime: '연장근로수당',
  night: '야간근로수당',
  holiday: '휴일근로수당',
  leave: '연차수당',
};

export const WEEKS_PER_MONTH = 4.345;
const NIGHT_PREMIUM = 0.5;

function roundAmount(value: number, rounding: Rounding): number {
  if (rounding === 'floor10') return Math.floor(value / 10) * 10;
  if (rounding === 'floor100') return Math.floor(value / 100) * 100;
  return Math.round(value);
}

/** 항목별 월 인정시간 — 사무소 양식 식 그대로 */
export function designHours(input: DesignInput): Record<ItemKey, number> {
  const { daysPerWeek: days, dailyWorkHours: daily, holidayDaysPerYear } = input;
  const fivePlus = input.fivePlus ?? true;
  const regular = Math.min(daily, 8);
  const extra = Math.max(daily - 8, 0);
  const weekly = Math.min(regular * days, 40);
  const weeklyHoliday = weekly >= 15 ? (weekly / 40) * 8 : 0;
  const base = weekly === 40 ? 209 : (weekly + weeklyHoliday) * WEEKS_PER_MONTH;
  const overtime = extra * days * (fivePlus ? 1.5 : 1) * WEEKS_PER_MONTH;
  const night = fivePlus ? (input.nightHoursPerDay ?? 0) * NIGHT_PREMIUM * days * WEEKS_PER_MONTH : 0;
  const holiday = fivePlus ? ((regular * 1.5 + extra * 2) * holidayDaysPerYear * (Math.min(days, 5) / 5)) / 12 : 0;
  const leave = fivePlus ? (weekly / 40) * 8 : 0;
  const o = input.overrides ?? {};
  return {
    base: o.baseHours ?? base,
    weeklyHoliday: 0,
    overtime: o.overtimeHours ?? overtime,
    night,
    holiday: o.holidayHours ?? holiday,
    leave: o.leaveHours ?? leave,
  };
}

/**
 * 총액을 가중시간 비율로 나눈다(월급제·파트 공용). 잔액 항목 말고는 단위를 맞추고, 잔액 항목이 끝수를 받는다.
 * order 에 있는 항목 중 시간이 0 인 것은 결과에서 뺀다(keep 은 0 이어도 남긴다).
 */
export function splitTotal(
  total: number,
  hours: Record<ItemKey, number>,
  order: ItemKey[],
  opts: { rounding?: Rounding; absorbInto?: ItemKey; keep?: ItemKey[] },
): { items: DesignItem[]; totalHours: number; rate: number } {
  const rounding = opts.rounding ?? 'won';
  const absorbInto = opts.absorbInto ?? 'base';
  if (!(hours[absorbInto] > 0)) throw new Error(`${ITEM_LABEL[absorbInto]}의 시간이 0이라 잔액을 받을 수 없습니다`);
  const keys = order.filter((k) => hours[k] > 0 || opts.keep?.includes(k));
  const totalHours = keys.reduce((s, k) => s + hours[k], 0);
  const rate = total / totalHours;
  const amounts = {} as Record<ItemKey, number>;
  for (const key of keys) if (key !== absorbInto) amounts[key] = roundAmount(rate * hours[key], rounding);
  amounts[absorbInto] = total - keys.filter((k) => k !== absorbInto).reduce((s, k) => s + amounts[k], 0);
  return {
    totalHours,
    rate,
    items: keys.map((key) => ({ key, label: ITEM_LABEL[key], hours: hours[key], amount: amounts[key], exact: rate * hours[key], absorbs: key === absorbInto })),
  };
}

const MONTHLY_ORDER: ItemKey[] = ['base', 'overtime', 'night', 'holiday', 'leave'];

export function designMonthlyWage(input: DesignInput): DesignResult {
  const hours = designHours(input);
  // 기존 4항목(기본·연장·휴일·연차)은 0시간이어도 표에 남긴다(5명 미만은 휴일·연차를 법상 넣지 않으므로 뺀다). 야간은 있을 때만
  const keep: ItemKey[] = (input.fivePlus ?? true) ? ['base', 'overtime', 'holiday', 'leave'] : ['base', 'overtime'];
  const { items, totalHours, rate } = splitTotal(input.monthlyTotal, hours, MONTHLY_ORDER, { rounding: input.rounding, absorbInto: input.absorbInto, keep });
  const displayRate = Math.floor(rate);
  const minimum = input.minimumWage ?? null;
  const weeklyOvertimeHours = Math.max(input.dailyWorkHours - 8, 0) * input.daysPerWeek;
  return {
    period: 'month',
    total: input.monthlyTotal,
    hours,
    totalHours,
    rate,
    displayRate,
    items,
    checks: {
      minimumWage: { ok: minimum === null ? null : displayRate >= minimum, minimum },
      weeklyOvertime: { ok: weeklyOvertimeHours <= 12 + 1e-9, hours: weeklyOvertimeHours },
    },
  };
}
