'use client';

import { useMemo, useState } from 'react';
import { calcWageDelayInterest, type DelayKind, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, fmtDate, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { CONSEQUENCES, EXCLUSION_REASONS, FORMULA, headline, itemLine, NOT_COVERED } from './copy';

interface Row { kind: DelayKind; amount: string; periodicPayDate: string; paidDate: string }

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');
// 재직 중이면 퇴직 금품은 아직 없다 — 모든 항목을 정기지급일이 있는 임금으로 본다
const kindOf = (r: Row, retired: boolean): DelayKind => (retired ? r.kind : 'periodic');

export default function WageDelayInterestClient() {
  const today = todayKst();
  const [retired, setRetired] = useState(true);
  const [retireDate, setRetireDate] = useState('');
  const [rows, setRows] = useState<Row[]>([{ kind: 'retirement', amount: '', periodicPayDate: '', paidDate: today }]);
  const [hasExcl, setHasExcl] = useState(false);
  const [exFrom, setExFrom] = useState('');
  const [exTo, setExTo] = useState('');

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const out = useMemo(() => {
    if (retired && !retireDate) return { error: '퇴직일(또는 사망일)을 넣어 주세요.' };
    for (const [i, r] of rows.entries()) {
      if (!r.amount.trim()) return { error: `항목 ${i + 1}의 금액을 넣어 주세요.` };
      if (kindOf(r, retired) === 'periodic' && !r.periodicPayDate) return { error: `항목 ${i + 1}의 정기지급일을 넣어 주세요.` };
      if (!r.paidDate) return { error: `항목 ${i + 1}의 지급한 날을 넣어 주세요.` };
    }
    if (hasExcl && (!exFrom || !exTo)) return { error: '적용 제외 기간의 시작일과 끝나는 날을 넣어 주세요.' };
    try {
      const base: WageDelayInput = {
        retireDate: retired ? retireDate : undefined,
        items: rows.map((r) => ({
          kind: kindOf(r, retired),
          amount: num(r.amount),
          periodicPayDate: kindOf(r, retired) === 'periodic' ? r.periodicPayDate : undefined,
          paidDate: r.paidDate,
        })),
      };
      const full = calcWageDelayInterest(base);
      const r = hasExcl ? calcWageDelayInterest({ ...base, exclusions: [{ from: exFrom, to: exTo }] }) : full;
      return { r, full };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [retired, retireDate, rows, hasExcl, exFrom, exTo]);

  const r = 'r' in out ? out.r : undefined;

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">지금 일하고 있나요</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="retired" checked={retired} onChange={() => setRetired(true)} /> 퇴직했다(또는 사망)</label>
            <label className="flex items-center gap-2"><input type="radio" name="retired" checked={!retired} onChange={() => setRetired(false)} /> 재직 중이다</label>
          </div>
        </fieldset>
        {retired && (
          <>
            <label className={small} style={muted}>
              퇴직일 또는 사망일
              <input type="date" className={inputCls} value={retireDate} onChange={(e) => setRetireDate(e.target.value)} />
            </label>
            <p className={small} style={muted}>
              퇴직일은 근로관계가 끝난 날, 곧 마지막으로 일한 날의 다음 날입니다(4대보험 상실일과 같은 날). 마지막 근무일을 넣으면 기준일이 하루 당겨져 하루치가 더 붙습니다.
            </p>
          </>
        )}
      </section>

      {rows.map((row, i) => (
        <section key={i} aria-label={`항목 ${i + 1}`} className={`${card} grid gap-4 sm:grid-cols-2`}>
          <div className="flex items-center justify-between sm:col-span-2">
            <span className="text-base font-semibold" style={ink}>항목 {i + 1}</span>
            {rows.length > 1 && (
              <button type="button" className={`${small} underline underline-offset-2`} style={muted} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                항목 빼기
              </button>
            )}
          </div>
          {retired && (
            <fieldset className={`${small} sm:col-span-2`} style={muted}>
              <legend className="mb-1">어떤 돈인가요</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name={`kind-${i}`} checked={row.kind === 'retirement'} onChange={() => set(i, { kind: 'retirement' })} /> 퇴직금(일시금)·퇴직 때 정산하는 금품
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={`kind-${i}`} checked={row.kind === 'periodic'} onChange={() => set(i, { kind: 'periodic' })} /> 정기지급일이 정해진 임금(월급 등)
                </label>
              </div>
            </fieldset>
          )}
          <label className={small} style={muted}>
            금액(원)
            <input inputMode="numeric" className={inputCls} value={row.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="예: 3000000" />
          </label>
          {kindOf(row, retired) === 'periodic' && (
            <label className={small} style={muted}>
              정기지급일(취업규칙·계약에서 정한 날)
              <input type="date" className={inputCls} value={row.periodicPayDate} onChange={(e) => set(i, { periodicPayDate: e.target.value })} />
            </label>
          )}
          <label className={small} style={muted}>
            지급한 날(아직이면 계산할 날)
            <input type="date" className={inputCls} value={row.paidDate} onChange={(e) => set(i, { paidDate: e.target.value })} />
          </label>
        </section>
      ))}
      <button
        type="button"
        className={`${small} rounded-lg border border-[var(--color-border)] px-3 py-2`}
        style={ink}
        onClick={() => setRows((rs) => [...rs, { kind: rs[rs.length - 1]?.kind ?? 'retirement', amount: '', periodicPayDate: '', paidDate: today }])}
      >
        항목 더하기
      </button>
      <p className={small} style={muted}>일부만 늦게 지급했으면 지급한 금액과 날을 항목으로 나눠 넣습니다.</p>

      <section className={card}>
        <label className={`${small} flex items-center gap-2`} style={ink}>
          <input type="checkbox" checked={hasExcl} onChange={(e) => setHasExcl(e.target.checked)} /> 적용 제외 사유가 있었던 기간을 뺀다
        </label>
        {hasExcl && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <ul className={`${small} list-disc space-y-1 pl-5 sm:col-span-2`} style={muted}>
              {EXCLUSION_REASONS.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <label className={small} style={muted}>
              적용 제외 시작일
              <input type="date" className={inputCls} value={exFrom} onChange={(e) => setExFrom(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              적용 제외 끝나는 날
              <input type="date" className={inputCls} value={exTo} onChange={(e) => setExTo(e.target.value)} />
            </label>
            <p className={`${small} sm:col-span-2`} style={muted}>
              사유가 이어진 기간만 빼고 나머지 기간은 그대로 셉니다. 사유에 해당하는지는 이 계산기가 가리지 않습니다.
            </p>
          </div>
        )}
      </section>

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r, 'full' in out ? out.full : undefined)}>
          <ul className={`${small} mt-3 space-y-1`} style={muted}>
            {r.items.map((it, i) => <li key={i}>{itemLine(it, i, today)}</li>)}
          </ul>
          {retired && retireDate && <p className={`${small} mt-2`} style={muted}>퇴직 {fmtDate(retireDate, today)}</p>}
        </AnswerCard>
      )}

      <FoldedDetail summary="계산 방법">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {FORMULA.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="그래서 생기는 일">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {CONSEQUENCES.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="이 계산기가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {NOT_COVERED.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
