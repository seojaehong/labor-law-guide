// 연차수당 결과 블록의 글자 — 계산(calcLeavePay)은 그대로 두고, 답 문장(headline)과 그 아래 문장(effectLines·promotionLines·formulaLines)은
// copy.ts 의 글자를 그대로 옮겨 담는다(261124 이전 화면과 같은 글자). 여기서는 금액 칸·근거 조문·다음 할 일만 더한다.
// 소멸시효는 말하지 않는다(copy.ts 머리 주석 — 제우스 게이트).
// 기준일: 이 계산기는 고시 금액이나 법령 확인일을 코드에 두지 않아 asOf 를 비운다. 계산 입력 asOf(오늘)는 조항 번호를 고르는 날이지 확인일이 아니다.
import type { LeavePayResult } from '@/lib/calc/leave-pay';
import { STATUS_ESTIMATE, STATUS_STOP, lawLink, won, type ResultView } from '@/components/tool-result/result-view';
import { effectLines, formulaLines, headline, promotionLines } from './copy';

/** 결과를 내지 않는 입력(4명 이하·주 15시간 미만·다루지 않는 기준시간) */
export { STATUS_STOP } from '@/components/tool-result/result-view';

const ART60 = lawLink('근로기준법 제60조(연차 유급휴가)', '근로기준법', '제60조');
const ART61 = lawLink('근로기준법 제61조(연차 유급휴가의 사용 촉진)', '근로기준법', '제61조');
const ART36 = lawLink('근로기준법 제36조(금품 청산)', '근로기준법', '제36조');
const ART18 = lawLink('근로기준법 제18조(단시간근로자의 근로조건)', '근로기준법', '제18조');
const DEC7 = lawLink('근로기준법 시행령 제7조(적용범위)', '근로기준법 시행령', '제7조');
const DEC6 = lawLink('근로기준법 시행령 제6조(통상임금)', '근로기준법 시행령', '제6조');

/** 남은 연차가 0 이라 0원일 때 */
export const ZERO_NOTE = '남은 연차가 없어 계산한 연차수당이 0원입니다. 남은 일수와 이미 쓰거나 수당으로 받은 일수가 연차 대장·급여명세서와 같은지 확인합니다.';

/** 결과 블록 안, 판정 아래에 그대로 붙는 문장(261124 이전 답 카드의 작은 글씨와 같은 순서) */
export function leavePayNotes(r: LeavePayResult): string[] {
  return [...effectLines(r), ...(r.status === 'calculated' ? promotionLines(r) : formulaLines(r))];
}

export function leavePayView(r: LeavePayResult): ResultView {
  const verdict = headline(r);
  if (r.status === 'under5') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [DEC7, ART60], asOf: [],
      nextNote: '상시 근로자 수가 헷갈리면 상시 근로자 수 계산기로 먼저 셉니다. 5명 이상이면 연차휴가가 적용됩니다.',
      next: [
        { label: '상시 근로자 수 계산기', href: '/tools/headcount' },
        { label: '근로계약서 점검', href: '/tools/contract-check' },
      ],
    };
  }
  if (r.status === 'under15h') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [ART18, ART60], asOf: [],
      nextNote: '계약서에 적힌 시간과 실제로 일한 시간이 계속 다르면, 출퇴근 기록으로 4주 평균 시간을 다시 세어 넣어 봅니다. 15시간 이상이면 결과가 달라집니다.',
      next: [
        { label: '근로계약서 점검', href: '/tools/contract-check' },
        { label: '주휴수당 계산기', href: '/tools/weekly-holiday-pay' },
      ],
    };
  }
  if (r.status === 'out-of-scope') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [DEC6, ART60], asOf: [],
      nextNote: '급여명세서·취업규칙에 적힌 월 기준시간을 먼저 확인합니다. 그 시간으로 나눈 시간급을 「시급」으로 넣으면 계산합니다.',
      next: [
        { label: '통상임금 점검', href: '/tools/ordinary-wage-check' },
        { label: '월급 대조', href: '/tools/pay-check' },
      ],
    };
  }
  const termination = r.timing === 'termination';
  return {
    status: STATUS_ESTIMATE,
    verdict,
    amounts: [{ label: termination ? '퇴직 시 미사용 연차수당' : '미사용 연차수당', value: won(r.amount!) }],
    basis: termination ? [ART60, ART61, ART36] : [ART60, ART61],
    asOf: [],
    nextNote: r.amount === 0 ? ZERO_NOTE : undefined,
    next: termination
      ? [
        { label: '퇴사 점검표(근로자)', href: '/exit' },
        { label: '퇴직금 계산기', href: '/tools/severance.html' },
      ]
      : [
        { label: '출근율 계산기', href: '/tools/attendance-rate' },
        { label: '연차휴가 계산기', href: '/tools/leave' },
      ],
  };
}
