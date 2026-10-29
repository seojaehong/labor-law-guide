'use client';

import { useMemo, useState } from 'react';
import { checkItems, compareTakeHome, QUESTIONS, SOURCES, type Answer, type Answers } from '@/lib/calc/contractor-check';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import {
  AFTER_LEAD, AFTER_RECOGNITION, CHECK_HEADLINE, CHECK_NOTES, HOMETAX_LINE, HOMETAX_URL, INPUT_GUIDE, MONEY_NOTES, NOTICE,
  OUT_OF_SCOPE, SOURCE_TITLE, answerLabel, formulaLines, itemSentence, moneyHeadline, moneyRows,
} from './copy';

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');
const heading = 'mb-3 text-base font-semibold';

export default function ContractorCheckClient() {
  const today = useMemo(() => todayKst(), []);
  const [answers, setAnswers] = useState<Answers>({});
  const [pay, setPay] = useState('3000000');
  const [meal, setMeal] = useState('');
  const [family, setFamily] = useState('1');

  const items = useMemo(() => checkItems(answers), [answers]);
  const out = useMemo(() => {
    try {
      return { r: compareTakeHome({ pay: num(pay), meal: num(meal), family: num(family) }, today) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [pay, meal, family, today]);

  return (
    <div className="space-y-4">
      <h2 className={heading} style={ink}>① 실제로 일한 모습 대조</h2>
      <section className={`${card} space-y-4`}>
        {QUESTIONS.map((q) => {
          const value = answers[q.id] ?? 'unknown';
          const options: [Answer, string][] = [['yes', q.yesLabel], ['no', q.noLabel], ['unknown', '모름']];
          return (
            <fieldset key={q.id} className={small} style={muted}>
              <legend className="mb-1" style={ink}>{q.text}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {options.map(([a, label]) => (
                  <label key={a} className="flex items-center gap-2">
                    <input type="radio" name={q.id} checked={value === a} onChange={() => setAnswers((s) => ({ ...s, [q.id]: a }))} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </section>

      <div data-part="check">
        <AnswerCard lines={CHECK_HEADLINE}>
          <ul className={`${small} mt-4 space-y-3`} style={muted}>
            {items.map((i) => (
              <li key={i.id}>
                <div style={ink}>{i.question.element} — <span className="font-semibold">{itemSentence(i)}</span></div>
                <div className="text-xs">답: {answerLabel(i)}{i.question.light ? ' · 회사가 정할 수 있는 사정으로 본 항목' : ''}</div>
              </li>
            ))}
          </ul>
        </AnswerCard>
      </div>
      {CHECK_NOTES.map((n) => <p key={n} className={small} style={muted}>{n}</p>)}

      <FoldedDetail summary="판결 원문">
        <div className={small} style={muted}>
          <div className="font-semibold" style={ink}>{SOURCE_TITLE}</div>
          {[SOURCES.standard, SOURCES.applied].map((s) => (
            <div key={s.where} className="mt-3">
              <div className="text-xs">{s.where}</div>
              <blockquote className="mt-1 border-l-2 border-[var(--color-border)] pl-3">{s.quote}</blockquote>
            </div>
          ))}
        </div>
      </FoldedDetail>

      <h2 className={`${heading} pt-6`} style={ink}>② 같은 보수의 예상 실수령</h2>
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={`${small} sm:col-span-2`} style={muted}>
          월 보수(원, 3.3%를 떼기 전 한 달 금액 전부)
          <input inputMode="numeric" className={inputCls} value={pay} onChange={(e) => setPay(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          그중 식대(원, 없으면 비움)
          <input inputMode="numeric" className={inputCls} value={meal} onChange={(e) => setMeal(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          공제대상가족 수(본인 포함)
          <input inputMode="numeric" className={inputCls} value={family} onChange={(e) => setFamily(e.target.value)} />
        </label>
      </section>

      <div data-part="money">
        {'error' in out ? (
          <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
        ) : (
          <AnswerCard lines={moneyHeadline(out.r!)}>
            <dl className={`${small} mt-4 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2`} style={muted}>
              <dt className="text-xs">항목</dt>
              <dd className="text-right text-xs">3.3%</dd>
              <dd className="text-right text-xs">근로소득</dd>
              {moneyRows(out.r!).map((x) => (
                <div key={x.label} className="contents">
                  <dt>
                    <span style={ink}>{x.label}</span>
                    <span className="block text-xs">{x.basis}</span>
                  </dt>
                  <dd className="text-right tabular-nums" style={ink}>{x.business}</dd>
                  <dd className="text-right tabular-nums" style={ink}>{x.wage}</dd>
                </div>
              ))}
            </dl>
            {MONEY_NOTES.map((n) => <p key={n} className={`${small} mt-3`} style={muted}>{n}</p>)}
          </AnswerCard>
        )}
      </div>
      <p className={small} style={muted}>
        {NOTICE}{' '}
        <a href={HOMETAX_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX_LINE}</a>
      </p>
      {'r' in out && (
        <FoldedDetail summary="산식">
          <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
            {formulaLines(out.r!, num(meal)).map((l) => <li key={l}>{l}</li>)}
          </ul>
        </FoldedDetail>
      )}

      <FoldedDetail summary="근로자로 인정되면 적용되는 조문">
        <p className={small} style={muted}>{AFTER_LEAD}</p>
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {AFTER_RECOGNITION.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="무엇을 넣나">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {INPUT_GUIDE.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="이 도구가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          {OUT_OF_SCOPE.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </FoldedDetail>
    </div>
  );
}
