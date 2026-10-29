'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { calcDailyWorkerTax, expandLines, type DailyWorkerTaxResult } from '@/lib/calc/daily-worker-tax';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small } from '@/lib/tool-kit';
import {
  CONSEQUENCES, ELIGIBILITY_NO, ELIGIBILITY_NOTE, ELIGIBILITY_STOP, ELIGIBILITY_YES, formulaLines, headline, HOMETAX, INPUT_GUIDE, NOT_COVERED, NOTICE, NTS,
  paymentLine, won,
} from './copy';

// 입력값은 이 화면 안에서만 계산한다 — 보내거나 저장하지 않는다.

interface Line { wage: string; days: string }
interface Pay { lines: Line[] }

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');
const newLine = (): Line => ({ wage: '', days: '1' });

/** 빈 칸 안내 — 다 채웠으면 null */
function firstBlank(pays: Pay[]): string | null {
  for (const [i, p] of pays.entries()) {
    if (p.lines.some((l) => !l.wage.trim())) return `지급 ${i + 1}의 일급을 넣어 주세요.`;
    if (p.lines.some((l) => !l.days.trim())) return `지급 ${i + 1}의 일수를 넣어 주세요.`;
  }
  return null;
}

function Notice() {
  return (
    <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={muted}>
      {NOTICE.map((l) => <li key={l}>{l}</li>)}
      <li>
        <a href={NTS.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{NTS.text}</a>{NTS.after}{' '}
        <a href={HOMETAX.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX.text}</a>{HOMETAX.after}
      </li>
    </ul>
  );
}

export default function DailyWorkerTaxClient() {
  const [eligible, setEligible] = useState<'' | 'yes' | 'no'>('');
  const [pays, setPays] = useState<Pay[]>([{ lines: [newLine()] }]);

  const setLine = (i: number, j: number, patch: Partial<Line>) =>
    setPays((ps) => ps.map((p, a) => (a === i ? { lines: p.lines.map((l, b) => (b === j ? { ...l, ...patch } : l)) } : p)));

  const out = useMemo((): { error: string } | { stop: true } | { r: DailyWorkerTaxResult } => {
    if (!eligible) return { error: '먼저 일용근로자인지 골라 주세요.' };
    if (eligible === 'no') return { stop: true };
    const blank = firstBlank(pays);
    if (blank) return { error: blank };
    try {
      return {
        r: calcDailyWorkerTax({
          payments: pays.map((p) => ({ days: expandLines(p.lines.map((l) => ({ dailyWage: num(l.wage), days: num(l.days) }))) })),
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [eligible, pays]);

  return (
    <div className="space-y-4">
      <section className={card}>
        <fieldset className={small} style={muted}>
          <legend className="mb-2 font-semibold" style={ink}>먼저 확인 — 일용근로자인가요</legend>
          <p className="mb-3">{ELIGIBILITY_NOTE}</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="eligible" checked={eligible === 'yes'} onChange={() => setEligible('yes')} /> {ELIGIBILITY_YES}</label>
            <label className="flex items-center gap-2"><input type="radio" name="eligible" checked={eligible === 'no'} onChange={() => setEligible('no')} /> {ELIGIBILITY_NO}</label>
          </div>
        </fieldset>
      </section>

      {pays.map((p, i) => (
        <section key={i} aria-label={`지급 ${i + 1}`} className={`${card} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold" style={ink}>지급 {i + 1}</span>
            {pays.length > 1 && (
              <button type="button" className={`${small} underline underline-offset-2`} style={muted} onClick={() => setPays((ps) => ps.filter((_, a) => a !== i))}>
                지급 빼기
              </button>
            )}
          </div>
          {p.lines.map((l, j) => (
            <div key={j} role="group" aria-label={`줄 ${j + 1}`} className="grid grid-cols-[1fr_6rem] items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
              <label className={small} style={muted}>
                일급(원)
                <input inputMode="numeric" className={inputCls} value={l.wage} onChange={(e) => setLine(i, j, { wage: e.target.value })} placeholder="예: 200000" />
              </label>
              <label className={small} style={muted}>
                일수
                <input inputMode="numeric" className={inputCls} value={l.days} onChange={(e) => setLine(i, j, { days: e.target.value })} />
              </label>
              {p.lines.length > 1 && (
                <button
                  type="button"
                  className={`${small} col-span-2 justify-self-start underline underline-offset-2 sm:col-span-1 sm:pb-2`}
                  style={muted}
                  onClick={() => setPays((ps) => ps.map((q, a) => (a === i ? { lines: q.lines.filter((_, b) => b !== j) } : q)))}
                >
                  줄 빼기
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className={`${small} underline underline-offset-2`}
            style={ink}
            onClick={() => setPays((ps) => ps.map((q, a) => (a === i ? { lines: [...q.lines, newLine()] } : q)))}
          >
            일급이 다른 날 더하기
          </button>
        </section>
      ))}
      <button
        type="button"
        className={`${small} rounded-lg border border-[var(--color-border)] px-3 py-2`}
        style={ink}
        onClick={() => setPays((ps) => [...ps, { lines: [newLine()] }])}
      >
        지급 더하기
      </button>
      <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
        {INPUT_GUIDE.map((l) => <li key={l}>{l}</li>)}
      </ul>

      {'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : 'stop' in out ? (
        <AnswerCard lines={ELIGIBILITY_STOP}>
          <p className={`${small} mt-3`} style={muted}>
            <Link href="/tools/take-home-pay" className="underline underline-offset-2">실수령액 계산기</Link>
          </p>
        </AnswerCard>
      ) : (
        <AnswerCard lines={headline(out.r)}>
          {out.r.payments.length > 1 ? (
            <ul className={`${small} mt-3 space-y-1`} style={muted}>
              {out.r.payments.map((p, i) => <li key={i}>{paymentLine(p, i)}</li>)}
            </ul>
          ) : (
            <p className={`${small} mt-3`} style={muted}>
              {out.r.payments[0].days.length}일분 과세 일급 합계 {won(out.r.gross)} · 떼는 세금 합계 {won(out.r.total)}
            </p>
          )}
          <Notice />
        </AnswerCard>
      )}

      {'r' in out && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-1 pl-5`} style={muted}>
            {formulaLines(out.r).map((l) => <li key={l}>{l}</li>)}
          </ol>
        </FoldedDetail>
      )}

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
