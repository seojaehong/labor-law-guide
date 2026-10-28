'use client';

import { useMemo, useState } from 'react';
import { calcRetirementTax } from '@/lib/calc/retirement-tax';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, fmtDate, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';
import { CONSEQUENCES, HIRE_LABEL, HIRE_NOTE, HOMETAX, NOT_COVERED, headline } from './copy';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const num = (s: string) => Number(s.replace(/,/g, '').trim() || '0');
/** 만원 단위로 떨어지는 표 금액은 억·만으로 — 15,000,000 → 1,500만원 · 151,700,000 → 1억 5,170만원 · 300,000,000 → 3억원 */
function man(n: number): string {
  if (n % 10_000 !== 0) return won(n);
  const m = n / 10_000;
  const eok = Math.floor(m / 10_000);
  const rest = m % 10_000;
  if (!eok) return `${rest.toLocaleString('ko-KR')}만원`;
  return `${eok.toLocaleString('ko-KR')}억${rest ? ` ${rest.toLocaleString('ko-KR')}만` : ''}원`;
}

export default function RetirementTaxClient() {
  const today = todayKst();
  const [pay, setPay] = useState('');
  const [hire, setHire] = useState('');
  const [last, setLast] = useState(today);

  const out = useMemo(() => {
    if (!pay.trim()) return { error: '퇴직급여를 넣어 주세요.' };
    if (!hire) return { error: '입사일을 넣어 주세요.' };
    try {
      return { r: calcRetirementTax({ pay: num(pay), hireDate: hire, lastWorkDate: last }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [pay, hire, last]);

  const r = 'r' in out ? out.r : undefined;
  const p = num(pay);

  return (
    <div className="space-y-4">
      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <label className={`${small} sm:col-span-2`} style={muted}>
          퇴직급여(원)
          <input inputMode="numeric" className={inputCls} value={pay} onChange={(e) => setPay(e.target.value)} placeholder="예: 60000000" />
        </label>
        <label className={small} style={muted}>
          {HIRE_LABEL}
          <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          퇴사일(마지막 근무일)
          <input type="date" className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
        <p className={`${small} sm:col-span-2`} style={muted}>
          퇴사일에는 마지막으로 일한 날을 넣습니다. 그다음 날(4대보험 상실일, 퇴직금 계산의 퇴직일)을 넣으면 근속연수가 1년 늘어 세액이 달라질 수 있습니다.
          {' '}{HIRE_NOTE}
        </p>
      </section>

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r)}>
          <p className={`${small} mt-3`} style={muted}>
            근속연수 {r.years}년({r.months}개월) · 과세표준 {won(r.taxBase)}
            {r.taxBase > 0 ? ` · 세율 ${r.brackets.rate[1]}% 구간(소득세법 제55조)` : ''} · 합계 {won(r.total)}
          </p>
          <p className={`${small} mt-2`} style={muted}>
            입사 {fmtDate(hire, today)} · 퇴사 {fmtDate(last, today)}
          </p>
          <p className={`${small} mt-3`} style={muted}>
            예상 금액입니다. 세무대리·신고서 작성 대행이 아닙니다.{' '}
            홈택스{' '}
            <a href={HOMETAX.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{HOMETAX.name}</a>
            {HOMETAX.note}
          </p>
        </AnswerCard>
      )}

      {r && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
            <li>
              근속연수 — 입사일에서 퇴사일까지 지난 개월 수 {r.months - 1}개월(1개월 미만 버림) + 1 = {r.months}개월, 12로 나눠 올림 = {r.years}년
            </li>
            <li>
              근속연수공제 — {r.brackets.service[2] === 0
                ? `${man(r.brackets.service[1])} × ${r.years}년`
                : `${man(r.brackets.service[0])} + ${man(r.brackets.service[1])} × (${r.years} − ${r.brackets.service[2]})년`}{' '}
              = {won(r.serviceDeductionTable)}
              {r.serviceDeductionCapped ? ` → 퇴직급여(${won(p)})가 더 적어 ${won(r.serviceDeduction)}만 뺍니다(제48조 제2항)` : ''}
            </li>
            <li>
              환산급여 — ({won(p)} − {won(r.serviceDeduction)}) × 12 ÷ {r.years}년 = {won(r.converted)}(원 미만 버림)
            </li>
            <li>
              환산급여공제 — {r.brackets.converted[2] === 0
                ? `환산급여 전액 = ${won(r.convertedDeduction)}`
                : `${man(r.brackets.converted[0])} + (${won(r.converted)} − ${man(r.brackets.converted[2])}) × ${r.brackets.converted[1]}% = ${won(r.convertedDeduction)}(원 미만 버림)`}
            </li>
            <li>과세표준 — {won(r.converted)} − {won(r.convertedDeduction)} = {won(r.taxBase)}</li>
            <li>
              환산산출세액 — {r.taxBase === 0
                ? '0원'
                : r.brackets.rate[2] === 0
                  ? `${won(r.taxBase)} × ${r.brackets.rate[1]}% = ${won(r.convertedTax)}(원 미만 버림)`
                  : `${man(r.brackets.rate[0])} + (${won(r.taxBase)} − ${man(r.brackets.rate[2])}) × ${r.brackets.rate[1]}% = ${won(r.convertedTax)}(원 미만 버림)`}
            </li>
            <li>산출세액 — {won(r.convertedTax)} × {r.years}년 ÷ 12 = {won(r.calculatedTax)}(원 미만 버림)</li>
            <li>퇴직소득세 — 10원 미만 버림 = {won(r.incomeTax)}</li>
            <li>지방소득세 — {won(r.incomeTax)} × 10%에서 10원 미만 버림 = {won(r.localTax)}</li>
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
