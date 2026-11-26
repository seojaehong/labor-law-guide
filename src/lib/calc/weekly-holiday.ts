// 주휴수당 — 1주 소정근로일을 개근한 사람에게 주는 유급휴일 1일분의 임금.
// 식 = 시급 × 1일 소정근로시간
//   1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상근로자 총 소정근로일 수 (근로기준법 시행령 별표2 제2호나목)
//   = 1주 소정근로시간 ÷ 통상근로자 1주 소정근로일 수(보통 5일), 하루 8시간을 넘지 않는다(근로기준법 §50②)
// 주 15시간 미만이면 주휴가 없고(§18③), 그 주 소정근로일을 개근해야 생긴다(시행령 §30①).
// 원 미만 — 법이 끝수를 정하지 않았다. 사이트 끝수 규칙(./wage-rounding.ts)대로 1주 금액에서 올린다. 한 달 평균은 참고값이라 반올림한다.
import { payableWon } from './wage-rounding';

export interface WeeklyHolidayInput {
  hourlyWage: number;
  /** 1주 소정근로시간(4주 평균). 연장근로는 넣지 않는다 */
  weeklyHours: number;
  /** 그 주 소정근로일을 모두 나왔나 */
  fullAttendance: boolean;
  /** 같은 일을 하는 통상근로자의 1주 소정근로일 수. 기본 5 */
  fullTimeDays?: number;
  /**
   * 입사한 주에만: 입사일이 그 주(회사가 정한 연속 7일)의 첫날보다 늦은가. true 면 1주 동안 근로관계가 이어지지 않아 없다.
   * 비우면 그 주 첫날부터 재직한 것으로 본다.
   */
  joinedMidWeek?: boolean;
  /**
   * 퇴사하는 주에만: 퇴사일이 그 주(연속 7일)의 마지막 날(7일째) 전인가. 주휴일이 무슨 요일이든 같다.
   * 퇴사일 = 근로관계가 이어진 마지막 날(마지막 근무일이 아니다). 인사기록·4대보험의 상실일(퇴직일)은 그다음 날이다 —
   * 상실일을 기준으로 판단하면 하루가 밀린다.
   * 월~일 주에 금요일까지 일하고 퇴사일도 금요일이면 true(주휴 없음), 퇴사일이 일요일이면 false. 주휴일이 수요일이어도
   * 목요일 퇴사면 true. 비우면 평상 주로 본다. (261125 판의 endsBeforeRestDay 「주휴일 전」은 D1 로 대체 — master 에 들어간 적 없음)
   */
  endsBeforeWeekEnd?: boolean;
}

export interface WeeklyHolidayResult {
  /**
   * paid = 생긴다 · under15 = 주 15시간 미만 · joined = 그 주 첫날보다 늦게 입사 · ended = 7일째 전에 퇴사
   * · absent = 개근하지 않음
   */
  status: 'paid' | 'under15' | 'joined' | 'ended' | 'absent';
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
  // 1주(연속 7일)의 첫날부터 마지막 날(7일째)까지 근로관계가 이어져야 생긴다 — 주휴일 요일과 상관없다(G4 D1, 261126 재홍님 결정).
  // 존속 요건은 조문에 없다(§2①7 「1주」 = 휴일 포함 7일, 시행령 §30①은 개근 요건). 원문 확인한 근거:
  //   · 고용노동부 1350 답변(2025. 9. 15., 문답 페이지 1000299736 — 문답 셋이 한 페이지에 있다) 「1주 7일의 마지막날(7일째가
  //     되는 날)에 … 사업장에 소속되어 있는 경우에는 1주간 근로관계가 유지된 것」, 같은 페이지의 2025. 7. 3. 답변 「1주를 초과한 날
  //     (8일째) 근로가 예정되어 있지 않더라도 … 발생」
  //   · 임금근로시간과-1743(2021. 8. 5., DRF 16858) 「1주간의 근로관계가 존속하면서」
  //   · 근로기준정책과-6551(2015. 12. 7., DRF 22546)은 1주 개근 뒤 퇴사하면 「발생하는 것으로 보기 어렵다」고 해 0원 쪽으로만
  //     같은 방향이다. 글자대로면 7일째까지 재직하고 나간 경우도 0원이라 1350 답변과 어긋나 화면 근거에는 넣지 않았다.
  // 입사 주: 그 주 첫날보다 늦게 입사하면 1주 동안 이어지지 않아 없다(D1). 입사 주를 직접 다룬 해석은 찾지 못했다 —
  //   1743 의 기산 시점(근로 시작 뒤 어느 시점에서 과거 1주)은 일용근로자 사안이라 이 규칙의 근거로 쓰지 않는다.
  const status =
    weeklyHours < 15 ? 'under15'
      : input.joinedMidWeek ? 'joined'
        : input.endsBeforeWeekEnd ? 'ended'
          : fullAttendance ? 'paid' : 'absent';
  if (status !== 'paid') return { status, dailyHours, amount: 0, monthly: 0 };

  const amount = payableWon(capped ? hourlyWage * 8 : (hourlyWage * weeklyHours) / days);
  return { status, dailyHours, amount, monthly: Math.round((amount * 365) / 84) };
}
