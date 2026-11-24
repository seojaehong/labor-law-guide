// 통상임금 점검 답 카드의 글자 — 판단(checkItem·sumIncluded)은 그대로 두고 받은 값을 문장으로만 바꾼다.
// 새 기준과 종전 기준을 나란히 보이는 점검이라 상태는 「확인용 비교」다. 답 문장은 summaryLines 를 그대로 쓴다.
// 기준일: 판결 원문 대조일은 ordinary-wage-sources.ts 의 주석에만 있고 값으로 두지 않아 asOf 를 비운다(지어낸 날짜를 쓰지 않는다).
import {
  AGREED_WAGE_NOTICE, OLD_ERA_NOTICE, RIGHT_TO_PAY_NOTICE, eraLabel, hourlyText, summaryLines, type Era, type ItemCheck,
} from '@/lib/calc/ordinary-wage-check';
import { STATUS_COMPARE, lawLink, won, type ResultView } from '@/components/tool-result/result-view';

type Sum = { annual: number; hourly: number; count: number };

const BASIS = [
  lawLink('근로기준법 시행령 제6조(통상임금)', '근로기준법 시행령', '제6조'),
  lawLink('근로기준법 제56조(연장·야간 및 휴일 근로)', '근로기준법', '제56조'),
];

export function ordinaryWageView(a: {
  era: Era;
  checks: ItemCheck[];
  /** 점검 기준일의 기준 · 새 기준 · 종전 기준 합계 */
  cur: Sum;
  neu: Sum;
  old: Sum;
  /** 월 기준시간 */
  hours: number;
  /** 입력 오류로 합계에서 뺀 항목 수 */
  invalid: number;
  /** 지급일 재직 조건이 붙은 항목이 있나 */
  payday: boolean;
}): ResultView {
  const { era, checks, cur, neu, old, hours, invalid, payday } = a;
  const warnings = [
    ...(era === 'old' ? [OLD_ERA_NOTICE] : []),
    ...(payday ? [RIGHT_TO_PAY_NOTICE] : []),
  ];
  const base = {
    status: STATUS_COMPARE,
    verdict: summaryLines(era, checks, cur.hourly, invalid),
    meta: [`${eraLabel('new')} ${hourlyText(neu)} · ${eraLabel('old')} ${hourlyText(old)}`],
    warnings,
    basis: BASIS,
    asOf: [] as string[],
    // 규정과의 관계 안내는 늘 붙는 한계라 caveat — 주의(warnings)는 기준·재직 조건에 따라 붙는 것만
    caveat: AGREED_WAGE_NOTICE,
  };
  if (cur.count === 0) {
    return {
      ...base,
      amounts: [],
      nextNote: '들어가는 쪽 항목이 없어 시간급을 내지 않았습니다. 「모름」으로 둔 질문이 있으면 취업규칙·임금 규정을 보고 다시 답해 보세요.',
      next: [
        { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
        { label: '월급 대조', href: '/tools/pay-check' },
      ],
    };
  }
  return {
    ...base,
    amounts: [{
      label: '시간급(참고)',
      value: hourlyText(cur),
      note: [`들어가는 쪽 항목 1년 합계 ${won(cur.annual)} ÷ 12 ÷ ${hours.toLocaleString('ko-KR')}시간`],
    }],
    next: [
      { label: '월급 대조', href: '/tools/pay-check' },
      { label: '해고예고수당 계산기', href: '/tools/notice-pay' },
    ],
  };
}
