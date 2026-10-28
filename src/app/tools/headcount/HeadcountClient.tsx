'use client';

import { useMemo, useState } from 'react';
import {
  addDays,
  annualLeaveCoverage,
  computeHeadcount,
  coverageTimeline,
  type HeadcountInput,
  type HeadcountWorker,
  type WorkerKind,
} from '@/lib/headcount';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const KIND_LABEL: Record<WorkerKind, string> = {
  regular: '근로자(정규·기간제·단시간)',
  family: '동거친족',
  dispatched: '파견근로자(제외)',
};

type Row = HeadcountWorker & { id: number };

const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

function sampleRows(base: string): Row[] {
  const start = addDays(base, -20);
  return [
    ...['직원 1', '직원 2', '직원 3', '직원 4'].map((name, i) => ({
      id: i + 1, name, start: '2025-01-01', workWeekdays: WEEKDAYS, kind: 'regular' as const,
    })),
    { id: 5, name: '한 달 계약직', start, end: addDays(start, 29), workWeekdays: WEEKDAYS, kind: 'regular' as const },
  ];
}

const card = 'rounded-xl border border-[var(--color-border)] p-5';
const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none';
const labelCls = 'mb-1 block text-sm font-semibold';
const fmt = (n: number) => n.toFixed(2);

function WeekToggle({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEK.map((w, i) => {
        const on = value.includes(i);
        return (
          <button
            key={w}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            className="h-8 w-8 rounded-md border text-xs font-semibold"
            style={
              on
                ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-bg-primary)', borderColor: 'var(--color-text-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}

export default function HeadcountClient() {
  const [baseDate, setBaseDate] = useState(todayKst);
  const [operatingWeekdays, setOperatingWeekdays] = useState<number[]>(WEEKDAYS);
  const [closedText, setClosedText] = useState('');
  const [threshold, setThreshold] = useState<5 | 10>(5);
  const [businessStart, setBusinessStart] = useState('');
  const [rows, setRows] = useState<Row[]>(() => sampleRows(todayKst()));

  const input: HeadcountInput = useMemo(
    () => ({
      operatingWeekdays,
      closedDates: closedText.match(/\d{4}-\d{2}-\d{2}/g) ?? [],
      threshold,
      businessStart: businessStart || undefined,
      workers: rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.start)).map((r) => ({ name: r.name, start: r.start, end: r.end || undefined, workWeekdays: r.workWeekdays, kind: r.kind })),
    }),
    [operatingWeekdays, closedText, threshold, businessStart, rows],
  );

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(baseDate);
  const result = useMemo(() => (valid ? computeHeadcount(input, baseDate) : null), [input, baseDate, valid]);
  const leave = useMemo(() => (valid ? annualLeaveCoverage(input, baseDate) : null), [input, baseDate, valid]);
  const spans = useMemo(
    () => (valid ? coverageTimeline(input, addDays(baseDate, -92), addDays(baseDate, 92)) : []),
    [input, baseDate, valid],
  );

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const nextId = () => Math.max(0, ...rows.map((r) => r.id)) + 1;
  const n = threshold;

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="t-h4 mb-4" style={{ color: 'var(--color-text-primary)' }}>1. 사업장</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="hc-base">기준일 (수당·해고 등 법을 적용할 일이 생긴 날)</label>
            <input id="hc-base" type="date" className={inputCls} value={baseDate} onChange={(e) => setBaseDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="hc-threshold">기준 인원</label>
            <select id="hc-threshold" className={inputCls} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) as 5 | 10)}>
              <option value={5}>5명 (근로기준법 대부분)</option>
              <option value={10}>10명 (취업규칙 작성·신고, 제93조)</option>
            </select>
          </div>
          <div>
            <span className={labelCls}>영업 요일</span>
            <WeekToggle value={operatingWeekdays} onChange={setOperatingWeekdays} />
          </div>
          <div>
            <label className={labelCls} htmlFor="hc-start">사업 시작일 (1개월이 안 됐을 때만)</label>
            <input id="hc-start" type="date" className={inputCls} value={businessStart} onChange={(e) => setBusinessStart(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} htmlFor="hc-closed">영업 요일 중 쉰 날 (공휴일 휴무 등, YYYY-MM-DD 여러 개)</label>
            <textarea id="hc-closed" rows={2} className={inputCls} value={closedText} onChange={(e) => setClosedText(e.target.value)} placeholder="2026-12-25, 2027-01-01" />
          </div>
        </div>
      </section>

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-h4" style={{ color: 'var(--color-text-primary)' }}>2. 근로자</h2>
          <div className="flex gap-2 text-sm">
            <button type="button" className="rounded-lg border border-[var(--color-border)] px-3 py-1.5" onClick={() => setRows(sampleRows(valid ? baseDate : todayKst()))}>
              예시: 4명 + 한 달 계약직
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5"
              onClick={() => setRows((rs) => [...rs, { id: nextId(), name: '', start: '', workWeekdays: operatingWeekdays, kind: 'regular' }])}
            >
              + 추가
            </button>
          </div>
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--grey-700)' }}>
          날짜 칸은 입사일, 마지막 근무일 순서입니다(계속 근무하면 비워 둡니다). 대표자는 넣지 않습니다.
          근무 요일이 아닌 날(주휴일·휴무일)은 그 사람을 세지 않습니다.
        </p>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-1 gap-2 rounded-lg bg-[var(--grey-100)] p-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_auto]">
              <input aria-label="이름" className={inputCls} value={r.name} placeholder="이름" onChange={(e) => update(r.id, { name: e.target.value })} />
              <select aria-label="구분" className={inputCls} value={r.kind} onChange={(e) => update(r.id, { kind: e.target.value as WorkerKind })}>
                {(Object.keys(KIND_LABEL) as WorkerKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <input aria-label="입사일" type="date" className={inputCls} value={r.start} onChange={(e) => update(r.id, { start: e.target.value })} />
              <input aria-label="마지막 근무일" type="date" className={inputCls} value={r.end ?? ''} onChange={(e) => update(r.id, { end: e.target.value })} />
              <button type="button" aria-label="삭제" className="text-sm text-[var(--grey-700)]" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                삭제
              </button>
              <div className="md:col-span-5">
                <WeekToggle value={r.workWeekdays} onChange={(v) => update(r.id, { workWeekdays: v })} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {result && (
        <section className={card} aria-live="polite">
          <h2 className="t-h4 mb-3" style={{ color: 'var(--color-text-primary)' }}>3. 산정 결과</h2>
          <p className="mb-4 text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {baseDate} 기준 — {result.covered ? `상시 ${n}명 이상 사업장으로 봅니다` : `상시 ${n}명 이상 사업장으로 보지 않습니다`}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            {[
              ['산정기간', `${result.periodStart} ~ ${result.periodEnd}`],
              ['가동 일수', `${result.operatingDays}일`],
              ['연인원', `${result.personDays}명`],
              ['평균', `${fmt(result.average)}명`],
              [`${n}명 미만인 날`, `${result.belowDays}일`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt style={{ color: 'var(--grey-700)' }}>{k}</dt>
                <dd className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {result.operatingDays === 0
              ? '산정기간에 가동일이 없습니다. 영업 요일과 쉰 날을 확인하세요.'
              : result.basis === 'rule1'
                ? `평균 ${fmt(result.average)}명이고 ${n}명 미만인 날이 가동일의 ${result.covered ? '절반 미만' : '절반 이상'}입니다(시행령 제7조의2 제1항·제2항).`
                : result.basis === 'rule2-1'
                  ? `평균은 ${n}명 미만이지만 ${n}명 미만인 날(${result.belowDays}일)이 가동일(${result.operatingDays}일)의 절반 미만이라 ${n}명 이상 사업장으로 봅니다(제2항 제1호).`
                  : `평균은 ${n}명 이상이지만 ${n}명 미만인 날(${result.belowDays}일)이 가동일(${result.operatingDays}일)의 절반 이상이라 ${n}명 이상 사업장으로 보지 않습니다(제2항 제2호).`}
          </p>

          <h3 className="mt-6 mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            기준일 앞뒤 3개월 중 {n}명 이상으로 보는 기간
          </h3>
          {spans.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>없습니다.</p>
          ) : (
            <ul className="list-disc pl-5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {spans.map((s) => (
                <li key={s.from}>{s.from} ~ {s.to}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--grey-700)' }}>
            이 기간에 생긴 연장·야간·휴일근로, 공휴일, 해고, 휴업에는 {n}명 이상 사업장 규정이 적용됩니다.
            날짜는 그 일이 생긴 날을 기준일로 다시 넣어 확인하세요.
          </p>

          {threshold === 5 && leave && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                연차휴가(1년 이상 근속자 15일 등) — {leave.covered ? '적용됩니다' : '적용되지 않습니다'}
              </h3>
              <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--grey-700)' }}>
                기준일 전 1년을 한 달씩 나눠 열두 달 모두 5명 이상이어야 합니다(제7조의2 제3항). 입사 1년 미만 근로자의
                1개월 개근 1일(제60조 제2항)은 이 요건에서 빠져 위 1개월 산정으로 봅니다.
              </p>
              <div className="flex flex-wrap gap-1">
                {leave.months.map((m) => (
                  <span
                    key={m.periodStart}
                    title={`${m.periodStart} ~ ${m.periodEnd} 평균 ${fmt(m.average)}명`}
                    className="rounded px-2 py-1 text-xs"
                    style={m.covered ? { backgroundColor: 'var(--grey-200)', color: 'var(--grey-700)' } : { border: '1px solid var(--color-border)', color: 'var(--grey-700)' }}
                  >
                    {m.periodEnd.slice(0, 7)} {m.covered ? '5명 이상' : '미만'}
                  </span>
                ))}
              </div>
            </>
          )}

          <details className="mt-6 text-sm">
            <summary className="cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>날짜별 인원 보기</summary>
            <div className="mt-2 grid grid-cols-3 gap-1 md:grid-cols-6">
              {result.days.map((d) => (
                <span key={d.date} className="tabular-nums" style={{ color: d.count < n ? 'var(--grey-700)' : 'var(--color-text-primary)' }}>
                  {d.date.slice(5)} {d.count}명
                </span>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
