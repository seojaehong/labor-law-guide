// 근로계약서 작성 — 임금 구성 설계(시급·일급 파트).
// 하루 지급액(시간당 지급액 × 휴게 포함 체류시간)을 항목별 하루 인정시간 비율로 나눈다.
// 정본 공식 = _e-contract/요구_U02_포괄설계_역산_계약서자동작성_261026.md 「파트」, 사무소 파트 양식 「_2026」 시트와 같은 식.
// 회귀 표본 = 수원 파트 양식 a~e — tests/unit/contract-write-part.test.ts.
//
// ★ 양식과 다른 점(법 기준): 1주 소정근로가 15시간 미만이면 주휴·연차·휴일을 넣지 않는다(근로기준법 제18조 제3항 →
//   제55조·제60조 미적용). 양식은 이 경우에도 넣는다 — 양식 재현은 includeUnder15 로만 한다.
// ★ 공휴일 하루 근로가 8시간을 넘으면 넘는 시간은 2.0배다(제56조 제2항) — 일 지급액의 연장 1.5 + 휴일 0.5. 양식은 하루 8시간까지만 1.5배로 넣는다(표본 e).
// ★ 1주 40시간을 넘는 시간도 연장이다(주 6일 등, #139 적대 검토 1). 양식 표본 a~e 는 모두 40시간 이하라 그대로다.
// ★ 브라우저 안에서만 쓴다.

import { HOLIDAY_OVER8_REST, holidayWeekDropDaysPerYear, holidayWeekDroppedOvertime, splitTotal, weeklySchedule, WEEKS_PER_MONTH, type DesignResult, type ItemKey, type Rounding } from './design';

export interface HourlyDesignInput {
  /** 시간당 지급액 — 휴게를 포함한 체류시간에 곱해 하루 지급액을 만든다 */
  hourlyWage: number;
  /** 출근~퇴근(휴게 포함) 시간 */
  stayHours: number;
  breakMinutes: number;
  /** 22:00~06:00 에 걸친 근로시간(실시간) */
  nightHours: number;
  daysPerWeek: number;
  /** 연간 공휴일 근무 예정 일수 */
  holidayDaysPerYear: number;
  /** 상시 5명 이상(기본 true) */
  fivePlus?: boolean;
  /** 주 15시간 미만에도 주휴·연차·휴일을 넣는다(양식 재현 전용, 화면에 없음) */
  includeUnder15?: boolean;
  rounding?: Rounding;
  absorbInto?: ItemKey;
}

const ORDER: ItemKey[] = ['base', 'weeklyHoliday', 'overtime', 'night', 'leave', 'holiday'];

/** 항목별 하루 인정시간(가산 반영) */
export function hourlyDesignHours(input: HourlyDesignInput): Record<ItemKey, number> {
  const fivePlus = input.fivePlus ?? true;
  const days = input.daysPerWeek;
  const work = input.stayHours - input.breakMinutes / 60;
  // 하루 소정 = 1주 소정(하루 8시간·1주 40시간 한도) ÷ 근무일. 주 5일 이하·하루 8시간 이내면 실근무 그대로다
  const { scheduled: weekly } = weeklySchedule(work, days);
  const base = weekly / days;
  const eligible = weekly >= 15 || Boolean(input.includeUnder15);
  // 공휴일 하루의 근로는 그날 실근무 — 8시간까지 1.5배, 넘는 시간은 2.0배(근로기준법 제56조 제2항). 1주 한도와 무관하다.
  // 소정근로일인 공휴일에 근무하면 그날 일 지급액의 기본급(100%) = 유급휴일 임금, 이 항목(1.5) = 근무 100% + 가산 50% → 합 250%
  // (임금근로시간과-653·근로기준과-2156). 8시간 넘는 시간은 그날 일 지급액의 연장(overtime, 1.5)이 이미 담아 이 항목은 0.5 만 더한다 —
  // 합 2.0(제56조 제2항 제2호, 「제1항에도 불구하고」라 연장 가산을 겹치지 않는다 — 대법원 2024. 2. 8. 선고 2018다206899 판결). #151 전에는
  // 2.0 을 더해 3.5 였다. 양식(표본 e)은 8시간 × 1.5 만 넣는다 — 그보다 8시간 넘는 시간 × 0.5 만큼 많다
  const holidayDay = Math.min(work, 8) * 1.5 + Math.max(work - 8, 0) * HOLIDAY_OVER8_REST;
  // 공휴일이 든 주는 1주 40시간 연장을 공휴일이 아닌 날로만 센다(design.ts holidayWeekDroppedOvertime) — 주 6일부터 빠지는 시간을 근무일 평균으로 뺀다.
  // 빼는 날 수는 월급제와 같다(설·추석 연휴 6일 제외, holidayWeekDropDaysPerYear)
  const holidayShare = eligible && fivePlus ? holidayWeekDropDaysPerYear(input.holidayDaysPerYear, days) / ((days * 365) / 7) : 0;
  const droppedPerDay = holidayWeekDroppedOvertime(work, days) * holidayShare;
  return {
    base,
    // 1주 주휴 = 1주 소정 ÷ 40 × 8 = 1주 소정 ÷ 5, 근무일에 나눈다
    weeklyHoliday: eligible ? weekly / 5 / days : 0,
    overtime: Math.max(work - base - droppedPerDay, 0) * (fivePlus ? 1.5 : 1),
    night: fivePlus ? input.nightHours * 0.5 : 0,
    leave: eligible && fivePlus ? weekly / 5 / days / WEEKS_PER_MONTH : 0,
    holiday: eligible && fivePlus ? (holidayDay * input.holidayDaysPerYear) / ((days * 365) / 7) : 0,
  };
}

/**
 * 노동절(5월 1일)이 소정근로일이 아닌 날에 들 때 주는 1일분의 시간 — 근로기준법 시행령 별표 2 제2호 가·나목의 1일 소정근로시간
 * = 4주 소정근로시간 ÷ 그 기간 통상 근로자의 총 소정근로일 수. 통상 근로자 주 5일(4주 20일)을 가정해 1주 소정 ÷ 5 다(임금근로시간정책과-1384).
 * 하루 실근무(8시간 등)가 아니다. 위 hourlyDesignHours 의 1주 주휴(weekly / 5)와 같은 양이라 주휴일과 겹치면 추가가 없다(근로기준정책과-6852).
 * 1주 15시간 미만도 같은 식으로 센다(근로기준정책과-4361 — 노동절은 제18조 제3항과 상관없다).
 * 연 1회·소정근로일이 아닌 날에만 생기는 돈이라 일 지급액 구성(ORDER)에는 넣지 않는다 — 계약서 제5조가 금액을 적는다(document.ts)
 */
export function laborDayOffHours(dailyWorkHours: number, daysPerWeek: number): number {
  return weeklySchedule(dailyWorkHours, daysPerWeek).scheduled / 5;
}

/** 노동절 1일분 금액 — 시간 × 통상시급, 끝수는 근로자에게 불리하지 않게 원 단위로 올린다(임금근로시간정책과-1384). 1e-6 = 부동소수 오차 */
export function laborDayOffPay(hours: number, rate: number): number {
  return Math.ceil(hours * rate - 1e-6);
}

export function designHourlyWage(input: HourlyDesignInput): DesignResult {
  const hours = hourlyDesignHours(input);
  if (!(hours.base > 0)) throw new Error('하루 실근무시간이 0보다 커야 합니다');
  const total = Math.round(input.hourlyWage * input.stayHours);
  const { items, totalHours, rate } = splitTotal(total, hours, ORDER, { rounding: input.rounding, absorbInto: input.absorbInto, keep: ['base'] });
  return {
    period: 'day',
    total,
    hours,
    totalHours,
    rate,
    // 파트의 기본급은 주휴를 따로 둔다
    items: items.map((i) => (i.key === 'base' ? { ...i, label: '기본급' } : i)),
  };
}
