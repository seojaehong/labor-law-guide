'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { calcShutdownAllowance, calendarBreakdown, type ShutdownAllowanceInput, type WageUnit } from '@/lib/calc/shutdown-allowance';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small } from '@/lib/tool-kit';
import { breakdownLine, DAYS_HINT, effectLines, EXCLUDE_HINT, formulaLines, headline, PAID_HINT, SCOPE_ITEMS } from './copy';

const UNIT_LABEL: Record<WageUnit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} /> {children}
    </label>
  );
}

export default function ShutdownAllowanceClient() {
  const [fivePlus, setFivePlus] = useState(true);
  const [cause, setCause] = useState<ShutdownAllowanceInput['cause']>('employer');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState('');
  const [paid, setPaid] = useState('');
  const [direct, setDirect] = useState(false);
  const [hire, setHire] = useState('');
  const [total, setTotal] = useState('9000000');
  const [exclDays, setExclDays] = useState('');
  const [exclWages, setExclWages] = useState('');
  const [avgDaily, setAvgDaily] = useState('');
  const [unit, setUnit] = useState<WageUnit>('month');
  const [amount, setAmount] = useState('3000000');
  const [weekly, setWeekly] = useState('40');
  const [daily, setDaily] = useState('8');

  const calc = fivePlus && cause === 'employer';

  const out = useMemo(() => {
    if (calc) {
      if (!direct && !start) return { error: '휴업을 시작한 날을 넣어 주세요.' };
      if (!direct && !hire) return { error: '입사일을 넣어 주세요.' };
      if (!days.trim()) return { error: '휴업일수를 넣어 주세요.' };
    }
    try {
      return {
        r: calcShutdownAllowance({
          fivePlus, cause,
          average: direct
            ? { source: 'direct', daily: num(avgDaily) }
            : { source: 'period', hireDate: hire, startDate: start, wageTotal: num(total), excludedDays: num(exclDays), excludedWages: num(exclWages) },
          ordinary: { unit, amount: num(amount), weeklyHours: num(weekly), dailyHours: num(daily) },
          days: num(days),
          paidDuring: num(paid),
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [calc, fivePlus, cause, direct, avgDaily, hire, start, total, exclDays, exclWages, unit, amount, weekly, daily, days, paid]);

  const breakdown = useMemo(() => {
    if (!start || !end) return null;
    try {
      return breakdownLine(start, end, calendarBreakdown(start, end));
    } catch (e) {
      return (e as Error).message;
    }
  }, [start, end]);

  const r = 'r' in out ? out.r : undefined;

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="적용 범위">
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">상시 근로자 수</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="size" checked={fivePlus} onChange={() => setFivePlus(true)}>5명 이상</Radio>
            <Radio name="size" checked={!fivePlus} onChange={() => setFivePlus(false)}>4명 이하</Radio>
          </div>
          <p className="mt-2">
            모르면 <Link href="/tools/headcount" className="underline underline-offset-2">상시 근로자 수 계산기</Link>로 셉니다. 휴업수당을 줄 사유가 생긴 날 전 1개월이 기준입니다.
          </p>
        </fieldset>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">왜 쉬었나요</legend>
          <div className="flex flex-col gap-2">
            <Radio name="cause" checked={cause === 'employer'} onChange={() => setCause('employer')}>회사 사정(경영 사정·작업 중단·대기발령 등)</Radio>
            <Radio name="cause" checked={cause === 'force-majeure'} onChange={() => setCause('force-majeure')}>천재지변 등 회사가 막을 수 없는 사유</Radio>
            <Radio name="cause" checked={cause === 'commission'} onChange={() => setCause('commission')}>노동위원회 승인을 받았다(부득이한 사유)</Radio>
          </div>
        </fieldset>
      </section>

      {calc && (
        <>
          <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="휴업기간">
            <label className={small} style={muted}>
              휴업 시작일
              <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              휴업 마지막 날(달력 나누기용)
              <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              휴업일수
              <input inputMode="numeric" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <div className={`${small} sm:col-span-2 space-y-1`} style={muted}>
              {breakdown && <p style={ink}>{breakdown}</p>}
              <p>{DAYS_HINT}</p>
            </div>
            <label className={`${small} sm:col-span-2`} style={muted}>
              휴업 중 받은 임금(일부 시간 일한 날의 임금 합계, 없으면 비움)
              <input inputMode="numeric" className={inputCls} value={paid} onChange={(e) => setPaid(e.target.value)} />
            </label>
            <p className={`${small} sm:col-span-2`} style={muted}>{PAID_HINT}</p>
          </section>

          <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="평균임금">
            <fieldset className={`${small} sm:col-span-2`} style={muted}>
              <legend className="mb-1">1일 평균임금</legend>
              <div className="flex flex-wrap gap-4">
                <Radio name="avg" checked={!direct} onChange={() => setDirect(false)}>휴업 전 3개월 임금으로 셈</Radio>
                <Radio name="avg" checked={direct} onChange={() => setDirect(true)}>직접 넣음</Radio>
              </div>
            </fieldset>
            {direct ? (
              <label className={small} style={muted}>
                1일 평균임금(원)
                <input inputMode="decimal" className={inputCls} value={avgDaily} onChange={(e) => setAvgDaily(e.target.value)} />
              </label>
            ) : (
              <>
                <label className={small} style={muted}>
                  입사일
                  <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
                </label>
                <label className={small} style={muted}>
                  휴업 전 3개월 동안 받은 임금 총액(원)
                  <input inputMode="numeric" className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} />
                </label>
                <label className={small} style={muted}>
                  뺄 기간 일수(없으면 비움)
                  <input inputMode="numeric" className={inputCls} value={exclDays} onChange={(e) => setExclDays(e.target.value)} />
                </label>
                <label className={small} style={muted}>
                  뺄 기간에 받은 임금(원)
                  <input inputMode="numeric" className={inputCls} value={exclWages} onChange={(e) => setExclWages(e.target.value)} />
                </label>
                <p className={`${small} sm:col-span-2`} style={muted}>{EXCLUDE_HINT}</p>
              </>
            )}
          </section>

          <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="통상임금">
            <fieldset className={`${small} sm:col-span-2`} style={muted}>
              <legend className="mb-1">통상임금을 어떤 단위로 정했나요</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(UNIT_LABEL) as WageUnit[]).map((u) => (
                  <Radio key={u} name="unit" checked={unit === u} onChange={() => setUnit(u)}>{UNIT_LABEL[u]}</Radio>
                ))}
              </div>
            </fieldset>
            <label className={small} style={muted}>
              {UNIT_LABEL[unit]}(기본급과 매달 정해서 주는 수당)
              <input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              1일 소정근로시간
              <input inputMode="decimal" className={inputCls} value={daily} onChange={(e) => setDaily(e.target.value)} />
            </label>
            {(unit === 'month' || unit === 'week') && (
              <label className={small} style={muted}>
                1주 소정근로시간
                <input inputMode="decimal" className={inputCls} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
              </label>
            )}
          </section>
        </>
      )}

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r)}>
          {effectLines(r).map((l) => (
            <p key={l} className={`${small} mt-3`} style={muted}>{l}</p>
          ))}
        </AnswerCard>
      )}

      {r && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
            {formulaLines(r).map((l) => <li key={l}>{l}</li>)}
          </ol>
        </FoldedDetail>
      )}

      <FoldedDetail summary="이 계산기가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {SCOPE_ITEMS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
