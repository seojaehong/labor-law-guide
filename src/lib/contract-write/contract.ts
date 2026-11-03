// 근로계약서 작성 — 화면 입력 → 임금 구성 설계 → 점검 엔진(Contract) 모양.
// 작성한 계약서를 같은 사이트의 근로계약서 점검 규칙으로 다시 돌려, 만든 문서가 점검에서 걸리지 않는지 본다.

import type { Contract, WageItem, WageItemCode } from '@/lib/contract-check/types';

import { designMonthlyWage, type DesignResult, type ItemKey, type Rounding } from './design';

export interface WriteForm {
  workplaceName: string;
  ownerName?: string;
  employeeCount5plus: boolean;
  employeeName: string;
  startDate: string;
  /** 비우면 기간의 정함이 없음 */
  endDate?: string | null;
  location: string;
  duty: string;
  daysPerWeek: number;
  /** HH:MM */
  start: string;
  end: string;
  breakMinutes: number;
  weeklyRestDay: string;
  monthlyTotal: number;
  holidayDaysPerYear: number;
  overrides?: { overtimeHours?: number; holidayHours?: number; leaveHours?: number };
  rounding?: Rounding;
  absorbInto?: ItemKey;
  payday: string;
  paymentMethod: string;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 하루 실근로시간 = 퇴근 − 출근 − 휴게(자정 넘김 허용) */
export function dailyWorkHours(form: Pick<WriteForm, 'start' | 'end' | 'breakMinutes'>): number {
  let span = minutesOf(form.end) - minutesOf(form.start);
  if (span <= 0) span += 24 * 60;
  return (span - form.breakMinutes) / 60;
}

const ITEM_CODE: Record<ItemKey, WageItemCode> = {
  base: 'BASE',
  overtime: 'OT_WEEKDAY',
  holiday: 'HOLIDAY_EXTRA',
  leave: 'ANNUAL_LEAVE',
};
const MULTIPLIER: Record<ItemKey, number> = { base: 1, overtime: 1.5, holiday: 1.5, leave: 1 };

// 계약서에 적는 통상시급 = 계산 시급 소수 둘째 자리. 원 단위로 내리면 항목 금액(계산 시급 × 시간)과 수십 원 어긋난다
const rate2 = (rate: number) => Math.round(rate * 100) / 100;
export const rateText = (rate: number) => rate2(rate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 점검 규칙 HOLIDAY-COVER 가 읽는 'N일/M.MH' — M = 월 평균 공휴일 실근로시간 */
function holidayNote(form: WriteForm): string {
  const monthlyDays = (form.holidayDaysPerYear * (Math.min(form.daysPerWeek, 5) / 5)) / 12;
  const planned = Math.round(monthlyDays * dailyWorkHours(form) * 100) / 100;
  return `연 ${form.holidayDaysPerYear}일 근무 예정, 월 평균 ${Math.round(form.holidayDaysPerYear)}일/${planned}H`;
}

export function designFromForm(form: WriteForm, minimumWage?: number): DesignResult {
  return designMonthlyWage({
    monthlyTotal: form.monthlyTotal,
    daysPerWeek: form.daysPerWeek,
    dailyWorkHours: dailyWorkHours(form),
    holidayDaysPerYear: form.holidayDaysPerYear,
    overrides: form.overrides,
    rounding: form.rounding,
    absorbInto: form.absorbInto,
    minimumWage,
  });
}

/** 설계 결과를 점검 엔진 입력으로. 시간은 가산을 반영한 인정시간이고 basis_text 에 시급×시간을 적는다 */
export function toContract(form: WriteForm, design: DesignResult): Contract {
  const items: WageItem[] = design.items
    .filter((item) => item.hours > 0)
    .map((item) => ({
      code: ITEM_CODE[item.key],
      label: item.label,
      amount: item.amount,
      basis_hours: Number(item.hours.toFixed(4)),
      rate_multiplier: 1,
      basis_text: `통상시급 ${rateText(design.rate)}원 × ${item.hours.toFixed(2)}시간${MULTIPLIER[item.key] !== 1 ? `(가산 ${MULTIPLIER[item.key]}배 반영)` : ''}`,
      ...(item.key === 'base' ? { includes_weekly_holiday: true } : {}),
    }));
  return {
    contract_id: 'contract-write',
    workplace: { name: form.workplaceName, owner_name: form.ownerName ?? null, employee_count_5plus: form.employeeCount5plus } as Contract['workplace'],
    employee: { name: form.employeeName, hire_date: form.startDate, employment_type: null },
    period: { start_date: form.startDate, end_date: form.endDate ?? null, indefinite: !form.endDate },
    job: { location: form.location, duty: form.duty },
    work_time: {
      days_per_week: form.daysPerWeek,
      start: form.start,
      end: form.end,
      breaks: [{ minutes: form.breakMinutes }],
      night_work: false,
    },
    wage: {
      monthly_total: form.monthlyTotal,
      ordinary_hourly_rate: rate2(design.rate),
      // 근무시각이 고정이고 항목마다 시간을 적으므로 시간 산정이 가능한 정액 수당 구조로 본다
      inclusive_wage: false,
      public_holiday_included: form.holidayDaysPerYear > 0,
      public_holiday_note: form.holidayDaysPerYear > 0 ? holidayNote(form) : null,
      pay_type: 'monthly',
      items,
      payday: form.payday,
      payment_method: form.paymentMethod,
    },
    holidays_leave: {
      weekly_rest: form.weeklyRestDay,
      weekly_rest_day_specified: true,
      annual_leave_clause: '근로기준법 제60조에 따라 부여',
    },
    risk_clauses: [],
    signatures: { written_date: form.startDate, employer_signed: true, employee_signed: true, copy_delivered_confirmed: true },
  };
}
