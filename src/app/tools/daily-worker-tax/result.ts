// 일용근로소득 원천징수 결과 블록의 글자 — 계산(calcDailyWorkerTax)과 답 문장(copy.ts headline·paymentLine)은 그대로 두고 블록 칸에 나눠 담는다.
// 세무 계산기라 「예상」을 금액 이름에도 붙이고, 원천징수의무자 고지(D4 261126)·국세청·홈택스 링크는 화면(Notice)이 블록 안에 글자 그대로 싣는다.
// 끝수 순서가 갈리면(r.differs) 두 값을 금액 칸 둘로 같은 무게로 낸다 — 어느 순서인지 원문으로 닫히지 않았다(copy.ts ROUNDING_NOTE).
// 기준일: DAILY_WORKER_RULE 의 from(적용 소득의 첫날)·checked(조문 확인일)에서만 만든다.
import { DAILY_WORKER_RULE as RULE, type DailyWorkerTaxResult } from '@/lib/calc/daily-worker-tax';
import { STATUS_ESTIMATE, STATUS_STOP, dotDate, lawLink, type ResultLink, type ResultView } from '@/components/tool-result/result-view';
import { CONSEQUENCES, ELIGIBILITY_STOP, headline, paymentLine, won } from './copy';

/** 일용근로자가 아니라 계산하지 않을 때의 상태 띠 — 추정값을 낸 것처럼 보이지 않게 한다 */
export { STATUS_STOP } from '@/components/tool-result/result-view';

const BASIS: ResultLink[] = [
  lawLink('소득세법 제47조', '소득세법', '제47조'),
  lawLink('소득세법 제59조', '소득세법', '제59조'),
  lawLink('소득세법 제86조', '소득세법', '제86조'),
  lawLink('소득세법 제129조', '소득세법', '제129조'),
  lawLink('소득세법 제134조', '소득세법', '제134조'),
  lawLink('지방세법 제103조의13', '지방세법', '제103조의13'),
];

function asOf(): string[] {
  const [y, m, d] = RULE.from.split('-').map(Number);
  return [`${y}년 ${m}월 ${d}일 이후 발생 소득 기준 · 조문 확인 ${dotDate(RULE.checked)}`];
}

const NEXT: ResultLink[] = [
  { label: '3.3% 계약 점검', href: '/tools/contractor-check' },
  { label: '공휴일 수당 계산기', href: '/tools/holiday-pay' },
];

export function dailyWorkerTaxView(r: DailyWorkerTaxResult): ResultView {
  const meta = r.payments.length > 1
    ? r.payments.map(paymentLine)
    : [`${r.payments[0].days.length}일분 과세 일급 합계 ${won(r.gross)} · 떼는 세금 합계 ${won(r.total)}`];
  const amounts = r.differs
    ? [
      { label: '예상 소득세 · 합계에서 한 번 버리면', value: won(r.incomeTax), note: [`지방소득세 ${won(r.localTax)}`] },
      { label: '예상 소득세 · 날마다 1원 미만을 먼저 버리면', value: won(r.dailyFloor.incomeTax), note: [`지방소득세 ${won(r.dailyFloor.localTax)}`] },
    ]
    : [
      { label: '예상 원천징수 소득세', value: won(r.incomeTax) },
      { label: '예상 지방소득세', value: won(r.localTax) },
    ];
  return {
    status: STATUS_ESTIMATE,
    verdict: headline(r),
    meta,
    amounts,
    basis: BASIS,
    asOf: asOf(),
    // 0원일 때 — 소액부징수 지급이 있으면 지급명세서 안내(CONSEQUENCES 글자 그대로), 과세표준 0 이면 새 주장 없이 아래 접은 안내로 보낸다
    ...(r.incomeTax === 0 && {
      nextNote: r.payments.some((p) => p.small) ? CONSEQUENCES[3] : '지급한 뒤 할 일(지급명세서 제출 기한 등)은 아래 「그래서 생기는 일」에 적었습니다.',
    }),
    next: NEXT,
  };
}

/** 일용근로자가 아니다 — 결과를 내지 않는다. 문장은 ELIGIBILITY_STOP 그대로 */
export function dailyWorkerStopView(): ResultView {
  return {
    status: STATUS_STOP,
    verdict: ELIGIBILITY_STOP,
    amounts: [],
    basis: [lawLink('소득세법 시행령 제20조', '소득세법 시행령', '제20조')],
    asOf: [],
    nextNote: '일용근로자인지는 맨 위 세 갈래(소득세법 시행령 제20조 제1항)에 해당하는지로 가립니다.',
    next: [{ label: '실수령액 계산기', href: '/tools/take-home-pay' }],
  };
}
