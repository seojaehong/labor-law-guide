// 근로계약서 작성 — 임금 구성 설계(시급·일급 파트).
// 하루 지급액(시간당 지급액 × 휴게 포함 체류시간)을 항목별 하루 인정시간 비율로 나눈다.
// 정본 공식 = _e-contract/요구_U02_포괄설계_역산_계약서자동작성_261026.md 「파트」, 사무소 파트 양식 「_2026」 시트와 같은 식.
// 회귀 표본 = 수원 파트 양식 a~e — tests/unit/contract-write-part.test.ts.
//
// ★ 양식과 다른 점(법 기준): 1주 소정근로가 15시간 미만이면 주휴·연차·휴일을 넣지 않는다(근로기준법 제18조 제3항 →
//   제55조·제60조 미적용). 양식은 이 경우에도 넣는다 — 양식 재현은 includeUnder15 로만 한다.
// ★ 브라우저 안에서만 쓴다.

import { splitTotal, weeklySchedule, WEEKS_PER_MONTH, type DesignResult, type ItemKey, type Rounding } from './design';

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
  minimumWage?: number;
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
  // 공휴일 하루의 근로는 그날 실근무(8시간까지) — 1주 한도와 무관하다
  const holidayDay = Math.min(work, 8);
  return {
    base,
    // 1주 주휴 = 1주 소정 ÷ 40 × 8 = 1주 소정 ÷ 5, 근무일에 나눈다
    weeklyHoliday: eligible ? weekly / 5 / days : 0,
    overtime: Math.max(work - base, 0) * (fivePlus ? 1.5 : 1),
    night: fivePlus ? input.nightHours * 0.5 : 0,
    leave: eligible && fivePlus ? weekly / 5 / days / WEEKS_PER_MONTH : 0,
    holiday: eligible && fivePlus ? (holidayDay * input.holidayDaysPerYear * 1.5) / ((days * 365) / 7) : 0,
  };
}

export function designHourlyWage(input: HourlyDesignInput): DesignResult {
  const hours = hourlyDesignHours(input);
  if (!(hours.base > 0)) throw new Error('하루 실근무시간이 0보다 커야 합니다');
  const total = Math.round(input.hourlyWage * input.stayHours);
  const { items, totalHours, rate } = splitTotal(total, hours, ORDER, { rounding: input.rounding, absorbInto: input.absorbInto, keep: ['base'] });
  const displayRate = Math.floor(rate);
  const minimum = input.minimumWage ?? null;
  const weeklyOvertimeHours = Math.max(input.stayHours - input.breakMinutes / 60 - 8, 0) * input.daysPerWeek;
  return {
    period: 'day',
    total,
    hours,
    totalHours,
    rate,
    displayRate,
    // 파트의 기본급은 주휴를 따로 둔다
    items: items.map((i) => (i.key === 'base' ? { ...i, label: '기본급' } : i)),
    checks: {
      minimumWage: { ok: minimum === null ? null : displayRate >= minimum, minimum },
      weeklyOvertime: { ok: weeklyOvertimeHours <= 12 + 1e-9, hours: weeklyOvertimeHours },
    },
  };
}
