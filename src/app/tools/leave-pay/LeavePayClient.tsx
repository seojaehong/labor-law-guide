'use client';

import { useMemo, useState } from 'react';
import { calcLeavePay, type LeavePayInput, type WageUnit } from '@/lib/calc/leave-pay';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { effectLines, formulaLines, headline, promotionLines, PROMOTION_REMAINS, SCOPE_ITEMS } from './copy';

const UNIT_LABEL: Record<WageUnit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');
const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} /> {children}
    </label>
  );
}

export default function LeavePayClient() {
  const today = todayKst();
  const [fivePlus, setFivePlus] = useState(true);
  const [timing, setTiming] = useState<LeavePayInput['timing']>('employed');
  const [partTime, setPartTime] = useState(false);
  const [weekly, setWeekly] = useState('40');
  const [daily, setDaily] = useState('8');
  const [fullWeekly, setFullWeekly] = useState('40');
  const [fullDays, setFullDays] = useState('15');
  const [usedHours, setUsedHours] = useState('0');
  const [average, setAverage] = useState(false);
  const [unit, setUnit] = useState<WageUnit>('month');
  const [amount, setAmount] = useState('2600000');
  const [avgDaily, setAvgDaily] = useState('');
  const [otherPaid, setOtherPaid] = useState(false);
  const [byLedger, setByLedger] = useState(false);
  const [unused, setUnused] = useState('5');
  const [hire, setHire] = useState('');
  const [last, setLast] = useState(today);
  const [usedDays, setUsedDays] = useState('0');
  const [promotion, setPromotion] = useState<NonNullable<LeavePayInput['promotion']>>('unknown');
  const [before, setBefore] = useState(false);
  const [paid, setPaid] = useState('');

  const ledger = timing === 'termination' && !partTime && byLedger;
  const useAverage = average && !partTime;

  const out = useMemo(() => {
    try {
      return {
        r: calcLeavePay({
          timing, fivePlus, weeklyHours: num(weekly), dailyHours: num(daily),
          rate: useAverage ? { basis: 'average-wage', dailyRate: num(avgDaily) } : { basis: 'ordinary-wage', unit, amount: num(amount) },
          days: ledger
            ? { source: 'ledger', hireDate: hire, lastWorkDate: last, usedDays: num(usedDays) }
            : { source: 'unused', unusedDays: num(unused) },
          partTime: partTime ? { fullTimeWeeklyHours: num(fullWeekly), fullTimeDays: num(fullDays), usedHours: num(usedHours) } : undefined,
          otherPaidHours: otherPaid && (unit === 'month' || unit === 'week'),
          promotion,
          arisenBeforeTermination: timing === 'termination' ? before : undefined,
          alreadyPaid: paid.trim() ? num(paid) : undefined,
          asOf: today,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [timing, fivePlus, weekly, daily, useAverage, avgDaily, unit, amount, ledger, hire, last, usedDays, unused, partTime, fullWeekly, fullDays, usedHours, otherPaid, promotion, before, paid, today]);

  const r = 'r' in out ? out.r : undefined;
  const ptDaily = num(weekly) / 5;

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="입력">
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">상시 근로자 수</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="size" checked={fivePlus} onChange={() => setFivePlus(true)}>5명 이상</Radio>
            <Radio name="size" checked={!fivePlus} onChange={() => setFivePlus(false)}>4명 이하</Radio>
          </div>
        </fieldset>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">언제 받는 수당인가요</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="timing" checked={timing === 'employed'} onChange={() => setTiming('employed')}>재직 중(연차를 쓸 수 있는 1년이 끝남)</Radio>
            <Radio name="timing" checked={timing === 'termination'} onChange={() => setTiming('termination')}>퇴직하면서</Radio>
          </div>
        </fieldset>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">근로자</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="worker" checked={!partTime} onChange={() => setPartTime(false)}>통상 근로자</Radio>
            <Radio name="worker" checked={partTime} onChange={() => setPartTime(true)}>단시간 근로자(같은 일을 하는 통상 근로자보다 짧게 일함)</Radio>
          </div>
        </fieldset>
        <label className={small} style={muted}>
          1주 소정근로시간
          <input inputMode="decimal" className={inputCls} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          1일 소정근로시간
          <input inputMode="decimal" className={inputCls} value={daily} onChange={(e) => setDaily(e.target.value)} />
        </label>
        {partTime && (
          <label className={small} style={muted}>
            통상 근로자의 1주 소정근로시간
            <input inputMode="decimal" className={inputCls} value={fullWeekly} onChange={(e) => setFullWeekly(e.target.value)} />
          </label>
        )}
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="임금">
        {!partTime && (
          <fieldset className={`${small} sm:col-span-2`} style={muted}>
            <legend className="mb-1">수당을 무엇으로 계산하나요</legend>
            <div className="flex flex-wrap gap-4">
              <Radio name="basis" checked={!average} onChange={() => setAverage(false)}>통상임금(정함이 없으면 이것)</Radio>
              <Radio name="basis" checked={average} onChange={() => setAverage(true)}>취업규칙 등이 평균임금으로 정함</Radio>
            </div>
          </fieldset>
        )}
        {useAverage ? (
          <label className={small} style={muted}>
            1일 평균임금(원)
            <input inputMode="numeric" className={inputCls} value={avgDaily} onChange={(e) => setAvgDaily(e.target.value)} />
          </label>
        ) : (
          <>
            <fieldset className={`${small} sm:col-span-2`} style={muted}>
              <legend className="mb-1">임금을 어떤 단위로 정했나요</legend>
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
            {(unit === 'month' || unit === 'week') && (
              <label className={`${small} flex items-start gap-2 sm:col-span-2`} style={muted}>
                <input type="checkbox" className="mt-1" checked={otherPaid} onChange={(e) => setOtherPaid(e.target.checked)} />
                주휴 말고도 유급으로 정한 시간이 있다(토요일 유급 등)
              </label>
            )}
          </>
        )}
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="남은 연차">
        {partTime ? (
          <>
            <label className={small} style={muted}>
              통상 근로자라면 생겼을 연차일수
              <input inputMode="decimal" className={inputCls} value={fullDays} onChange={(e) => setFullDays(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              이미 쓴 연차 시간
              <input inputMode="decimal" className={inputCls} value={usedHours} onChange={(e) => setUsedHours(e.target.value)} />
            </label>
            <p className={`${small} sm:col-span-2`} style={muted}>
              하루 쉬면 1일 소정근로시간 {Number.isFinite(ptDaily) && ptDaily > 0 ? fmt(ptDaily) : '—'}시간(1주 소정근로시간 ÷ 5)만큼 씁니다.
            </p>
          </>
        ) : (
          <>
            {timing === 'termination' && (
              <fieldset className={`${small} sm:col-span-2`} style={muted}>
                <legend className="mb-1">남은 일수</legend>
                <div className="flex flex-wrap gap-4">
                  <Radio name="days" checked={!byLedger} onChange={() => setByLedger(false)}>남은 일수를 안다</Radio>
                  <Radio name="days" checked={byLedger} onChange={() => setByLedger(true)}>입사일로 발생 누계를 센다</Radio>
                </div>
              </fieldset>
            )}
            {ledger ? (
              <>
                <label className={small} style={muted}>
                  입사일
                  <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
                </label>
                <label className={small} style={muted}>
                  마지막 재직일
                  <input type="date" className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} />
                </label>
                <label className={small} style={muted}>
                  이미 쓰거나 수당으로 받은 일수(누계)
                  <input inputMode="decimal" className={inputCls} value={usedDays} onChange={(e) => setUsedDays(e.target.value)} />
                </label>
                <p className={`${small} sm:col-span-2`} style={muted}>
                  마지막 재직일은 마지막으로 일한 날입니다. 입사 1년째 되는 날까지 재직하면 15일이 더 생기므로, 하루 차이로 일수가 달라집니다.
                </p>
              </>
            ) : (
              <label className={small} style={muted}>
                남은 연차 일수
                <input inputMode="decimal" className={inputCls} value={unused} onChange={(e) => setUnused(e.target.value)} />
              </label>
            )}
          </>
        )}
        {timing === 'termination' && (
          <fieldset className={`${small} sm:col-span-2`} style={muted}>
            <legend className="mb-1">이 수당은 언제 생겼나요</legend>
            <div className="flex flex-wrap gap-4">
              <Radio name="origin" checked={!before} onChange={() => setBefore(false)}>퇴직하면서 처음 생김(마지막 해에 남은 연차)</Radio>
              <Radio name="origin" checked={before} onChange={() => setBefore(true)}>퇴직 전에 이미 생겨 있었음</Radio>
            </div>
          </fieldset>
        )}
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">회사가 연차 사용 촉진(서면 촉구·시기 지정)을 했나요</legend>
          <div className="flex flex-wrap gap-4">
            <Radio name="promotion" checked={promotion === 'none'} onChange={() => setPromotion('none')}>하지 않았다</Radio>
            <Radio name="promotion" checked={promotion === 'claimed'} onChange={() => setPromotion('claimed')}>했다</Radio>
            <Radio name="promotion" checked={promotion === 'unknown'} onChange={() => setPromotion('unknown')}>모른다</Radio>
          </div>
        </fieldset>
        <label className={`${small} sm:col-span-2`} style={muted}>
          회사가 지급했거나 지급하려는 금액(대조할 때만, 원)
          <input inputMode="numeric" className={inputCls} value={paid} onChange={(e) => setPaid(e.target.value)} />
        </label>
      </section>

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r)}>
          {[...effectLines(r), ...(r.status === 'calculated' ? promotionLines(r) : formulaLines(r))].map((l) => (
            <p key={l} className={`${small} mt-3`} style={muted}>{l}</p>
          ))}
        </AnswerCard>
      )}

      {r && r.status === 'calculated' && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
            {formulaLines(r).map((l) => <li key={l}>{l}</li>)}
          </ol>
        </FoldedDetail>
      )}

      <FoldedDetail summary="촉진을 했어도 지급하는 경우">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {PROMOTION_REMAINS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="이 계산기가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {SCOPE_ITEMS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
