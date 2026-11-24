// 해고예고수당 결과 블록의 글자 — 계산(calcNoticePay)은 그대로 두고 받은 값을 문장으로만 바꾼다.
// 기준일: 이 계산기는 고시 금액이나 법령 확인일을 코드에 두지 않아 asOf 를 비운다(지어낸 날짜를 쓰지 않는다).
import { dec2 } from '@/lib/calc/wage-rounding';
import type { NoticePayResult } from '@/lib/calc/notice-pay';
import { fmtDateWithYear } from '@/lib/tool-kit';
import { STATUS_ESTIMATE, lawLink, won, type ResultView } from '@/components/tool-result/result-view';

const BASIS = [
  lawLink('근로기준법 제26조(해고의 예고)', '근로기준법', '제26조'),
  lawLink('근로기준법 시행령 제6조(통상임금)', '근로기준법 시행령', '제6조'),
];

const WRITTEN_NOTICE = '상시 5명 이상 사업장은 해고 사유와 시기를 서면으로 알려야 합니다(근로기준법 제27조). 예고수당과는 따로 봅니다.';

export function noticePayView(a: { r: NoticePayResult; dailyHours: number; hire: string; dismissal: string }): ResultView {
  const { r, dailyHours, hire, dismissal } = a;
  const meta = hire && dismissal ? [`입사 ${fmtDateWithYear(hire)} · 해고 ${fmtDateWithYear(dismissal)}`] : [];
  const base = { status: STATUS_ESTIMATE, meta, basis: BASIS, asOf: [] as string[] };

  if (r.status === 'under3m' || r.status === 'noticed') {
    return {
      ...base,
      verdict: r.status === 'under3m'
        ? ['해고예고수당이 없습니다.', '계속 근로한 기간이 3개월이 되지 않았습니다.']
        : ['해고예고수당이 없습니다.', `해고일 ${r.noticeDays}일 전에 예고했습니다.`],
      amounts: [],
      nextNote: WRITTEN_NOTICE,
      next: [
        { label: '퇴사 점검표(근로자)', href: '/exit' },
        { label: '직원 퇴사 처리 점검(사업주)', href: '/exit-employer' },
      ],
    };
  }
  return {
    ...base,
    verdict: r.status === 'short'
      ? ['해고예고수당이 생기는 입력입니다.', `예고가 해고일 ${r.noticeDays}일 전이라 30일에 못 미칩니다.`]
      : ['해고예고수당이 생기는 입력입니다.', '30일 전에 예고하지 않았으면 30일분 통상임금입니다.'],
    amounts: [{ label: '해고예고수당', value: won(r.amount) }],
    formula: `1일 통상임금 ${dec2(r.dailyOrdinary)}원(시간당 ${dec2(r.hourly)}원 × ${dailyHours}시간) × 30일. 시간급과 1일 통상임금은 끝수를 버리지 않고 곱하며, 원 미만은 마지막 금액에서 올립니다.`
      + (r.status === 'short' ? ' 예고를 했더라도 30일에 못 미치면 모자란 날만큼이 아니라 30일분 전액입니다.' : ''),
    caveat: '천재·사변이나 근로자의 고의로 인한 큰 손해처럼 수당이 없는 사유는 사실관계에 따라 달라 계산에 넣지 않았습니다.',
    next: [
      { label: '퇴사 점검표(근로자)', href: '/exit' },
      { label: '임금 지연이자 계산기', href: '/tools/wage-delay-interest' },
    ],
  };
}
