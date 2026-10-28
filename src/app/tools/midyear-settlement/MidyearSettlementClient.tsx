'use client';

import { useMemo, useState } from 'react';
import { calcMidyear, type MidyearInput, type MidyearOutcome } from '@/lib/calc/midyear-settlement';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { effectLines, formulaLines, headline, LIMITS, NOTICE, SCOPE_ITEMS, SCOPE_STOP, whyLines } from './copy';

// 입력값은 이 화면 안에서만 계산한다 — 보내거나 저장하지 않는다.

type Field = Exclude<keyof MidyearInput, 'year'>;
const FIELDS: { key: Field; label: string }[] = [
  { key: 'totalPay', label: '받은 급여 합계(비과세 포함, 퇴직월까지)' },
  { key: 'nonTaxable', label: '비과세 급여 합계' },
  { key: 'pension', label: '국민연금(근로자 부담 합계)' },
  { key: 'health', label: '건강보험료(근로자 부담 합계)' },
  { key: 'longTermCare', label: '장기요양보험료(근로자 부담 합계)' },
  { key: 'employment', label: '고용보험료(근로자 부담 합계)' },
  { key: 'paidIncomeTax', label: '이미 낸 소득세(퇴직월 전 달까지)' },
  { key: 'paidLocalTax', label: '이미 낸 지방소득세(퇴직월 전 달까지)' },
  { key: 'lastMonthSimpleTax', label: '퇴직월 간이세액(계산에 쓰지 않음)' },
];

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

function Notice() {
  return (
    <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={muted}>
      {NOTICE.map((l) => <li key={l}>{l}</li>)}
      <li>
        <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">홈택스</a>의 연말정산 모의계산으로도 확인할 수 있습니다.
      </li>
    </ul>
  );
}

export default function MidyearSettlementClient() {
  const thisYear = Number(todayKst().slice(0, 4));
  const [scope, setScope] = useState<'' | 'none' | 'some'>('');
  const [year, setYear] = useState(thisYear);
  const [vals, setVals] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<Field, string>,
  );

  const out = useMemo((): { error: string } | { stop: true } | { o: MidyearOutcome } => {
    if (!scope) return { error: '먼저 위 경우에 해당하는 것이 있는지 골라 주세요.' };
    if (scope === 'some') return { stop: true };
    if (!vals.totalPay.trim()) return { error: '받은 급여 합계를 넣어 주세요.' };
    try {
      const inp = Object.fromEntries(FIELDS.map((f) => [f.key, num(vals[f.key])])) as Record<Field, number>;
      return { o: calcMidyear({ ...inp, year }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [scope, year, vals]);

  return (
    <div className="space-y-4">
      <section className={card}>
        <fieldset className={small} style={muted}>
          <legend className="mb-2 font-semibold" style={ink}>먼저 확인 — 올해 아래에 해당하는 것이 있나요</legend>
          <ul className="mb-3 list-disc space-y-1 pl-5">
            {SCOPE_ITEMS.map((s) => <li key={s}>{s}</li>)}
          </ul>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'none'} onChange={() => setScope('none')} /> 하나도 없다</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'some'} onChange={() => setScope('some')} /> 하나라도 있다</label>
          </div>
        </fieldset>
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={small} style={muted}>
          퇴사한 해
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className={small} style={muted}>
            {f.label}
            <input
              inputMode="numeric"
              className={inputCls}
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </label>
        ))}
        <p className={`${small} sm:col-span-2`} style={muted}>
          금액은 모두 그해 1월부터의 합계(원)입니다. 4대보험료는 급여에서 뗀 근로자 부담분이고, 퇴직정산으로 더 뗀 건강·장기요양보험료는 더하고 돌려받은 것은 뺍니다.
          이미 낸 세금에는 퇴직월 간이세액을 넣지 않습니다.
        </p>
      </section>

      {'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : 'stop' in out ? (
        <AnswerCard lines={SCOPE_STOP}><Notice /></AnswerCard>
      ) : (
        <AnswerCard lines={headline(out.o)}>
          {out.o.kind === 'ok' && (
            <>
              <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={muted}>
                {whyLines(out.o.detail).map((l) => <li key={l}>{l}</li>)}
              </ul>
              <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={ink}>
                {effectLines(out.o.detail).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </>
          )}
          <Notice />
        </AnswerCard>
      )}

      {'o' in out && out.o.kind === 'ok' && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-1 pl-5`} style={muted}>
            {formulaLines(out.o.detail).map((l) => <li key={l}>{l}</li>)}
          </ol>
        </FoldedDetail>
      )}

      <FoldedDetail summary="이 도구가 계산하지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
