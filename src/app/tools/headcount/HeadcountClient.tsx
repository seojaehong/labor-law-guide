'use client';

import Link from 'next/link';
import { useMemo, useReducer, useState } from 'react';
import {
  answerPlan,
  defaultPlan,
  editPlan,
  explainDate,
  nextMonthRange,
  type Crew,
  type PlanEdit,
  type WorkerKind,
} from '@/lib/headcount-plan';
import BizNoLookup from '@/components/BizNoLookup';
import { CHANGES, basisLine, crewLabel, fmtDate, headline, leaveLines, noteLine, tenLine, whyLines } from './copy';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const PRESETS: { label: string; days: number[] }[] = [
  { label: '월~금', days: [1, 2, 3, 4, 5] },
  { label: '월~토', days: [1, 2, 3, 4, 5, 6] },
  { label: '매일', days: [0, 1, 2, 3, 4, 5, 6] },
];
const KIND_LABEL: Record<WorkerKind, string> = {
  regular: '직원(정규·계약·아르바이트)',
  family: '함께 사는 가족',
  dispatched: '파견 직원(세지 않음)',
};

const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const card = 'rounded-xl border border-[var(--color-border)] p-4 sm:p-5';
const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-base focus:border-[var(--color-accent)] focus:outline-none';
const small = 'text-sm leading-relaxed';
const muted = { color: 'var(--grey-700)' };
const ink = { color: 'var(--color-text-primary)' };
const chip = (on: boolean) =>
  on
    ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' }
    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' };

function WeekToggle({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEK.map((w, i) => {
        const on = value.includes(i);
        return (
          <button key={w} type="button" aria-pressed={on} className="h-10 w-10 rounded-md border text-sm font-semibold" style={chip(on)}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}>
            {w}
          </button>
        );
      })}
    </div>
  );
}

function CrewCard({ crew, openDays, canRemove, edit }: { crew: Crew; openDays: number[]; canRemove: boolean; edit: (e: PlanEdit) => void }) {
  const dated = !!(crew.from || crew.to);
  const dates = (
    <div className="grid grid-cols-2 gap-2">
      <label className={small} style={muted}>
        {dated ? '언제부터' : '입사일(1년 안 됐을 때)'}
        <input type="date" className={inputCls} value={crew.from ?? ''} onChange={(e) => edit({ type: 'period', id: crew.id, from: e.target.value })} />
      </label>
      <label className={small} style={muted}>
        {dated ? '언제까지(비우면 계속)' : '마지막 근무일'}
        <input type="date" className={inputCls} value={crew.to ?? ''} onChange={(e) => edit({ type: 'period', id: crew.id, to: e.target.value })} />
      </label>
    </div>
  );
  return (
    <div className="space-y-3 rounded-lg bg-[var(--grey-100)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={ink}>{crewLabel(crew)}</span>
        {canRemove && (
          <button type="button" className="text-sm" style={muted} onClick={() => edit({ type: 'remove', id: crew.id })}>빼기</button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="한 명 줄이기" className="h-11 w-11 rounded-lg border border-[var(--color-border)] text-lg" onClick={() => edit({ type: 'count', id: crew.id, count: crew.count - 1 })}>−</button>
        <input aria-label="인원" inputMode="numeric" className={`${inputCls} w-16 text-center`} value={crew.count}
          onChange={(e) => edit({ type: 'count', id: crew.id, count: Number(e.target.value.replace(/\D/g, '')) })} />
        <button type="button" aria-label="한 명 늘리기" className="h-11 w-11 rounded-lg border border-[var(--color-border)] text-lg" onClick={() => edit({ type: 'count', id: crew.id, count: crew.count + 1 })}>+</button>
        <span className="text-base" style={ink}>명</span>
      </div>
      {dated && dates}
      <details>
        <summary className="cursor-pointer text-sm" style={muted}>자세히 — 구분·근무 요일{dated ? '' : '·입사일'}</summary>
        <div className="mt-3 space-y-3">
          {!dated && dates}
          <label className={`${small} block`} style={muted}>
            구분
            <select className={inputCls} value={crew.kind} onChange={(e) => edit({ type: 'crew', id: crew.id, patch: { kind: e.target.value as WorkerKind } })}>
              {(Object.keys(KIND_LABEL) as WorkerKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <div className="space-y-2">
            <label className={`${small} flex items-center gap-2`} style={muted}>
              <input type="checkbox" checked={crew.days === 'site'}
                onChange={(e) => edit({ type: 'crew', id: crew.id, patch: { days: e.target.checked ? 'site' : openDays } })} />
              문 여는 날 모두 일함
            </label>
            {crew.days !== 'site' && (
              <WeekToggle value={crew.days} onChange={(v) => edit({ type: 'crew', id: crew.id, patch: { days: v } })} />
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

export default function HeadcountClient() {
  const [today] = useState(todayKst);
  const [plan, edit] = useReducer(editPlan, today, defaultPlan);
  const answer = useMemo(() => answerPlan(plan, today), [plan, today]);
  const firstStart = answer.five.kind === 'spans' && answer.five.spans[0].start !== 'open' ? answer.five.spans[0].start.date : today;
  const [picked, setPicked] = useState<string | null>(null);
  const inspectDate = picked ?? firstStart;
  const inspect = useMemo(() => explainDate(plan, inspectDate), [plan, inspectDate]);
  const ten = tenLine(answer, today);
  const [lead, ...rest] = headline(answer, today);

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="t-h4 mb-1" style={ink}>사람</h2>
        <p className="mb-1 text-sm" style={muted}>대표는 빼고, 아르바이트·계약직은 넣습니다.</p>
        <BizNoLookup onFound={(w) => {
          const staff = plan.crews.find((c) => !c.from && !c.to);
          if (staff) edit({ type: 'count', id: staff.id, count: w.headcount });
        }} />
        <div className="space-y-3">
          {plan.crews.map((c) => (
            <CrewCard key={c.id} crew={c} openDays={plan.site.openDays} canRemove={plan.crews.length > 1} edit={edit} />
          ))}
        </div>
        <button type="button" className="mt-3 w-full rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm" style={ink}
          onClick={() => edit({ type: 'add', ...nextMonthRange(today) })}>
          + 기간을 정해 더 쓰는 사람
        </button>

        <h2 className="t-h4 mt-6 mb-2" style={ink}>문 여는 날</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" aria-pressed={sameDays(plan.site.openDays, p.days)} className="rounded-full border px-4 py-2 text-sm font-semibold"
              style={chip(sameDays(plan.site.openDays, p.days))} onClick={() => edit({ type: 'site', patch: { openDays: p.days } })}>
              {p.label}
            </button>
          ))}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm" style={muted}>요일 직접 고르기 · 쉬는 날 · 사업 시작일</summary>
          <div className="mt-3 space-y-3">
            <WeekToggle value={plan.site.openDays} onChange={(v) => edit({ type: 'site', patch: { openDays: v } })} />
            <label className={`${small} block`} style={muted}>
              문 여는 요일 중 쉰 날(공휴일 휴무 등, 2026-12-25 처럼 여러 개)
              <textarea rows={2} className={inputCls} defaultValue={plan.site.closedDates.join(', ')}
                onChange={(e) => edit({ type: 'site', patch: { closedDates: e.target.value.match(/\d{4}-\d{2}-\d{2}/g) ?? [] } })} />
            </label>
            <label className={`${small} block`} style={muted}>
              사업 시작일(문 연 지 1개월이 안 됐을 때만)
              <input type="date" className={inputCls} value={plan.site.businessStart ?? ''}
                onChange={(e) => edit({ type: 'site', patch: { businessStart: e.target.value } })} />
            </label>
          </div>
        </details>
      </section>

      <section className={card} aria-live="polite">
        <p className="text-lg font-bold leading-snug sm:text-xl" style={ink}>{lead}</p>
        {rest.map((l) => <p key={l} className="mt-1 text-lg font-bold" style={ink}>{l}</p>)}
        <ul className="mt-3 space-y-1.5">
          {whyLines(answer, today).map((l) => <li key={l} className={small} style={muted}>{l}</li>)}
        </ul>

        <h3 className="mt-5 mb-1.5 text-base font-semibold" style={ink}>연차휴가</h3>
        <ul className="space-y-1.5">
          {leaveLines(answer, today).map((l) => <li key={l} className={small} style={ink}>{l}</li>)}
        </ul>
        {ten && <p className={`${small} mt-3`} style={ink}>{ten}</p>}

        {answer.five.kind !== 'none' && (
          <>
            <h3 className="mt-5 mb-1.5 text-base font-semibold" style={ink}>5인 이상으로 보는 기간에 생긴 일에는 다음이 적용됩니다</h3>
            <ul className="list-disc space-y-1 pl-5">
              {CHANGES.map((c) => <li key={c.id} className={small} style={ink}>{c.title} <span style={muted}>({c.basis})</span></li>)}
            </ul>
            <p className={`${small} mt-2`}><Link href="/duties" className="underline underline-offset-2">규모별 의무 전체 보기</Link></p>
          </>
        )}

        <ul className="mt-5 space-y-1 border-t border-[var(--color-border)] pt-3">
          {answer.notes.map((n) => <li key={n.kind + ('crewId' in n ? n.crewId : '')} className="text-xs leading-relaxed" style={muted}>{noteLine(n, plan, today)}</li>)}
        </ul>
      </section>

      <details className={card}>
        <summary className="cursor-pointer text-base font-semibold" style={ink}>날짜별 계산 보기</summary>
        <div className="mt-4 space-y-4">
          <label className={`${small} block`} style={muted}>
            확인할 날(수당·해고 등 법을 적용할 일이 생긴 날)
            <input type="date" className={inputCls} value={inspectDate} onChange={(e) => setPicked(e.target.value || null)} />
          </label>
          <p className="text-base font-semibold" style={ink}>
            {fmtDate(inspect.baseDate, today)} — {inspect.covered ? '5인 이상으로 봅니다' : '5인 이상으로 보지 않습니다'}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ['거슬러 센 기간', `${inspect.periodStart} ~ ${inspect.periodEnd}`],
              ['가동 일수', `${inspect.operatingDays}일`],
              ['연인원', `${inspect.personDays}명`],
              ['평균', `${inspect.average.toFixed(2)}명`],
              ['5명 미만인 날', `${inspect.belowDays}일`],
            ].map(([k, v]) => (
              <div key={k}><dt style={muted}>{k}</dt><dd className="font-semibold" style={ink}>{v}</dd></div>
            ))}
          </dl>
          <p className={small} style={muted}>{basisLine(inspect)}</p>
          <div className="grid grid-cols-3 gap-1 text-sm sm:grid-cols-6">
            {inspect.days.map((d) => (
              <span key={d.date} className="tabular-nums" style={d.count < 5 ? muted : ink}>{d.date.slice(5)} {d.count}명</span>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
