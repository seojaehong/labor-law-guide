// 근로계약서 작성 — 화면 입력 → 임금 구성 설계 → 점검 엔진(Contract) 모양.
// 작성한 계약서를 같은 사이트의 근로계약서 점검 규칙으로 다시 돌려, 만든 문서가 점검에서 걸리지 않는지 본다.

import { checkContract } from '@/lib/contract-check/engine';
import { dayWorkMinutes, normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem, WageItemCode } from '@/lib/contract-check/types';

import { designMonthlyWage, weeklySchedule, WEEKS_PER_MONTH, type DesignResult, type ItemKey, type Rounding } from './design';
import { designHourlyWage } from './part';

export interface Probation {
  months: number;
  /** 처음 3개월 임금을 100분의 90 으로 정한다(최저임금법 제5조 제2항·시행령 제3조) */
  reduced: boolean;
  /** 단순노무업무 고시 직종 — 감액할 수 없다 */
  simpleLabor: boolean;
}

export const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

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
  /** 근무 요일(월~일). 계약서에 근로일·근로일별 시간으로 적는다(단시간이면 기간제법 §17 필수) */
  workDays: string[];
  /** 주휴일 요일. 근무 요일과 겹치면 안 된다(formState 가 막는다) */
  weeklyRestDay: WeekDay;
  /** 계약서 작성일(YYYY-MM-DD). 서명 날짜와 점검 소급 작성 판단에 쓴다 */
  writtenDate: string;
  /** monthly = 월 임금 총액을 나눈다(기본), hourly = 시간당 지급액 × 체류시간(일 지급액)을 나눈다 */
  payType?: 'monthly' | 'hourly';
  /** 월급제 필수 */
  monthlyTotal?: number;
  /** 시급·일급 필수 — 휴게를 포함한 출근~퇴근 시간에 곱한다 */
  hourlyWage?: number;
  holidayDaysPerYear: number;
  overrides?: { overtimeHours?: number; holidayHours?: number; leaveHours?: number };
  rounding?: Rounding;
  absorbInto?: ItemKey;
  probation?: Probation | null;
  payday: string;
  paymentMethod: string;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 출근~퇴근 분. 퇴근이 출근보다 이르면 자정을 넘긴 근무, 같으면 0(점검 엔진 dayWorkMinutes 와 같다) */
export function spanMinutes(form: Pick<WriteForm, 'start' | 'end'>): number {
  return dayWorkMinutes(form.start, form.end, []);
}

/** 하루 실근로시간 = 퇴근 − 출근 − 휴게. 점검 엔진과 같은 함수로 센다 */
export function dailyWorkHours(form: Pick<WriteForm, 'start' | 'end' | 'breakMinutes'>): number {
  return dayWorkMinutes(form.start, form.end, [{ minutes: form.breakMinutes }]) / 60;
}

/** 출근~퇴근 중 22:00~06:00 과 겹치는 시간. 휴게가 어디 있는지 모르므로 휴게는 야간 밖에 둔다고 본다(사무소 양식과 같다) */
export function nightHoursOf(form: Pick<WriteForm, 'start' | 'end'>): number {
  const s = minutesOf(form.start);
  const e = s + spanMinutes(form);
  const windows = [
    [0, 6 * 60],
    [22 * 60, 30 * 60],
    [46 * 60, 54 * 60],
  ];
  return windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0) / 60;
}

const ITEM_CODE: Record<ItemKey, WageItemCode> = {
  base: 'BASE',
  weeklyHoliday: 'WEEKLY_HOLIDAY',
  overtime: 'OT_WEEKDAY',
  night: 'NIGHT',
  holiday: 'HOLIDAY_EXTRA',
  leave: 'ANNUAL_LEAVE',
};

// 계약서에 적는 통상시급 = 계산 시급 소수 둘째 자리. 원 단위로 내리면 항목 금액(계산 시급 × 시간)과 수십 원 어긋난다
const rate2 = (rate: number) => Math.round(rate * 100) / 100;
export const rateText = (rate: number) => rate2(rate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 점검 규칙 HOLIDAY-COVER 가 읽는 'N일/M.MH' — M = 월 평균 공휴일 실근로시간 */
function holidayNote(form: WriteForm): string {
  const monthlyDays = (form.holidayDaysPerYear * (Math.min(form.daysPerWeek, 5) / 5)) / 12;
  const planned = Math.round(monthlyDays * dailyWorkHours(form) * 100) / 100;
  return `연 ${form.holidayDaysPerYear}일 근무 예정, 월 평균 ${Math.round(form.holidayDaysPerYear)}일/${planned}H`;
}

/** 시작일부터 종료일까지가 1년 이상인지(종료일 = 시작일 + 1년 − 1일이면 1년) */
function atLeastOneYear(start: string, end: string): boolean {
  const [y, m, d] = start.split('-').map(Number);
  const oneYearLast = new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
  return end >= oneYearLast;
}

/** 수습 감액을 쓸 수 없는 사유. 없으면 null */
export function probationIssue(form: WriteForm): string | null {
  const p = form.probation;
  if (!p?.reduced) return null;
  if (p.simpleLabor) return '단순노무업무로 고시된 직종은 수습 중에도 최저임금을 감액할 수 없습니다(최저임금법 제5조 제2항 단서).';
  if (form.endDate && !atLeastOneYear(form.startDate, form.endDate)) {
    return '수습 감액은 1년 이상의 기간을 정한 계약에만 쓸 수 있습니다(최저임금법 제5조 제2항). 계약기간을 늘리거나 감액을 끄세요.';
  }
  return null;
}

export const PROBATION_PCT = 90;

/** 1주 소정근로가 15시간 미만 — 주휴·연차를 적용하지 않는다(근로기준법 제18조 제3항) */
export function isUnder15(form: Pick<WriteForm, 'start' | 'end' | 'breakMinutes' | 'workDays'>): boolean {
  return weeklySchedule(dailyWorkHours(form), form.workDays.length).scheduled < 15;
}

/** 주휴일 조항 첫 줄 — 계약서 본문(제4조)과 점검 입력이 같은 문장을 쓴다 */
export function restDayTerm(form: WriteForm): string {
  return isUnder15(form)
    ? '1주 소정근로시간이 15시간 미만이므로 주휴일과 연차유급휴가는 적용하지 않는다(근로기준법 제18조 제3항).'
    : `주휴일: 매주 ${form.weeklyRestDay}요일(유급)`;
}

/** 연차유급휴가 조항 — 계약서 본문(제6조)과 점검 입력이 같은 문장을 쓴다 */
export function leaveTerms(form: WriteForm): string[] {
  if (isUnder15(form)) return ['1주 소정근로시간이 15시간 미만이므로 연차유급휴가는 적용하지 않는다(근로기준법 제18조 제3항).'];
  if (!form.employeeCount5plus) {
    return ['상시 5명 미만 사업장이므로 근로기준법 제60조(연차유급휴가)는 적용하지 않는다(근로기준법 시행령 제7조 별표 1).'];
  }
  return [
    '근로기준법 제60조에 따라 부여한다.',
    '표의 연차수당은 쓰지 않은 연차유급휴가에 대한 수당을 매월 나누어 미리 지급하는 것이며, 근로자의 연차유급휴가 사용을 제한하지 않는다.',
  ];
}

export function designFromForm(form: WriteForm, minimumWage?: number): DesignResult {
  const issue = probationIssue(form);
  if (issue) throw new Error(issue);
  if (form.payType === 'hourly') {
    if (!(form.hourlyWage && form.hourlyWage > 0)) throw new Error('시간당 지급액을 넣어 주세요');
    return designHourlyWage({
      hourlyWage: form.hourlyWage,
      stayHours: spanMinutes(form) / 60,
      breakMinutes: form.breakMinutes,
      nightHours: nightHoursOf(form),
      daysPerWeek: form.daysPerWeek,
      holidayDaysPerYear: form.holidayDaysPerYear,
      fivePlus: form.employeeCount5plus,
      rounding: form.rounding,
      absorbInto: form.absorbInto,
      minimumWage,
    });
  }
  if (!(form.monthlyTotal && form.monthlyTotal > 0)) throw new Error('월 임금 총액을 넣어 주세요');
  return designMonthlyWage({
    monthlyTotal: form.monthlyTotal,
    daysPerWeek: form.daysPerWeek,
    dailyWorkHours: dailyWorkHours(form),
    nightHoursPerDay: nightHoursOf(form),
    holidayDaysPerYear: form.holidayDaysPerYear,
    fivePlus: form.employeeCount5plus,
    overrides: form.overrides,
    rounding: form.rounding,
    absorbInto: form.absorbInto,
    minimumWage,
  });
}

/** 작성한 계약을 근로계약서 점검 규칙으로 다시 돌린 결과 중 손볼 것(위반·확인 필요·주요 위험). 화면과 시험이 같이 쓴다 */
export function checkWritten(form: WriteForm, design: DesignResult): Finding[] {
  const [contract] = normalize([toContract(form, design)]);
  const under15 = isUnder15(form);
  return checkContract(contract).filter((f) => {
    // 1주 15시간 미만은 주휴일 자체가 없어 「특정했는가」를 물을 수 없다 — 작성 단계라 해당 없음(근로기준법 제18조 제3항)
    if (f.rule_code === 'REST-DAY' && f.status === 'needs_data' && under15) return false;
    return f.status === 'violation' || f.status === 'needs_data' || (f.status === 'risk' && f.severity !== 'minor' && f.severity !== 'info');
  });
}

/** 항목의 실시간·가산율 — 인정시간(가산 반영)을 실시간 × 가산율로 푼다. 휴일은 1.5·2.0 이 섞여 환산시간 그대로 둔다 */
function basisOf(key: ItemKey, hours: number, fivePlus: boolean): { basis: number; multiplier: number } {
  if (key === 'overtime' && fivePlus) return { basis: hours / 1.5, multiplier: 1.5 };
  if (key === 'night') return { basis: hours / 0.5, multiplier: 0.5 };
  return { basis: hours, multiplier: 1 };
}

/**
 * 설계 결과를 점검 엔진 입력으로. 시간은 가산을 반영한 인정시간이고 basis_text 에 시급×시간을 적는다.
 * 시급·일급 파트는 하루 금액·시간을 월 환산(주근무일 × 4.345주)해 넣는다 — 점검 규칙이 월 금액을 기준으로 본다.
 */
export function toContract(form: WriteForm, design: DesignResult): Contract {
  const fivePlus = form.employeeCount5plus;
  const scale = design.period === 'day' ? form.daysPerWeek * WEEKS_PER_MONTH : 1;
  const items: WageItem[] = design.items
    .filter((item) => item.hours > 0)
    .map((item) => {
      const hours = item.hours * scale;
      const { basis, multiplier } = basisOf(item.key, hours, fivePlus);
      return {
        code: ITEM_CODE[item.key],
        label: item.label,
        amount: design.period === 'day' ? Math.round(item.exact * scale) : item.amount,
        basis_hours: Number(basis.toFixed(4)),
        rate_multiplier: multiplier,
        basis_text: `통상시급 ${rateText(design.rate)}원 × ${hours.toFixed(2)}시간${multiplier !== 1 ? `(가산 ${multiplier}배 반영)` : ''}`,
        ...(item.key === 'base' ? { includes_weekly_holiday: design.period === 'month' } : {}),
      };
    });
  const monthlyTotal = design.period === 'day' ? items.reduce((s, i) => s + i.amount, 0) : design.total;
  const prob = form.probation;
  return {
    contract_id: 'contract-write',
    workplace: { name: form.workplaceName, owner_name: form.ownerName ?? null, employee_count_5plus: fivePlus } as Contract['workplace'],
    employee: { name: form.employeeName, hire_date: form.startDate, employment_type: null },
    period: {
      start_date: form.startDate,
      end_date: form.endDate ?? null,
      indefinite: !form.endDate,
      probation: prob
        ? { applied: true, months: prob.months, wage_rate_pct: prob.reduced ? PROBATION_PCT : 100, simple_labor_job: prob.simpleLabor }
        : null,
    },
    job: { location: form.location, duty: form.duty },
    work_time: {
      days_per_week: form.daysPerWeek,
      start: form.start,
      end: form.end,
      breaks: [{ minutes: form.breakMinutes }],
      daily_schedules: form.workDays.map((day) => ({ day, start: form.start, end: form.end })),
      night_work: nightHoursOf(form) > 0,
    },
    wage: {
      monthly_total: monthlyTotal,
      ordinary_hourly_rate: rate2(design.rate),
      // 근무시각이 고정이고 항목마다 시간을 적으므로 시간 산정이 가능한 정액 수당 구조로 본다
      inclusive_wage: false,
      public_holiday_included: fivePlus && design.hours.holiday > 0,
      public_holiday_note: fivePlus && design.hours.holiday > 0 ? holidayNote(form) : null,
      pay_type: design.period === 'day' ? 'hourly' : 'monthly',
      items,
      payday: form.payday,
      payment_method: form.paymentMethod,
    },
    holidays_leave: {
      weekly_rest: restDayTerm(form),
      // 15시간 미만은 주휴일이 없다 — 특정 여부를 물을 대상이 아니다(checkWritten 이 REST-DAY 확인 필요를 뺀다)
      weekly_rest_day_specified: isUnder15(form) ? null : true,
      annual_leave_clause: leaveTerms(form).join(' '),
      annual_leave_prepaid_hours_per_month: design.hours.leave * scale,
    },
    risk_clauses: [],
    // 서명·교부는 계약서를 만든 뒤의 일이라 작성 단계에서는 모른다
    signatures: { written_date: form.writtenDate, employer_signed: null, employee_signed: null, copy_delivered_confirmed: null },
  };
}
