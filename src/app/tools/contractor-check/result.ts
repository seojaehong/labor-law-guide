// 3.3% 계약 점검의 두 결과 카드 글자 — 대조(checkItems)·금액(compareTakeHome)은 그대로 두고, 답 문장도 copy.ts 것을 그대로 쓴다.
// ① 점검 카드: 판례 기준과 항목마다 대조만 하고 결론을 내지 않아 상태는 「확인용 비교」. 항목 목록은 화면 children 으로 둔다.
//    verify.mts P2·P3 가 이 카드 글자 전체에 「적습니다」·「요소가 있습니다」가 없는지 보므로 여기서 더하는 글자에 두 말을 쓰지 않는다.
// ② 금액 카드: 「예상」 실수령이라 상태는 「확인용 추정」. 세액 계산 도구 공통 장치(261028) — 참고용 계산·본인 확정신고 고지(D4 261126)와 홈택스 링크는
//    화면 children 에 글자 그대로 둔다. 연락을 권하지 않는다.
// 기준일: 판결 원문 대조일은 lib 주석에만 있어 점검 카드는 비운다. 금액 카드는 rates.ts 의 확인일과 간이세액표 개정판(WITHHOLDING_REVISION)에서만 만든다.
import { rateOn, type RateKey } from '@/content/rates';
import type { ItemCheck, MoneyResult } from '@/lib/calc/contractor-check';
import { WITHHOLDING_REVISION } from '@/lib/calc/wage-withholding-2026-02-27';
import { STATUS_COMPARE, STATUS_ESTIMATE, dotDate, lawLink, type ResultView } from '@/components/tool-result/result-view';
import { CHECK_HEADLINE, moneyHeadline, moneyRows } from './copy';

export const CHECK_LABEL = '실제로 일한 모습 대조 결과';
export const MONEY_LABEL = '같은 보수의 예상 실수령';

export function contractorCheckView(items: ItemCheck[]): ResultView {
  const empty = items.every((i) => i.answer === 'unknown');
  return {
    status: STATUS_COMPARE,
    verdict: [...CHECK_HEADLINE],
    amounts: [],
    basis: [lawLink('근로기준법 제2조(정의)', '근로기준법', '제2조')],
    asOf: [],
    ...(empty ? { nextNote: '아직 고른 답이 없어 모든 항목이 「확인이 필요합니다」입니다. 위 질문에 실제로 일한 모습대로 답하면 항목마다 판례 기준과 대조한 문장이 나옵니다.' } : {}),
    next: [
      { label: '근로계약서 점검', href: '/tools/contract-check' },
      { label: '퇴사 점검표(근로자)', href: '/exit' },
    ],
  };
}

/** 근로소득 쪽에 쓰는 rates.ts 줄 — takeHomeRatesOn 과 같은 열 개 */
const WAGE_RATE_KEYS: RateKey[] = [
  'npsEmployeePerMillion', 'npsIncomeFloor', 'npsIncomeCap', 'healthEmployeePerMillion', 'ltcEmployeePerMillion',
  'ltcToHealthPerMillion', 'healthPremiumFloor', 'healthPremiumCap', 'employmentEmployeePerMillion', 'mealNonTaxMonthly',
];

/** 금액 카드 기준일 — 근로소득 쪽에서 실제로 쓴 값만. 4대보험 줄은 4대보험을 셈했을 때(ok·표 밖), 간이세액표 줄은 소득세를 셈했을 때(ok)만.
 *  확인일은 열 줄 가운데 가장 이른 날(더 늦은 날로 말하지 않는다) */
export function moneyAsOf(r: MoneyResult, today: string): string[] {
  const s = r.wage.status;
  if (!r.rates || (s !== 'ok' && s !== 'aboveTable')) return [];
  const checked = WAGE_RATE_KEYS.map((k) => rateOn(k, today)?.checked).filter((c): c is string => !!c).sort()[0];
  if (!checked) return [];
  return [
    `근로소득 쪽 4대보험 요율·기준소득월액 하한·식대 비과세 한도는 ${dotDate(today)}에 적용되는 값 기준 · 확인 ${dotDate(checked)}`,
    ...(s === 'ok' ? [`근로소득 쪽 소득세는 ${WITHHOLDING_REVISION} 간이세액표 기준`] : []),
  ];
}

/** 근로소득 쪽을 다 셈하지 못했을 때 — 멈춘 까닭에 맞는 다음 일만 말한다(실수령액 계산기도 같은 곳에서 멈추는 경우는 그리로 보내지 않는다) */
function moneyNextNote(r: MoneyResult): string | undefined {
  switch (r.wage.status) {
    case 'ok':
      return undefined;
    case 'notComputed':
      return '근로소득 쪽 금액을 내지 않은 까닭은 위 문장에 있습니다. 그 칸을 고치면 두 쪽을 나란히 봅니다. 3.3% 쪽 금액은 그대로입니다.';
    case 'aboveTable':
      return '월 과세 급여가 1,000만원을 넘는 소득세는 간이세액표 밖이라 이 도구가 셈하지 않습니다. 3.3% 쪽 금액과 4대보험 근로자 몫만 참고합니다.';
    case 'noRates':
      return '오늘 날짜의 보험료율·기준이 반영되면 근로소득 쪽도 셈합니다. 3.3% 쪽 금액은 그대로입니다.';
  }
}

export function contractorMoneyView(r: MoneyResult, today: string): ResultView {
  const total = moneyRows(r).at(-1)!;
  const ok = r.wage.status === 'ok';
  const nextNote = moneyNextNote(r);
  return {
    status: STATUS_ESTIMATE,
    verdict: moneyHeadline(r),
    amounts: [
      { label: '3.3%로 뗀 예상 실수령', value: total.business },
      ...(ok ? [{ label: '근로소득으로 뗀 예상 실수령', value: total.wage }] : []),
    ],
    basis: [
      lawLink('소득세법 제129조(원천징수세율)', '소득세법', '제129조'),
      lawLink('지방세법 제103조의13', '지방세법', '제103조의13'),
    ],
    asOf: moneyAsOf(r, today),
    ...(nextNote ? { nextNote } : {}),
    next: [{ label: '실수령액 계산기', href: '/tools/take-home-pay' }],
  };
}
