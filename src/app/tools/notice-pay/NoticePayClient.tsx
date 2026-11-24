'use client';

import { useMemo, useState } from 'react';
import { calcNoticePay, type NoticePayInput } from '@/lib/calc/notice-pay';
import FoldedDetail from '@/components/tool/FoldedDetail';
import ResultBlock from '@/components/tool-result/ResultBlock';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { noticePayView } from './result';

type Unit = NoticePayInput['unit'];
const UNIT_LABEL: Record<Unit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

export default function NoticePayClient() {
  const today = todayKst();
  const [unit, setUnit] = useState<Unit>('month');
  const [amount, setAmount] = useState('2156880');
  const [weekly, setWeekly] = useState('40');
  const [daily, setDaily] = useState('8');
  const [hire, setHire] = useState('');
  const [dismissal, setDismissal] = useState(today);
  const [noticed, setNoticed] = useState(false);
  const [notice, setNotice] = useState('');

  const out = useMemo(() => {
    if (!hire) return { error: '입사일을 넣어 주세요.' };
    try {
      return {
        r: calcNoticePay({
          unit, amount: num(amount), weeklyHours: num(weekly), dailyHours: num(daily),
          hireDate: hire, dismissalDate: dismissal, noticeDate: noticed && notice ? notice : undefined,
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [unit, amount, weekly, daily, hire, dismissal, noticed, notice]);

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={small} style={muted}>
          입사일
          <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          해고일(근로관계가 끝나는 날)
          <input type="date" className={inputCls} value={dismissal} onChange={(e) => setDismissal(e.target.value)} />
        </label>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">해고를 미리 알렸나요</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="notice" checked={!noticed} onChange={() => setNoticed(false)} /> 알리지 않았다</label>
            <label className="flex items-center gap-2"><input type="radio" name="notice" checked={noticed} onChange={() => setNoticed(true)} /> 알렸다</label>
          </div>
        </fieldset>
        {noticed && (
          <label className={small} style={muted}>
            알린 날
            <input type="date" className={inputCls} value={notice} onChange={(e) => setNotice(e.target.value)} />
          </label>
        )}
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">임금을 어떤 단위로 정했나요</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
              <label key={u} className="flex items-center gap-2">
                <input type="radio" name="unit" checked={unit === u} onChange={() => setUnit(u)} /> {UNIT_LABEL[u]}
              </label>
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

      {'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : (
        <ResultBlock view={noticePayView({ r: out.r!, dailyHours: num(daily), hire, dismissal })} />
      )}

      <FoldedDetail summary="수당을 주지 않아도 되는 경우">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>계속 근로한 기간이 3개월 미만인 경우 — 날짜로 위에서 계산합니다.</li>
          <li>천재·사변, 그 밖의 부득이한 사유로 사업을 계속할 수 없는 경우</li>
          <li>근로자가 고의로 사업에 막대한 지장을 주거나 재산상 손해를 끼친 경우로서 고용노동부령(근로기준법 시행규칙 별표)이 정한 사유에 해당하는 경우</li>
          <li>뒤의 두 경우는 사실관계에 따라 달라 이 도구가 계산에 넣지 않습니다.</li>
        </ul>
      </FoldedDetail>
    </div>
  );
}
