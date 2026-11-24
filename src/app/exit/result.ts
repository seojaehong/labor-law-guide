// /exit 「확인용 추정」 블록의 글자 — 계산(exit-calc.ts)은 그대로 두고 받은 값을 문장으로만 바꾼다.
// 금액·산식 문장은 261124 이전 화면과 글자까지 같다(tests/unit/tool-result-block.test.ts 가 고정).
import { CHECKED } from '@/content/exit-worker-data';
import type { EntitlementResult } from '@/lib/leave/annual-leave';
import { STATUS_ESTIMATE, lawLink, type ResultView } from '@/components/tool-result/result-view';
import type { LeaveEstimate, SeveranceCheck, SeveranceEstimate } from './exit-calc';

/** 261124 이전 화면과 같은 반올림 표기(1일 평균임금 98,901.1 → 98,901원) */
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const BASIS = [
  lawLink('근로자퇴직급여 보장법 제4조(퇴직급여제도의 설정)', '근로자퇴직급여 보장법', '제4조'),
  lawLink('근로자퇴직급여 보장법 제8조(퇴직금제도의 설정 등)', '근로자퇴직급여 보장법', '제8조'),
  lawLink('근로기준법 제60조(연차 유급휴가)', '근로기준법', '제60조'),
];

export function exitResultView(a: {
  check: SeveranceCheck;
  sev: SeveranceEstimate | null;
  lv: LeaveEstimate | null;
  ent: EntitlementResult | null;
  unusedLeaveDays?: number;
}): ResultView {
  const { check, sev, lv, ent, unusedLeaveDays } = a;
  const meta = [`재직 ${check.serviceDays.toLocaleString('ko-KR')}일 · 계속근로 1년 ${check.oneYear ? '이상' : '미만'} · 4주 평균 주 15시간 ${check.hours15 ? '이상' : '미만'}`];
  if (!check.oneYear) meta.push('입사일 1년 뒤 같은 날 이후에 퇴직일(마지막 근무일 다음 날)이 와야 1년 이상입니다.');

  const leaveNote: string[] = [];
  if (lv && lv.applicable) leaveNote.push(`1일 통상임금 ${lv.daily.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원 × ${unusedLeaveDays}일(원 미만은 마지막에 올림)`);
  if (lv && !lv.applicable) leaveNote.push('주 15시간 미만은 연차휴가 규정이 적용되지 않습니다(근로기준법 §18③)');
  if (ent && check.hours15) leaveNote.push(`참고 · 마지막 근무일 기준 법정 연차 발생 ${ent.days}일(${ent.basisLabel})`);

  return {
    status: STATUS_ESTIMATE,
    verdict: [check.eligible
      ? '퇴직금 요건(계속근로 1년 이상, 주 15시간 이상)에 해당하는 입력입니다'
      : '입력 기준으로는 퇴직금 요건에 해당하지 않습니다'],
    meta,
    amounts: [
      {
        label: '퇴직금 추정',
        value: sev ? won(sev.amount) : '해당 없음',
        note: sev ? [`1일 평균임금 ${won(sev.dailyAverage)} = ${won(sev.wageTotal)} ÷ ${sev.periodDays}일`, `× 30일 × ${check.serviceDays}일 ÷ 365`] : undefined,
      },
      {
        label: '미사용 연차수당 추정',
        value: lv ? (lv.applicable ? won(lv.amount) : '적용 제외') : '일수 입력 시',
        note: leaveNote.length ? leaveNote : undefined,
      },
    ],
    basis: BASIS,
    asOf: [`법제처 현행 법령 원문 기준 · 확인 ${CHECKED}`],
    caveat: '입력한 월 급여 × 3 을 3개월 임금으로 놓은 세전 금액입니다. 상여금·평균임금에서 빼는 기간·통상임금 비교는 넣지 않았습니다.',
    nextNote: check.eligible
      ? undefined
      : '퇴직금이 없어도 마지막 달 임금 등 남은 금품은 퇴직일부터 14일 안에 받아야 합니다(근로기준법 제36조). 아래 날짜순 점검표에서 날짜를 확인해 보세요.',
    next: check.eligible
      ? [
        { label: '퇴직금 계산기로 자세히 계산', href: '/tools/severance.html' },
        { label: '추정치의 한계', href: '#limits' },
      ]
      : [
        { label: '날짜순 점검표 보기', href: '#checklist' },
        { label: '추정치의 한계', href: '#limits' },
      ],
  };
}
