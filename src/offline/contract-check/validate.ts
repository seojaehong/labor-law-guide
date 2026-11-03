// 오프라인판 — 붙여넣은 JSON 의 모양·형식 검사.
//
// 받는 것: 계약 객체 1건 · 계약 객체 목록 · fixtures 형식({common, contracts}).
// 거절(errors): null·숫자·문자열·불리언·빈 목록·빈 객체·객체 아닌 목록 원소·알아볼 칸이 하나도 없는 객체,
//              그리고 칸 형식 위반(불리언은 true/false, 시각 HH:MM, 날짜 YYYY-MM-DD, 숫자는 따옴표 없이).
// 경고(warnings): 모르는 칸 — 점검은 그대로 하되 그 칸은 쓰지 않는다고 알린다.
// null 은 「비워 둠」으로 본다(어느 칸이든 허용).

type Kind = 'string' | 'number' | 'boolean' | 'date' | 'time' | 'any';
type Spec = Kind | { obj: Shape } | { arr: Spec } | { oneOf: readonly string[] };
interface Shape {
  [key: string]: Spec;
}

const EMPLOYMENT_TYPES = ['regular', 'fixed_term', 'part_time', 'fixed_term_part_time'] as const;
const WAGE_CODES = [
  'BASE',
  'WEEKLY_HOLIDAY',
  'OT_WEEKDAY',
  'OT_WEEKEND',
  'ANNUAL_LEAVE',
  'HOLIDAY_EXTRA',
  'NIGHT',
  'MEAL',
  'BONUS',
  'OTHER',
] as const;

const WORKPLACE: Shape = {
  name: 'string',
  brand: 'string',
  branch: 'string',
  biz_reg_no: 'string',
  owner_name: 'string',
  address: 'string',
  phone: 'string',
  employee_count_5plus: 'boolean',
};
const EMPLOYEE: Shape = {
  name: 'string',
  birth_date: 'date',
  gender: { oneOf: ['M', 'F'] },
  rrn_masked: 'string',
  address: 'string',
  phone: 'string',
  hire_date: 'date',
  is_foreign: 'boolean',
  is_minor: 'boolean',
  employment_type: { oneOf: EMPLOYMENT_TYPES },
};
const PROBATION: Shape = {
  applied: 'boolean',
  months: 'number',
  wage_rate_pct: 'number',
  wage_amount: 'number',
  simple_labor_job: 'boolean',
  note: 'string',
};
const PERIOD: Shape = {
  start_date: 'date',
  end_date: 'date',
  indefinite: 'boolean',
  probation: { obj: PROBATION },
};
const JOB: Shape = { location: 'string', duty: 'string', duty_change_clause: 'string' };
const WORK_TIME: Shape = {
  days_per_week: 'number',
  start: 'time',
  end: 'time',
  variants: { arr: { obj: { label: 'string', per_week: 'number', start: 'time', end: 'time' } } },
  breaks: { arr: { obj: { from: 'time', to: 'time', minutes: 'number' } } },
  daily_schedules: { arr: { obj: { day: 'string', start: 'time', end: 'time' } } },
  break_total_minutes: 'number',
  weekly_actual_hours: 'number',
  weekly_overtime_hours: 'number',
  weekly_scheduled_hours: 'number',
  weekly_scheduled_days: 'number',
  weekly_scheduled_source: { oneOf: ['daily', 'actual'] },
  night_work: 'boolean',
  flexible_clause: 'string',
};
const WAGE_ITEM: Shape = {
  code: { oneOf: WAGE_CODES },
  label: 'string',
  amount: 'number',
  basis_hours: 'number',
  rate_multiplier: 'number',
  basis_text: 'string',
  includes_weekly_holiday: 'boolean',
};
const WAGE_FIELDS: Shape = {
  monthly_total: 'number',
  ordinary_hourly_rate: 'number',
  inclusive_wage: 'boolean',
  pay_type: { oneOf: ['hourly', 'monthly'] },
  items: { arr: { obj: WAGE_ITEM } },
  pay_period: 'string',
  payday: 'string',
  payment_method: 'string',
  severance_clause: 'string',
  public_holiday_included: 'boolean',
  public_holiday_note: 'string',
  amount_rounding_unit: 'number',
};
const HOLIDAYS_LEAVE: Shape = {
  weekly_rest: 'string',
  weekly_rest_day_specified: 'boolean',
  annual_leave_clause: 'string',
  annual_leave_prepaid_hours_per_month: 'number',
};
const RISK_CLAUSE: Shape = { clause_ref: 'string', text: 'string', tags: { arr: 'string' } };
const SIGNATURES: Shape = {
  written_date: 'date',
  employer_signed: 'boolean',
  employee_signed: 'boolean',
  copy_delivered_confirmed: 'boolean',
  retroactive_days: 'number',
};
const SOURCE: Shape = { files: { arr: 'string' }, captured_at: 'string', ocr_confidence_notes: 'string' };

const CONTRACT: Shape = {
  contract_id: 'string',
  schema_version: 'string',
  workplace: { obj: WORKPLACE },
  employee: { obj: EMPLOYEE },
  period: { obj: PERIOD },
  job: { obj: JOB },
  work_time: { obj: WORK_TIME },
  wage: { obj: WAGE_FIELDS },
  holidays_leave: { obj: HOLIDAYS_LEAVE },
  risk_clauses: { arr: { obj: RISK_CLAUSE } },
  signatures: { obj: SIGNATURES },
  source: { obj: SOURCE },
  expected_findings: { arr: 'any' },
};

/** fixtures 형식의 개별 계약 — common 에서 채워지는 칸을 빼고 *_extra 를 더한다 */
const FIXTURE_CONTRACT: Shape = {
  ...CONTRACT,
  wage: { obj: { ...WAGE_FIELDS, items_extra: { arr: { obj: WAGE_ITEM } } } },
  findings_extra: { arr: 'any' },
};
const FIXTURE_COMMON: Shape = {
  workplace: { obj: WORKPLACE },
  period_common: { obj: { indefinite: 'boolean', probation: { obj: PROBATION } } },
  work_time: { obj: WORK_TIME },
  wage_common: { obj: { ...WAGE_FIELDS, items_fixed: { arr: { obj: WAGE_ITEM } } } },
  holidays_leave: { obj: HOLIDAYS_LEAVE },
  risk_clauses: { arr: { obj: RISK_CLAUSE } },
  findings_common: { arr: 'any' },
};

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const SHAPE_HELP = '계약 정보는 { } 로 감싼 객체 1건이나, 객체들을 [ ] 로 묶은 목록이어야 합니다.';
const MAX_LINES = 20;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function describe(v: unknown): string {
  if (typeof v === 'string') return `"${v.length > 20 ? `${v.slice(0, 20)}…` : v}"(글자)`;
  if (Array.isArray(v)) return '목록';
  if (isPlainObject(v)) return '객체';
  return String(v);
}

function checkValue(spec: Spec, v: unknown, path: string, out: ValidationResult): void {
  if (v === null || v === undefined) return;
  if (typeof spec === 'string') {
    switch (spec) {
      case 'any':
        return;
      case 'string':
        if (typeof v !== 'string') out.errors.push(`${path}: 글자(따옴표로 감싼 값)로 적어 주세요 — 지금 ${describe(v)}`);
        return;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v))
          out.errors.push(`${path}: 숫자로 적어 주세요(따옴표·쉼표 없이, 예: 2156880) — 지금 ${describe(v)}`);
        return;
      case 'boolean':
        if (typeof v !== 'boolean')
          out.errors.push(`${path}: true 또는 false 로 적어 주세요(따옴표 없이) — 지금 ${describe(v)}`);
        return;
      case 'time':
        if (typeof v !== 'string' || !TIME_RE.test(v))
          out.errors.push(`${path}: 시각은 "HH:MM" 형식으로 적어 주세요(예: "09:00") — 지금 ${describe(v)}`);
        return;
      case 'date':
        if (typeof v !== 'string' || !isRealDate(v))
          out.errors.push(`${path}: 날짜는 "YYYY-MM-DD" 형식으로 적어 주세요(예: "2026-03-01") — 지금 ${describe(v)}`);
        return;
    }
  }
  if ('oneOf' in spec) {
    if (typeof v !== 'string' || !spec.oneOf.includes(v))
      out.errors.push(`${path}: ${spec.oneOf.join(' · ')} 중 하나로 적어 주세요 — 지금 ${describe(v)}`);
    return;
  }
  if ('arr' in spec) {
    if (!Array.isArray(v)) {
      out.errors.push(`${path}: [ ] 목록으로 적어 주세요 — 지금 ${describe(v)}`);
      return;
    }
    v.forEach((x, i) => checkValue(spec.arr, x, `${path}[${i}]`, out));
    return;
  }
  if (!isPlainObject(v)) {
    out.errors.push(`${path}: { } 객체로 적어 주세요 — 지금 ${describe(v)}`);
    return;
  }
  checkShape(spec.obj, v, path, out);
}

function checkShape(shape: Shape, obj: Record<string, unknown>, path: string, out: ValidationResult): void {
  for (const [k, v] of Object.entries(obj)) {
    const at = path ? `${path}.${k}` : k;
    const spec = shape[k];
    if (!spec) {
      out.warnings.push(`${at}: 모르는 칸이라 점검에 쓰지 않습니다(철자를 확인해 주세요)`);
      continue;
    }
    checkValue(spec, v, at, out);
  }
}

function checkContract(shape: Shape, v: unknown, label: string, path: string, out: ValidationResult): void {
  if (!isPlainObject(v)) {
    out.errors.push(`${label}이 객체가 아닙니다(지금 ${describe(v)}). ${SHAPE_HELP}`);
    return;
  }
  const keys = Object.keys(v);
  if (keys.length === 0) {
    out.errors.push(`${label}이 빈 객체입니다. 「빈 양식 넣기」로 칸 이름을 받아 채워 주세요.`);
    return;
  }
  if (!keys.some((k) => k in shape)) {
    out.errors.push(
      `${label}에서 알아볼 수 있는 칸이 없습니다(예: period, work_time, wage). 「빈 양식 넣기」로 칸 이름을 확인해 주세요.`,
    );
    return;
  }
  checkShape(shape, v, path, out);
}

/** 붙여넣은 값의 모양·형식을 본다. errors 가 하나라도 있으면 점검하지 않는다 */
export function validateInput(data: unknown): ValidationResult {
  const out: ValidationResult = { errors: [], warnings: [] };
  if (Array.isArray(data)) {
    if (data.length === 0) out.errors.push(`빈 목록입니다. ${SHAPE_HELP}`);
    data.forEach((c, i) => checkContract(CONTRACT, c, `${i + 1}번째 계약`, `[${i}]`, out));
  } else if (isPlainObject(data) && ('contracts' in data || 'common' in data)) {
    const { common, contracts, ...rest } = data;
    for (const k of Object.keys(rest)) out.warnings.push(`${k}: 모르는 칸이라 점검에 쓰지 않습니다(common·contracts 만 씁니다)`);
    if (!isPlainObject(common)) out.errors.push('common: fixtures 형식은 common 객체와 contracts 목록이 함께 있어야 합니다.');
    else checkShape(FIXTURE_COMMON, common, 'common', out);
    if (!Array.isArray(contracts) || contracts.length === 0) {
      out.errors.push('contracts: 계약을 1건 이상 담은 [ ] 목록이어야 합니다.');
    } else {
      contracts.forEach((c, i) => checkContract(FIXTURE_CONTRACT, c, `contracts[${i}]`, `contracts[${i}]`, out));
    }
  } else if (isPlainObject(data)) {
    checkContract(CONTRACT, data, '계약', '', out);
  } else {
    out.errors.push(`${SHAPE_HELP} 지금 붙여넣은 값은 ${describe(data)}입니다.`);
  }
  const cap = (xs: string[]) =>
    xs.length > MAX_LINES ? [...xs.slice(0, MAX_LINES), `… 외 ${xs.length - MAX_LINES}건`] : xs;
  return { errors: cap(out.errors), warnings: cap(out.warnings) };
}

/** 「빈 양식 넣기」 — 엔진이 읽는 칸을 모두 담은 뼈대(값은 비움). 그대로 점검하면 대부분 「자료 필요」로 나온다 */
export function blankTemplate(): Record<string, unknown> {
  return {
    contract_id: '',
    workplace: { name: '', employee_count_5plus: null },
    employee: { name: '', hire_date: null, is_minor: null, employment_type: null },
    period: {
      start_date: null,
      end_date: null,
      indefinite: null,
      probation: { applied: null, months: null, wage_rate_pct: null, simple_labor_job: null },
    },
    job: { location: null, duty: null },
    work_time: {
      days_per_week: null,
      start: null,
      end: null,
      breaks: [],
      variants: [],
      daily_schedules: [],
      night_work: null,
    },
    wage: {
      monthly_total: null,
      inclusive_wage: null,
      pay_type: null,
      payment_method: null,
      payday: null,
      items: [
        {
          code: 'BASE',
          label: '기본급',
          amount: null,
          basis_hours: null,
          rate_multiplier: null,
          basis_text: null,
          includes_weekly_holiday: null,
        },
      ],
    },
    holidays_leave: {
      weekly_rest: null,
      weekly_rest_day_specified: null,
      annual_leave_clause: null,
      annual_leave_prepaid_hours_per_month: null,
    },
    risk_clauses: [],
    signatures: {
      written_date: null,
      employer_signed: null,
      employee_signed: null,
      copy_delivered_confirmed: null,
    },
  };
}
