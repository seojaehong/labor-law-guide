// 폼 상태 모델 + 계약 객체 빌더 (ContractCheckClient에서 분리).
// 순수 TS라 unit 테스트에서 바로 import 할 수 있다 — 사진 추출 결과 역매핑(extractMap.ts)도 이 모델을 쓴다.

import type {
  Contract,
  DailySchedule,
  RiskClause,
  WageItem,
  WorkTimeVariant,
} from '@/lib/contract-check/types';

/** 문제조항 체크리스트 — 각 항목은 risk_clauses 태그로 매핑된다. */
export const CLAUSE_ITEMS: { tag: string; label: string; hint: string }[] = [
  {
    tag: '금품청산',
    label: '퇴직 후 14일을 넘겨 임금·퇴직금을 지급한다는 약정',
    hint: '예: "퇴직금은 퇴직 다음 달 말일에 지급한다"',
  },
  {
    tag: '조건부지급',
    label: '반납·방문 등 조건을 걸고 임금을 지급한다는 조항',
    hint: '예: "유니폼 반납 후 마지막 급여를 지급한다"',
  },
  {
    tag: '즉시해고',
    label: '"즉시 해고할 수 있다"는 문구',
    hint: '해고예고(30일)·서면통지 절차를 건너뛰는 표현',
  },
  {
    tag: '자동만료',
    label: '일정 사유 발생 시 계약이 자동 종료·만료된다는 조항',
    hint: '예: "무단결근 3일 시 자동 퇴사 처리한다"',
  },
  {
    tag: '부제소',
    label: '회사에 이의제기·소송을 하지 않겠다는 조항',
    hint: '예: "본 계약에 대해 민형사상 이의를 제기하지 않는다"',
  },
  {
    tag: '위약예정',
    label: '위약금·손해배상액을 미리 정해 둔 조항',
    hint: '예: "중도 퇴사 시 300만원을 배상한다"',
  },
];

export interface VariantRow {
  perWeek: string;
  start: string;
  end: string;
}

export interface DailyRow {
  day: string;
  start: string;
  end: string;
}

export interface FormState {
  // ① 기본
  periodType: '' | 'indefinite' | 'fixed';
  /** 상시 5인 이상 — 계약서에 없는 사업장 정보라 사진 추출이 채우지 않는다 */
  fivePlus: '' | 'yes' | 'no';
  startDate: string;
  endDate: string;
  probation: '' | 'yes' | 'no';
  probationMonths: string;
  probationRate: string;
  monthlyTotal: string;
  /** 급여 형태 — 시급제(시급 × 시간, 최저임금 법리 A·B)·월급제(법리 C). 비우면 엔진이 산출근거 시간으로 추론한다 */
  payType: '' | 'hourly' | 'monthly';
  baseWage: string;
  /** 시급제의 시급 — 기본급 = 시급 × basisHours(비우면 시급 그대로) */
  hourlyWage: string;
  /** 기본급 산출근거 월 시간(선택) → BASE.basis_hours. 시급제는 시급 × 이 시간이 기본급 */
  basisHours: string;
  /** 시급에 주휴수당이 포함돼 있다고 적혀 있나 — 시급제에서만 BASE.includes_weekly_holiday 로 싣는다 */
  weeklyHolidayIncluded: '' | 'yes' | 'no';
  // ② 근로시간
  daysPerWeek: string;
  workStart: string;
  workEnd: string;
  hasVariants: boolean;
  variants: VariantRow[];
  breakMinutes: string;
  nightWork: '' | 'yes' | 'no';
  hasDaily: boolean;
  daily: DailyRow[];
  // ③ 임금 구성·지급
  /** 주휴수당 별도 항목 금액(월) → WEEKLY_HOLIDAY */
  weeklyHolidayPay: string;
  otAmount: string;
  otHours: string;
  holidayExtra: string;
  annualLeavePay: string;
  basisWritten: boolean;
  payday: string;
  paymentMethod: string;
  weeklyRest: '' | 'specified' | 'unspecified';
  annualLeaveClause: boolean;
  jobWritten: boolean;
  // ④ 문제조항
  clauses: Record<string, boolean>;
}

export const INITIAL: FormState = {
  periodType: '',
  fivePlus: '',
  startDate: '',
  endDate: '',
  probation: '',
  probationMonths: '',
  probationRate: '',
  monthlyTotal: '',
  payType: '',
  baseWage: '',
  hourlyWage: '',
  basisHours: '',
  weeklyHolidayIncluded: '',
  daysPerWeek: '',
  workStart: '',
  workEnd: '',
  hasVariants: false,
  variants: [{ perWeek: '', start: '', end: '' }],
  breakMinutes: '',
  nightWork: '',
  hasDaily: false,
  daily: [{ day: '월', start: '', end: '' }],
  weeklyHolidayPay: '',
  otAmount: '',
  otHours: '',
  holidayExtra: '',
  annualLeavePay: '',
  basisWritten: false,
  payday: '',
  paymentMethod: '',
  weeklyRest: '',
  annualLeaveClause: false,
  jobWritten: false,
  clauses: {},
};

export function num(s: string): number | null {
  const n = parseFloat((s || '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 폼 상태 → 스키마 규격 계약 객체 (RALPH-README 매핑 지침). */
export function buildContract(f: FormState): Contract {
  const items: WageItem[] = [];
  const basisText = f.basisWritten ? '계약서 기재' : null;
  // 산출근거 시간은 적었을 때만 싣는다 — 비우면 키도 두지 않아 엔진이 형태를 추론한다(rules/wage.ts payBasis)
  const hours = num(f.basisHours);
  const basis = hours != null && hours > 0 ? { basis_hours: hours } : {};
  if (f.payType === 'hourly') {
    const hourly = num(f.hourlyWage);
    if (hourly != null) {
      items.push({
        code: 'BASE',
        label: '기본급',
        amount: hours != null && hours > 0 ? Math.round(hourly * hours) : hourly,
        ...basis,
        basis_text: basisText,
        ...(f.weeklyHolidayIncluded ? { includes_weekly_holiday: f.weeklyHolidayIncluded === 'yes' } : {}),
      });
    }
  } else {
    const base = num(f.baseWage);
    if (base != null) {
      items.push({ code: 'BASE', label: '기본급', amount: base, ...basis, basis_text: basisText });
    }
  }
  const weeklyHolidayPay = num(f.weeklyHolidayPay);
  if (weeklyHolidayPay != null) {
    items.push({ code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: weeklyHolidayPay, basis_text: basisText });
  }
  const ot = num(f.otAmount);
  if (ot != null) {
    items.push({
      code: 'OT_WEEKDAY',
      label: '연장수당',
      amount: ot,
      basis_hours: num(f.otHours),
      basis_text: basisText,
    });
  }
  const holiday = num(f.holidayExtra);
  if (holiday != null) {
    items.push({ code: 'HOLIDAY_EXTRA', label: '휴일·추가수당', amount: holiday, basis_text: basisText });
  }
  const annual = num(f.annualLeavePay);
  if (annual != null) {
    items.push({ code: 'ANNUAL_LEAVE', label: '연차수당', amount: annual, basis_text: basisText });
  }

  const variants: WorkTimeVariant[] = f.hasVariants
    ? f.variants
        .filter((v) => num(v.perWeek) != null && v.start && v.end)
        .map((v) => ({ per_week: num(v.perWeek) ?? 0, start: v.start, end: v.end }))
    : [];
  const daily: DailySchedule[] = f.hasDaily
    ? f.daily.filter((d) => d.day && d.start && d.end).map((d) => ({ day: d.day, start: d.start, end: d.end }))
    : [];

  const breakMin = num(f.breakMinutes);
  const riskClauses: RiskClause[] = CLAUSE_ITEMS.filter((c) => f.clauses[c.tag]).map((c) => ({
    clause_ref: '체크리스트',
    text: c.label,
    tags: [c.tag],
  }));

  return {
    contract_id: 'web-form',
    workplace: { name: '', employee_count_5plus: f.fivePlus === '' ? null : f.fivePlus === 'yes' },
    employee: { name: '' },
    period: {
      start_date: f.startDate || null,
      end_date: f.periodType === 'fixed' ? f.endDate || null : null,
      indefinite: f.periodType === '' ? null : f.periodType === 'indefinite',
      probation:
        f.probation === ''
          ? null
          : f.probation === 'no'
            ? { applied: false }
            : {
                applied: true,
                months: num(f.probationMonths),
                wage_rate_pct: num(f.probationRate),
              },
    },
    job: f.jobWritten ? { location: '계약서 기재', duty: '계약서 기재' } : {},
    work_time: {
      days_per_week: num(f.daysPerWeek),
      start: f.workStart || null,
      end: f.workEnd || null,
      variants: variants.length > 0 ? variants : null,
      breaks: breakMin != null ? [{ minutes: breakMin }] : null,
      daily_schedules: daily.length > 0 ? daily : null,
      night_work: f.nightWork === '' ? null : f.nightWork === 'yes',
    },
    wage: {
      monthly_total: num(f.monthlyTotal),
      ...(f.payType ? { pay_type: f.payType } : {}),
      items,
      payday: f.payday || null,
      payment_method: f.paymentMethod || null,
    },
    holidays_leave: {
      weekly_rest: f.weeklyRest === '' ? null : '계약서 기재',
      weekly_rest_day_specified: f.weeklyRest === '' ? null : f.weeklyRest === 'specified',
      annual_leave_clause: f.annualLeaveClause ? '계약서 기재' : null,
    },
    risk_clauses: riskClauses,
  };
}
