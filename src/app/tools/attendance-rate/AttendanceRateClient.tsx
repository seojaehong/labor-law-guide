'use client';

import { useMemo, useState } from 'react';
import { calcAttendanceRate, CAUSE_IDS, CAUSES, monthlyLeaveDay, type AttendanceCause } from '@/lib/calc/attendance-rate';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small } from '@/lib/tool-kit';
import {
  ACCRUAL_HINT, CAUSE_COPY, effectLines, formulaLines, GROUP_COPY, headline, monthLines, MONTH_RULES, OPEN_ITEMS, SCHEDULED_HINT, SCOPE_ITEMS,
} from './copy';

const num = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return t === '' ? 0 : Number(t);
};

const GROUPS = ['deemed', 'excluded', 'absent'] as const;
const EMPTY = Object.fromEntries(CAUSE_IDS.map((c) => [c, ''])) as Record<AttendanceCause, string>;

export default function AttendanceRateClient() {
  // 첫 화면 = 근속 2년(15일) · 소정근로일수 250일 · 결근 5일 → 245/250 = 98.00%
  const [hire, setHire] = useState('2024-03-04');
  const [accrual, setAccrual] = useState('2026-03-04');
  const [scheduled, setScheduled] = useState('250');
  const [days, setDays] = useState<Record<AttendanceCause, string>>({ ...EMPTY, absence: '5' });
  const [mS, setMS] = useState('20');
  const [mX, setMX] = useState('0');
  const [mB, setMB] = useState('0');

  const out = useMemo(() => {
    try {
      return {
        r: calcAttendanceRate({
          hireDate: hire,
          accrualDate: accrual,
          scheduledDays: num(scheduled),
          days: Object.fromEntries(CAUSE_IDS.map((c) => [c, num(days[c])])),
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [hire, accrual, scheduled, days]);

  const month = useMemo(() => {
    try {
      return { m: monthlyLeaveDay({ scheduled: num(mS), excluded: num(mX), absent: num(mB) }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [mS, mX, mB]);

  const r = 'r' in out ? out.r! : null;
  const showMonth = !!r && (r.status === 'under1y' || r.primary?.status === 'monthly' || r.alt?.status === 'monthly');

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={small} style={muted}>
          입사일
          <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
        </label>
        <div>
          <label className={small} style={muted}>
            연차가 생기는 날
            <input type="date" className={inputCls} value={accrual} onChange={(e) => setAccrual(e.target.value)} aria-describedby="att-accrual-hint" />
          </label>
          <p id="att-accrual-hint" className={`${small} mt-1`} style={muted}>{ACCRUAL_HINT}</p>
        </div>
        <div className="sm:col-span-2">
          <label className={small} style={muted}>
            1년 소정근로일수
            <input inputMode="numeric" className={inputCls} value={scheduled} onChange={(e) => setScheduled(e.target.value)} aria-describedby="att-scheduled-hint" />
          </label>
          <p id="att-scheduled-hint" className={`${small} mt-1`} style={muted}>{SCHEDULED_HINT}</p>
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g} className={card}>
          <h2 className="text-base font-semibold" style={ink}>{GROUP_COPY[g].title}</h2>
          <p className={`${small} mb-3`} style={muted}>{GROUP_COPY[g].note}</p>
          <div className="space-y-3">
            {CAUSE_IDS.filter((c) => CAUSES[c].cls === g).map((c) => (
              <div key={c} className="grid grid-cols-[1fr_6rem] items-start gap-3">
                <div>
                  <label htmlFor={`att-${c}`} className={`${small} font-medium`} style={ink}>{CAUSE_COPY[c].label}</label>
                  <p id={`att-${c}-basis`} className="text-xs leading-relaxed" style={muted}>{CAUSE_COPY[c].basis}</p>
                </div>
                <input
                  id={`att-${c}`}
                  inputMode="numeric"
                  placeholder="0"
                  className={inputCls}
                  value={days[c]}
                  onChange={(e) => setDays((d) => ({ ...d, [c]: e.target.value }))}
                  aria-describedby={`att-${c}-basis`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {r?.primary && (
        <p className={small} style={muted}>
          나머지 {r.primary.tally.attended}일은 출근한 날로 셉니다. 지각·조퇴한 날, 육아기·임신기 근로시간 단축으로 일한 날도 출근한 날입니다.
        </p>
      )}

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r)}>
          {effectLines(r).map((l) => <p key={l} className={`${small} mt-3`} style={muted}>{l}</p>)}
        </AnswerCard>
      )}

      {showMonth && (
        <section className={card} aria-label="한 달 개근 확인">
          <h2 className="text-base font-semibold" style={ink}>한 달씩 개근 확인(근로기준법 제60조제2항)</h2>
          <ul className={`${small} mt-2 list-disc space-y-1 pl-5`} style={muted}>
            {MONTH_RULES.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className={small} style={muted}>
              그 달 소정근로일수
              <input inputMode="numeric" className={inputCls} value={mS} onChange={(e) => setMS(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              그 달 빼는 날
              <input inputMode="numeric" className={inputCls} value={mX} onChange={(e) => setMX(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              그 달 결근한 날
              <input inputMode="numeric" className={inputCls} value={mB} onChange={(e) => setMB(e.target.value)} />
            </label>
          </div>
          <div className="mt-3" aria-live="polite">
            {'m' in month
              ? monthLines(month.m!).map((l, i) => <p key={l} className={i === 0 ? 'text-base font-semibold' : `${small} mt-1`} style={i === 0 ? ink : muted}>{l}</p>)
              : <p className={small} style={ink}>{month.error}</p>}
          </div>
        </section>
      )}

      {r?.primary && (
        <FoldedDetail summary="계산식">
          <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
            {formulaLines(r).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </FoldedDetail>
      )}

      <FoldedDetail summary="확인할 점 — 해석이 갈리거나 확인이 덜 된 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {OPEN_ITEMS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="이 도구가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {SCOPE_ITEMS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
