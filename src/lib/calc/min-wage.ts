// 최저임금 확인 — 받는 임금을 시간급으로 바꿔 그해 시간급 최저임금과 비교한다.
// 환산(최저임금법 시행령 §5①): 일급 ÷ 1일 소정근로시간 · 주급 ÷ (1주 소정근로시간 + 주휴 시간)
//   · 월급 ÷ (1주 소정근로시간 + 주휴 시간) × 365 ÷ 7 ÷ 12. 월 시간은 고시의 209시간처럼 반올림한다.
// 산입(최저임금법 §6④): 매월 1회 이상 정기 지급하는 임금. 정기상여금·현금 복리후생비의 공제 비율은
//   부칙 <법률 제15666호, 2018. 6. 12.> 제2조로 2024년부터 100분의 0 — 전액 산입. 현물은 빼고(§6④3가),
//   연장·야간·휴일 가산처럼 소정근로 밖의 대가도 뺀다(§6④1). 무엇을 넣을지는 화면에서 고른다.
// 수습 90%(§5②, 시행령 §3): 1년 이상 계약 + 수습 시작 3개월 이내, 단순노무 고시 직종은 제외.
import { calcWeeklyHoliday } from './weekly-holiday';

export interface MinWageInput {
  unit: 'hour' | 'day' | 'week' | 'month';
  /** 기본급 등 소정근로의 대가(단위 기간 금액) */
  amount: number;
  /** 월급일 때 매월 주는 정기상여금 */
  monthlyBonus?: number;
  /** 월급일 때 현금으로 매월 주는 식비·교통비 등 */
  monthlyWelfareCash?: number;
  weeklyHours?: number;
  dailyHours?: number;
  /** 그해 시간급 최저임금(rates.ts) */
  minHourly: number;
  probation?: { oneYearContract: boolean; withinThreeMonths: boolean; simpleLabor: boolean };
}

export interface MinWageResult {
  /** 비교에 넣은 금액(단위 기간) */
  counted: number;
  /** 나눈 시간 수(시급이면 1) */
  hours: number;
  /** 시간급 환산(소수 둘째 자리까지) */
  hourly: number;
  /** 적용한 시간급 최저임금(수습 90% 포함) */
  applied: number;
  /** 단위 기간 최저임금 = applied × hours */
  required: number;
  meets: boolean;
  /** 모자란 금액(단위 기간) */
  shortfall: number;
}

const bad = (n: number | undefined) => n === undefined || !Number.isFinite(n) || n <= 0;

/** 1주 소정근로시간 + 주휴 시간(주 15시간 미만이면 주휴 없음) */
function weekHours(weeklyHours: number): number {
  const h = calcWeeklyHoliday({ hourlyWage: 1, weeklyHours, fullAttendance: true });
  return weeklyHours + (h.status === 'paid' ? Math.min(weeklyHours / 5, 8) : 0);
}

export function checkMinWage(input: MinWageInput): MinWageResult {
  const { unit, minHourly } = input;
  if (!(input.amount >= 0) || !Number.isFinite(input.amount)) throw new Error('금액을 확인해 주세요');
  if (bad(minHourly)) throw new Error('최저임금 기준이 없습니다');

  let hours = 1;
  if (unit === 'day') {
    if (bad(input.dailyHours) || input.dailyHours! > 24) throw new Error('1일 소정근로시간을 확인해 주세요');
    hours = input.dailyHours!;
  } else if (unit === 'week' || unit === 'month') {
    if (bad(input.weeklyHours) || input.weeklyHours! > 168) throw new Error('1주 소정근로시간을 확인해 주세요');
    const w = weekHours(input.weeklyHours!);
    hours = unit === 'week' ? w : Math.round((w * 365) / 84);
  }

  const counted = input.amount + (unit === 'month' ? (input.monthlyBonus ?? 0) + (input.monthlyWelfareCash ?? 0) : 0);
  const p = input.probation;
  const applied = p && p.oneYearContract && p.withinThreeMonths && !p.simpleLabor ? Math.round(minHourly * 0.9) : minHourly;
  const required = Math.round(applied * hours);
  return {
    counted,
    hours,
    hourly: Math.floor((counted / hours) * 100) / 100,
    applied,
    required,
    meets: counted >= required,
    shortfall: Math.max(required - counted, 0),
  };
}
