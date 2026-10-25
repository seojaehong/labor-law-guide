// 화면 입력 → 엔진 CheckInput. 엔진(src/lib/pay-check)은 고치지 않고, 엔진이 읽는 키 이름을 그대로 쓴다.
// 빈 칸은 키를 뺀다. 엔진(@486509a)은 키 없음·null·읽을 수 없는 날짜를 모두 「확인 못함」으로 보고 멈추므로,
// 빈 칸도 대조를 막는다. 「아니다」를 확인한 답은 false 로 명시해서 보낸다.

import { POLICY_FIELDS, ROUNDING_UNITS, type RoundingUnit } from '@/lib/pay-check/policies';
import type { CheckInput, Confirmed, PolicyId, Scenario } from '@/lib/pay-check/types';

/** 고르기 칸의 선택지. value 가 'omit' 이면 키를 넣지 않는다. */
export interface ChoiceOption {
  id: string;
  label: string;
  value: string | boolean | null | 'omit';
}

export type FieldDef =
  | { key: string; label: string; hint?: string; kind: 'number'; unit: string }
  | { key: string; label: string; hint?: string; kind: 'date' }
  /** 날짜 또는 「모름」(null). unknown() 으로 읽는 칸. */
  | { key: string; label: string; hint?: string; kind: 'date-or-unknown' }
  | { key: string; label: string; hint?: string; kind: 'choice'; options: ChoiceOption[] };

export type PickId = Scenario | 'NORMAL_MONTH' | 'MULTIPLE';

export const PICKS: { id: PickId; label: string; note: string }[] = [
  { id: 'MID_JOIN', label: '중도입사', note: '급여기간 중간에 들어온 달' },
  { id: 'MID_LEAVE', label: '중도퇴사', note: '급여기간 중간에 나간 달' },
  { id: 'ABSENCE_DEDUCTION', label: '결근 공제', note: '명세서에 결근 공제가 있다' },
  { id: 'HOURLY_WEEKLY_HOLIDAY', label: '시급제·주휴', note: '시급제 주휴수당' },
  { id: 'NORMAL_MONTH', label: '정상 근무월', note: '예외 없는 달' },
  { id: 'MULTIPLE', label: '두 가지 이상 겹침', note: '예: 중도입사 + 결근' },
];

export const OUTSIDE_NOTE: Record<'NORMAL_MONTH' | 'MULTIPLE', string> = {
  NORMAL_MONTH: '예외가 없는 정상 근무월은 지금 대조 범위 밖입니다. 이 도구는 한 달에 예외 하나가 있을 때 그 항목만 대조합니다.',
  MULTIPLE: '예외가 두 가지 이상 겹친 달은 지금 대조 범위 밖입니다. 겹친 예외를 합산하는 계산은 아직 없습니다.',
};

const YES_NO = (yes: string, no: string): ChoiceOption[] => [
  { id: 'yes', label: yes, value: true },
  { id: 'no', label: no, value: false },
];

const PERIOD: FieldDef[] = [
  { key: 'pay_period_start', label: '급여기간 첫날', hint: '명세서에 적힌 기간', kind: 'date' },
  { key: 'pay_period_end', label: '급여기간 마지막 날', hint: '명세서에 적힌 기간', kind: 'date' },
];

/** 예외마다 먼저 묻는 사실과 명세서 금액. 계산 기준에 딸린 칸(POLICY_FIELDS)은 기준을 고른 뒤에 붙는다. */
export const FACT_FIELDS: Record<Scenario, FieldDef[]> = {
  MID_JOIN: [
    { key: 'employment_start', label: '입사일', kind: 'date' },
    ...PERIOD,
    { key: 'payslip_amount', label: '명세서의 입사월 기본급', kind: 'number', unit: '원' },
  ],
  MID_LEAVE: [
    { key: 'employment_end', label: '퇴사일', kind: 'date' },
    ...PERIOD,
    { key: 'last_scheduled_workday', label: '마지막 소정근로일', hint: '모르면 「모름」', kind: 'date-or-unknown' },
    {
      key: 'paid_holiday_treatment',
      label: '퇴사월 유급휴일 처리',
      kind: 'choice',
      options: [
        { id: 'paid', label: '유급으로 처리됨', value: 'paid' },
        { id: 'unpaid', label: '무급으로 처리됨', value: 'unpaid' },
        { id: 'unknown', label: '모름', value: null },
      ],
    },
    { key: 'payslip_amount', label: '명세서의 퇴사월 기본급', kind: 'number', unit: '원' },
  ],
  ABSENCE_DEDUCTION: [
    { key: 'unpaid_absence_hours', label: '무급 결근시간', kind: 'number', unit: '시간' },
    { key: 'payslip_absence_deduction', label: '명세서 결근 공제액', hint: '−로 찍혀 있어도 그대로', kind: 'number', unit: '원' },
    {
      key: 'scheduled_workday_confirmed',
      label: '공제된 날이 소정근로일인지',
      kind: 'choice',
      options: YES_NO('근무표로 소정근로일임을 확인함', '확인하지 못함'),
    },
    {
      key: 'paid_leave_or_holiday',
      label: '그날이 유급휴가·유급휴일이었는지',
      kind: 'choice',
      options: [
        { id: 'no', label: '아니오 · 유급휴가·휴일이 아님을 확인함', value: false },
        { id: 'yes', label: '예 · 유급휴가·휴일로 확인됨', value: true },
        { id: 'unknown', label: '모름 · 확인하지 못함', value: null },
      ],
    },
  ],
  HOURLY_WEEKLY_HOLIDAY: [
    { key: 'four_week_scheduled_hours', label: '평균 기간의 약정 소정근로시간 합계', hint: '보통 4주 · 근로한 기간이 4주 미만이면 그 기간 · 계약서에 적힌 시간', kind: 'number', unit: '시간' },
    { key: 'averaging_weeks', label: '평균을 낸 주수', hint: '보통 4 · 근로한 기간이 4주 미만이면 그 주수(예: 2)', kind: 'number', unit: '주' },
    { key: 'temporary_actual_hours_in_one_week', label: '대타로 실제 일한 그 주의 시간', hint: '대타가 있었을 때만', kind: 'number', unit: '시간' },
    {
      key: 'contract_change_confirmed',
      label: '대타 시간이 계약상 약정시간 변경인지',
      hint: '대타가 있었을 때만',
      kind: 'choice',
      options: YES_NO('약정시간 변경으로 확인함', '변경이 아니거나 확인하지 못함'),
    },
    {
      key: 'employment_continued_for_7_days',
      label: '그 주 7일 동안 계약이 이어졌는지',
      kind: 'choice',
      options: YES_NO('이어짐', '이어지지 않았거나 모름'),
    },
    {
      key: 'weekly_holiday_designated',
      label: '주휴일 지정',
      kind: 'choice',
      options: [
        { id: 'yes', label: '계약·규칙에 지정됨', value: true },
        { id: 'no', label: '지정되지 않음을 확인함', value: false },
        { id: 'unknown', label: '모름', value: null },
      ],
    },
    {
      key: 'all_scheduled_days_attended',
      label: '그 주 소정근로일 개근',
      kind: 'choice',
      options: YES_NO('근무표로 개근 확인함', '개근 아님 또는 확인하지 못함'),
    },
    { key: 'payslip_weekly_holiday_pay', label: '명세서 주휴 금액', kind: 'number', unit: '원' },
  ],
};

/** 계산 기준 칸. 키는 엔진 POLICY_FIELDS 와 같다. */
const POLICY_FIELD_DEF: Record<string, FieldDef> = {
  hourly_rate: { key: 'hourly_rate', label: '확정 시급', kind: 'number', unit: '원' },
  paid_hours: { key: 'paid_hours', label: '유급 처리된 시간', kind: 'number', unit: '시간' },
  monthly_base_pay: { key: 'monthly_base_pay', label: '월 기본급', kind: 'number', unit: '원' },
  eligible_days: { key: 'eligible_days', label: '인정일수', hint: '30일 기준으로 셀 날수', kind: 'number', unit: '일' },
  unpaid_absence_hours: { key: 'unpaid_absence_hours', label: '무급 결근시간', kind: 'number', unit: '시간' },
  four_week_scheduled_hours: { key: 'four_week_scheduled_hours', label: '평균 기간의 약정 소정근로시간 합계', kind: 'number', unit: '시간' },
  full_time_scheduled_days_4w: { key: 'full_time_scheduled_days_4w', label: '같은 기간 통상 근로자의 소정근로일수', hint: '주 5일 근무 사업장이면 4주에 보통 20일', kind: 'number', unit: '일' },
  holiday_weeks: { key: 'holiday_weeks', label: '명세서 주휴 항목이 몇 주분인지', kind: 'number', unit: '주' },
};

/** 예외마다 쓸 수 있는 회사 계산 기준 (엔진 check.ts POLICIES_FOR 와 같아야 한다 — 시험으로 고정). */
export const BASES: Record<Scenario, { id: PolicyId; label: string; note: string }[]> = {
  MID_JOIN: [
    { id: 'HOUR_ACTUAL', label: '시간 기준', note: '시급 × 유급 처리된 시간' },
    { id: 'DAY_30', label: '30일 기준', note: '월 기본급 ÷ 30 × 인정일수' },
  ],
  MID_LEAVE: [
    { id: 'HOUR_ACTUAL', label: '시간 기준', note: '시급 × 유급 처리된 시간' },
    { id: 'DAY_30', label: '30일 기준', note: '월 기본급 ÷ 30 × 인정일수' },
  ],
  ABSENCE_DEDUCTION: [{ id: 'ABSENCE_HOUR', label: '시간 단위 결근 공제', note: '시급 × 무급 결근시간' }],
  HOURLY_WEEKLY_HOLIDAY: [
    { id: 'WEEKLY_HOLIDAY_FIXED', label: '주휴 고정 스케줄', note: '시급 × 1일 소정근로시간 × 주수' },
  ],
};

export type Rounding = 'UNKNOWN' | 'FLOOR' | 'ROUND' | 'CEIL';
export const ROUNDINGS: { id: Rounding; label: string }[] = [
  { id: 'UNKNOWN', label: '모름' },
  { id: 'FLOOR', label: '버림' },
  { id: 'ROUND', label: '반올림' },
  { id: 'CEIL', label: '올림' },
];

/** 끝수 처리 단위. 목록은 엔진 ROUNDING_UNITS(1·10·100원)를 그대로 쓴다. null = 모름. */
export const ROUNDING_UNIT_OPTIONS: { id: RoundingUnit | null; label: string }[] = [
  { id: null, label: '모름' },
  ...ROUNDING_UNITS.map((u) => ({ id: u, label: `${u}원 단위` })),
];

/** 이 예외·기준에서 보여줄 칸. 사실 칸에 이미 있는 키는 한 번만 묻는다. */
export function fieldsFor(s: Scenario, p: PolicyId | null): { facts: FieldDef[]; basis: FieldDef[] } {
  const facts = FACT_FIELDS[s];
  const seen = new Set(facts.map((f) => f.key));
  const basis = p ? POLICY_FIELDS[p].filter((k) => !seen.has(k)).map((k) => POLICY_FIELD_DEF[k]!) : [];
  return { facts, basis };
}

/** 쉼표·공백을 뺀 숫자. 빈 칸·숫자가 아닌 값은 null. */
export function parseNumber(raw: string): number | null {
  const t = raw.replace(/[,\s원]/g, '').replace(/^−/, '-');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 'unknown' 은 date-or-unknown 칸의 「모름」 표시. */
export const UNKNOWN_DATE = 'unknown';

export interface FormState {
  scenario: Scenario;
  values: Record<string, string>;
  policy: PolicyId | null;
  rounding: Rounding;
  /** 끝수 처리 단위(원). 없거나 null 이면 모름. */
  roundingUnit?: RoundingUnit | null;
  /** 고른 계산 기준을 회사 문서에서 확인했는지. 없거나 null 이면 답하지 않음 — 「기준이 있음」과 다른 사실이다 (261022 결정). */
  basisDocumented?: boolean | null;
}

export function buildInput(f: FormState): CheckInput {
  const { facts, basis } = fieldsFor(f.scenario, f.policy);
  const confirmed: Confirmed = {};
  for (const def of [...facts, ...basis]) {
    const raw = (f.values[def.key] ?? '').trim();
    if (raw === '') continue;
    if (def.kind === 'number') {
      const n = parseNumber(raw);
      if (n !== null) confirmed[def.key] = n;
    } else if (def.kind === 'date') {
      confirmed[def.key] = raw;
    } else if (def.kind === 'date-or-unknown') {
      confirmed[def.key] = raw === UNKNOWN_DATE ? null : raw;
    } else {
      const opt = def.options.find((o) => o.id === raw);
      if (opt && opt.value !== 'omit') confirmed[def.key] = opt.value;
    }
  }
  if (f.policy && typeof f.basisDocumented === 'boolean') confirmed.calculation_basis_documented = f.basisDocumented;
  if (f.rounding !== 'UNKNOWN') confirmed.rounding = f.rounding;
  if (f.roundingUnit != null) confirmed.rounding_unit = f.roundingUnit;
  return { scenario: f.scenario, confirmed, policy_id: f.policy };
}
