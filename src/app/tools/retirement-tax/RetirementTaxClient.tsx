'use client';

import { useMemo, useState } from 'react';
import { calcRetirementTax, type RetirementTaxResult } from '@/lib/calc/retirement-tax';
import AnswerCard from '@/components/tool/AnswerCard';
import FoldedDetail from '@/components/tool/FoldedDetail';
import { card, fmtDate, inputCls, ink, muted, small, todayKst } from '@/lib/tool-kit';

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

function headline(r: RetirementTaxResult, pay: number): string[] {
  if (r.incomeTax === 0) {
    const why = r.serviceDeductionCapped
      ? `퇴직급여가 근속연수공제(${won(r.serviceDeductionTable)})보다 적어 공제하고 남는 금액이 없습니다.`
      : r.taxBase === 0
        ? '환산급여가 800만원 이하라 환산급여공제를 빼면 과세표준이 0원입니다.'
        : '산출세액이 10원이 되지 않아 10원 미만을 버리면 0원입니다.';
    return ['예상 퇴직소득세는 0원입니다.', why];
  }
  return [
    `예상 퇴직소득세는 ${won(r.incomeTax)}, 지방소득세는 ${won(r.localTax)}입니다.`,
    `두 세금을 떼면 손에 남는 금액은 ${won(pay - r.total)}입니다.`,
  ];
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
          입사일
          <input type="date" className={inputCls} value={hire} onChange={(e) => setHire(e.target.value)} />
        </label>
        <label className={small} style={muted}>
          퇴사일(마지막 근무일)
          <input type="date" className={inputCls} value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
        <p className={`${small} sm:col-span-2`} style={muted}>
          퇴사일에는 마지막으로 일한 날을 넣습니다. 그다음 날(4대보험 상실일, 퇴직금 계산의 퇴직일)을 넣으면 근속연수가 1년 늘어 세액이 달라질 수 있습니다.
        </p>
      </section>

      {!r ? (
        <section className={card} aria-live="polite"><p className={small} style={ink}>{'error' in out ? out.error : ''}</p></section>
      ) : (
        <AnswerCard lines={headline(r, p)}>
          <p className={`${small} mt-3`} style={muted}>
            근속연수 {r.years}년({r.months}개월) · 과세표준 {won(r.taxBase)}
            {r.taxBase > 0 ? ` · 세율 ${r.brackets.rate[1]}% 구간(소득세법 제55조)` : ''} · 합계 {won(r.total)}
          </p>
          <p className={`${small} mt-2`} style={muted}>
            입사 {fmtDate(hire, today)} · 퇴사 {fmtDate(last, today)}
          </p>
          <p className={`${small} mt-3`} style={muted}>
            예상 금액입니다. 세무대리·신고서 작성 대행이 아닙니다. 같은 값을{' '}
            <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">홈택스</a>{' '}
            모의계산으로 대조해 볼 수 있습니다.
          </p>
        </AnswerCard>
      )}

      {r && (
        <FoldedDetail summary="계산 과정">
          <ol className={`${small} list-decimal space-y-2 pl-5`} style={muted}>
            <li>
              근속연수 — 입사일부터 퇴사일까지 꽉 찬 달 {r.months - 1}개월 + 1 = {r.months}개월, 12로 나눠 올림 = {r.years}년
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
          <li>회사는 퇴직급여를 줄 때 퇴직소득세를 떼고 줍니다(소득세법 제146조 제1항). 지방소득세도 함께 뗍니다(지방세법 제103조의13 제1항).</li>
          <li>지급일이 속한 달의 다음 달 말일까지 퇴직소득 원천징수영수증을 받습니다(소득세법 제146조 제3항). 근속연수공제·환산급여·과세표준·산출세액 칸을 이 화면의 계산 과정과 대조할 수 있습니다.</li>
          <li>퇴직하고 받은 날부터 60일 안에 연금계좌로 옮기면 연금 외로 찾기 전까지 세금을 떼지 않습니다(소득세법 제146조 제2항). 이 계산기는 그 경우를 계산하지 않습니다.</li>
        </ul>
      </FoldedDetail>

      <FoldedDetail summary="이 계산기가 다루지 않는 것">
        <ul className={`${small} list-disc space-y-1 pl-5`} style={muted}>
          <li>비과세 퇴직소득, 임원 퇴직소득 한도를 넘는 부분 — 넣은 퇴직급여 전액을 과세 대상으로 봅니다.</li>
          <li>중간정산(퇴직소득 중간지급)과 같은 해 이전 직장 퇴직금 합산 — 국세청 프로그램도 이 경우는 퇴직소득 확정신고 대상으로 안내합니다.</li>
          <li>근속연수에서 빼는 기간(소득세법 시행령 제105조 제1항 단서)과 더하는 기간(같은 조 제2항)</li>
          <li>공적연금 일시금, 건설근로자 퇴직공제금 — 근속연수를 세는 방법이 다릅니다.</li>
          <li>연금계좌 과세이연과 이연퇴직소득세, 이미 낸 세액과 세액공제</li>
          <li>2022년 12월 31일 이전 퇴사 — 종전 공제표·세율을 적용합니다.</li>
          <li>비거주자, 세액 감면</li>
        </ul>
      </FoldedDetail>
    </div>
  );
}
