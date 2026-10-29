'use client';

import { useMemo, useState } from 'react';
import { calcMidyear, defaultYear, type MidyearOutcome } from '@/lib/calc/midyear-settlement';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import {
  effectLines, firstMissing, formulaLines, headline, HOMETAX_LINK, HOMETAX_URL, INPUT_FIELDS, INPUT_GUIDE, LIMITS, NOTICE, SCOPE_ITEMS, SCOPE_STOP, whyLines,
  type MoneyField,
} from './copy';

// 입력값은 이 화면 안에서만 계산한다 — 보내거나 저장하지 않는다.

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

function Notice() {
  return (
    <ul className={`${small} mt-3 list-disc space-y-1 pl-5`} style={muted}>
      {NOTICE.map((l) => <li key={l}>{l}</li>)}
      <li>
        <a href={HOMETAX_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX_LINK.text}</a>{HOMETAX_LINK.after}
      </li>
    </ul>
  );
}

export default function MidyearSettlementClient() {
  const thisYear = Number(todayKst().slice(0, 4));
  const [scope, setScope] = useState<'' | 'none' | 'some'>('');
  // 올해 기준이 아직 없으면 미리 고르지 않는다 — 다른 해로 대신 고르지 않고 이용자가 직접 고른다
  const [year, setYear] = useState<number | null>(() => defaultYear(thisYear));
  const [vals, setVals] = useState<Record<MoneyField, string>>(
    () => Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, ''])) as Record<MoneyField, string>,
  );

  const out = useMemo((): { error: string } | { stop: true } | { o: MidyearOutcome } => {
    if (!scope) return { error: '먼저 위 경우에 해당하는 것이 있는지 골라 주세요.' };
    if (scope === 'some') return { stop: true };
    if (year === null) return { error: '퇴사한 해를 골라 주세요.' };
    const missing = firstMissing(vals);
    if (missing) return { error: missing };
    try {
      const inp = Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, num(vals[f.key])])) as Record<MoneyField, number>;
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
          <select className={inputCls} value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}>
            {year === null && <option value="">골라 주세요</option>}
            {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </label>
        {INPUT_FIELDS.map((f) => (
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
          {INPUT_GUIDE.join(' ')}
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
