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
import type { Finding, FindingSeverity, FindingStatus } from '@/lib/contract-check/types';
import PhotoUploadCard from './PhotoUploadCard';
import { applyExtracted } from './extractMap';
import { CLAUSE_ITEMS, INITIAL, buildContract, type FormState } from './formState';

const RULE_META: Record<string, { name: string; statute: string }> = Object.fromEntries(
  rulesCatalog.rules.map((r) => [r.code, { name: r.name, statute: r.statute }]),
);

const STATUS_LABEL: Record<FindingStatus, string> = {
  violation: '위반',
  risk: '리스크',
  ok: '적정',
  needs_data: '자료 필요',
};

// DESIGN.md §6.4 배지 4변형(위험·주의·성공·중립). 값이 아니라 이름을 붙이는 교체다 —
// #dc2626·#059669 같은 전경색으로 "정리"하면 틴트 위 대비가 후퇴한다.
// 단 risk 잉크만 #b45309 → --color-warn-ink(#92400e)로 바뀐다(§6.4 "주의 잉크만은 예외", 4.51→6.37:1).
const STATUS_STYLE: Record<FindingStatus, { bg: string; fg: string }> = {
  violation: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-ink)' },
  risk: { bg: 'var(--color-warn-bg)', fg: 'var(--color-warn-ink)' },
  ok: { bg: 'var(--color-success-bg)', fg: 'var(--color-success-ink)' },
  needs_data: { bg: 'var(--grey-100)', fg: 'var(--grey-700)' },
};

const STATUS_ORDER: FindingStatus[] = ['violation', 'risk', 'needs_data', 'ok'];
const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'major', 'minor', 'info'];

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
                ? { backgroundColor: 'var(--color-brand-solid)', color: '#191f28' }
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

/** missing=true → 사진에서 못 읽은 항목. 직접 입력하도록 하이라이트한다. */
function Field({
  label,
  hint,
  missing,
  children,
}: {
  label: string;
  hint?: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={missing ? 'rounded-lg border-l-4 border-amber-400 bg-amber-50/60 py-2 pl-3 dark:bg-amber-950/20' : undefined}
    >
      <span className="mb-1 block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {label}
        {missing && (
          <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: 'var(--color-warn-bg)', color: 'var(--color-warn-ink)' }}>
            사진에서 못 읽음
          </span>
        )}
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
  'w-full rounded-lg border px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20';
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
              active
                ? 'border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]'
                : 'hover:border-slate-400'
            }`}
            style={
              active
                ? { color: 'var(--color-brand-ink)' }
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
        checked
          ? 'border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]'
          : 'hover:border-slate-400'
      }`}
      style={checked ? undefined : { borderColor: 'var(--color-border)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--brand-500)]"
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
  // 사진 추출 결과: null이면 아직 업로드 안 함(하이라이트·배너 없음).
  const [extracted, setExtracted] = useState<{
    filled: Set<string>;
    notes: string[];
    warnings: string[];
  } | null>(null);

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));

  /** 사진에서 못 읽은 항목인가 — 업로드한 뒤에만 하이라이트한다. */
  const miss = (key: string) => !!extracted && !extracted.filled.has(key);

  const onExtracted = (payload: unknown) => {
    const result = applyExtracted(payload);
    setForm(result.form);
    setExtracted({ filled: result.filled, notes: result.notes, warnings: result.warnings });
    setStep(1);
  };

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
    setExtracted(null);
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
        className="mb-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
        <span className="leading-relaxed">
          입력하신 내용은 저장되지 않습니다. 이 화면에서 계산에만 쓰이고, 창을 닫으면 사라집니다.
          <br />
          사진은 글자를 읽어내는 동안에만 서버를 거치고, 사진과 읽어낸 결과 모두 남기지 않습니다.
        </span>
      </div>

      {step < 5 && <PhotoUploadCard onExtracted={onExtracted} />}

      {extracted && step < 5 && (
        <div
          role="status"
          className="mb-5 rounded-lg px-3 py-2 text-xs leading-relaxed"
          style={{ backgroundColor: '#eff6ff', color: '#1e40af' }}
        >
          {extracted.filled.size === 0 ? (
            <span className="font-semibold">
              사진에서 인식된 항목이 없습니다. 더 밝고 선명한 사진으로 다시 시도하거나, 아래 폼에 직접
              입력해 주세요.
            </span>
          ) : (
            <span className="font-semibold">
              인식 결과를 확인·수정하세요 — 사진에서 읽은 값을 채워 두었습니다. 못 읽은 항목은
              「사진에서 못 읽음」으로 표시되니 직접 입력해 주세요.
            </span>
          )}
          {[...extracted.warnings, ...extracted.notes].map((m) => (
            <span key={m} className="mt-1 block">
              · {m}
            </span>
          ))}
        </div>
      )}

      <StepHeader current={step} />

      {step === 1 && (
        <div className="space-y-5">
          <Field missing={miss('periodType')} label="계약기간" hint="계약서에 적힌 기간 형태를 골라 주세요.">
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
            <Field missing={miss('startDate')} label="계약 시작일">
              <TextInput
                type="date"
                ariaLabel="계약 시작일"
                value={form.startDate}
                onChange={(v) => patch({ startDate: v })}
              />
            </Field>
            {form.periodType === 'fixed' && (
              <Field missing={miss('endDate')} label="계약 종료일">
                <TextInput
                  type="date"
                  ariaLabel="계약 종료일"
                  value={form.endDate}
                  onChange={(v) => patch({ endDate: v })}
                />
              </Field>
            )}
          </div>
          <Field missing={miss('probation')} label="수습 기간" hint="수습 중 임금을 깎는 약정이 있는지 확인합니다.">
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
              <Field missing={miss('probationMonths')} label="수습 개월 수">
                <TextInput
                  ariaLabel="수습 개월 수"
                  numeric
                  suffix="개월"
                  placeholder="예: 3"
                  value={form.probationMonths}
                  onChange={(v) => patch({ probationMonths: v })}
                />
              </Field>
              <Field missing={miss('probationRate')} label="수습 기간 임금 비율" hint="예: 90 (정상 임금의 90%를 지급)">
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
            <Field missing={miss('monthlyTotal')} label="월급여 총액" hint="세전 금액. 모르면 비워 두세요.">
              <TextInput
                ariaLabel="월급여 총액"
                numeric
                suffix="원"
                placeholder="예: 2,200,000"
                value={form.monthlyTotal}
                onChange={(v) => patch({ monthlyTotal: v })}
              />
            </Field>
            <Field missing={miss('baseWage')} label="기본급" hint="수당을 뺀 기본급. 최저임금 판정에 사용됩니다.">
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
            <Field missing={miss('daysPerWeek')} label="주 근무일수">
              <TextInput
                ariaLabel="주 근무일수"
                numeric
                suffix="일"
                placeholder="예: 5"
                value={form.daysPerWeek}
                onChange={(v) => patch({ daysPerWeek: v })}
              />
            </Field>
            <Field missing={miss('workStart')} label="출근 시각">
              <TextInput
                type="time"
                ariaLabel="출근 시각"
                value={form.workStart}
                onChange={(v) => patch({ workStart: v })}
              />
            </Field>
            <Field missing={miss('workEnd')} label="퇴근 시각">
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
                className="text-sm font-semibold text-[var(--color-brand-ink)] hover:underline"
                onClick={() => patch({ variants: [...form.variants, { perWeek: '', start: '', end: '' }] })}
              >
                + 근무 형태 추가
              </button>
            </div>
          )}
          <Field missing={miss('breakMinutes')} label="하루 휴게시간" hint="점심시간 등 쉬는 시간의 하루 합계(분). 4시간 근무당 30분 이상이 법정 기준입니다.">
            <TextInput
              ariaLabel="하루 휴게시간"
              numeric
              suffix="분"
              placeholder="예: 60"
              value={form.breakMinutes}
              onChange={(v) => patch({ breakMinutes: v })}
            />
          </Field>
          <Field missing={miss('nightWork')} label="야간근무(22시~06시)가 있나요?">
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
                className="text-sm font-semibold text-[var(--color-brand-ink)] hover:underline"
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
            <Field missing={miss('otAmount')} label="연장수당 금액(월)" hint="계약서에 고정 연장수당이 있으면 입력. 없으면 비워 두세요.">
              <TextInput
                ariaLabel="연장수당 금액"
                numeric
                suffix="원"
                value={form.otAmount}
                onChange={(v) => patch({ otAmount: v })}
              />
            </Field>
            <Field missing={miss('otHours')} label="연장근로 환산시간(월)" hint="계약서에 적힌 시간 (예: 20). 모르면 비워 두세요.">
              <TextInput
                ariaLabel="연장근로 환산시간"
                numeric
                suffix="시간"
                value={form.otHours}
                onChange={(v) => patch({ otHours: v })}
              />
            </Field>
            <Field missing={miss('holidayExtra')} label="휴일·추가수당 금액(월)">
              <TextInput
                ariaLabel="휴일 추가수당 금액"
                numeric
                suffix="원"
                value={form.holidayExtra}
                onChange={(v) => patch({ holidayExtra: v })}
              />
            </Field>
            <Field missing={miss('annualLeavePay')} label="연차수당 금액(월)">
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
            <Field missing={miss('payday')} label="임금 지급일" hint='예: "매월 10일"'>
              <TextInput
                ariaLabel="임금 지급일"
                placeholder="예: 매월 10일"
                value={form.payday}
                onChange={(v) => patch({ payday: v })}
              />
            </Field>
            <Field missing={miss('paymentMethod')} label="지급 방법">
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
          <Field missing={miss('weeklyRest')} label="주휴일(유급 휴일)이 계약서에 어떻게 적혀 있나요?">
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
            {/* 집계 칩은 아래 항목별 StatusBadge와 같은 4변형이다 — 같은 표를 쓴다(같은 화면에서 색이 갈리면 안 된다) */}
            {(['violation', 'risk', 'ok', 'needs_data'] as FindingStatus[]).map((status) => (
              <span
                key={status}
                className="rounded-lg px-3 py-1.5"
                style={{ backgroundColor: STATUS_STYLE[status].bg, color: STATUS_STYLE[status].fg }}
              >
                {STATUS_LABEL[status]} {counts[status]}
              </span>
            ))}
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
              className="flex-1 rounded-lg bg-[var(--color-brand-solid)] px-5 py-3 text-center text-sm font-bold text-slate-900 hover:bg-[var(--brand-300)]"
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
            className="rounded-lg bg-[var(--color-brand-solid)] px-5 py-2 text-sm font-bold text-slate-900 hover:bg-[var(--brand-300)]"
          >
            다음
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            onClick={runCheck}
            className="rounded-lg bg-[var(--color-brand-solid)] px-5 py-2 text-sm font-bold text-slate-900 hover:bg-[var(--brand-300)]"
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
