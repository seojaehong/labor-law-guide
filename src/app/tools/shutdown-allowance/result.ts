// 휴업수당 결과 블록의 글자 — 계산(calcShutdownAllowance)은 그대로 두고, 답 문장(headline)과 그 아래 문장(effectLines)은
// copy.ts 의 글자를 그대로 옮겨 담는다(261124 이전 화면과 같은 글자). 여기서는 금액 칸·근거 조문·다음 할 일만 더한다.
// 기준일: 이 계산기는 고시 금액이나 법령 확인일을 코드에 두지 않아 asOf 를 비운다(지어낸 날짜를 쓰지 않는다).
import type { ShutdownAllowanceResult } from '@/lib/calc/shutdown-allowance';
import { STATUS_ESTIMATE, STATUS_STOP, lawLink, won, type ResultView } from '@/components/tool-result/result-view';
import { effectLines, headline } from './copy';

/** 결과를 내지 않는 입력(4명 이하·불가항력·노동위원회 승인) */
export { STATUS_STOP } from '@/components/tool-result/result-view';

const ART46 = lawLink('근로기준법 제46조(휴업수당)', '근로기준법', '제46조');
const ART2 = lawLink('근로기준법 제2조(정의)', '근로기준법', '제2조');
// 조문 제목을 저장소 안에서 확인하지 못한 두 조문은 제목 없이 번호만 쓴다
const DEC26 = lawLink('근로기준법 시행령 제26조', '근로기준법 시행령', '제26조');
const DEC7 = lawLink('근로기준법 시행령 제7조(적용범위)', '근로기준법 시행령', '제7조');
const RULE8 = lawLink('근로기준법 시행규칙 제8조', '근로기준법 시행규칙', '제8조');

/** 결과 블록 안, 판정 아래에 그대로 붙는 문장(261124 이전 답 카드의 작은 글씨) */
export const shutdownAllowanceNotes = (r: ShutdownAllowanceResult): string[] => effectLines(r);

export function shutdownAllowanceView(r: ShutdownAllowanceResult): ResultView {
  const verdict = headline(r);
  if (r.status === 'under5') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [DEC7, ART46], asOf: [],
      nextNote: '상시 근로자 수가 헷갈리면 상시 근로자 수 계산기로 먼저 셉니다. 5명 이상이면 「5명 이상」을 골라 다시 계산합니다.',
      next: [
        { label: '상시 근로자 수 계산기', href: '/tools/headcount' },
        { label: '근로계약서 점검', href: '/tools/contract-check' },
      ],
    };
  }
  if (r.status === 'force-majeure') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [ART46], asOf: [],
      nextNote: '쉰 이유가 경영 사정이었다면 「회사 사정」을 골라 다시 계산합니다. 쉰 기간의 임금이 명세서에 어떻게 적혔는지도 확인합니다.',
      next: [
        { label: '월급 대조', href: '/tools/pay-check' },
        { label: '임금 지연이자 계산기', href: '/tools/wage-delay-interest' },
      ],
    };
  }
  if (r.status === 'commission') {
    return {
      status: STATUS_STOP, verdict, amounts: [], basis: [ART46, RULE8], asOf: [],
      nextNote: '금액은 노동위원회가 승인한 지급률로 셉니다. 승인을 받지 못했으면 「회사 사정」을 골라 다시 계산합니다.',
      next: [
        { label: '월급 대조', href: '/tools/pay-check' },
        { label: '임금 지연이자 계산기', href: '/tools/wage-delay-interest' },
      ],
    };
  }
  const basis = [ART46, ...(r.ordinaryAsAverage ? [ART2] : []), ...(r.paidDuring > 0 ? [DEC26] : [])];
  if (r.mainClamped) {
    return {
      status: STATUS_ESTIMATE, verdict, amounts: [], basis, asOf: [],
      nextNote: '휴업 중 받은 임금이 실제로 일한 시간의 임금인지 급여명세서로 확인합니다. 받은 임금을 잘못 넣었으면 그 칸을 고쳐 다시 계산합니다.',
      next: [
        { label: '월급 대조', href: '/tools/pay-check' },
        { label: '임금 지연이자 계산기', href: '/tools/wage-delay-interest' },
      ],
    };
  }
  return {
    status: STATUS_ESTIMATE,
    verdict,
    amounts: r.proviso !== null
      ? [
        { label: '평균임금 기준(이 금액 이상)', value: won(r.main!) },
        { label: '통상임금 기준', value: won(r.proviso) },
      ]
      : [{ label: '휴업수당(이 금액 이상)', value: won(r.main!) }],
    basis,
    asOf: [],
    next: [
      { label: '임금 지연이자 계산기', href: '/tools/wage-delay-interest' },
      { label: '상시 근로자 수 계산기', href: '/tools/headcount' },
    ],
  };
}
