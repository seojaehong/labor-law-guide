// 주휴수당 결과 블록의 글자 — 계산(calcWeeklyHoliday)은 건드리지 않고 받은 결과를 화면 문장으로만 바꾼다.
import type { Rate } from '@/content/rates';
import type { WeeklyHolidayResult } from '@/lib/calc/weekly-holiday';
import { STATUS_ESTIMATE, dotDate, lawLink, minWageAsOf, won, type ResultView } from '@/components/tool-result/result-view';

const hours = (n: number) => `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}시간`;

/** 소정근로시간 한도(근로기준법 제50조 제1항) — 넘으면 입력을 다시 보게 하되 계산은 그대로 한다 */
export const WEEKLY_HOURS_LIMIT = 40;

export function weeklyHoursWarning(weeklyHours: number): string | null {
  if (!(weeklyHours > WEEKLY_HOURS_LIMIT)) return null;
  return `1주 ${hours(weeklyHours)}은 소정근로시간 한도 주 40시간(상시 5명 이상 사업장, 근로기준법 제50조)을 넘습니다. 연장근로를 뺀 시간인지 확인해 주세요. 계산은 넣은 값으로 했고 하루 시간은 8시간까지만 셉니다.`;
}

/** 시급 칸 아래 한 줄 — 기본값이 어디서 왔는지 */
export function defaultWageNote(rate: Rate | null): string | null {
  if (!rate) return null;
  return `기본값 ${won(rate.value)}은 ${rate.from.slice(0, 4)}년 최저임금입니다. 근거 ${rate.basis} · 확인 ${dotDate(rate.checked)}`;
}

const BASIS = [
  lawLink('근로기준법 제55조(휴일)', '근로기준법', '제55조'),
  lawLink('근로기준법 시행령 제30조(휴일)', '근로기준법 시행령', '제30조'),
  lawLink('근로기준법 제18조(단시간근로자)', '근로기준법', '제18조'),
];

export function weeklyHolidayView(a: {
  r: WeeklyHolidayResult;
  hourlyWage: number;
  weeklyHours: number;
  fullTimeDays: number;
  minWage: Rate | null;
}): ResultView {
  const { r, hourlyWage, weeklyHours, fullTimeDays, minWage } = a;
  const warnings: string[] = [];
  const over = weeklyHoursWarning(weeklyHours);
  if (over) warnings.push(over);
  if (minWage && hourlyWage > 0 && hourlyWage < minWage.value) {
    warnings.push(`입력한 시급이 ${minWage.from.slice(0, 4)}년 최저임금 ${won(minWage.value)}보다 낮습니다.`);
  }
  const base = {
    status: STATUS_ESTIMATE,
    warnings,
    basis: BASIS,
    asOf: minWage ? [minWageAsOf(minWage)] : [],
  };

  if (r.status === 'under15') {
    return {
      ...base,
      verdict: [`1주 ${hours(weeklyHours)}이면 주휴수당이 없습니다.`, '4주를 평균한 1주 소정근로시간이 15시간 미만입니다.'],
      amounts: [],
      nextNote: '계약서에 적힌 시간과 실제로 일하는 시간이 계속 다르면, 출퇴근 기록으로 4주 평균 시간을 다시 세어 넣어 보세요. 15시간 이상이면 결과가 달라질 수 있습니다.',
      next: [
        { label: '근로계약서 점검', href: '/tools/contract-check' },
        { label: '월급 대조(시급제 주휴)', href: '/tools/pay-check' },
      ],
    };
  }
  if (r.status === 'absent') {
    return {
      ...base,
      verdict: ['이번 주는 주휴수당이 없습니다.', '그 주 소정근로일을 모두 나와야 생깁니다.'],
      amounts: [],
      nextNote: '빠진 날이 결근인지 먼저 확인해 보세요. 연차휴가를 쓴 날이나 회사 사정으로 쉰 날은 다르게 볼 수 있습니다. 다음 주에 모두 나오면 그 주 주휴수당은 다시 생깁니다.',
      next: [
        { label: '월급 대조(시급제 주휴)', href: '/tools/pay-check' },
        { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
      ],
    };
  }
  return {
    ...base,
    verdict: ['주휴수당이 생기는 입력입니다(1주 15시간 이상, 그 주 개근).'],
    amounts: [
      { label: '1주 주휴수당', value: won(r.amount) },
      { label: '한 달 평균(참고)', value: `약 ${won(r.monthly)}` },
    ],
    formula: `시급 ${won(hourlyWage)} × 하루 ${hours(r.dailyHours)}. 하루 시간은 1주 ${hours(weeklyHours)}을 통상근로자 1주 근무일 ${fullTimeDays}일로 나눈 값입니다(하루 8시간까지).`,
    caveat: '1주 금액의 원 미만은 올렸고, 한 달 평균은 1주 금액 × 365 ÷ 7 ÷ 12 를 반올림한 참고값입니다. 월급에 주휴수당이 이미 들어 있으면 따로 더하지 않습니다.',
    next: [
      { label: '최저임금 확인 계산기', href: '/tools/min-wage' },
      { label: '월급 대조(시급제 주휴)', href: '/tools/pay-check' },
    ],
  };
}
