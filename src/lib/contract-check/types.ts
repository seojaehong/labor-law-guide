// data/employment_contract.schema.json v1.1 대응 타입 + 룰엔진 Finding 타입.

export type EmploymentType =
  | 'regular'
  | 'fixed_term'
  | 'part_time'
  | 'fixed_term_part_time';

export interface Workplace {
  name: string;
  brand?: string | null;
  branch?: string | null;
  biz_reg_no?: string | null;
  owner_name?: string | null;
  address?: string | null;
  phone?: string | null;
  employee_count_5plus?: boolean | null;
}

export interface Employee {
  name: string;
  birth_date?: string | null;
  gender?: 'M' | 'F' | null;
  rrn_masked?: string | null;
  address?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  is_foreign?: boolean | null;
  is_minor?: boolean | null;
  employment_type?: EmploymentType | null;
}

export interface Probation {
  applied?: boolean | null;
  /** 수습 기간 전체(개월) */
  months?: number | null;
  /** 그중 임금을 감액하는 기간(개월). 비우면 수습 기간 전체를 감액 기간으로 본다(근로계약서 작성이 채운다 — 처음 3개월) */
  reduced_months?: number | null;
  wage_rate_pct?: number | null;
  wage_amount?: number | null;
  simple_labor_job?: boolean | null;
  note?: string | null;
}

export interface Period {
  start_date?: string | null;
  end_date?: string | null;
  indefinite?: boolean | null;
  probation?: Probation | null;
}

export interface Job {
  location?: string | null;
  duty?: string | null;
  duty_change_clause?: string | null;
}

export interface WorkTimeVariant {
  label?: string;
  per_week?: number;
  start?: string;
  end?: string;
}

export interface WorkBreak {
  from?: string;
  to?: string;
  minutes: number;
}

export interface DailySchedule {
  day: string;
  start: string;
  end: string;
}

export interface WorkTime {
  days_per_week?: number | null;
  start?: string | null;
  end?: string | null;
  variants?: WorkTimeVariant[] | null;
  breaks?: WorkBreak[] | null;
  daily_schedules?: DailySchedule[] | null;
  /** 사이트 폼(buildContract)이 요일·시업·종업을 덜 채워 버린 근로일별 행 수 — 이것이 있을 때만 행 수 불일치를
   * §17 누락이 아니라 「근로일별 시간 일부 미입력」으로 본다(JSON·사진 경로에는 없다) */
  daily_schedules_dropped?: number | null;
  break_total_minutes?: number | null;
  weekly_actual_hours?: number | null;
  weekly_overtime_hours?: number | null;
  /** 파생(normalize) — 휴게를 뺀 1주 소정근로시간. 요일별 근무표가 있으면 그 합, 없으면 weekly_actual_hours */
  weekly_scheduled_hours?: number | null;
  /** 파생(normalize) — 1주 소정근로일 수. 요일별 근무표가 있으면 그 수, 없으면 days_per_week */
  weekly_scheduled_days?: number | null;
  /** 파생(normalize) — 1주 소정의 출처. daily = 믿을 수 있는 요일별 근무표, actual = 시업·종업으로 계산한 실근로 */
  weekly_scheduled_source?: 'daily' | 'actual' | null;
  night_work?: boolean | null;
  flexible_clause?: string | null;
}

export type WageItemCode =
  | 'BASE'
  | 'WEEKLY_HOLIDAY'
  | 'OT_WEEKDAY'
  | 'OT_WEEKEND'
  | 'ANNUAL_LEAVE'
  | 'HOLIDAY_EXTRA'
  | 'NIGHT'
  | 'MEAL'
  | 'BONUS'
  | 'OTHER';

export interface WageItem {
  code: WageItemCode;
  label?: string;
  amount: number;
  basis_hours?: number | null;
  rate_multiplier?: number | null;
  basis_text?: string | null;
  /** BASE 전용 — 시급에 주휴수당이 포함돼 있다고 계약서에 표시됨(true)·미포함(false)·표시 없음(null) */
  includes_weekly_holiday?: boolean | null;
}

export interface Wage {
  monthly_total?: number | null;
  ordinary_hourly_rate?: number | null;
  inclusive_wage?: boolean | null;
  /** 임금 형태 — hourly(시급 × 시간)·monthly(월 고정급). 비우면 BASE 산출근거로 추론한다(rules/wage.ts payBasis) */
  pay_type?: 'hourly' | 'monthly' | null;
  items?: WageItem[];
  pay_period?: string | null;
  payday?: string | null;
  payment_method?: string | null;
  severance_clause?: string | null;
  public_holiday_included?: boolean | null;
  public_holiday_note?: string | null;
  /** 항목 금액을 이 단위(10·100원)로 올려 적었다는 표시 — 근로계약서 작성 도구가 넣는다. WAGE-MATH 가 그만큼 많은 쪽 차이를 받아준다 */
  amount_rounding_unit?: number | null;
}

export interface HolidaysLeave {
  weekly_rest?: string | null;
  weekly_rest_day_specified?: boolean | null;
  annual_leave_clause?: string | null;
  annual_leave_prepaid_hours_per_month?: number | null;
}

export interface RiskClause {
  clause_ref: string;
  text: string;
  tags?: string[];
}

export interface Signatures {
  written_date?: string | null;
  employer_signed?: boolean | null;
  employee_signed?: boolean | null;
  copy_delivered_confirmed?: boolean | null;
  retroactive_days?: number | null;
}

export interface Source {
  files?: string[];
  captured_at?: string | null;
  ocr_confidence_notes?: string | null;
}

export type FindingStatus = 'violation' | 'risk' | 'ok' | 'needs_data';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface Finding {
  rule_code: string;
  severity: FindingSeverity;
  status: FindingStatus;
  statute: string | null;
  detail: string | null;
}

export interface Contract {
  contract_id: string;
  schema_version?: string;
  workplace: Workplace;
  employee: Employee;
  period: Period;
  job?: Job;
  work_time: WorkTime;
  wage: Wage;
  holidays_leave?: HolidaysLeave;
  risk_clauses?: RiskClause[];
  signatures?: Signatures;
  source?: Source;
  /** fixtures의 findings_common + findings_extra — 골든테스트 정답지 */
  expected_findings?: Finding[];
}

/** fixtures 형식(common+contracts) 입력 */
export interface FixturesInput {
  common: {
    workplace: Workplace;
    period_common?: { indefinite?: boolean | null; probation?: Probation | null };
    work_time: WorkTime;
    wage_common?: Record<string, unknown> & { items_fixed?: WageItem[] };
    holidays_leave?: HolidaysLeave;
    risk_clauses?: RiskClause[];
    findings_common?: Finding[];
  };
  contracts: Array<
    Record<string, unknown> & {
      contract_id: string;
      wage?: Wage & { items_extra?: WageItem[] };
      findings_extra?: Finding[];
    }
  >;
}
