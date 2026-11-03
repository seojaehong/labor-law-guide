'use client';

// 근로계약서 작성 — 입력 → 임금 구성 설계 → 점검 규칙 되먹임 → 엑셀·한글·PDF 내려받기.
// 🔒 전부 브라우저 안에서 한다. 서버로 보내는 것은 PDF 글꼴 파일을 받아오는 요청(같은 사이트의 정적 파일) 하나뿐이다.

import { useMemo, useState } from 'react';

import { ruleName } from '@/lib/contract-check/present';
import { designFromForm, publicText, reviewWritten } from '@/lib/contract-write/contract';
import { type Rounding } from '@/lib/contract-write/design';
import { buildContractDocument } from '@/lib/contract-write/document';
import { hoursText, wonText } from '@/lib/contract-write/text';

import type { WeekDay } from '@/lib/contract-write/contract';

import { absorbOptions, amountInput, INITIAL, toWriteForm, WEEK_DAYS, type WriteState } from './formState';

const inputClass =
  'w-full rounded-lg border px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20';
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)',
  color: 'var(--color-text-primary)',
};

// <label> 로 감싸면 안의 첫 버튼(선택지)이 라벨 글자 전체를 이름으로 가져간다 — 입력칸은 각자 aria-label 을 단다
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        {label}
      </span>
      {hint && (
        <span className="mb-2 block text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}

function Input({ value, onChange, label, type = 'text', placeholder }: { value: string; onChange: (v: string) => void; label: string; type?: string; placeholder?: string }) {
  return <input type={type} aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} style={inputStyle} />;
}

function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]' : 'hover:border-[var(--grey-400)]'}`}
            style={active ? { color: 'var(--color-brand-ink)' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-[var(--color-border)] p-5">
      <h2 className="t-h4" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const ROUNDING: { value: Rounding; label: string }[] = [
  { value: 'won', label: '원 단위(반올림)' },
  { value: 'ceil10', label: '10원 단위 올림' },
  { value: 'ceil100', label: '100원 단위 올림' },
];
const YES_NO = [
  { value: 'no' as const, label: '아니오' },
  { value: 'yes' as const, label: '예' },
];


function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContractWriteClient() {
  const [s, setS] = useState<WriteState>(INITIAL);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<WriteState>) => setS((prev) => ({ ...prev, ...p }));

  const parsed = useMemo(() => toWriteForm(s), [s]);
  const result = useMemo(() => {
    if (!parsed.form) return null;
    try {
      const design = designFromForm(parsed.form);
      const review = reviewWritten(parsed.form, design);
      return { design, findings: review.problems, minimumWage: review.minimumWage, minimumWageLater: review.minimumWageLater, doc: buildContractDocument(parsed.form, design) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [parsed]);

  const fileBase = parsed.form ? `근로계약서_${parsed.form.employeeName}` : '근로계약서';
  const save = async (kind: 'xlsx' | 'hwpx' | 'pdf') => {
    if (!result || !('doc' in result) || !result.doc) return;
    setBusy(kind);
    setError(null);
    try {
      const ex = await import('@/lib/contract-write/export');
      if (kind === 'xlsx') download(await ex.buildContractXlsx(result.doc), `${fileBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (kind === 'hwpx') download(await ex.buildContractHwpx(result.doc), `${fileBase}.hwpx`, 'application/hwp+zip');
      if (kind === 'pdf') {
        const res = await fetch('/fonts/NanumGothic-Regular.ttf');
        // 404·오류 페이지를 글꼴로 넣으면 엉뚱한 오류가 난다 — 받지 못했다고 말한다
        if (!res.ok) throw new Error(`PDF 글꼴을 받지 못했습니다(HTTP ${res.status}). 잠시 뒤 다시 눌러 주세요`);
        const font = new Uint8Array(await res.arrayBuffer());
        download(await ex.buildContractPdf(result.doc, font), `${fileBase}.pdf`, 'application/pdf');
      }
    } catch (e) {
      setError(`파일을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleDay = (d: string) => patch({ workDays: s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d] });

  return (
    <div className="space-y-5">
      <p className="rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-700)' }}>
        입력한 내용은 이 브라우저 안에서만 계산하고 파일로 만듭니다. 서버로 보내거나 저장하지 않습니다.
      </p>

      <Section title="1. 당사자와 계약기간">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="사업체명"><Input label="사업체명" value={s.workplaceName} onChange={(v) => patch({ workplaceName: v })} /></Field>
          <Field label="대표자"><Input label="대표자" value={s.ownerName} onChange={(v) => patch({ ownerName: v })} /></Field>
          <Field label="근로자 성명"><Input label="근로자 성명" value={s.employeeName} onChange={(v) => patch({ employeeName: v })} /></Field>
          <Field label="상시 근로자 5명 이상">
            <Choice options={[{ value: 'yes', label: '5명 이상' }, { value: 'no', label: '5명 미만' }]} value={s.fivePlus} onChange={(v) => patch({ fivePlus: v })} />
          </Field>
          <Field label="계약 시작일"><Input label="계약 시작일" type="date" value={s.startDate} onChange={(v) => patch({ startDate: v })} /></Field>
          <Field label="계약 종료일" hint="비우면 기간의 정함이 없는 계약"><Input label="계약 종료일" type="date" value={s.endDate} onChange={(v) => patch({ endDate: v })} /></Field>
          <Field label="작성일" hint="비우면 오늘. 서명 날짜로 적습니다"><Input label="작성일" type="date" value={s.writtenDate} onChange={(v) => patch({ writtenDate: v })} /></Field>
          <Field label="근무장소"><Input label="근무장소" value={s.location} onChange={(v) => patch({ location: v })} /></Field>
          <Field label="업무"><Input label="업무" value={s.duty} onChange={(v) => patch({ duty: v })} /></Field>
        </div>
        <Field label="수습기간">
          <Choice options={[{ value: 'none', label: '없음' }, { value: 'yes', label: '있음' }]} value={s.probation} onChange={(v) => patch({ probation: v })} />
        </Field>
        {s.probation === 'yes' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="수습 개월 수"><Input label="수습 개월 수" value={s.probationMonths} onChange={(v) => patch({ probationMonths: v.replace(/[^\d]/g, '') })} /></Field>
            <Field label="처음 3개월 임금 90%" hint="1년 이상 계약만 가능(최저임금법 제5조 제2항)">
              <Choice options={YES_NO} value={s.probationReduced} onChange={(v) => patch({ probationReduced: v })} />
            </Field>
            <Field label="단순노무 업무" hint="고시된 단순노무 직종은 감액할 수 없습니다">
              <Choice options={YES_NO} value={s.simpleLabor} onChange={(v) => patch({ simpleLabor: v })} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="2. 근무형태">
        <Field label="근무 요일">
          <div className="flex flex-wrap gap-2" role="group" aria-label="근무 요일">
            {WEEK_DAYS.map((d) => {
              const on = s.workDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d)}
                  className={`min-w-[44px] rounded-lg border px-3 py-2 text-sm font-medium ${on ? 'border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]' : ''}`}
                  style={on ? { color: 'var(--color-brand-ink)' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="출근 시각"><Input label="출근 시각" type="time" value={s.start} onChange={(v) => patch({ start: v })} /></Field>
          <Field label="퇴근 시각"><Input label="퇴근 시각" type="time" value={s.end} onChange={(v) => patch({ end: v })} /></Field>
          <Field label="하루 휴게시간(분)"><Input label="하루 휴게시간" value={s.breakMinutes} onChange={(v) => patch({ breakMinutes: v.replace(/[^\d]/g, '') })} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="주휴일" hint="근무 요일이 아닌 요일 하나">
            <select aria-label="주휴일" value={s.weeklyRestDay} onChange={(e) => patch({ weeklyRestDay: e.target.value as WeekDay })} className={inputClass} style={inputStyle}>
              {WEEK_DAYS.map((d) => (
                <option key={d} value={d}>
                  매주 {d}요일
                </option>
              ))}
            </select>
          </Field>
          <Field label="연간 공휴일 근무 예정 일수" hint="공휴일에 쉬면 0. 주 5일 기준 일수를 넣으면 주 4일 이하는 비례로 줄입니다">
            <Input label="연간 공휴일 근무 예정 일수" value={s.holidayDaysPerYear} onChange={(v) => patch({ holidayDaysPerYear: v.replace(/[^\d.]/g, '') })} />
          </Field>
        </div>
      </Section>

      <Section title="3. 임금">
        <Field label="임금 형태">
          <Choice
            options={[
              { value: 'monthly', label: '월급 정직원' },
              { value: 'hourly', label: '시급·일급 파트' },
            ]}
            value={s.payType}
            onChange={(v) => patch({ payType: v, absorbInto: 'base' })}
          />
        </Field>
        {s.payType === 'monthly' ? (
          <>
            <Field label="금액 넣는 방식">
              <Choice
                options={[
                  { value: 'gross', label: '월 총액(세전)' },
                  { value: 'net', label: '월 실수령액' },
                ]}
                value={s.amountMode}
                onChange={(v) => patch({ amountMode: v })}
              />
            </Field>
            {s.amountMode === 'gross' ? (
              <Field label="월 임금 총액(원)"><Input label="월 임금 총액" value={s.monthlyTotal} onChange={(v) => patch({ monthlyTotal: amountInput(v) })} placeholder="예: 2,600,000" /></Field>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="월 실수령액(원)" hint="4대보험 근로자 몫과 소득세를 뺀 뒤 받는 금액"><Input label="월 실수령액" value={s.netPay} onChange={(v) => patch({ netPay: amountInput(v) })} placeholder="예: 2,300,000" /></Field>
                <Field label="공제대상가족 수(본인 포함)"><Input label="공제대상가족 수" value={s.family} onChange={(v) => patch({ family: v.replace(/[^\d]/g, '') })} /></Field>
              </div>
            )}
          </>
        ) : (
          <Field label="시간당 지급액(원)" hint="휴게시간을 포함한 출근~퇴근 시간에 곱해 하루 지급액을 정하고, 그 금액을 기본급·주휴·연차 등으로 나눕니다">
            <Input label="시간당 지급액" value={s.hourlyWage} onChange={(v) => patch({ hourlyWage: amountInput(v) })} placeholder="예: 13,000" />
          </Field>
        )}
        {s.payType === 'hourly' && (
          <Field label="결근한 주의 주휴수당" hint="일 지급액에 나눠 넣은 주휴수당은 그 주를 개근해야 생깁니다. 결근한 주에 이미 준 몫을 뺄지 정해 계약서에 적습니다">
            <Choice
              options={[
                { value: 'deduct', label: '그 주 몫을 뺀다' },
                { value: 'keep', label: '빼지 않는다' },
              ]}
              value={s.absentWeekHoliday}
              onChange={(v) => patch({ absentWeekHoliday: v })}
            />
          </Field>
        )}
        <Field label="임금 지급일"><Input label="임금 지급일" value={s.payday} onChange={(v) => patch({ payday: v })} /></Field>
        <Field label="금액 단위" hint="잔액을 받는 항목 말고는 이 단위로 올립니다(수당이 산정 기준보다 적어지지 않게). 올리면 잔액은 기본급이 받습니다">
          <Choice options={ROUNDING} value={s.rounding} onChange={(v) => patch(v === 'won' ? { rounding: v } : { rounding: v, absorbInto: 'base' })} />
        </Field>
        <Field label="끝에 남는 금액을 넣을 항목">
          <Choice options={absorbOptions(s.payType)} value={s.absorbInto} onChange={(v) => patch({ absorbInto: v })} />
        </Field>
        {s.payType === 'monthly' && (
        <details className="rounded-xl border border-dashed p-3">
          <summary className="cursor-pointer text-sm font-semibold">월 인정시간을 직접 정하기(선택)</summary>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            기존 계약서에 정해 둔 시간이 있으면 넣습니다. 비우면 근무형태로 계산합니다.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="연장(가산 반영)"><Input label="연장 인정시간" value={s.overtimeHours} onChange={(v) => patch({ overtimeHours: v.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="휴일(가산 반영)"><Input label="휴일 인정시간" value={s.holidayHours} onChange={(v) => patch({ holidayHours: v.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="연차"><Input label="연차 인정시간" value={s.leaveHours} onChange={(v) => patch({ leaveHours: v.replace(/[^\d.]/g, '') })} /></Field>
          </div>
        </details>
        )}
      </Section>

      <section aria-live="polite" id="cw-result" className="space-y-4 rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="t-h4" style={{ color: 'var(--color-text-primary)' }}>
          임금 구성
        </h2>
        {!result && parsed.error && <p className="text-sm" style={{ color: 'var(--color-warn-ink)' }}>{parsed.error}</p>}
        {!result && !parsed.error && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>입력이 필요합니다: {parsed.missing.join(', ')}</p>}
        {result && parsed.netNote && <p className="text-sm">{parsed.netNote}</p>}
        {result && 'error' in result && <p className="text-sm" style={{ color: 'var(--color-warn-ink)' }}>{result.error}</p>}
        {result && 'design' in result && result.design && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--color-text-secondary)' }}>
                    <th className="py-1 pr-2">항목</th>
                    <th className="py-1 pr-2 text-right">{result.design.period === 'day' ? '하루 인정시간' : '월 인정시간'}</th>
                    <th className="py-1 text-right">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {result.design.items.map((i) => (
                    <tr key={i.key} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5 pr-2">
                        {i.label}
                        {i.absorbs && <span className="ml-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>(잔액)</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{hoursText(i.hours)}</td>
                      <td className="py-1.5 text-right">{wonText(i.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--color-border)] font-semibold">
                    <td className="py-1.5">합계</td>
                    <td className="py-1.5 pr-2 text-right">{hoursText(result.design.totalHours)}</td>
                    <td className="py-1.5 text-right">{wonText(result.design.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {result.design.period === 'day' && (
              <p className="text-sm">
                하루 지급액 {wonText(result.design.total)} · 한 달 예상 {wonText(Math.round(result.design.total * parsed.form!.workDays.length * 4.345))}(주 {parsed.form!.workDays.length}일 × 4.345주, 실제 근무일 기준으로 지급)
              </p>
            )}
            <p className="text-sm" style={result.minimumWage.warn ? { color: 'var(--color-warn-ink)' } : undefined}>
              {result.minimumWage.text}
            </p>
            {result.minimumWageLater.map((l) => (
              <p key={l.text} className="text-sm" style={l.warn ? { color: 'var(--color-warn-ink)' } : undefined}>
                {l.text}
              </p>
            ))}
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--grey-100)' }}>
              <p className="font-semibold">근로계약서 점검 규칙으로 다시 본 결과</p>
              {result.findings.length === 0 ? (
                <p className="mt-1">손볼 항목이 없습니다.</p>
              ) : (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {result.findings.map((f) => (
                    <li key={f.rule_code}>
                      {publicText(ruleName(f.rule_code))}: {f.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              연장·휴일 시간은 근무형태로 미리 정한 월 예정 시간입니다. 실제 근로가 이를 넘으면 넘는 시간의 수당을 따로 지급해야 하고, 계약서에도 그렇게 적힙니다.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {(['xlsx', 'hwpx', 'pdf'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => save(k)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--color-brand-solid)] px-5 py-2.5 text-[15px] font-semibold text-[#191f28] hover:bg-[var(--brand-500)] disabled:opacity-60"
                >
                  {busy === k ? '만드는 중…' : { xlsx: '엑셀로 받기', hwpx: '한글로 받기', pdf: 'PDF로 받기' }[k]}
                </button>
              ))}
            </div>
            {error && <p className="text-sm" style={{ color: 'var(--color-warn-ink)' }}>{error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
