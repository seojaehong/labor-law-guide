'use client';

import { useMemo, useState } from 'react';
import { checkMinWage, type MinWageInput } from '@/lib/calc/min-wage';
import { rateOn } from '@/content/rates';
import FoldedDetail from '@/components/tool/FoldedDetail';
import ToolSplit from '@/components/tool/ToolSplit';
import ResultBlock from '@/components/tool-result/ResultBlock';
import { card, choiceLabel, inputCls, ink, monthlyMinWage, muted, small, todayKst, wonInputError } from '@/lib/tool-kit';
import { minWageView } from './result';

type Unit = MinWageInput['unit'];
const UNIT_LABEL: Record<Unit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

/** 올해와 내년 중 고시가 있는 해 — rates.ts 에 없으면 보여주지 않는다. 기준일 줄을 위해 고시 줄(rate)을 같이 넘긴다 */
function years(today: string) {
  const y = Number(today.slice(0, 4));
  return [y, y + 1].flatMap((year) => {
    const r = rateOn('minWageHourly', `${year}-${year === y ? today.slice(5) : '01-01'}`);
    return r ? [{ year, min: r.value, rate: r }] : [];
  });
}

export default function MinWageClient() {
  const today = todayKst();
  const ys = useMemo(() => years(today), [today]);
  const [unit, setUnit] = useState<Unit>('month');
  // 단위마다 금액을 따로 둔다 — 월급 숫자가 시급 칸에 그대로 남아 「충족」으로 보이던 결함(L-07, 261122)
  const [amounts, setAmounts] = useState<Record<Unit, string>>({ month: String(monthlyMinWage(today) ?? ''), week: '', day: '', hour: '' });
  const amount = amounts[unit];
  const [bonus, setBonus] = useState('');
  const [welfare, setWelfare] = useState('');
  const [weekly, setWeekly] = useState('40');
  const [daily, setDaily] = useState('8');
  const [days, setDays] = useState('5');
  const [prob, setProb] = useState({ on: false, oneYearContract: false, withinThreeMonths: false, simpleLabor: false });

  const out = useMemo(() => {
    // 빈칸·0 은 0원으로 비교하지 않고, 금액은 10억원까지(실수령액 계산기와 같은 한도) — 계산식은 그대로다
    const bad = wonInputError(UNIT_LABEL[unit], amount, { required: true })
      ?? (unit === 'month' ? wonInputError('정기상여금', bonus) ?? wonInputError('식비·교통비 등', welfare) : null);
    if (bad) return { error: bad };
    try {
      return {
        rows: ys.map(({ year, min, rate }) => ({
          year,
          rate,
          r: checkMinWage({
            unit, amount: num(amount), monthlyBonus: num(bonus), monthlyWelfareCash: num(welfare),
            weeklyHours: num(weekly), dailyHours: num(daily), fullTimeDays: days.trim() ? num(days) : undefined, minHourly: min,
            probation: prob.on ? prob : undefined,
          }),
        })),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [ys, unit, amount, bonus, welfare, weekly, daily, days, prob]);

  const first = 'rows' in out ? out.rows![0]?.r : undefined;
  return (
    <ToolSplit
      inputs={
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">임금을 어떤 단위로 정했습니까</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
              <label key={u} className={choiceLabel}>
                <input type="radio" name="unit" checked={unit === u} onChange={() => setUnit(u)} /> {UNIT_LABEL[u]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={small} style={muted}>
          {UNIT_LABEL[unit]}(기본급 등, 연장·야간·휴일 수당은 빼고)
          <input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmounts((a) => ({ ...a, [unit]: e.target.value }))} />
        </label>
        {unit === 'day' ? (
          <label className={small} style={muted}>
            1일 소정근로시간
            <input inputMode="decimal" className={inputCls} value={daily} onChange={(e) => setDaily(e.target.value)} />
          </label>
        ) : unit !== 'hour' ? (
          <>
            <label className={small} style={muted}>
              1주 소정근로시간(연장근로 빼고)
              <input inputMode="decimal" className={inputCls} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              같은 일을 하는 통상근로자의 1주 근무일 수(보통 5일)
              <input inputMode="numeric" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
          </>
        ) : null}
        {unit === 'month' && (
          <>
            <label className={small} style={muted}>
              매달 주는 정기상여금(없으면 비움)
              <input inputMode="numeric" className={inputCls} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </label>
            <label className={small} style={muted}>
              매달 현금으로 주는 식비·교통비 등(없으면 비움)
              <input inputMode="numeric" className={inputCls} value={welfare} onChange={(e) => setWelfare(e.target.value)} />
            </label>
          </>
        )}
      </section>
      }
      result={
      'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : ys.length === 0 || !first ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>올해 최저임금 고시가 아직 반영되지 않았습니다.</p></section>
      ) : (
        <ResultBlock view={minWageView(out.rows!, unit)} label="비교 결과" />
      )
      }
    >
      <FoldedDetail summary="수습 중이라면">
        <label className={`${small} ${choiceLabel}`} style={muted}>
          <input type="checkbox" checked={prob.on} onChange={(e) => setProb({ ...prob, on: e.target.checked })} /> 수습 기간이다
        </label>
        {prob.on && (
          <div className="space-y-2 pl-6">
            {([
              ['oneYearContract', '근로계약 기간이 1년 이상이다(기간을 정하지 않은 계약 포함)'],
              ['withinThreeMonths', '수습을 시작한 날부터 3개월이 지나지 않았다'],
              ['simpleLabor', '한국표준직업분류의 단순노무 종사자다(청소·경비·배달·단순 포장 등)'],
            ] as const).map(([k, label]) => (
              <label key={k} className={`${small} ${choiceLabel}`} style={muted}>
                <input type="checkbox" checked={prob[k]} onChange={(e) => setProb({ ...prob, [k]: e.target.checked })} /> {label}
              </label>
            ))}
            <p className={small} style={muted}>앞의 둘에 해당하고 단순노무 직종이 아니면 최저임금의 90%를 기준으로 봅니다.</p>
          </div>
        )}
      </FoldedDetail>

      <FoldedDetail summary="무엇을 넣고 무엇을 빼나">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>넣는 것: 기본급, 직무·직책수당처럼 매달 정해서 주는 수당, 매달 주는 정기상여금, 매달 현금으로 주는 식비·교통비·숙박비</li>
          <li>빼는 것: 연장·야간·휴일근로 수당, 연차 미사용 수당, 두 달 이상에 한 번 주는 상여금, 현물로 주는 식사·숙소</li>
          <li>월급은 (1주 소정근로시간 + 주휴 시간) × 365 ÷ 7 ÷ 12 시간으로 나눕니다. 주 40시간이면 고시대로 209시간입니다.</li>
          <li>그 밖의 시간은 소수점 아래를 버리거나 반올림하지 않고 나눕니다. 주 20시간이면 104.29시간입니다.</li>
          <li>주휴 시간은 1주 소정근로시간 ÷ 같은 일을 하는 통상근로자의 1주 근무일 수입니다(8시간까지).</li>
          <li>주 15시간 미만이면 주휴 시간 없이 셉니다.</li>
        </ul>
      </FoldedDetail>
    </ToolSplit>
  );
}
