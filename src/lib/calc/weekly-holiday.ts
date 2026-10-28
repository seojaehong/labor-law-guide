// 주휴수당 — 1주 소정근로일을 개근한 사람에게 주는 유급휴일 1일분의 임금.
// 식 = 시급 × 1일 소정근로시간
//   1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상근로자 총 소정근로일 수 (근로기준법 시행령 별표2 제2호나목)
//   = 1주 소정근로시간 ÷ 통상근로자 1주 소정근로일 수(보통 5일), 하루 8시간을 넘지 않는다(근로기준법 §50②)
// 주 15시간 미만이면 주휴가 없고(§18③), 그 주 소정근로일을 개근해야 생긴다(시행령 §30①).
// 원 미만은 반올림 — 법이 끝수를 정하지 않아 참고값으로 맞춘 것이다.

export interface WeeklyHolidayInput {
  hourlyWage: number;
  /** 1주 소정근로시간(4주 평균). 연장근로는 넣지 않는다 */
  weeklyHours: number;
  /** 그 주 소정근로일을 모두 나왔나 */
  fullAttendance: boolean;
  /** 같은 일을 하는 통상근로자의 1주 소정근로일 수. 기본 5 */
  fullTimeDays?: number;
}

export interface WeeklyHolidayResult {
  /** paid = 생긴다 · under15 = 주 15시간 미만 · absent = 개근하지 않음 */
  status: 'paid' | 'under15' | 'absent';
  dailyHours: number;
  /** 1주 주휴수당 */
  amount: number;
  /** 한 달 평균(1주 금액 × 365 ÷ 7 ÷ 12) */
  monthly: number;
}

export function calcWeeklyHoliday(input: WeeklyHolidayInput): WeeklyHolidayResult {
  const { hourlyWage, weeklyHours, fullAttendance } = input;
  const days = input.fullTimeDays ?? 5;
  if (!(hourlyWage > 0) || !Number.isFinite(hourlyWage)) throw new Error('시급을 확인해 주세요');
  if (!(weeklyHours >= 0) || weeklyHours > 168) throw new Error('1주 소정근로시간을 확인해 주세요');
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error('통상근로자 소정근로일 수를 확인해 주세요');

  const capped = weeklyHours >= days * 8;
  // 화면에 보이는 시간은 소수 둘째 자리까지, 금액은 나누기 전 값으로 센다(23 ÷ 6 = 3.83… 을 깎지 않는다)
  const dailyHours = capped ? 8 : Math.round((weeklyHours / days) * 100) / 100;
  const status = weeklyHours < 15 ? 'under15' : fullAttendance ? 'paid' : 'absent';
  if (status !== 'paid') return { status, dailyHours, amount: 0, monthly: 0 };

  const amount = Math.round(capped ? hourlyWage * 8 : (hourlyWage * weeklyHours) / days);
  return { status, dailyHours, amount, monthly: Math.round((amount * 365) / 84) };
}
