// 실수령액 결과 블록의 글자 — 계산(calcTakeHomePay)과 문장(copy.ts headline·items·CONSEQUENCES)은 그대로 두고 블록 칸에 나눠 담는다.
// 세무 계산기라 「예상」을 금액 이름에도 붙이고, 대행 아님 고지·홈택스 링크는 화면이 블록 안에 글자 그대로 싣는다.
// 과세 급여 1,000만원 초과(aboveTable)는 소득세를 계산하지 않으므로 실수령액 금액 칸을 내지 않는다.
// 기준일: takeHomeRatesOn 이 읽는 rates.ts 열 개 키의 checked(가장 이른 날~가장 늦은 날)와 간이세액표 개정일 상수에서만 만든다.
// 간이세액표에는 확인일 상수가 없어 개정일만 적는다.
import { rateOn, type RateKey } from '@/content/rates';
import type { TakeHomeResult } from '@/lib/calc/take-home-pay';
import { WITHHOLDING_REVISION } from '@/lib/calc/wage-withholding-2026-02-27';
import { STATUS_ESTIMATE, dotDate, lawLink, type ResultLink, type ResultView } from '@/components/tool-result/result-view';
import { CONSEQUENCES, headline, items, won } from './copy';

/** takeHomeRatesOn(src/lib/calc/take-home-pay.ts)이 읽는 키 — 시험이 그 소스와 맞춰 본다 */
export const TAKE_HOME_RATE_KEYS: readonly RateKey[] = [
  'npsEmployeePerMillion', 'npsIncomeFloor', 'npsIncomeCap', 'healthEmployeePerMillion', 'ltcEmployeePerMillion',
  'ltcToHealthPerMillion', 'healthPremiumFloor', 'healthPremiumCap', 'employmentEmployeePerMillion', 'mealNonTaxMonthly',
];

/** 가장 이른 날~가장 늦은 날(같으면 한 날) */
function span(days: string[]): string {
  const s = [...days].sort();
  const [first, last] = [s[0], s[s.length - 1]];
  return first === last ? dotDate(first) : `${dotDate(first)}~${dotDate(last)}`;
}

/** date 는 rates.ts 줄을 고르는 데만 쓴다 — 화면에 적는 날짜는 그 줄들의 from(적용 시작일)·checked(확인일)이다 */
export function takeHomeAsOf(date: string): string[] {
  const rows = TAKE_HOME_RATE_KEYS.map((k) => rateOn(k, date)).filter((r): r is NonNullable<typeof r> => r !== null);
  if (!rows.length) return [];
  return [
    `4대보험 요율·한도와 식대 비과세 한도(적용 시작 ${span(rows.map((r) => r.from))}) 기준 · 확인 ${span(rows.map((r) => r.checked))}`,
    `근로소득 간이세액표 ${WITHHOLDING_REVISION} 기준`,
  ];
}

const BASIS: ResultLink[] = [
  lawLink('국민연금법 제88조', '국민연금법', '제88조'),
  lawLink('국민건강보험법 제69조', '국민건강보험법', '제69조'),
  lawLink('노인장기요양보험법 제9조', '노인장기요양보험법', '제9조'),
  lawLink('보험료징수법 제13조', '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률', '제13조'),
  lawLink('소득세법 제134조', '소득세법', '제134조'),
  lawLink('지방세법 제103조의13', '지방세법', '제103조의13'),
];

const NEXT: ResultLink[] = [
  { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
  { label: '급여 일할계산기', href: '/tools/pay-proration' },
];

export function takeHomeView({ r, date }: { r: TakeHomeResult; date: string }): ResultView {
  const lines = items(r).map((i) => `${i.label} ${i.amount} — ${i.basis}`);
  const base = {
    status: STATUS_ESTIMATE,
    verdict: headline(r),
    warnings: CONSEQUENCES,
    basis: BASIS,
    asOf: takeHomeAsOf(date),
    next: NEXT,
  };
  if (r.status === 'aboveTable') {
    return {
      ...base,
      amounts: [{ label: '예상 4대보험 근로자 몫', value: won(r.insurance), note: lines }],
      nextNote: '1,000만원을 넘는 달의 소득세는 이 도구가 계산하지 않습니다. 급여명세서에 적힌 소득세와 대조합니다.',
    };
  }
  return {
    ...base,
    amounts: [
      { label: '예상 실수령액', value: won(r.takeHome) },
      { label: '예상 공제 합계', value: won(r.deduction), note: lines },
    ],
    ...(r.tax.incomeTax === 0 && {
      nextNote: '이번 달 떼는 소득세는 0원이어도 4대보험료는 위 금액대로 뗍니다. 1년 치 소득세는 연말정산에서 다시 계산합니다(소득세법 제137조).',
    }),
  };
}
