// 근로계약서 작성 — 화면 입력 → 임금 구성 설계 → 점검 엔진(Contract) 모양.
// 작성한 계약서를 같은 사이트의 근로계약서 점검 규칙으로 다시 돌려, 만든 문서가 점검에서 걸리지 않는지 본다.

import { checkContract } from '@/lib/contract-check/engine';
import { dayWorkMinutes, MINWAGE_TABLE, normalize } from '@/lib/contract-check/normalize';
import { minwageAssessment } from '@/lib/contract-check/rules/wage';
import type { Contract, Finding, WageItem, WageItemCode } from '@/lib/contract-check/types';

import { designMonthlyWage, ROUNDING_UNIT, weeklySchedule, WEEKS_PER_MONTH, type DesignResult, type ItemKey, type Rounding } from './design';
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
  /** 시급·일급 — 결근한 주에 미리 준 주휴수당을 공제한다(deduct, 기본) / 공제하지 않는다(keep) */
  absentWeekHoliday?: 'deduct' | 'keep';
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

/**
 * 하루 야간근로(22:00~06:00) 시간. 화면은 휴게가 몇 시에 있는지 받지 않으므로, 실제 야간근로는
 * [겹친 시간 − 휴게, min(겹친 시간, 실근로)] 사이 어딘가다. 그 위쪽 끝 min(겹친 시간, 실근로)을 쓴다.
 * - 휴게를 야간 밖에 둘 수 있으면(낮 구간 ≥ 휴게) 겹친 시간 그대로다(사무소 양식과 같다).
 * - 근무 전체가 야간이면 휴게도 야간 안이라 실근로가 상한이다(22:00~06:00 휴게 60분 → 7시간, PR #140 검토 2).
 * 위쪽 끝을 고른 까닭: 월 총액을 나누는 설계라 야간 수당은 미리 정한 고정액이다. 휴게가 실제로 야간 밖에 있을 때 이 값보다 적게 잡으면
 * 고정 야간수당이 실제 야간 가산(근로기준법 제56조 제3항)에 못 미친다. 반대로 휴게가 야간 안에 있으면 통상시급이 조금 낮아지는데,
 * 그 낮아진 시급을 최저임금 점검(MINWAGE)이 그대로 본다.
 */
export function nightHoursOf(form: Pick<WriteForm, 'start' | 'end' | 'breakMinutes'>): number {
  const s = minutesOf(form.start);
  const e = s + spanMinutes(form);
  const windows = [
    [0, 6 * 60],
    [22 * 60, 30 * 60],
    [46 * 60, 54 * 60],
  ];
  const overlap = windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0) / 60;
  return Math.min(overlap, dailyWorkHours(form));
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

/** 점검 규칙 HOLIDAY-COVER 가 읽는 'N일/M.MH' — N = 월 평균 공휴일 근무 일수, M = 그 실근로시간 */
function holidayNote(form: WriteForm): string {
  const monthlyDays = (form.holidayDaysPerYear * (Math.min(form.workDays.length, 5) / 5)) / 12;
  const planned = Math.round(monthlyDays * dailyWorkHours(form) * 100) / 100;
  return `연 ${form.holidayDaysPerYear}일 근무 예정, 월 평균 ${Math.round(monthlyDays * 100) / 100}일/${planned}H`;
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

/** 수습 중 감액하는 기간 = 수습 기간과 3개월 중 짧은 쪽(최저임금법 시행령 제3조). 계약서 제1조와 점검 입력이 같은 값을 쓴다 */
export function reducedMonthsOf(p: Probation): number {
  return Math.min(p.months, 3);
}

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

export function designFromForm(form: WriteForm): DesignResult {
  const issue = probationIssue(form);
  if (issue) throw new Error(issue);
  if (form.payType === 'hourly') {
    if (!(form.hourlyWage && form.hourlyWage > 0)) throw new Error('시간당 지급액을 넣어 주세요');
    return designHourlyWage({
      hourlyWage: form.hourlyWage,
      stayHours: spanMinutes(form) / 60,
      breakMinutes: form.breakMinutes,
      nightHours: nightHoursOf(form),
      daysPerWeek: form.workDays.length,
      holidayDaysPerYear: form.holidayDaysPerYear,
      fivePlus: form.employeeCount5plus,
      rounding: form.rounding,
      absorbInto: form.absorbInto,
    });
  }
  if (!(form.monthlyTotal && form.monthlyTotal > 0)) throw new Error('월 임금 총액을 넣어 주세요');
  return designMonthlyWage({
    monthlyTotal: form.monthlyTotal,
    daysPerWeek: form.workDays.length,
    dailyWorkHours: dailyWorkHours(form),
    nightHoursPerDay: nightHoursOf(form),
    holidayDaysPerYear: form.holidayDaysPerYear,
    fivePlus: form.employeeCount5plus,
    overrides: form.overrides,
    rounding: form.rounding,
    absorbInto: form.absorbInto,
  });
}

/** 점검 규칙 글을 화면·계약서에 옮길 때 — 공개 명칭은 「임금 구성」이라 「포괄」을 쓰지 않는다 */
export function publicText(text: string): string {
  return text.replace(/포괄임금/g, '임금 구성').replace(/포괄/g, '임금 구성');
}

export interface WrittenReview {
  /** 손볼 것(위반·확인 필요·주요 위험) */
  problems: Finding[];
  /** 최저임금 한 줄 — 점검 규칙 MINWAGE 판정에서(계약 시작 연도) */
  minimumWage: { text: string; warn: boolean };
  /** 계약 기간이 다음 해 이후로 이어질 때 그 해 최저시급과 비교한 줄(낮아지는 해·미등록 해). 없으면 빈 배열 */
  minimumWageLater: Array<{ text: string; warn: boolean }>;
}

/** 기간제 2년 초과 — 점검 규칙은 사소한 위험(minor)으로 두지만, 작성 단계에서는 예외에 해당하는지 확인할 일이라 남긴다(PR #140 검토 3) */
function fixedTermText(detail: string | null | undefined): string {
  const span = detail?.split(' — ')[0] ?? '계약기간 2년 초과';
  return (
    `${span} — 기간제 근로자를 2년을 넘어 사용하면 기간의 정함이 없는 근로자로 봅니다(기간제법 제4조 제2항). ` +
    '사업의 완료에 필요한 기간을 정한 경우나 55세 이상 고령자와 맺는 계약 등 같은 조 제1항 단서의 예외에 해당하는지 확인이 필요합니다'
  );
}

/**
 * 계약 기간이 걸친 시작 다음 해부터의 최저시급 비교(PR #140 검토 8). 같은 계약을 그 해 1월 1일 시작으로 놓고 점검 규칙 MINWAGE 를 다시 돌린다.
 * 기간의 정함이 없으면 표에 등록된 다음 해들과만 비교한다(끝이 없으므로 미등록 해는 적지 않는다).
 */
function laterMinimumWage(form: WriteForm, raw: Contract): WrittenReview['minimumWageLater'] {
  const first = Number(form.startDate.slice(0, 4));
  const last = form.endDate ? Number(form.endDate.slice(0, 4)) : Math.max(first, ...Object.keys(MINWAGE_TABLE).map(Number));
  const out: WrittenReview['minimumWageLater'] = [];
  for (let y = first + 1; y <= last; y += 1) {
    const minimum = MINWAGE_TABLE[String(y)];
    if (minimum === undefined) {
      out.push({ text: `${y}년 최저시급 미등록 — 계약이 ${y}년까지 이어지지만 비교하지 않았습니다(고시 뒤 다시 확인)`, warn: false });
      continue;
    }
    const [shifted] = normalize([{ ...raw, period: { ...raw.period, start_date: `${y}-01-01` } }]);
    if (minwageAssessment(shifted).status === 'violation') {
      out.push({
        text: `${y}년 최저시급 ${minimum.toLocaleString('ko-KR')}원보다 낮습니다 — 계약이 ${y}년까지 이어지므로 ${y}년 1월 1일부터는 임금을 올려 다시 정해야 합니다`,
        warn: true,
      });
    }
  }
  return out;
}

/** 작성한 계약을 근로계약서 점검 규칙으로 다시 돌린 결과. 화면·오프라인판·시험이 같이 쓴다 */
export function reviewWritten(form: WriteForm, design: DesignResult): WrittenReview {
  const raw = toContract(form, design);
  const [contract] = normalize([raw]);
  const under15 = isUnder15(form);
  const findings = checkContract(contract).map((f) => ({ ...f, detail: f.detail == null ? f.detail : publicText(f.detail) }));
  const problems = findings
    .filter((f) => {
      // 1주 15시간 미만은 주휴일 자체가 없어 「특정했는가」를 물을 수 없다 — 작성 단계라 해당 없음(근로기준법 제18조 제3항)
      if (f.rule_code === 'REST-DAY' && f.status === 'needs_data' && under15) return false;
      if (f.rule_code === 'FIXED-TERM-2Y' && f.status === 'risk') return true;
      return f.status === 'violation' || f.status === 'needs_data' || (f.status === 'risk' && f.severity !== 'minor' && f.severity !== 'info');
    })
    .map((f) => (f.rule_code === 'FIXED-TERM-2Y' && f.status === 'risk' ? { ...f, detail: fixedTermText(f.detail) } : f));
  const year = form.startDate.slice(0, 4);
  const minimum = MINWAGE_TABLE[year];
  const rate = `통상시급 ${rateText(design.rate)}원`;
  const minwage = findings.find((f) => f.rule_code === 'MINWAGE');
  let line: WrittenReview['minimumWage'];
  // 표에 없는 해는 마지막 해 값으로 대신하지 않는다 — 비교하지 않았다고 말한다
  if (minimum === undefined) line = { text: `${rate} — ${year}년 최저시급 미등록(비교하지 않았습니다)`, warn: true };
  else if (minwage?.status === 'ok') line = { text: `${rate} (${year}년 최저시급 ${minimum.toLocaleString('ko-KR')}원 이상)`, warn: false };
  else if (minwage?.status === 'violation') line = { text: `${rate} — ${year}년 최저시급 ${minimum.toLocaleString('ko-KR')}원보다 낮습니다`, warn: true };
  else line = { text: `${rate} — 최저임금: ${minwage?.detail ?? '판단하지 못했습니다'}`, warn: true };
  // 시작 연도부터 낮으면 다음 해도 낮다 — 같은 말을 되풀이하지 않는다
  const later = minwage?.status === 'violation' ? [] : laterMinimumWage(form, raw);
  return { problems, minimumWage: line, minimumWageLater: later };
}

export function checkWritten(form: WriteForm, design: DesignResult): Finding[] {
  return reviewWritten(form, design).problems;
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
  const scale = design.period === 'day' ? form.workDays.length * WEEKS_PER_MONTH : 1;
  // 파트는 계산값(exact)을 월로 환산해 넣으므로 단위 올림이 점검에 닿지 않는다 — 월급제만 단위를 밝힌다
  const unit = design.period === 'month' ? ROUNDING_UNIT[form.rounding ?? 'won'] : 0;
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
        basis_text: `통상시급 ${rateText(design.rate)}원 × ${hours.toFixed(2)}시간${multiplier > 1 ? `(${multiplier}배, 가산 포함)` : multiplier < 1 ? `(가산분 ${multiplier}배)` : ''}${unit && !item.absorbs ? `(${unit}원 단위 올림)` : ''}`,
        // 월급제 기본급은 주휴를 담는다 — 1주 15시간 미만은 주휴가 없어 담지 않는다(근로기준법 제18조 제3항, PR #140 검토 1)
        ...(item.key === 'base' ? { includes_weekly_holiday: design.period === 'month' && !isUnder15(form) } : {}),
      };
    });
  const monthlyTotal = design.period === 'day' ? items.reduce((s, i) => s + i.amount, 0) : design.total;
  const prob = form.probation;
  return {
    contract_id: 'contract-write',
    workplace: { name: form.workplaceName, owner_name: form.ownerName ?? null, employee_count_5plus: fivePlus },
    employee: { name: form.employeeName, hire_date: form.startDate, employment_type: null },
    period: {
      start_date: form.startDate,
      end_date: form.endDate ?? null,
      indefinite: !form.endDate,
      probation: prob
        ? {
            applied: true,
            months: prob.months,
            // 문서 제1조와 같은 감액 기간(처음 3개월) — 수습 전체를 감액 기간으로 보면 6개월 수습이 위반으로 잡힌다(PR #140 검토 5)
            reduced_months: prob.reduced ? reducedMonthsOf(prob) : null,
            wage_rate_pct: prob.reduced ? PROBATION_PCT : 100,
            simple_labor_job: prob.simpleLabor,
          }
        : null,
    },
    job: { location: form.location, duty: form.duty },
    work_time: {
      days_per_week: form.workDays.length,
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
      amount_rounding_unit: unit || null,
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
