'use client';

import { useMemo, useState } from 'react';
import { calcNoticePay, type NoticePayInput, type NoticePayResult } from '@/lib/calc/notice-pay';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, fmtDate, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';

type Unit = NoticePayInput['unit'];
const UNIT_LABEL: Record<Unit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

function headline(r: NoticePayResult): string[] {
  switch (r.status) {
    case 'under3m':
      return ['해고예고수당이 없습니다.', '계속 근로한 기간이 3개월이 되지 않았습니다.'];
    case 'noticed':
      return ['해고예고수당이 없습니다.', `해고일 ${r.noticeDays}일 전에 예고했습니다.`];
    case 'short':
      return [`해고예고수당은 ${won(r.amount)}입니다.`, `예고가 해고일 ${r.noticeDays}일 전이라 30일에 못 미칩니다.`];
    default:
      return [`해고예고수당은 ${won(r.amount)}입니다.`, '30일 전에 예고하지 않았으면 30일분 통상임금입니다.'];
  }
}

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
        <AnswerCard lines={headline(out.r!)}>
          {out.r!.amount > 0 && (
            <p className={`${small} mt-3`} style={muted}>
              1일 통상임금 {won(out.r!.dailyOrdinary)}(시간당 {won(Math.round(out.r!.hourly))} × {num(daily)}시간) × 30일
              {out.r!.status === 'short' ? '. 법 조문은 「30일 전에 예고를 하지 아니하였을 때에는 30일분 이상」으로 정하고 있어 30일분을 보여줍니다. 모자란 날만큼만 주면 되는지는 이 도구가 근거를 확인하지 못했습니다.' : ''}
            </p>
          )}
          {hire && dismissal && <p className={`${small} mt-2`} style={muted}>입사 {fmtDate(hire, today)} · 해고 {fmtDate(dismissal, today)}</p>}
        </AnswerCard>
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
