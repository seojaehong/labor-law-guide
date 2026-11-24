// 퇴직소득세 결과 블록의 글자 — 계산(calcRetirementTax)은 그대로 두고 받은 값을 문장으로만 바꾼다(261124).
// 판정 문장은 copy.ts 의 headline 을 그대로 쓴다(retirement-tax-copy 시험이 고정).
// 기준일: 세율표(BASIC_TAX_RATES, 퇴사한 해의 과세기간 표)의 확인일만 쓴다. 공제표 확인일은 lib 밖으로 나오지 않아 싣지 않는다.
// 세무사법 고지(「예상 금액」·세무대리 아님·홈택스 모의계산)는 링크가 있어 Client 의 ResultBlock children 으로 글자 그대로 둔다.
import { basicTaxRatesFor, type RetirementTaxResult } from '@/lib/calc/retirement-tax';
import { fmtDate } from '@/lib/tool-kit';
import { STATUS_ESTIMATE, dotDate, lawLink, won, type ResultView } from '@/components/tool-result/result-view';
import { headline } from './copy';

const BASIS = [
  lawLink('소득세법 제48조(퇴직소득공제)', '소득세법', '제48조'),
  lawLink('소득세법 제55조(세율)', '소득세법', '제55조'),
  lawLink('소득세법 제146조', '소득세법', '제146조'),
];

const NEXT = [
  { label: '퇴직금 계산기', href: '/tools/severance.html' },
  { label: '퇴사 점검표(근로자)', href: '/exit' },
];

export function retirementTaxView(a: { r: RetirementTaxResult; hire: string; last: string; today: string }): ResultView {
  const { r, hire, last, today } = a;
  const rates = basicTaxRatesFor(`${last.slice(0, 4)}-01-01`);
  const meta = [
    `근속연수 ${r.years}년(${r.months}개월) · 과세표준 ${won(r.taxBase)}`
      + `${r.taxBase > 0 ? ` · 세율 ${r.brackets.rate[1]}% 구간(소득세법 제55조)` : ''} · 합계 ${won(r.total)}`,
    `입사 ${fmtDate(hire, today)} · 퇴사 ${fmtDate(last, today)}`,
  ];
  const base = {
    status: STATUS_ESTIMATE,
    verdict: headline(r),
    meta,
    basis: BASIS,
    asOf: rates ? [`소득세법 제55조 기본세율(${rates.from.slice(0, 4)}년 이후 과세기간) 기준 · 확인 ${dotDate(rates.checked)}`] : [],
    next: NEXT,
  };
  if (r.incomeTax === 0) {
    return {
      ...base,
      amounts: [],
      nextNote: '세액이 0원이어도 퇴직급여 자체가 맞는지는 따로 봅니다. 퇴직금 계산기로 금액을 다시 확인할 수 있습니다.',
    };
  }
  return {
    ...base,
    amounts: [
      { label: '예상 퇴직소득세', value: won(r.incomeTax) },
      { label: '예상 지방소득세', value: won(r.localTax) },
    ],
  };
}
