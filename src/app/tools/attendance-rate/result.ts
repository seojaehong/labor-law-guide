// 출근율 결과 블록의 글자 — 계산(calcAttendanceRate)은 그대로 두고, 답 문장(headline)·그래서 생기는 일(effectLines)은
// copy.ts 의 글자를 그대로 옮겨 담는다(261124 이전 화면과 같은 글자). 여기서는 일수 칸·다음 할 일만 더한다.
// 기준일: 이 계산기는 고시 금액이나 법령 확인일을 코드에 두지 않아 asOf 를 비운다(지어낸 날짜를 쓰지 않는다).
import type { AttendanceOutcome, AttendanceRateResult } from '@/lib/calc/attendance-rate';
import { STATUS_COMPARE, lawLink, type ResultAmount, type ResultView } from '@/components/tool-result/result-view';
import { effectLines, fmtDays, headline } from './copy';

const BASIS = [lawLink('근로기준법 제60조(연차 유급휴가)', '근로기준법', '제60조')];

/** 15일·비례 일수가 나온 결과의 일수 글자. 1개월 개근·생기지 않음은 칸으로 만들지 않는다 */
function daysValue(o: AttendanceOutcome, base: number): string | null {
  if (o.status === 'full') return `${base}일`;
  if (o.status === 'prorated') return `${fmtDays(o.days!)}일`;
  return null;
}

function amountsOf(r: AttendanceRateResult): ResultAmount[] {
  if (r.status === 'under1y' || !r.primary) return [];
  const base = r.baseDays!;
  const p = daysValue(r.primary, base);
  if (!r.alt) return p ? [{ label: '생기는 연차휴가', value: p }] : [];
  const a = daysValue(r.alt, base);
  if (!p || !a) return [];
  if (p === a) return [{ label: '생기는 연차휴가', value: p }];
  return [
    { label: '빼는 날로 보면', value: p },
    { label: '출근한 것으로 보면', value: a },
  ];
}

/** 결과 블록 안, 판정 아래에 그대로 붙는 문장(261124 이전 답 카드의 작은 글씨) */
export const attendanceRateNotes = (r: AttendanceRateResult): string[] => effectLines(r);

export function attendanceRateView(r: AttendanceRateResult): ResultView {
  const amounts = amountsOf(r);
  const base = { status: STATUS_COMPARE, verdict: headline(r), amounts, basis: BASIS, asOf: [] as string[] };
  const statuses = [r.primary?.status, r.alt?.status];

  if (r.status === 'under1y' || !r.primary || statuses.includes('monthly')) {
    return {
      ...base,
      nextNote: '1개월 개근할 때마다 생기는 1일은 아래 「한 달씩 개근 확인」에서 달마다 봅니다. 입사일 기준 발생 일수는 연차휴가 계산기에서 셉니다.',
      next: [
        { label: '연차휴가 계산기', href: '/tools/leave' },
        { label: '연차수당 계산기', href: '/tools/leave-pay' },
      ],
    };
  }
  if (statuses.includes('none')) {
    return {
      ...base,
      nextNote: '단체협약·취업규칙에 이 기간의 연차를 따로 정했는지 먼저 확인합니다. 정한 것이 있으면 그에 따릅니다.',
      next: [{ label: '연차휴가 계산기', href: '/tools/leave' }],
    };
  }
  return {
    ...base,
    next: [
      { label: '연차수당 계산기', href: '/tools/leave-pay' },
      { label: '연차휴가 계산기', href: '/tools/leave' },
    ],
  };
}
