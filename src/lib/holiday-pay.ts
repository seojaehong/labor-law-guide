// 공휴일(노동절 포함) 수당 계산기 — Phase 1+2
// 6분기 매트릭스: (5인 이상 / 5인 미만) × (상용 월급제 / 일용직 / 파트 시급제)
// 법적 근거:
//   - 근로기준법 제56조 (휴일근로수당)
//   - 근로기준법 제55조 (유급휴일)
//   - 근로기준법 시행령 제30조 (관공서 공휴일 → 5인 이상 사업장 유급휴일)
//   - 근로자의 날 제정에 관한 법률 (모든 사업장 5/1 유급휴일)
//   - 행정해석 임금근로시간과-956 (2026.4. — 휴일대체)
//   - 행정해석 근기 68207-2508 (일용직 통상임금)
//   - 대법원 2024.12.19. 전합 2020다247190 (통상임금 고정성 요건 폐기)

export type SiteSize = 'large' | 'small';
// large: 5인 이상 (가산수당 의무)
// small: 5인 미만 (가산수당 의무 없음 — 약정 있으면 그에 따름)

export type WorkerType = 'monthly' | 'daily' | 'hourly';
// monthly: 상용 월급제 (통상임금 산정 — 월급 / 209h)
// daily: 일용직 (일급)
// hourly: 파트 시급제

export type HolidayKind = 'labor_day' | 'public_holiday';
// labor_day: 근로자의 날 (5/1) — 모든 사업장 유급
// public_holiday: 관공서 공휴일 — 5인 이상만 유급

export interface MonthlyInput {
  worker_type: 'monthly';
  site_size: SiteSize;
  holiday_kind: HolidayKind;
  monthly_pay: number;          // 월 통상임금 항목 합계 (기본급+고정수당)
  monthly_hours?: number;       // 월 소정근로시간 (기본 209h)
  worked_hours: number;         // 공휴일에 실제 근무한 시간
  night_hours?: number;         // 22:00~06:00 야간근로 시간
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

export interface Result {
  total: number;
  base_hourly: number;          // 통상시급
  ordinary_hourly_displayed: number; // 입력된 시급 (참고용 — hourly만)
  breakdown: BreakdownLine[];
  notes: string[];
  legal_basis: string[];
  warning?: string;             // 5인 미만 등 주의사항
}

const DEFAULT_MONTHLY_HOURS = 209;
const DEFAULT_DAILY_HOURS = 8;

// ────────────── 통상시급 계산 ──────────────

function ordinaryHourlyMonthly(monthly_pay: number, monthly_hours: number): number {
  if (monthly_hours <= 0) return 0;
  return Math.floor(monthly_pay / monthly_hours);
}

function ordinaryHourlyDaily(daily_wage: number, daily_hours: number): number {
  if (daily_hours <= 0) return 0;
  return Math.floor(daily_wage / daily_hours);
}

// 시급에 주휴수당이 포함되어 있으면, 통상시급은 주휴분을 뺀 "기본시급"
// 주 40h 근무 기준: 통상시급(주휴 포함) = 기본시급 × 1.2
//   (주 40h × 4.345주 = 약 174h, 주휴 8h × 4.345 = 약 35h, 총 209h / 174h ≈ 1.2)
// 따라서 기본시급 = 표시시급 / 1.2
function ordinaryHourlyHourly(
  hourly_wage: number,
  includes_weekly: boolean,
  weekly_hours: number
): { base: number; includes: boolean; ratio: number } {
  // 주 15시간 미만은 주휴수당 미발생 → 시급 그대로 통상시급
  if (!includes_weekly || weekly_hours < 15) {
    return { base: hourly_wage, includes: false, ratio: 1.0 };
  }
  // 주 40h 이상 → 1.2배 가정 (주휴 8h)
  // 주 15~40h → 비례: ratio = (weekly_hours + weekly_hours/5) / weekly_hours = 1.2
  // 주 15h 이상이면 주휴 = 주 소정근로의 1/5
  const ratio = 1.2;
  const base = Math.floor(hourly_wage / ratio);
  return { base, includes: true, ratio };
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
    '근로자의 날 제정에 관한 법률 — 5/1은 모든 사업장 유급휴일',
  ];
  let warning: string | undefined;

  const { within8, over8 } = premiumRate(input.worked_hours);
  const night_hours = input.night_hours || 0;

  // ── 통상시급 계산 ──
  let base_hourly = 0;
  let ordinary_hourly_displayed = 0;
  let already_includes_holiday_pay = false;
  // already_includes_holiday_pay:
  //   상용 월급제는 월급에 휴일분 임금(1.0)이 이미 포함되어 있음 → 추가는 가산분(0.5/1.0)만
  //   일용/시급제는 일하지 않으면 임금 발생 안 함 → 1.0 + 가산(0.5/1.0) 모두 추가 지급

  if (input.worker_type === 'monthly') {
    const monthly_hours = input.monthly_hours || DEFAULT_MONTHLY_HOURS;
    base_hourly = ordinaryHourlyMonthly(input.monthly_pay, monthly_hours);
    ordinary_hourly_displayed = base_hourly;
    already_includes_holiday_pay = true;
    notes.push(
      `통상시급 = 월급 ${input.monthly_pay.toLocaleString('ko-KR')}원 ÷ 월 소정근로 ${monthly_hours}시간 = ${base_hourly.toLocaleString('ko-KR')}원`
    );
    notes.push(
      '월급제는 월급에 유급휴일 임금(1.0배)이 이미 포함되어 있어, 휴일근로 시 가산분(8h 이내 0.5배 / 8h 초과 1.0배)만 추가 지급합니다.'
    );
  } else if (input.worker_type === 'daily') {
    const daily_hours = input.daily_hours || DEFAULT_DAILY_HOURS;
    base_hourly = ordinaryHourlyDaily(input.daily_wage, daily_hours);
    ordinary_hourly_displayed = base_hourly;
    already_includes_holiday_pay = false;
    notes.push(
      `통상시급 = 일급 ${input.daily_wage.toLocaleString('ko-KR')}원 ÷ 1일 ${daily_hours}시간 = ${base_hourly.toLocaleString('ko-KR')}원`
    );
    if (!input.paid_continuously) {
      // 단발성 일용직 → 통상임금 산정 대상 아님 → 가산수당 없음 (일급만)
      warning =
        '단발성 일용직(1일만 근로하고 종료)은 통상임금 산정 대상이 아니므로 가산수당이 발생하지 않습니다. ' +
        '근로한 시간만큼 일당(또는 시급)을 받게 되며, 1.5배·2배 가산은 미적용입니다. ' +
        '명칭과 관계없이 동일 사업장에서 지속적으로 근로(반복 호출)하는 경우에 한해 통상임금이 인정됩니다 (행정해석 근기 68207-2508).';
      legal.push('행정해석 근기 68207-2508 — 일용직 통상임금 인정 요건');
      // 가산수당 0 — 휴일근로 임금만 (1.0배)
      const wage = Math.floor(base_hourly * input.worked_hours);
      breakdown.push({
        label: '일당 (가산 미적용)',
        formula: `통상시급 ${base_hourly.toLocaleString('ko-KR')}원 × ${input.worked_hours}시간`,
        amount: wage,
      });
      const total_warn = breakdown.reduce((s, b) => s + b.amount, 0);
      return {
        total: total_warn,
        base_hourly,
        ordinary_hourly_displayed,
        breakdown,
        notes,
        legal_basis: legal,
        warning,
      };
    } else {
      notes.push(
        '명칭과 관계없이 동일 사업장에서 지속적으로 근로 → 통상임금 인정 (행정해석 근기 68207-2508).'
      );
    }
    legal.push('행정해석 근기 68207-2508 — 일용직 통상임금 인정 요건');
  } else {
    // hourly
    const weekly_hours = input.weekly_hours || 0;
    const includes_weekly = !!input.hourly_includes_weekly;
    const result = ordinaryHourlyHourly(input.hourly_wage, includes_weekly, weekly_hours);
    base_hourly = result.base;
    ordinary_hourly_displayed = input.hourly_wage;
    already_includes_holiday_pay = false;
    if (result.includes) {
      notes.push(
        `시급 ${input.hourly_wage.toLocaleString('ko-KR')}원에 주휴수당이 포함되어 있어, ` +
        `통상시급(가산수당 산정 기준) = ${input.hourly_wage.toLocaleString('ko-KR')} ÷ ${result.ratio} = ${base_hourly.toLocaleString('ko-KR')}원`
      );
      notes.push('가산수당은 주휴분을 제외한 "기본시급"으로 계산합니다.');
    } else if (weekly_hours > 0 && weekly_hours < 15) {
      notes.push(
        `주 ${weekly_hours}시간 < 15시간이므로 주휴수당 미발생. 통상시급 = 시급 ${input.hourly_wage.toLocaleString('ko-KR')}원`
      );
    } else {
      notes.push(`통상시급 = 시급 ${input.hourly_wage.toLocaleString('ko-KR')}원 (주휴수당 별도 지급 가정)`);
    }
  }

  // ── 5인 미만 + 관공서 공휴일 케이스 ──
  if (input.site_size === 'small' && input.holiday_kind === 'public_holiday') {
    warning =
      '⚠️ 5인 미만 사업장은 관공서 공휴일(빨간날) 유급휴일 의무가 없고, 휴일근로 가산수당(1.5배/2배) 의무도 없습니다. ' +
      '단, 근로계약·취업규칙·관행으로 약정한 경우에는 약정에 따라 지급해야 합니다.';
    legal.push('근로기준법 제11조·시행령 제7조 — 5인 미만 사업장은 제56조(가산수당) 적용 제외');
  }

  // ── 5인 미만 + 근로자의 날 케이스 ──
  if (input.site_size === 'small' && input.holiday_kind === 'labor_day') {
    notes.push(
      '근로자의 날(5/1)은 「근로자의 날 제정에 관한 법률」에 따라 5인 미만 사업장에도 적용되는 유급휴일입니다.'
    );
    notes.push(
      '단, 가산수당(1.5배/2배)은 근로기준법 제56조 사항으로 5인 미만 사업장은 의무가 없습니다. ' +
      '월급제는 통상임금 100% 유급, 일용·시급제는 근무 시 통상임금 100% 추가 지급이 원칙입니다.'
    );
  }

  // ── 휴일근로 임금/가산수당 계산 ──
  const apply_premium = input.site_size === 'large';

  // (A) 휴일근로분 임금 (1.0배) — 일용/시급제만 추가 지급
  if (!already_includes_holiday_pay && input.worked_hours > 0) {
    const wage = Math.floor(base_hourly * input.worked_hours);
    breakdown.push({
      label: '휴일근로 임금 (1.0배)',
      formula: `통상시급 ${base_hourly.toLocaleString('ko-KR')}원 × ${input.worked_hours}시간`,
      amount: wage,
    });
  } else if (already_includes_holiday_pay) {
    breakdown.push({
      label: '휴일근로 임금 (1.0배)',
      formula: '월급에 이미 포함됨',
      amount: 0,
    });
  }

  // (B) 휴일 8h 이내 가산수당 (0.5배)
  if (apply_premium && within8 > 0) {
    const amt = Math.floor(base_hourly * 0.5 * within8);
    breakdown.push({
      label: '휴일 8시간 이내 가산수당 (0.5배)',
      formula: `통상시급 ${base_hourly.toLocaleString('ko-KR')}원 × 0.5 × ${within8}시간`,
      amount: amt,
    });
  }

  // (C) 휴일 8h 초과 가산수당 (1.0배)
  if (apply_premium && over8 > 0) {
    const amt = Math.floor(base_hourly * 1.0 * over8);
    breakdown.push({
      label: '휴일 8시간 초과 가산수당 (1.0배)',
      formula: `통상시급 ${base_hourly.toLocaleString('ko-KR')}원 × 1.0 × ${over8}시간`,
      amount: amt,
    });
  }

  // (D) 야간근로 가산수당 (0.5배)
  if (apply_premium && night_hours > 0) {
    const amt = Math.floor(base_hourly * 0.5 * night_hours);
    breakdown.push({
      label: '야간근로 가산수당 (0.5배, 22:00~06:00)',
      formula: `통상시급 ${base_hourly.toLocaleString('ko-KR')}원 × 0.5 × ${night_hours}시간`,
      amount: amt,
    });
  } else if (!apply_premium && night_hours > 0) {
    notes.push('5인 미만 사업장은 야간근로 가산수당(0.5배) 의무가 없습니다.');
  }

  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  return {
    total,
    base_hourly,
    ordinary_hourly_displayed,
    breakdown,
    notes,
    legal_basis: legal,
    warning,
  };
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
