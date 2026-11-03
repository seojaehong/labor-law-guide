// 근로계약서 작성 — 임금 구성 설계(월급 정직원).
// 월 총액과 근무형태로 항목별 시간을 내고, 총액을 그 가중시간으로 나눠 통상시급과 항목 금액을 만든다.
// 정본 공식 = _e-contract/요구_U02_포괄설계_역산_계약서자동작성_261026.md (사무소 실무 양식과 같은 식).
// 회귀 표본 = 수원(U02)·의정부 주4(261103 교정) — tests/unit/contract-write-design.test.ts.
// 시급·일급 파트는 part.ts — 같은 DesignResult 모양을 돌려준다(period 만 다르다).
// ★ 브라우저 안에서만 쓴다. 이 파일과 그 의존에 네트워크 호출이 없어야 한다.

export type ItemKey = 'base' | 'weeklyHoliday' | 'overtime' | 'night' | 'holiday' | 'leave';

/** 흡수하지 않는 항목의 금액 단위. won = 원 단위 반올림(기본), ceil10·ceil100 = 그 단위로 올림.
 * 올리는 까닭: 내리면 연장·야간·휴일 수당이 「통상시급 × 시간 × 가산율」보다 적어져 법정 가산에 못 미친다(#139 적대 검토 4) */
export type Rounding = 'won' | 'ceil10' | 'ceil100';

/** 단위 맞춤의 원 단위(원 단위 반올림이면 0) — 점검 엔진에 산출근거 허용 폭으로 넘긴다 */
export const ROUNDING_UNIT: Record<Rounding, number> = { won: 0, ceil10: 10, ceil100: 100 };

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
  overrides?: { overtimeHours?: number; holidayHours?: number; leaveHours?: number };
  rounding?: Rounding;
  /** 잔액을 받는 항목. 기본 = 기본급(재홍님 261103) */
  absorbInto?: ItemKey;
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
  /** 계산 시급(내리지 않음). 항목 금액은 이 값으로 낸다. 최저임금·1주 연장 한도는 점검 규칙(MINWAGE·WH-52CAP)이 본다 */
  rate: number;
  items: DesignItem[];
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
  const unit = ROUNDING_UNIT[rounding];
  // 1e-6 = 부동소수 오차로 정확히 떨어지는 값이 한 단위 더 올라가지 않게
  return unit ? Math.ceil(value / unit - 1e-6) * unit : Math.round(value);
}

/** 1주 소정근로(하루 8시간·1주 40시간 한도)와 그것을 넘는 1주 연장 — 근로기준법 제50조·제53조 제1항.
 * 점검 엔진 normalize(deriveFields)의 weekly_overtime_hours 와 같은 식이다: Σ실근로 − min(Σmin(하루, 8), 40) */
export function weeklySchedule(dailyWorkHours: number, daysPerWeek: number): { scheduled: number; overtime: number } {
  const scheduled = Math.min(Math.min(dailyWorkHours, 8) * daysPerWeek, 40);
  return { scheduled, overtime: Math.max(0, dailyWorkHours * daysPerWeek - scheduled) };
}

/** 항목별 월 인정시간 — 사무소 양식 식에 1주 40시간 연장을 더했다 */
export function designHours(input: DesignInput): Record<ItemKey, number> {
  const { daysPerWeek: days, dailyWorkHours: daily, holidayDaysPerYear } = input;
  const fivePlus = input.fivePlus ?? true;
  const regular = Math.min(daily, 8);
  const extra = Math.max(daily - 8, 0);
  const { scheduled: weekly, overtime: weeklyOvertime } = weeklySchedule(daily, days);
  // 1주 소정 15시간 미만은 제55조(주휴일·공휴일 유급휴일)·제60조(연차)가 적용되지 않는다(근로기준법 제18조 제3항) — 파트(part.ts)와 같다.
  // 관공서 공휴일은 제55조 제2항 경로로만 유급휴일이라 이들에게는 법정 휴일이 아니고 그날 근무는 휴일근로(제56조 제2항)가 아니다
  // (취업규칙·계약으로 약정휴일로 정하지 않은 경우). 노동절은 다르다 — 노동절 제정에 관한 법률의 유급휴일이라 15시간 미만에도 유급이고,
  // 5명 이상이면 그날 근무는 휴일근로다(제18조 제3항은 제56조를 빼지 않는다, 근로기준정책과-4361). 그 가산은 표에 넣지 않고
  // 계약서 제4조 노동절 줄·제5조 「표의 연장·휴일 시간」 문장이 덮는다(표 밖 지급).
  // 이때는 계약서 제4·6조도 미적용이라 직접 정한 시간도 넣지 않는다
  const eligible = weekly >= 15;
  const weeklyHoliday = eligible ? (weekly / 40) * 8 : 0;
  const base = weekly === 40 ? 209 : (weekly + weeklyHoliday) * WEEKS_PER_MONTH;
  const overtime = weeklyOvertime * (fivePlus ? 1.5 : 1) * WEEKS_PER_MONTH;
  const night = fivePlus ? (input.nightHoursPerDay ?? 0) * NIGHT_PREMIUM * days * WEEKS_PER_MONTH : 0;
  // 휴일 = 유급휴일에 근무한 시간의 100% + 가산 50%(8시간 넘는 시간은 100%) — 유급휴일분 100% 는 기본급(209시간) 안이다
  // (대법원 2024.2.8. 2018다206899·1998.4.24. 97다28421, 임금근로시간과-653). 휴일근로 8시간 이내에 연장 가산을 겹치지 않는다(2011다112391 전합).
  // 위 연장(overtime)은 공휴일이 든 주도 주 5일로 세어, 공휴일 당일 8시간 넘는 시간에 연장 1.5 가 한 번 더 든다(합 3.5, 법정 2.0) —
  // 계약의 통상시급 기준으로는 법정 수당보다 많이 잡히는 쪽이나, 총액이 고정이라 그만큼 통상시급이 낮아진다. 고칠지는 사람 판단(PR 「사람 확인」)
  const holiday = fivePlus && eligible ? ((regular * 1.5 + extra * 2) * holidayDaysPerYear * (Math.min(days, 5) / 5)) / 12 : 0;
  const leave = fivePlus && eligible ? (weekly / 40) * 8 : 0;
  const o = input.overrides ?? {};
  return {
    base,
    weeklyHoliday: 0,
    overtime: o.overtimeHours ?? overtime,
    night,
    holiday: eligible ? (o.holidayHours ?? holiday) : 0,
    leave: eligible ? (o.leaveHours ?? leave) : 0,
  };
}

/** 1주 소정근로 15시간 이상 — 주휴·공휴일·연차 적용 대상(근로기준법 제18조 제3항의 반대) */
export function weeklyHolidayEligible(dailyWorkHours: number, daysPerWeek: number): boolean {
  return weeklySchedule(dailyWorkHours, daysPerWeek).scheduled >= 15;
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
  // 다른 항목을 올리면 잔액 항목은 계산값보다 적어진다. 그 항목이 가산·연차 수당이면 산정 기준에 못 미치므로 기본급만 받는다
  if (rounding !== 'won' && absorbInto !== 'base') {
    throw new Error('금액을 10원·100원 단위로 올릴 때는 끝에 남는 금액을 기본급이 받아야 합니다(다른 항목은 산정 기준보다 적어집니다)');
  }
  const keys = order.filter((k) => hours[k] > 0 || opts.keep?.includes(k));
  const totalHours = keys.reduce((s, k) => s + hours[k], 0);
  const rate = total / totalHours;
  const amounts = {} as Record<ItemKey, number>;
  for (const key of keys) if (key !== absorbInto) amounts[key] = roundAmount(rate * hours[key], rounding);
  const others = keys.filter((k) => k !== absorbInto).reduce((s, k) => s + amounts[k], 0);
  amounts[absorbInto] = total - others;
  // 극소액에서 단위 올림이 총액을 넘기면 잔액 항목이 음수가 된다(PR #140 추가 경계 입력) — 계약서를 만들지 않고 까닭을 말한다
  if (amounts[absorbInto] < 0) {
    const unit = ROUNDING_UNIT[rounding];
    const name = absorbInto === 'base' ? '기본급' : ITEM_LABEL[absorbInto];
    const fix = unit ? '총액을 늘리거나 금액 단위를 원 단위로 바꿔 주세요' : absorbInto === 'base' ? '총액을 늘려 주세요' : '총액을 늘리거나 잔액을 넣을 항목을 기본급으로 바꿔 주세요';
    throw new Error(
      `총액 ${total.toLocaleString('ko-KR')}원이 너무 작아 ${unit ? `${unit}원 단위로 올린 ` : ''}다른 항목 합(${others.toLocaleString('ko-KR')}원)을 빼면 ${name}이 음수가 됩니다. ${fix}`,
    );
  }
  return {
    totalHours,
    rate,
    items: keys.map((key) => ({ key, label: ITEM_LABEL[key], hours: hours[key], amount: amounts[key], exact: rate * hours[key], absorbs: key === absorbInto })),
  };
}

const MONTHLY_ORDER: ItemKey[] = ['base', 'overtime', 'night', 'holiday', 'leave'];

export function designMonthlyWage(input: DesignInput): DesignResult {
  const hours = designHours(input);
  const eligible = weeklyHolidayEligible(input.dailyWorkHours, input.daysPerWeek);
  // 기존 4항목(기본·연장·휴일·연차)은 0시간이어도 표에 남긴다(5명 미만·1주 15시간 미만은 휴일·연차를 법상 넣지 않으므로 뺀다). 야간은 있을 때만
  const keep: ItemKey[] = (input.fivePlus ?? true) && eligible ? ['base', 'overtime', 'holiday', 'leave'] : ['base', 'overtime'];
  const { items, totalHours, rate } = splitTotal(input.monthlyTotal, hours, MONTHLY_ORDER, { rounding: input.rounding, absorbInto: input.absorbInto, keep });
  return {
    period: 'month',
    total: input.monthlyTotal,
    hours,
    totalHours,
    rate,
    // 1주 15시간 미만은 주휴가 없다 — 기본급 이름에 「주휴 포함」을 적지 않는다(파트와 같다)
    items: eligible ? items : items.map((i) => (i.key === 'base' ? { ...i, label: '기본급' } : i)),
  };
}
