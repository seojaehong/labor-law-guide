'use client';

import { useMemo, useState } from 'react';
import { calcTakeHomePay, takeHomeRatesOn, type TakeHomeInput } from '@/lib/calc/take-home-pay';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { CONSEQUENCES, HOMETAX_LINE, HOMETAX_URL, NOTICE, OUT_OF_SCOPE, formulaLines, headline, items, won } from './copy';

type Ratio = NonNullable<TakeHomeInput['ratio']>;
const RATIOS: Ratio[] = [80, 100, 120];

const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');

export default function TakeHomePayClient() {
  const rates = useMemo(() => takeHomeRatesOn(todayKst()), []);
  const [pay, setPay] = useState('3000000');
  const [meal, setMeal] = useState('200000');
  const [other, setOther] = useState('');
  const [family, setFamily] = useState('1');
  const [children, setChildren] = useState('0');
  const [ratio, setRatio] = useState<Ratio>(100);
  const [npsExempt, setNpsExempt] = useState(false);
  const [employmentExempt, setEmploymentExempt] = useState(false);

  const out = useMemo(() => {
    if (!rates) return { error: '오늘 날짜에 맞는 보험료율·기준이 아직 반영되지 않았습니다.' };
    try {
      return {
        r: calcTakeHomePay(
          { pay: num(pay), meal: num(meal), otherNonTax: num(other), family: num(family), children: num(children), ratio, npsExempt, employmentExempt },
          rates,
        ),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [rates, pay, meal, other, family, children, ratio, npsExempt, employmentExempt]);

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={`${small} sm:col-span-2`} style={muted}>
          월 급여(세전, 식대 등 비과세 포함 그달 받기로 한 금액 전부)
          <input inputMode="numeric" className={inputCls} value={pay} onChange={(e) => setPay(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          식대(식사를 따로 제공받지 않는 경우)
          <input inputMode="numeric" className={inputCls} value={meal} onChange={(e) => setMeal(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          그 밖의 비과세 금액(없으면 비움)
          <input inputMode="numeric" className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          공제대상가족 수(본인 포함)
          <input inputMode="numeric" className={inputCls} value={family} onChange={(e) => setFamily(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          그중 8세 이상 20세 이하 자녀 수
          <input inputMode="numeric" className={inputCls} value={children} onChange={(e) => setChildren(e.target.value)} />
        </label>
        <fieldset className={`${small} sm:col-span-2`} style={muted}>
          <legend className="mb-1">소득세 원천징수 비율(회사에 신청한 경우만 80% 또는 120%)</legend>
          <div className="flex flex-wrap gap-4">
            {RATIOS.map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="ratio" checked={ratio === v} onChange={() => setRatio(v)} /> {v}%
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={`${small} space-y-2 sm:col-span-2`} style={muted}>
          <legend className="mb-1">해당하면 고릅니다</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={npsExempt} onChange={(e) => setNpsExempt(e.target.checked)} /> 국민연금 공제 대상이 아님(만 60세 이상 등)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={employmentExempt} onChange={(e) => setEmploymentExempt(e.target.checked)} /> 만 65세 이후 새로 고용됨
          </label>
        </fieldset>
      </section>

      {'error' in out ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{out.error}</p></section>
      ) : (
        <>
          <AnswerCard lines={headline(out.r!)}>
            <dl className={`${small} mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2`} style={muted}>
              {items(out.r!).map((i) => (
                <div key={i.label} className="contents">
                  <dt>
                    <span style={ink}>{i.label}</span>
                    <span className="block text-xs">{i.basis}</span>
                  </dt>
                  <dd className="text-right tabular-nums" style={ink}>{i.amount}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="border-t border-[var(--color-border)] pt-2 font-semibold" style={ink}>
                  {out.r!.status === 'ok' ? '공제 합계' : '4대보험 합계'}
                </dt>
                <dd className="border-t border-[var(--color-border)] pt-2 text-right font-semibold tabular-nums" style={ink}>
                  {won(out.r!.status === 'ok' ? out.r!.deduction : out.r!.insurance)}
                </dd>
              </div>
            </dl>
            {CONSEQUENCES.map((c) => <p key={c} className={`${small} mt-3`} style={muted}>{c}</p>)}
          </AnswerCard>
          <p className={small} style={muted}>
            {NOTICE}{' '}
            <a href={HOMETAX_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX_LINE}</a>
          </p>
          <FoldedDetail summary="산식">
            <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
              {formulaLines(out.r!, rates!).map((l) => <li key={l}>{l}</li>)}
            </ul>
          </FoldedDetail>
        </>
      )}

      <FoldedDetail summary="무엇을 넣나">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>월 급여: 기본급·수당·식대 등 그달 받기로 한 세전 금액 전부입니다. 연장·야간·휴일 수당도 넣습니다.</li>
          <li>식대: 회사가 식사를 따로 주지 않을 때 받는 식대입니다. 월 20만원까지만 비과세이고 넘는 부분은 과세로 셉니다(소득세법 제12조제3호러목).</li>
          <li>그 밖의 비과세: 6세 이하 자녀 보육수당(자녀 1명당 월 20만원까지), 본인 차량을 업무에 쓰고 받는 자가운전보조금(월 20만원까지)처럼 비과세 한도 안의 금액만 넣습니다.</li>
          <li>공제대상가족: 본인과 배우자를 각각 1명으로 세고, 기본공제 대상 부양가족을 더합니다(별표2 제2호).</li>
          <li>원천징수 비율: 회사에 80% 또는 120%를 신청하지 않았으면 100%입니다(소득세법 시행령 제194조).</li>
          <li>국민연금은 만 60세가 되면 의무가입이 끝나고(국민연금법 제8조제1항·제12조제1항제4호), 고용보험료는 만 65세 이후에 새로 고용된 사람에게서 걷지 않습니다(보험료징수법 제13조제3항). 65세 전부터 계속 일한 사람은 해당하지 않습니다.</li>
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
