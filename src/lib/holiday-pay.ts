// 공휴일(노동절 포함) 수당 계산기 — Phase 1+2
// 6분기 매트릭스: (5인 이상 / 5인 미만) × (상용 월급제 / 일용직 / 파트 시급제)
// 법적 근거:
//   - 근로기준법 제56조 (휴일근로수당)
//   - 근로기준법 제55조 (유급휴일)
//   - 근로기준법 시행령 제30조 (관공서 공휴일 → 5인 이상 사업장 유급휴일)
//   - 노동절 제정에 관한 법률 (모든 사업장 5/1 유급휴일)
//   - 행정해석 임금근로시간과-956 (2026.4. — 휴일대체. 노동절이 관공서 공휴일에도 든 2026 개정 뒤 유지 여부 사람 확인 필요)
//   - 행정해석 근기 68207-2508 (일용직 통상임금)
//   - 대법원 2024.12.19. 전합 2020다247190 (통상임금 고정성 요건 폐기)
// 끝수: 통상시급은 버리지 않고, 원 미만은 각 지급 항목에서 올린다(src/lib/calc/wage-rounding.ts, 261112).

import { dec2, payableWon } from './calc/wage-rounding';

export type SiteSize = 'large' | 'small';
// large: 5인 이상 (가산수당 의무)
// small: 5인 미만 (가산수당 의무 없음 — 약정 있으면 그에 따름)

export type WorkerType = 'monthly' | 'daily' | 'hourly';
// monthly: 상용 월급제 (통상임금 산정 — 월급 / 209h)
// daily: 일용직 (일급)
// hourly: 파트 시급제

export type HolidayKind = 'labor_day' | 'public_holiday';
// labor_day: 노동절 (5/1) — 「노동절 제정에 관한 법률」에 따라 모든 사업장(5인 미만 포함) 유급
// public_holiday: 관공서 공휴일 — 5인 이상만 유급

export interface MonthlyInput {
  worker_type: 'monthly';
  site_size: SiteSize;
  holiday_kind: HolidayKind;
  monthly_pay: number;          // 월 통상임금 항목 합계 (기본급+고정수당)
  monthly_hours?: number;       // 월 소정근로시간 (기본 209h)
  worked_hours: number;         // 공휴일에 실제 근무한 시간
  night_hours?: number;         // 22:00~06:00 야간근로 시간
  inclusive_pay?: boolean;      // 포괄임금 약정 (휴일·연장 가산이 월급에 포함되어 있다는 약정)
}

export interface DailyInput {
  worker_type: 'daily';
  site_size: SiteSize;
  holiday_kind: HolidayKind;
  daily_wage: number;           // 일급
  daily_hours?: number;         // 1일 근로시간 (기본 8h)
  worked_hours: number;         // 공휴일에 실제 근무한 시간
  night_hours?: number;
  paid_continuously: boolean;   // 명칭과 관계없이 지속적으로 동일 사업장에 근로 → 통상임금 인정
}

export interface HourlyInput {
  worker_type: 'hourly';
  site_size: SiteSize;
  holiday_kind: HolidayKind;
  hourly_wage: number;          // 시급 (사용자 입력)
  hourly_includes_weekly?: boolean; // 시급에 주휴수당이 포함되어 있는지
  worked_hours: number;
  night_hours?: number;
  weekly_hours?: number;        // 주간 소정근로시간 (15h 이상이면 주휴수당 발생)
}

export type Input = MonthlyInput | DailyInput | HourlyInput;

export interface BreakdownLine {
  label: string;
  formula: string;
  amount: number;
}

/**
 * 유급휴일 1일분 — 그날 일하지 않아도 받는 임금(근로기준법 제55조). 일한 대가(휴일근로 임금 1.0배 + 가산)와 별개다.
 *  in_monthly_pay  : 월급제 — 월급에 들어 있다(대법원 1998. 4. 24. 선고 97다28421 판결, 근로기준과-2156)
 *  separate        : 시급·일용제 — 일한 대가와 따로 준다. 받는 조건은 note 에 적는다(total 에 넣지 않는다)
 *  not_paid_holiday: 그날이 유급휴일이 아니다(4명 이하의 관공서 공휴일, 1주 15시간 미만의 관공서 공휴일)
 *  not_computed    : 하루만 일하고 끝난 일용직 — 근로관계에 따라 달라 계산하지 않는다
 */
export interface PaidHolidayDay {
  status: 'in_monthly_pay' | 'separate' | 'not_paid_holiday' | 'not_computed';
  hours: number | null;         // 1일분 시간 (모르면 null)
  amount: number | null;        // 1일분 금액 (status=separate 이고 시간을 알 때만)
  note: string;
}

export interface Result {
  total: number;                // 그날 일한 대가 = 휴일근로 임금 1.0배 + 가산. 월급제는 월급 외에 더 줄 금액. 유급휴일 1일분은 넣지 않는다(paid_holiday_day)
  regular_pay_equivalent: number; // total 중 휴일근로 임금 1.0배분 (유급휴일이 아닌 4명 이하 관공서 공휴일의 월급제는 0 — 그날 근로는 월급으로 지급)
  gross_holiday_pay: number;    // = total (종전 필드 유지)
  base_hourly: number;          // 통상시급
  ordinary_hourly_displayed: number; // 입력된 시급 (참고용 — hourly만)
  breakdown: BreakdownLine[];
  notes: string[];
  legal_basis: string[];
  warning?: string;             // 5인 미만 등 주의사항
  already_in_monthly_pay: boolean; // 월급제 — 유급휴일 1일분(쉬어도 받는 임금)이 월급에 들어 있다. 일한 시간의 1.0배는 월급에 들어 있지 않다
  paid_holiday_day: PaidHolidayDay;
}

/** 야간근로 시간은 그날 일한 시간 안에 있다 — 넘으면 오류 문구, 맞으면 null */
export function validateHolidayHours(worked_hours: number, night_hours: number | undefined): string | null {
  if ((night_hours ?? 0) > worked_hours) {
    return `야간근로 시간(${night_hours}시간)이 공휴일에 일한 시간(${worked_hours}시간)보다 많습니다. 야간근로 시간은 일한 시간 중 22시~6시에 일한 시간입니다.`;
  }
  return null;
}

const DEFAULT_MONTHLY_HOURS = 209;
const DEFAULT_DAILY_HOURS = 8;

// ────────────── 통상시급 계산 ──────────────
// 끝수 규칙(src/lib/calc/wage-rounding.ts) — 통상시급은 버리지 않고 분수(금액 ÷ 시간)로 둔다.
// 각 줄은 「금액 × 배율 × 시간 ÷ 기준시간」으로 곱셈을 먼저 하고, 원 미만은 그 줄(지급 항목)에서 한 번 올린다.
// 합계 = 줄의 합 — 임금명세서에 항목별 금액이 적히므로 줄과 합계가 어긋나지 않게 한다.

/** 통상시급 = num ÷ den */
interface HourlyRate { num: number; den: number }

function ordinaryHourlyMonthly(monthly_pay: number, monthly_hours: number): HourlyRate {
  return monthly_hours > 0 ? { num: monthly_pay, den: monthly_hours } : { num: 0, den: 1 };
}

function ordinaryHourlyDaily(daily_wage: number, daily_hours: number): HourlyRate {
  return daily_hours > 0 ? { num: daily_wage, den: daily_hours } : { num: 0, den: 1 };
}

/** 통상시급 × 배율 × 시간 — 원 미만 올림 */
function lineAmount(rate: HourlyRate, multiplier: number, hours: number): number {
  return payableWon((rate.num * multiplier * hours) / rate.den);
}

// 시급에 주휴수당이 포함되어 있으면, 통상시급은 주휴분을 뺀 "기본시급"
// 주 40h 근무 기준: 통상시급(주휴 포함) = 기본시급 × 1.2
//   (주 40h × 4.345주 = 약 174h, 주휴 8h × 4.345 = 약 35h, 총 209h / 174h ≈ 1.2)
// 따라서 기본시급 = 표시시급 / 1.2
function ordinaryHourlyHourly(
  hourly_wage: number,
  includes_weekly: boolean,
  weekly_hours: number
): { base: HourlyRate; includes: boolean; ratio: number } {
  // 주 15시간 미만은 주휴수당 미발생 → 시급 그대로 통상시급
  if (!includes_weekly || weekly_hours < 15) {
    return { base: { num: hourly_wage, den: 1 }, includes: false, ratio: 1.0 };
  }
  // 주 40h 이상 → 1.2배 가정 (주휴 8h)
  // 주 15~40h → 비례: ratio = (weekly_hours + weekly_hours/5) / weekly_hours = 1.2
  // 주 15h 이상이면 주휴 = 주 소정근로의 1/5
  // ÷ 1.2 = × 5 ÷ 6 — 1.2 는 이진 소수로 딱 떨어지지 않아 정수 분수로 둔다
  const ratio = 1.2;
  return { base: { num: hourly_wage * 5, den: 6 }, includes: true, ratio };
}

// ────────────── 가산율 결정 ──────────────

function premiumRate(worked_hours: number): { within8: number; over8: number } {
  // 휴일 8시간 이내: 1.5배 가산 (즉 1.0 + 0.5)
  // 휴일 8시간 초과: 2.0배 가산 (즉 1.0 + 1.0)
  return {
    within8: Math.min(worked_hours, 8),
    over8: Math.max(worked_hours - 8, 0),
  };
}

// ────────────── 메인 계산 ──────────────

export function calcHolidayPay(input: Input): Result {
  const breakdown: BreakdownLine[] = [];
  const notes: string[] = [];
  const legal: string[] = [
    '근로기준법 제56조(연장·야간 및 휴일 근로) — 휴일 8h 이내 1.5배, 8h 초과 2.0배',
    '근로기준법 제55조 + 시행령 제30조 — 관공서 공휴일은 5인 이상 사업장 유급휴일',
    '노동절 제정에 관한 법률 — 5/1은 모든 사업장 유급휴일',
  ];
  let warning: string | undefined;

  const invalid = validateHolidayHours(input.worked_hours, input.night_hours);
  if (invalid) throw new Error(invalid);

  // 그날이 유급휴일인가 — 노동절은 규모와 상관없이, 관공서 공휴일은 5명 이상만(시행령 제30조, 제11조·시행령 제7조 별표 1)
  const paid_holiday = input.holiday_kind === 'labor_day' || input.site_size === 'large';

  const { within8, over8 } = premiumRate(input.worked_hours);
  const night_hours = input.night_hours || 0;

  // ── 통상시급 계산 ── rate = 끝수 그대로의 분수, base_hourly = 그 값(화면은 소수 둘째 자리까지)
  let rate: HourlyRate = { num: 0, den: 1 };
  let base_hourly = 0;
  let ordinary_hourly_displayed = 0;
  let already_includes_holiday_pay = false;
  // already_includes_holiday_pay — 월급제는 월급에 유급휴일 1일분(쉬어도 받는 임금, 제55조)이 들어 있다.
  //   그날 일한 시간의 임금(1.0)과 가산(0.5/1.0)은 월급에 없어 따로 준다(제56조 제2항) — 일한 대가는 월급·시급·일급제가 같다.
  //   시급·일용제는 유급휴일 1일분이 임금에 없어 일한 대가와 별개로 준다(paid_holiday_day).
  let paid_day_hours: number | null = null;

  if (input.worker_type === 'monthly') {
    const monthly_hours = input.monthly_hours || DEFAULT_MONTHLY_HOURS;
    rate = ordinaryHourlyMonthly(input.monthly_pay, monthly_hours);
    base_hourly = rate.num / rate.den;
    ordinary_hourly_displayed = base_hourly;
    already_includes_holiday_pay = true;
    notes.push(
      `통상시급 = 월급 ${input.monthly_pay.toLocaleString('ko-KR')}원 ÷ 월 소정근로 ${monthly_hours}시간 = ${dec2(base_hourly)}원`
    );
    if (paid_holiday) {
      notes.push(
        '월급에 들어 있는 것은 그날 쉬어도 받는 유급휴일 1일분입니다. 그날 일한 시간에는 휴일근로 임금(1.0배)과 가산을 월급 외에 따로 줍니다' +
        (input.site_size === 'large' ? '(8시간까지 1.5배, 넘는 시간 2.0배).' : '(4명 이하는 가산 없이 1.0배).')
      );
      legal.push('대법원 1998. 4. 24. 선고 97다28421 판결 — 월급에는 유급휴일 임금도 포함');
      legal.push('근로기준법 제56조 제2항 — 휴일근로에는 그 시간의 임금과 가산(8시간 이내 50%, 초과 100%)을 지급');
    }
    if (input.inclusive_pay) {
      notes.push(
        '⚠️ 포괄임금 약정 표시 — 두 유형으로 나뉩니다. ' +
        '(1) 두루뭉술 포괄(시간·금액 특정 없음): 근로시간 산정이 어려운 업종이 아닌 한 무효로 보는 것이 판례 경향(대법원 2010다91046 등). 이 경우 아래 법정 가산수당이 별도 발생합니다. ' +
        '(2) 포괄역산형(예: "휴일근로 10시간분 포함" 등 시간·금액 특정): 그 특정된 범위까지는 유효로 인정 — 약정된 시간을 초과한 부분에 대해서만 추가 청구 가능. ' +
        '아래 계산은 법정 기준이며, 실제로는 (2)의 경우 약정 시간·금액과 비교한 차액 청구가 됩니다.'
      );
      legal.push('대법원 2010다91046 / 대법원 2014다74254 등 — 포괄임금 유효성 판단(두루뭉술 vs 포괄역산형)');
    }
  } else if (input.worker_type === 'daily') {
    const daily_hours = input.daily_hours || DEFAULT_DAILY_HOURS;
    rate = ordinaryHourlyDaily(input.daily_wage, daily_hours);
    base_hourly = rate.num / rate.den;
    ordinary_hourly_displayed = base_hourly;
    already_includes_holiday_pay = false;
    notes.push(
      `통상시급 = 일급 ${input.daily_wage.toLocaleString('ko-KR')}원 ÷ 1일 ${daily_hours}시간 = ${dec2(base_hourly)}원`
    );
    if (!input.paid_continuously) {
      // 단발성 일용직 → 통상임금 산정 대상 아님 → 가산수당 없음 (일급만)
      warning =
        '단발성 일용직(1일만 근로하고 종료)은 통상임금 산정 대상이 아니므로 가산수당이 발생하지 않습니다. ' +
        '근로한 시간만큼 일당(또는 시급)을 받게 되며, 1.5배·2배 가산은 미적용입니다. ' +
        '명칭과 관계없이 동일 사업장에서 지속적으로 근로(반복 호출)하는 경우에 한해 통상임금이 인정됩니다 (행정해석 근기 68207-2508).';
      legal.push('행정해석 근기 68207-2508 — 일용직 통상임금 인정 요건');
      // 가산수당 0 — 휴일근로 임금만 (1.0배)
      const wage = lineAmount(rate, 1, input.worked_hours);
      breakdown.push({
        label: '일당 (가산 미적용)',
        formula: `통상시급 ${dec2(base_hourly)}원 × ${input.worked_hours}시간`,
        amount: wage,
      });
      const total_warn = breakdown.reduce((s, b) => s + b.amount, 0);
      return {
        total: total_warn,
        regular_pay_equivalent: total_warn,
        gross_holiday_pay: total_warn,
        base_hourly,
        ordinary_hourly_displayed,
        breakdown,
        notes,
        legal_basis: legal,
        warning,
        already_in_monthly_pay: false,
        paid_holiday_day: {
          status: 'not_computed',
          hours: null,
          amount: null,
          note: '하루만 일하고 끝난 일용직의 유급휴일 1일분은 근로관계에 따라 달라 이 계산에 넣지 않았습니다. 따로 확인하세요.',
        },
      };
    } else {
      notes.push(
        '명칭과 관계없이 동일 사업장에서 지속적으로 근로 → 통상임금 인정 (행정해석 근기 68207-2508).'
      );
    }
    legal.push('행정해석 근기 68207-2508 — 일용직 통상임금 인정 요건');
    paid_day_hours = Math.min(daily_hours, 8);
  } else {
    // hourly
    const weekly_hours = input.weekly_hours || 0;
    const includes_weekly = !!input.hourly_includes_weekly;
    const result = ordinaryHourlyHourly(input.hourly_wage, includes_weekly, weekly_hours);
    rate = result.base;
    base_hourly = rate.num / rate.den;
    ordinary_hourly_displayed = input.hourly_wage;
    already_includes_holiday_pay = false;
    if (result.includes) {
      notes.push(
        `시급 ${input.hourly_wage.toLocaleString('ko-KR')}원에 주휴수당이 포함되어 있어, ` +
        `통상시급(가산수당 산정 기준) = ${input.hourly_wage.toLocaleString('ko-KR')} ÷ ${result.ratio} = ${dec2(base_hourly)}원`
      );
      notes.push('가산수당은 주휴분을 제외한 "기본시급"으로 계산합니다.');
    } else if (weekly_hours > 0 && weekly_hours < 15) {
      notes.push(
        `주 ${weekly_hours}시간 < 15시간이므로 주휴수당 미발생. 통상시급 = 시급 ${input.hourly_wage.toLocaleString('ko-KR')}원`
      );
    } else {
      notes.push(`통상시급 = 시급 ${input.hourly_wage.toLocaleString('ko-KR')}원 (주휴수당 별도 지급 가정)`);
    }
    // 1일분 = 1주 소정근로시간 ÷ 5(시행령 별표 2 제2호 나목, 통상 근로자 주 5일 기준 — contract-write/part.ts laborDayOffHours 와 같다)
    paid_day_hours = weekly_hours > 0 ? Math.min(weekly_hours, 40) / 5 : null;
  }

  // ── 5인 미만 + 관공서 공휴일 케이스 ──
  if (input.site_size === 'small' && input.holiday_kind === 'public_holiday') {
    warning =
      '⚠️ 5인 미만 사업장은 관공서 공휴일(빨간날) 유급휴일 의무가 없고, 휴일근로 가산수당(1.5배/2배) 의무도 없습니다. ' +
      '단, 근로계약·취업규칙·관행으로 약정한 경우에는 약정에 따라 지급해야 합니다.';
    legal.push('근로기준법 제11조·시행령 제7조 — 5인 미만 사업장은 제56조(가산수당) 적용 제외');
  }

  // ── 5인 미만 + 노동절 케이스 ──
  if (input.site_size === 'small' && input.holiday_kind === 'labor_day') {
    notes.push(
      '노동절(5/1)은 「노동절 제정에 관한 법률」에 따라 5인 미만 사업장에도 적용되는 유급휴일입니다.'
    );
    notes.push(
      '단, 가산수당(1.5배/2배)은 근로기준법 제56조 사항으로 5인 미만 사업장은 의무가 없습니다. ' +
      '그날 일한 시간에는 월급·일용·시급제 모두 통상임금 100%를 줍니다. 일용·시급제는 이와 별개로 유급휴일 1일분을 줍니다(아래 안내).'
    );
  }

  // ── 휴일근로 임금/가산수당 계산 ──
  const apply_premium = input.site_size === 'large';

  // (A) 휴일근로분 임금 (1.0배) — 일한 시간의 임금. 월급제도 유급휴일이면 월급 외에 따로 준다
  //     4명 이하의 관공서 공휴일은 유급휴일이 아니어서 월급제는 그날 근로가 월급(소정근로)에 들어 있다
  if (already_includes_holiday_pay && !paid_holiday) {
    breakdown.push({
      label: '휴일근로 임금 (1.0배)',
      formula: '유급휴일이 아닌 날의 근로 — 월급에 들어 있음',
      amount: 0,
    });
  } else if (input.worked_hours > 0) {
    const wage = lineAmount(rate, 1, input.worked_hours);
    breakdown.push({
      label: '휴일근로 임금 (1.0배)',
      formula: `통상시급 ${dec2(base_hourly)}원 × ${input.worked_hours}시간`,
      amount: wage,
    });
  }
  const regular_pay_equivalent = breakdown.length > 0 ? breakdown[0].amount : 0;

  // (B) 휴일 8h 이내 가산수당 (0.5배)
  if (apply_premium && within8 > 0) {
    const amt = lineAmount(rate, 0.5, within8);
    breakdown.push({
      label: '휴일 8시간 이내 가산수당 (0.5배)',
      formula: `통상시급 ${dec2(base_hourly)}원 × 0.5 × ${within8}시간`,
      amount: amt,
    });
  }

  // (C) 휴일 8h 초과 가산수당 (1.0배)
  if (apply_premium && over8 > 0) {
    const amt = lineAmount(rate, 1, over8);
    breakdown.push({
      label: '휴일 8시간 초과 가산수당 (1.0배)',
      formula: `통상시급 ${dec2(base_hourly)}원 × 1.0 × ${over8}시간`,
      amount: amt,
    });
  }

  // (D) 야간근로 가산수당 (0.5배)
  if (apply_premium && night_hours > 0) {
    const amt = lineAmount(rate, 0.5, night_hours);
    breakdown.push({
      label: '야간근로 가산수당 (0.5배, 22:00~06:00)',
      formula: `통상시급 ${dec2(base_hourly)}원 × 0.5 × ${night_hours}시간`,
      amount: amt,
    });
  } else if (!apply_premium && night_hours > 0) {
    notes.push('5인 미만 사업장은 야간근로 가산수당(0.5배) 의무가 없습니다.');
  }

  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  // ── 유급휴일 1일분 (일한 대가와 별개) ──
  const paid_holiday_day = paidHolidayDay(input, paid_holiday, already_includes_holiday_pay, paid_day_hours, rate);
  notes.push(paid_holiday_day.note);
  if (paid_holiday_day.status === 'separate') {
    legal.push('근로기준과-2156 — 시급·일급제는 유급휴일에 통상의 1일 근로를 제공하였을 때 지급해야 할 임금을 지급, 월급제는 월급으로 충족');
    legal.push('근로기준법 시행령 별표 2 제2호 나목 — 단시간 근로자의 1일 소정근로시간 = 4주 소정근로시간 ÷ 통상 근로자의 4주 소정근로일 수');
  }

  return {
    total,
    regular_pay_equivalent,
    gross_holiday_pay: total,
    base_hourly,
    ordinary_hourly_displayed,
    breakdown,
    notes,
    legal_basis: legal,
    warning,
    already_in_monthly_pay: already_includes_holiday_pay,
    paid_holiday_day,
  };
}

function paidHolidayDay(
  input: Input,
  paid_holiday: boolean,
  monthly: boolean,
  hours: number | null,
  rate: HourlyRate
): PaidHolidayDay {
  if (!paid_holiday) {
    const note = monthly
      ? '4명 이하 사업장의 관공서 공휴일은 유급휴일이 아니어서 그날 일한 시간은 월급(소정근로)으로 지급됩니다. 약정이 있으면 약정에 따릅니다.'
      : '4명 이하 사업장의 관공서 공휴일은 유급휴일이 아니어서 유급휴일 1일분이 없습니다.';
    return { status: 'not_paid_holiday', hours: null, amount: null, note };
  }
  if (monthly) {
    return { status: 'in_monthly_pay', hours: null, amount: null, note: '그날 쉬어도 받는 유급휴일 1일분은 월급에 들어 있습니다. 위 금액은 그날 일한 대가로 월급 외에 더 주는 금액입니다.' };
  }
  const weekly = input.worker_type === 'hourly' ? input.weekly_hours || 0 : 0;
  if (input.holiday_kind === 'public_holiday' && input.worker_type === 'hourly' && weekly > 0 && weekly < 15) {
    return {
      status: 'not_paid_holiday',
      hours: null,
      amount: null,
      note: '1주 소정근로시간이 15시간 미만이면 관공서 공휴일 유급휴일(제55조)이 적용되지 않아 유급휴일 1일분이 없습니다(근로기준법 제18조 제3항).',
    };
  }
  const amount = hours != null ? lineAmount(rate, 1, hours) : null;
  const sum = amount != null ? `1일분 ${amount.toLocaleString('ko-KR')}원(통상시급 × ${hours}시간)` : '1일분(통상시급 × 1주 소정근로시간 ÷ 5 — 주 소정근로시간을 넣으면 계산합니다)';
  const note =
    input.holiday_kind === 'labor_day'
      ? `위 금액은 그날 일한 대가입니다. 노동절은 유급휴일이라 일과 상관없이 유급휴일 ${sum}을 따로 줍니다(노동절 제정에 관한 법률, 근로기준과-2156). 노동절이 주휴일과 겹치면 주휴수당으로 갈음합니다.`
      : `위 금액은 그날 일한 대가입니다. 그 공휴일이 원래 일하기로 한 날(소정근로일)이었으면 일과 상관없이 유급휴일 ${sum}을 따로 줍니다(근로기준법 제55조 제2항·시행령 제30조). 소정근로일이 아니었으면 주지 않습니다.`;
  return { status: 'separate', hours, amount, note };
}

// ────────────── 통상임금 자동 분류 (Phase 4 placeholder) ──────────────
// 사용자가 "기본급+식대+직책수당" 같은 항목을 입력하면 통상임금에 들어가는지 자동 분류.
// Phase 1+2에서는 사용자가 직접 합산한 monthly_pay를 입력. 분류는 Phase 4에서 LLM으로.

export interface WageItem {
  name: string;
  amount: number;
  // 사용자가 직접 입력한 분류 (선택사항)
  category?: 'ordinary' | 'non_ordinary' | 'unknown';
}

export function sumOrdinaryWage(items: WageItem[]): { total: number; included: WageItem[]; excluded: WageItem[] } {
  const included: WageItem[] = [];
  const excluded: WageItem[] = [];
  let total = 0;
  for (const it of items) {
    if (it.category === 'ordinary' || (it.category !== 'non_ordinary' && it.amount > 0)) {
      // unknown / undefined도 일단 포함 (사용자 책임)
      included.push(it);
      total += it.amount;
    } else {
      excluded.push(it);
    }
  }
  return { total, included, excluded };
}
