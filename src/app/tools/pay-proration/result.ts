// 급여 일할계산기 결과 블록의 글자 — 계산(calcProration·calcAbsence)은 그대로 두고, 답 문장(headline·absenceHeadline)과
// 그 아래 문장(effectLines·absenceEffectLines)은 copy.ts 의 글자를 그대로 옮겨 담는다(261124 이전 화면과 같은 글자).
// 여기서는 금액 칸·근거 조문·기준일·다음 할 일만 더한다. 결과 카드는 둘(일할 계산·결근 공제)이고 label 로 나눈다.
// 기준일: 계산 모듈(minWageOf)이 읽는 것과 같은 rates.ts 의 그달 최저임금 고시 줄에서만 만든다. 고시가 없으면 비운다.
import { rateOn } from '@/content/rates';
import type { AbsenceResult, MethodId, ProrationResult, Variant } from '@/lib/calc/pay-proration';
import { STATUS_ESTIMATE, lawLink, minWageAsOf, won, type ResultAmount, type ResultView } from '@/components/tool-result/result-view';
import { METHOD_NAME, absenceEffectLines, absenceHeadline, effectLines, headline, type Basis } from './copy';

export const PRORATION_LABEL = '일할 계산 결과';
export const ABSENCE_LABEL = '결근 공제 결과';

/** 「적혀 있다」를 고르고 방식을 아직 고르지 않았을 때 맨 위에 붙는 한 줄(261124 이전 화면과 같은 글자) */
export const PICK_METHOD_HINT = '적힌 계산방법을 고르면 그 방식의 값을 맨 위에 보여 줍니다.';

const ART17 = lawLink('근로기준법 제17조(근로조건의 명시)', '근로기준법', '제17조');
const ART55 = lawLink('근로기준법 제55조(휴일)', '근로기준법', '제55조');
const ART95 = lawLink('근로기준법 제95조(제재 규정의 제한)', '근로기준법', '제95조');
const MW6 = lawLink('최저임금법 제6조(최저임금의 효력)', '최저임금법', '제6조');

/** copy.ts 의 money 와 같은 표기 — 원 미만이 남으면 소수 둘째 자리까지 */
const shown = (v: Variant) => v.amount ?? v.exact.num / v.exact.den;
const money = (v: Variant) => (v.amount !== null ? won(v.amount) : `${(v.exact.num / v.exact.den).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`);

/** 그달 최저임금 고시 줄 — 계산 모듈과 같은 날(그달 1일)로 찾는다 */
export function payProrationAsOf(month: string): string[] {
  const rate = rateOn('minWageHourly', `${month}-01`);
  return rate ? [minWageAsOf(rate)] : [];
}

function prorationAmounts(r: ProrationResult, basis: Basis): ResultAmount[] {
  if (r.status === 'full-month') return [];
  if (basis === 'FULL') return [{ label: '그달 월급 전액', value: won(r.monthlyPay) }];
  if (basis === 'unknown') {
    const xs = r.rows.filter((x) => x.id !== 'FULL').flatMap((x) => x.variants);
    const lo = xs.reduce((a, b) => (shown(b) < shown(a) ? b : a));
    const hi = xs.reduce((a, b) => (shown(b) > shown(a) ? b : a));
    return shown(lo) === shown(hi)
      ? [{ label: '방식별 값', value: money(lo) }]
      : [
        { label: '가장 적은 방식', value: money(lo) },
        { label: '가장 많은 방식', value: money(hi) },
      ];
  }
  const row = r.rows.find((x) => x.id === (basis as MethodId))!;
  if (row.variants.length === 1) return [{ label: `회사 기준(${METHOD_NAME[basis]})`, value: money(row.variants[0]!) }];
  return row.variants.map((v, i) => ({ label: v.label ?? `${METHOD_NAME[basis]} ${i + 1}`, value: money(v) }));
}

/** 일할 계산 카드 안, 판정 아래에 붙는 문장(261124 이전 답 카드의 작은 글씨) */
export const payProrationNotes = (r: ProrationResult, basis: Basis): string[] => effectLines(r, basis);

export function payProrationView(r: ProrationResult, basis: Basis): ResultView {
  const base = {
    status: STATUS_ESTIMATE,
    verdict: headline(r, basis),
    amounts: prorationAmounts(r, basis),
    basis: [ART17, ART55, MW6],
    asOf: payProrationAsOf(r.month),
  };
  if (r.status === 'full-month') {
    return {
      ...base,
      nextNote: '그달은 정한 월급 그대로입니다. 명세서 금액이 다르면 월급 대조에서 회사 문서의 계산 기준과 맞춰 봅니다.',
      next: [
        { label: '월급 대조', href: '/tools/pay-check' },
        { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
      ],
    };
  }
  const zero = base.amounts.length > 0 && base.amounts.every((a) => a.value === '0원');
  return {
    ...base,
    nextNote: zero ? ZERO_NOTE : undefined,
    next: [
      { label: '월급 대조', href: '/tools/pay-check' },
      { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
    ],
  };
}

/** 고른 방식의 값이 모두 0원일 때(31일 달 하루 재직의 공제식, 일요일 하루 재직의 시간 기준 등) */
export const ZERO_NOTE = '이 방식으로 계산하면 그달 일할 급여가 0원입니다. 회사가 실제로 이 방식으로 계산하는지 취업규칙·근로계약서·임금명세서에서 확인하고, 명세서 금액은 월급 대조에서 맞춰 봅니다.';

/** 결근 공제 카드 안, 판정 아래에 붙는 문장(261124 이전 답 카드의 작은 글씨) */
export const absenceNotes = (a: AbsenceResult): string[] => absenceEffectLines(a);

export function absenceView(a: AbsenceResult): ResultView {
  return {
    status: STATUS_ESTIMATE,
    verdict: absenceHeadline(a),
    amounts: [],
    basis: [ART55, ART95, MW6],
    asOf: payProrationAsOf(a.month),
    next: [
      { label: '월급 대조', href: '/tools/pay-check' },
      { label: '주휴수당 계산기', href: '/tools/weekly-holiday-pay' },
    ],
  };
}
