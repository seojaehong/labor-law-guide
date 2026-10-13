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
  months?: number | null;
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
  break_total_minutes?: number | null;
  weekly_actual_hours?: number | null;
  weekly_overtime_hours?: number | null;
  night_work?: boolean | null;
  flexible_clause?: string | null;
}

export type WageItemCode =
  | 'BASE'
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
}

export interface Wage {
  monthly_total?: number | null;
  ordinary_hourly_rate?: number | null;
  inclusive_wage?: boolean | null;
  items?: WageItem[];
  pay_period?: string | null;
  payday?: string | null;
  payment_method?: string | null;
  severance_clause?: string | null;
  public_holiday_included?: boolean | null;
  public_holiday_note?: string | null;
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
