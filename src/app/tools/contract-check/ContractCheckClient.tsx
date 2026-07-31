'use client';

// 근로계약서 자가진단 — 4스텝 간이 폼 → Contract 객체 → normalize() → checkContract().
// 모든 처리는 브라우저 내에서만 수행(서버 전송·저장 없음). 모르는 항목은 건너뛰기 허용(needs_data).

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Printer, ShieldCheck } from 'lucide-react';
import rulesCatalog from '@/lib/contract-check/data/compliance_rules.json';
import { amendContract } from '@/lib/contract-check/amendments';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type {
  Contract,
  Finding,
  FindingSeverity,
  FindingStatus,
  RiskClause,
  WageItem,
  WorkTimeVariant,
  DailySchedule,
} from '@/lib/contract-check/types';

const RULE_META: Record<string, { name: string; statute: string }> = Object.fromEntries(
  rulesCatalog.rules.map((r) => [r.code, { name: r.name, statute: r.statute }]),
);

const STATUS_LABEL: Record<FindingStatus, string> = {
  violation: '위반',
  risk: '리스크',
  ok: '적정',
  needs_data: '자료 필요',
};

const STATUS_STYLE: Record<FindingStatus, { bg: string; fg: string }> = {
  violation: { bg: '#fee2e2', fg: '#b91c1c' },
  risk: { bg: '#fef3c7', fg: '#b45309' },
  ok: { bg: '#dcfce7', fg: '#15803d' },
  needs_data: { bg: '#e2e8f0', fg: '#475569' },
};

const STATUS_ORDER: FindingStatus[] = ['violation', 'risk', 'needs_data', 'ok'];
const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'major', 'minor', 'info'];

/** 문제조항 체크리스트 — 각 항목은 risk_clauses 태그로 매핑된다. */
const CLAUSE_ITEMS: { tag: string; label: string; hint: string }[] = [
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

interface VariantRow {
  perWeek: string;
  start: string;
  end: string;
}

interface DailyRow {
  day: string;
  start: string;
  end: string;
}

interface FormState {
  // ① 기본
  periodType: '' | 'indefinite' | 'fixed';
  startDate: string;
  endDate: string;
  probation: '' | 'yes' | 'no';
  probationMonths: string;
  probationRate: string;
  monthlyTotal: string;
  baseWage: string;
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

const INITIAL: FormState = {
  periodType: '',
  startDate: '',
  endDate: '',
  probation: '',
  probationMonths: '',
  probationRate: '',
  monthlyTotal: '',
  baseWage: '',
  daysPerWeek: '',
  workStart: '',
  workEnd: '',
  hasVariants: false,
  variants: [{ perWeek: '', start: '', end: '' }],
  breakMinutes: '',
  nightWork: '',
  hasDaily: false,
  daily: [{ day: '월', start: '', end: '' }],
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

function num(s: string): number | null {
  const n = parseFloat((s || '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 폼 상태 → 스키마 규격 계약 객체 (RALPH-README 매핑 지침). */
export function buildContract(f: FormState): Contract {
  const items: WageItem[] = [];
  const basisText = f.basisWritten ? '계약서 기재' : null;
  const base = num(f.baseWage);
  if (base != null) {
    items.push({ code: 'BASE', label: '기본급', amount: base, basis_text: basisText });
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
    workplace: { name: '' },
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

// ── UI 조각 ──────────────────────────────────────────────────────────

const STEP_LABELS = ['기본', '근로시간', '임금·지급', '문제조항', '결과'];

function StepHeader({ current }: { current: number }) {
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full font-semibold"
            style={
              i + 1 < current
                ? { backgroundColor: '#facc15', color: '#fff' }
                : i + 1 === current
                  ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-bg-primary)' }
                  : { backgroundColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }
            }
          >
            {i + 1}
          </span>
          <span
            style={
              i + 1 === current
                ? { fontWeight: 600, color: 'var(--color-text-primary)' }
                : { color: 'var(--color-text-secondary)', fontWeight: 500 }
            }
          >
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && <ChevronRight className="h-3 w-3" />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {label}
      </span>
      {hint && (
        <div className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border px-3 py-2 text-base focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200';
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
  color: 'var(--color-text-primary)',
};

function TextInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  type = 'text',
  suffix,
  numeric,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  type?: string;
  suffix?: string;
  numeric?: boolean;
}) {
  const display = (() => {
    if (!numeric) return value;
    const n = parseFloat((value || '').replace(/[,\s]/g, ''));
    if (!Number.isFinite(n)) return value;
    if (suffix === '원' && n >= 1000) return n.toLocaleString('ko-KR');
    return value;
  })();
  return (
    <div className="flex items-center gap-2">
      <input
        type={type}
        inputMode={numeric ? 'decimal' : undefined}
        aria-label={ariaLabel}
        value={display}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        style={inputStyle}
      />
      {suffix && (
        <span className="flex-shrink-0 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'border-yellow-400 bg-yellow-50' : 'hover:border-slate-400'
            }`}
            style={
              active
                ? { color: '#854d0e' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        checked ? 'border-yellow-400 bg-yellow-50' : 'hover:border-slate-400'
      }`}
      style={checked ? undefined : { borderColor: 'var(--color-border)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-yellow-500"
      />
      <span>
        <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: FindingStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export default function ContractCheckClient() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [amendMap, setAmendMap] = useState<Record<string, string>>({});

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));

  const runCheck = () => {
    const [contract] = normalize(buildContract(form));
    const sorted = [...checkContract(contract)].sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        a.rule_code.localeCompare(b.rule_code),
    );
    setAmendMap(
      Object.fromEntries(amendContract(contract, sorted).rows.map((r) => [r.rule_code, r.amendment])),
    );
    setFindings(sorted);
    setStep(5);
  };

  const restart = () => {
    setFindings(null);
    setAmendMap({});
    setStep(1);
  };

  const counts =
    findings?.reduce(
      (acc, f) => {
        acc[f.status] += 1;
        return acc;
      },
      { violation: 0, risk: 0, ok: 0, needs_data: 0 } as Record<FindingStatus, number>,
    ) ?? null;

  return (
    <div className="rounded-xl border-2 border-slate-200 p-5">
      <div
        className="mb-5 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green-600" />
        입력 내용은 브라우저를 떠나지 않습니다 — 서버 전송·저장 없이 이 화면 안에서만 계산합니다.
      </div>

      <StepHeader current={step} />

      {step === 1 && (
        <div className="space-y-5">
          <Field label="계약기간" hint="계약서에 적힌 기간 형태를 골라 주세요.">
            <Choice
              options={[
                { value: 'indefinite', label: '기간 정함 없음' },
                { value: 'fixed', label: '기간제(종료일 있음)' },
                { value: '', label: '모름·건너뛰기' },
              ]}
              value={form.periodType}
              onChange={(v) => patch({ periodType: v })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="계약 시작일">
              <TextInput
                type="date"
                ariaLabel="계약 시작일"
                value={form.startDate}
                onChange={(v) => patch({ startDate: v })}
              />
            </Field>
            {form.periodType === 'fixed' && (
              <Field label="계약 종료일">
                <TextInput
                  type="date"
                  ariaLabel="계약 종료일"
                  value={form.endDate}
                  onChange={(v) => patch({ endDate: v })}
                />
              </Field>
            )}
          </div>
          <Field label="수습 기간" hint="수습 중 임금을 깎는 약정이 있는지 확인합니다.">
            <Choice
              options={[
                { value: 'yes', label: '있음' },
                { value: 'no', label: '없음' },
                { value: '', label: '모름·건너뛰기' },
              ]}
              value={form.probation}
              onChange={(v) => patch({ probation: v })}
            />
          </Field>
          {form.probation === 'yes' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="수습 개월 수">
                <TextInput
                  ariaLabel="수습 개월 수"
                  numeric
                  suffix="개월"
                  placeholder="예: 3"
                  value={form.probationMonths}
                  onChange={(v) => patch({ probationMonths: v })}
                />
              </Field>
              <Field label="수습 기간 임금 비율" hint="예: 90 (정상 임금의 90%를 지급)">
                <TextInput
                  ariaLabel="수습 기간 임금 비율"
                  numeric
                  suffix="%"
                  placeholder="예: 90"
                  value={form.probationRate}
                  onChange={(v) => patch({ probationRate: v })}
                />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="월급여 총액" hint="세전 금액. 모르면 비워 두세요.">
              <TextInput
                ariaLabel="월급여 총액"
                numeric
                suffix="원"
                placeholder="예: 2,200,000"
                value={form.monthlyTotal}
                onChange={(v) => patch({ monthlyTotal: v })}
              />
            </Field>
            <Field label="기본급" hint="수당을 뺀 기본급. 최저임금 판정에 사용됩니다.">
              <TextInput
                ariaLabel="기본급"
                numeric
                suffix="원"
                placeholder="예: 2,096,270"
                value={form.baseWage}
                onChange={(v) => patch({ baseWage: v })}
              />
            </Field>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="주 근무일수">
              <TextInput
                ariaLabel="주 근무일수"
                numeric
                suffix="일"
                placeholder="예: 5"
                value={form.daysPerWeek}
                onChange={(v) => patch({ daysPerWeek: v })}
              />
            </Field>
            <Field label="출근 시각">
              <TextInput
                type="time"
                ariaLabel="출근 시각"
                value={form.workStart}
                onChange={(v) => patch({ workStart: v })}
              />
            </Field>
            <Field label="퇴근 시각">
              <TextInput
                type="time"
                ariaLabel="퇴근 시각"
                value={form.workEnd}
                onChange={(v) => patch({ workEnd: v })}
              />
            </Field>
          </div>
          <CheckRow
            checked={form.hasVariants}
            onChange={(v) => patch({ hasVariants: v })}
            label="요일에 따라 근무시간이 다른 날이 있어요"
            hint="예: 금요일만 단축 근무"
          />
          {form.hasVariants && (
            <div className="space-y-3 rounded-lg border border-dashed p-3" style={{ borderColor: 'var(--color-border)' }}>
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextInput
                    ariaLabel={`다른 근무 주당 일수 ${i + 1}`}
                    numeric
                    suffix="일/주"
                    placeholder="주당 며칠"
                    value={v.perWeek}
                    onChange={(val) =>
                      patch({ variants: form.variants.map((x, j) => (j === i ? { ...x, perWeek: val } : x)) })
                    }
                  />
                  <TextInput
                    type="time"
                    ariaLabel={`다른 근무 출근 시각 ${i + 1}`}
                    value={v.start}
                    onChange={(val) =>
                      patch({ variants: form.variants.map((x, j) => (j === i ? { ...x, start: val } : x)) })
                    }
                  />
                  <TextInput
                    type="time"
                    ariaLabel={`다른 근무 퇴근 시각 ${i + 1}`}
                    value={v.end}
                    onChange={(val) =>
                      patch({ variants: form.variants.map((x, j) => (j === i ? { ...x, end: val } : x)) })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-sm font-semibold text-yellow-700 hover:underline"
                onClick={() => patch({ variants: [...form.variants, { perWeek: '', start: '', end: '' }] })}
              >
                + 근무 형태 추가
              </button>
            </div>
          )}
          <Field label="하루 휴게시간" hint="점심시간 등 쉬는 시간의 하루 합계(분). 4시간 근무당 30분 이상이 법정 기준입니다.">
            <TextInput
              ariaLabel="하루 휴게시간"
              numeric
              suffix="분"
              placeholder="예: 60"
              value={form.breakMinutes}
              onChange={(v) => patch({ breakMinutes: v })}
            />
          </Field>
          <Field label="야간근무(22시~06시)가 있나요?">
            <Choice
              options={[
                { value: 'yes', label: '있음' },
                { value: 'no', label: '없음' },
                { value: '', label: '모름·건너뛰기' },
              ]}
              value={form.nightWork}
              onChange={(v) => patch({ nightWork: v })}
            />
          </Field>
          <CheckRow
            checked={form.hasDaily}
            onChange={(v) => patch({ hasDaily: v })}
            label="주 40시간 미만 단시간 근로이고, 계약서에 요일별 근무시간이 따로 적혀 있어요"
            hint="적혀 있는 요일별 시간을 그대로 입력하면 초과근로 판정에 사용됩니다."
          />
          {form.hasDaily && (
            <div className="space-y-3 rounded-lg border border-dashed p-3" style={{ borderColor: 'var(--color-border)' }}>
              {form.daily.map((d, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextInput
                    ariaLabel={`근로일 ${i + 1}`}
                    placeholder="요일 (예: 월)"
                    value={d.day}
                    onChange={(val) => patch({ daily: form.daily.map((x, j) => (j === i ? { ...x, day: val } : x)) })}
                  />
                  <TextInput
                    type="time"
                    ariaLabel={`근로일 ${i + 1} 시작`}
                    value={d.start}
                    onChange={(val) => patch({ daily: form.daily.map((x, j) => (j === i ? { ...x, start: val } : x)) })}
                  />
                  <TextInput
                    type="time"
                    ariaLabel={`근로일 ${i + 1} 종료`}
                    value={d.end}
                    onChange={(val) => patch({ daily: form.daily.map((x, j) => (j === i ? { ...x, end: val } : x)) })}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-sm font-semibold text-yellow-700 hover:underline"
                onClick={() => patch({ daily: [...form.daily, { day: '', start: '', end: '' }] })}
              >
                + 근로일 추가
              </button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="연장수당 금액(월)" hint="계약서에 고정 연장수당이 있으면 입력. 없으면 비워 두세요.">
              <TextInput
                ariaLabel="연장수당 금액"
                numeric
                suffix="원"
                value={form.otAmount}
                onChange={(v) => patch({ otAmount: v })}
              />
            </Field>
            <Field label="연장근로 환산시간(월)" hint="계약서에 적힌 시간 (예: 20). 모르면 비워 두세요.">
              <TextInput
                ariaLabel="연장근로 환산시간"
                numeric
                suffix="시간"
                value={form.otHours}
                onChange={(v) => patch({ otHours: v })}
              />
            </Field>
            <Field label="휴일·추가수당 금액(월)">
              <TextInput
                ariaLabel="휴일 추가수당 금액"
                numeric
                suffix="원"
                value={form.holidayExtra}
                onChange={(v) => patch({ holidayExtra: v })}
              />
            </Field>
            <Field label="연차수당 금액(월)">
              <TextInput
                ariaLabel="연차수당 금액"
                numeric
                suffix="원"
                value={form.annualLeavePay}
                onChange={(v) => patch({ annualLeavePay: v })}
              />
            </Field>
          </div>
          <CheckRow
            checked={form.basisWritten}
            onChange={(v) => patch({ basisWritten: v })}
            label="각 임금 항목의 계산방법(산출근거)이 계약서에 적혀 있어요"
            hint='예: "기본급 = 시급 × 209시간" 같은 산식이 있는 경우'
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="임금 지급일" hint='예: "매월 10일"'>
              <TextInput
                ariaLabel="임금 지급일"
                placeholder="예: 매월 10일"
                value={form.payday}
                onChange={(v) => patch({ payday: v })}
              />
            </Field>
            <Field label="지급 방법">
              <Choice
                options={[
                  { value: '계좌이체', label: '계좌이체' },
                  { value: '현금', label: '현금' },
                  { value: '', label: '모름·건너뛰기' },
                ]}
                value={form.paymentMethod}
                onChange={(v) => patch({ paymentMethod: v })}
              />
            </Field>
          </div>
          <Field label="주휴일(유급 휴일)이 계약서에 어떻게 적혀 있나요?">
            <Choice
              options={[
                { value: 'specified', label: '요일까지 특정됨 (예: 일요일)' },
                { value: 'unspecified', label: '조항은 있으나 요일 미특정' },
                { value: '', label: '없음·모름' },
              ]}
              value={form.weeklyRest}
              onChange={(v) => patch({ weeklyRest: v })}
            />
          </Field>
          <div className="space-y-3">
            <CheckRow
              checked={form.annualLeaveClause}
              onChange={(v) => patch({ annualLeaveClause: v })}
              label="연차유급휴가 조항이 계약서에 있어요"
            />
            <CheckRow
              checked={form.jobWritten}
              onChange={(v) => patch({ jobWritten: v })}
              label="일하는 장소와 담당 업무가 계약서에 적혀 있어요"
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            계약서에 아래와 같은 조항이 있으면 체크해 주세요. 하나도 없으면 그대로 결과를 확인하면 됩니다.
          </p>
          {CLAUSE_ITEMS.map((c) => (
            <CheckRow
              key={c.tag}
              checked={!!form.clauses[c.tag]}
              onChange={(v) => patch({ clauses: { ...form.clauses, [c.tag]: v } })}
              label={c.label}
              hint={c.hint}
            />
          ))}
        </div>
      )}

      {step === 5 && findings && counts && (
        <div id="cc-print-area">
          <style>{`@media print {
            body * { visibility: hidden; }
            #cc-print-area, #cc-print-area * { visibility: visible; }
            #cc-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
            #cc-print-area .print-hide { display: none !important; }
          }`}</style>
          <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            점검 결과
          </h2>
          <div className="mb-5 flex flex-wrap gap-2 text-sm font-semibold">
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#fee2e2', color: '#b91c1c' }}>
              위반 {counts.violation}
            </span>
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
              리스크 {counts.risk}
            </span>
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
              적정 {counts.ok}
            </span>
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#e2e8f0', color: '#475569' }}>
              자료 필요 {counts.needs_data}
            </span>
          </div>
          <ul className="space-y-2">
            {findings.map((f) => (
              <li
                key={f.rule_code}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={f.status} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {RULE_META[f.rule_code]?.name ?? f.rule_code}
                  </span>
                  {f.statute && (
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {f.statute}
                    </span>
                  )}
                </div>
                {f.detail && (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {f.status === 'needs_data' ? `입력하면 판정됩니다 — ${f.detail}` : f.detail}
                  </p>
                )}
                {amendMap[f.rule_code] && (
                  <p
                    className="mt-2 rounded-md bg-slate-50 p-2 text-xs leading-relaxed dark:bg-slate-800"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      수정 방향:{' '}
                    </span>
                    {amendMap[f.rule_code]}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="print-hide mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="flex-1 rounded-lg bg-yellow-400 px-5 py-3 text-center text-sm font-bold text-slate-900 hover:bg-yellow-300"
            >
              전문가에게 계약서 검토 요청
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold hover:border-slate-400"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <Printer className="h-4 w-4" />
              결과 인쇄
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            본 결과는 입력하신 내용만으로 판정한 간이 자가점검이며 법률자문이 아닙니다. 실제 계약서
            문안과 근무 실태에 따라 판정이 달라질 수 있으므로, 정확한 판단이 필요하면 노무사 등
            전문가의 검토를 받아 주세요.
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        {step > 1 && step < 5 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:border-slate-400"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            이전
          </button>
        ) : (
          <span />
        )}
        {step < 4 && (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded-lg bg-yellow-400 px-5 py-2 text-sm font-bold text-slate-900 hover:bg-yellow-300"
          >
            다음
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            onClick={runCheck}
            className="rounded-lg bg-yellow-400 px-5 py-2 text-sm font-bold text-slate-900 hover:bg-yellow-300"
          >
            결과 보기
          </button>
        )}
        {step === 5 && (
          <button
            type="button"
            onClick={restart}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:border-slate-400"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            다시 입력하기
          </button>
        )}
      </div>
    </div>
  );
}
