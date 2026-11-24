// 상시 근로자 수 답 카드의 글자 — 계산(answerPlan)은 그대로 두고, 답 문장(headline)·까닭(whyLines)은 copy.ts 것을 그대로 쓴다.
// 연차휴가·10명 이상·적용되는 의무·입력 안내는 소제목이 있는 묶음이라 화면(HeadcountClient)의 ResultBlock children 으로 둔다.
// 금액이 없는 판정이라 상태 띠는 「확정 판단이 아닙니다」 쪽(STATUS_COMPARE)을 쓴다.
// 기준일: 적용되는 의무 목록(CHANGES)은 duties-data 의 CHECKED 를 따른다 — 그 목록이 보일 때만 적는다.
import { CHECKED } from '@/content/duties-data';
import type { PlanAnswer } from '@/lib/headcount-plan';
import { STATUS_COMPARE, lawLink, type ResultView } from '@/components/tool-result/result-view';
import { headline, whyLines } from './copy';

const BASIS = [
  lawLink('근로기준법 제11조(적용 범위)', '근로기준법', '제11조'),
  lawLink('근로기준법 시행령 제7조의2(상시 사용하는 근로자 수의 산정 방법)', '근로기준법 시행령', '제7조의2'),
  lawLink('근로기준법 제60조(연차 유급휴가)', '근로기준법', '제60조'),
];

const DUTIES = { label: '규모별 의무 전체 보기', href: '/duties' };

export function headcountView(a: { answer: PlanAnswer; today: string }): ResultView {
  const { answer, today } = a;
  const base = {
    status: STATUS_COMPARE,
    verdict: headline(answer, today),
    meta: whyLines(answer, today),
    amounts: [],
    basis: BASIS,
  };
  if (answer.five.kind === 'none') {
    return {
      ...base,
      asOf: [],
      nextNote: '사람을 더 쓸 계획이 있으면 「기간을 정해 더 쓰는 사람」에 넣어 다시 셉니다. 4명 이하 사업장에도 적용되는 의무는 아래에서 볼 수 있습니다.',
      next: [DUTIES, { label: '연차휴가 계산기', href: '/tools/leave' }],
    };
  }
  return {
    ...base,
    asOf: [`적용되는 의무 목록은 법제처 현행 법령 원문 기준 · 확인 ${CHECKED}`],
    next: [DUTIES, { label: '연차휴가 계산기', href: '/tools/leave' }],
  };
}
