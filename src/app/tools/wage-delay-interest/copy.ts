// 임금 지연이자 계산기의 문장 — 답 카드 굵은 줄, 항목 줄, 「그래서 생기는 일」, 계산 방법, 다루지 않는 것.
// 시험(tests/unit/wage-delay-interest-copy.test.ts)이 allCopy 로 전부를 금지어로 훑는다.
// 적용 제외(§37③·시행령 §18)는 회사가 주장하고 법원이 정하는 것이라 단정하지 않는다 — 「이 기간은 적용하지 않을 수 있습니다」.
import type { DelayItemResult, DelayReason, WageDelayResult } from '@/lib/calc/wage-delay-interest';
import { fmtDate } from '@/lib/tool-kit';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const pct = (r: WageDelayResult) => `연 ${(r.items.find((i) => i.ratePerMillion > 0)?.ratePerMillion ?? 200_000) / 10_000}%`;

/** 항목마다 어느 날을 기준일로 잡았는지와 그 근거 */
export const REASON: Record<DelayReason, string> = {
  retirement: '퇴직 금품 — 퇴직일부터 14일이 되는 날(근로기준법 제37조 제1항 제1호)',
  periodic: '재직 중 임금 — 정기지급일(제37조 제1항 제2호)',
  'periodic-kept': '정기지급일 뒤에 퇴직 — 정기지급일 그대로(제37조 제2항)',
  'periodic-after-retire': '정기지급일이 퇴직일 이후 — 퇴직일부터 14일이 되는 날(제37조 제1항 제1호)',
  'before-act-retired': '2025년 10월 23일 전 정기지급일 — 재직 중에는 붙지 않고(법률 제20520호 부칙 제2조) 퇴직일부터 14일이 되는 날(제37조 제1항 제1호)',
  'before-act': '2025년 10월 23일 전 정기지급일 — 재직 중에는 이 지연이자가 붙지 않습니다(법률 제20520호 부칙 제2조)',
};

const EXCLUSION_NOTE =
  '적용 제외 사유가 있으면 이 기간은 적용하지 않을 수 있습니다. 사유에 해당하는지는 회사가 주장하고 법원이 정합니다(근로기준법 제37조 제3항, 시행령 제18조).';

/** 답 카드 굵은 줄. full = 적용 제외 기간을 빼지 않은 결과 */
export function headline(r: WageDelayResult, full?: WageDelayResult): string[] {
  if (r.items.some((i) => i.excludedDays > 0)) {
    return [
      full
        ? `지연이자는 적용 제외 기간을 빼면 ${won(r.total)}, 빼지 않으면 ${won(full.total)}입니다.`
        : `지연이자는 적용 제외 기간을 빼면 ${won(r.total)}입니다.`,
      EXCLUSION_NOTE,
    ];
  }
  if (r.total > 0) {
    return [
      `지연이자는 모두 ${won(r.total)}입니다.`,
      `항목마다 지급해야 했던 날의 다음 날부터 지급한 날까지 ${pct(r)}로 일할 계산했습니다(근로기준법 제37조 제1항, 시행령 제17조).`,
    ];
  }
  if (r.items.every((i) => i.basis === 'none')) {
    return [
      '지연이자가 붙지 않습니다.',
      '정기지급일이 2025년 10월 23일 전인 임금은 재직 중 이 지연이자가 붙지 않습니다(법률 제20520호 부칙 제2조). 퇴직할 때까지 받지 못하면 퇴직일부터 14일이 되는 날의 다음 날부터 붙습니다.',
    ];
  }
  return [
    '지연이자가 붙지 않습니다.',
    r.items.some((i) => i.basis === 'none')
      ? '기준일까지 지급했거나, 재직 중 지연이자가 붙지 않는 임금입니다. 항목별 이유는 아래에 있습니다.'
      : '모든 항목을 기준일까지 지급했습니다. 지급한 날이 기준일과 같거나 앞섭니다.',
  ];
}

/** 답 카드 아래 항목 한 줄 */
export function itemLine(it: DelayItemResult, i: number, today: string): string {
  const head = `항목 ${i + 1} ${won(it.amount)}`;
  if (!it.baseDate) return `${head} · ${REASON[it.reason]} → 지연이자 0원`;
  const excl = it.excludedDays > 0 ? `, 적용 제외 ${it.excludedDays}일을 빼면 ${it.days}일` : '';
  return `${head} · 기준일 ${fmtDate(it.baseDate, today)}: ${REASON[it.reason]} · ${fmtDate(it.paidDate, today)} 지급까지 지연 ${it.delayDays}일${excl} → 지연이자 ${won(it.interest)}`;
}

/** 적용 제외 사유(근로기준법 제37조 제3항, 시행령 제18조) */
export const EXCLUSION_REASONS: readonly string[] = [
  '천재·사변',
  '회생절차개시 결정, 파산선고 결정, 고용노동부장관의 도산등사실인정(임금채권보장법 제7조 제1항 제1호~제3호)',
  '채무자 회생 및 파산에 관한 법률·국가재정법·지방자치법 등 법령상 제약으로 임금·퇴직금 지급 자금을 확보하기 어려운 경우',
  '지급이 늦어진 임금·퇴직금의 전부 또는 일부가 있는지를 법원이나 노동위원회에서 다투는 것이 적절하다고 인정되는 경우',
  '그 밖에 위 사유에 준하는 사유',
];

/** 계산 방법(접어 둔다) */
export const FORMULA: readonly string[] = [
  '기준일 — 퇴직 금품은 퇴직일 + 14일(퇴직일은 세지 않습니다, 민법 제157조), 재직 중 임금은 정기지급일. 기준일이 토요일·공휴일이어도 미루지 않습니다(광주지방법원 2010가합8213 판결의 계산과 같음).',
  '지연 일수 — 기준일 다음 날부터 지급한 날까지(양 끝 포함) = 지급한 날 − 기준일. 지급한 날이 기준일과 같거나 앞서면 0일입니다.',
  '지연이자 — 금액 × 20/100 × (지연 일수 − 적용 제외 일수) ÷ 365. 이율은 근로기준법 시행령 제17조(2005년 7월 1일 시행분부터 같은 연 100분의 20)입니다.',
  '365로 나누는 것은 조문의 숫자가 아니라 판결에서 계산하는 방식이고, 윤년에도 365로 나눕니다. 원 미만 끝수는 법령에 정한 것이 없어 이 계산기는 항목마다 버리고 합계는 그 합으로 냅니다. 합계를 먼저 내고 버리면 몇 원 많을 수 있습니다.',
];

/** 그래서 생기는 일 */
export const CONSEQUENCES: readonly string[] = [
  '지연이자는 늦게 지급한 임금과 따로 회사가 지급해야 하는 돈입니다(근로기준법 제37조 제1항). 퇴직금은 일시금으로 지급하는 경우만 해당합니다.',
  '퇴직 금품은 당사자가 합의해 지급기일을 늦춰도 지연이자가 붙기 시작하는 날은 바뀌지 않습니다(근로기준법 제36조 단서, 고용노동부 행정해석 근로기준과-3981, 2005. 7. 28.).',
  '재직 중 정기지급일에 받지 못한 임금은 그다음 날부터 붙고, 그 뒤에 퇴직해도 정기지급일 기준이 그대로입니다(제37조 제2항). 2025년 10월 22일까지의 정기지급일 임금은 재직 중에는 붙지 않고, 퇴직할 때까지 받지 못하면 퇴직일부터 14일이 되는 날의 다음 날부터 붙습니다(법률 제20520호 부칙 제2조).',
  '퇴직 후 14일까지의 기간과 적용 제외 기간에는 민법(연 5%)·상법(연 6%)의 지연손해금이 따로 문제 될 수 있습니다. 이 계산기는 근로기준법 제37조의 연 20%만 계산합니다.',
];

/** 이 계산기가 다루지 않는 것 */
export const NOT_COVERED: readonly string[] = [
  '민법·상법 지연손해금(연 5%·6%)과 소송촉진 등에 관한 특례법의 이율',
  '퇴직연금(확정급여형·확정기여형) 부담금을 내지 않아 생기는 지연이자 — 근로자퇴직급여 보장법 제20조와 같은 법 시행령 제11조가 따로 정합니다.',
  '재직 중 받는 퇴직금 중간정산 — 개정 전 법으로는 제37조가 적용되지 않았고(대법원 2026. 3. 12. 선고 2025다214123 판결), 개정 법의 제2호에 들어가는지는 아직 정해진 기준이 없습니다.',
  '1개월을 넘는 기간으로 산정하는 상여금·장려금과 부정기 수당(근로기준법 시행령 제23조)의 제2호 기준일 — 확인된 기준이 없습니다. 정기지급일이 없는 금품은 「퇴직 때 정산하는 금품」으로 넣어 퇴직일 기준으로만 계산합니다.',
  '일부만 지급했을 때 이자와 원금 중 어디에 먼저 충당하는지(민법 제476조~제479조) — 지급한 금액과 날을 항목으로 나눠 넣습니다.',
  '적용 제외 사유에 해당하는지 — 법원이 정할 일이라 넣은 기간을 빼기만 합니다.',
  '손해배상(근로기준법 제43조의8)과 벌칙 같은 다른 제도',
];

export function allCopy(r: WageDelayResult, full: WageDelayResult | undefined, today: string): string[] {
  return [
    ...headline(r, full),
    ...r.items.map((it, i) => itemLine(it, i, today)),
    ...EXCLUSION_REASONS,
    ...FORMULA,
    ...CONSEQUENCES,
    ...NOT_COVERED,
  ];
}
