// 주휴수당 — 1주 소정근로일을 개근한 사람에게 주는 유급휴일 1일분의 임금.
// 식 = 시급 × 1일 소정근로시간
//   1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상근로자 총 소정근로일 수 (근로기준법 시행령 별표2 제2호나목)
//   = 1주 소정근로시간 ÷ 통상근로자 1주 소정근로일 수(보통 5일), 하루 8시간을 넘지 않는다(근로기준법 §50②)
// 주 15시간 미만이면 주휴가 없고(§18③), 그 주 소정근로일을 개근해야 생긴다(시행령 §30①).
// 원 미만 — 법이 끝수를 정하지 않았다. 사이트 끝수 규칙(./wage-rounding.ts)대로 1주 금액에서 올린다. 한 달 평균은 참고값이라 반올림한다.
import { payableWon } from './wage-rounding';
import type { Assumption, Need } from './needs';

export interface WeeklyHolidayInput {
  hourlyWage: number;
  /** 1주 소정근로시간(4주 평균). 연장근로는 넣지 않는다 */
  weeklyHours: number;
  /** 그 주 소정근로일을 모두 나왔나. 비우면 needs(261127 — 종전 MCP 는 비우면 개근으로 봤다) */
  fullAttendance?: boolean;
  /** 같은 일을 하는 통상근로자의 1주 소정근로일 수. 기본 5 */
  fullTimeDays?: number;
  /**
   * 입사한 주에만: 입사일이 그 주(회사가 정한 연속 7일)의 첫날보다 늦은가. true 면 금액을 내지 않고 'joined-unclear'
   * (확인 필요)로 멈춘다 — 0원으로 단정하지 않는다(G4 E1). 입사한 주가 아니거나 그 주 첫날 입사면 false.
   * 비우면 금액 없이 needs 로 묻는다(261127 — 종전에는 비우면 그 주 첫날부터 재직한 것으로 보고 금액을 냈다).
   */
  joinedMidWeek?: boolean;
  /**
   * 퇴사하는 주에만: 퇴사일이 그 주(연속 7일)의 마지막 날(7일째) 전인가. 주휴일이 무슨 요일이든 같다.
   * 퇴사일 = 근로관계가 이어진 마지막 날(마지막으로 출근한 날이 아니다). 인사기록·4대보험의 상실일은 그다음 날이다 —
   * 상실일을 기준으로 판단하면 하루가 밀린다.
   * 월~일 주에 금요일까지 일하고 퇴사일도 금요일이면 true(주휴 없음), 퇴사일이 일요일이면 false. 주휴일이 수요일이어도
   * 목요일 퇴사면 true. 퇴사하는 주가 아니면 false. 비우면 금액 없이 needs 로 묻는다(261127 — 종전에는 평상 주로 봤다).
   * (261125 판의 endsBeforeRestDay 「주휴일 전」은 D1 로 대체 — master 에 들어간 적 없음)
   */
  endsBeforeWeekEnd?: boolean;
}

/**
 * 비운 입력마다 물을 사실(공통 형식 needs, ./needs.ts) — 웹·MCP 가 같은 글을 쓴다. 평가가 아니라 관찰할 수 있는 사실을 묻는다.
 * 어느 답이든 0원인 경우(15시간 미만·7일째 전 퇴사·결근)는 묻지 않는다.
 */
export const WEEKLY_HOLIDAY_NEEDS: Record<'fullAttendance' | 'endsBeforeWeekEnd' | 'joinedMidWeek', Need> = {
  fullAttendance: {
    key: 'fullAttendance',
    question: '그 주에 일하기로 정한 날에 하루도 빠지지 않고 나왔나요?',
    why: '그 주 소정근로일을 개근해야 주휴수당이 생깁니다(근로기준법 시행령 제30조 제1항).',
  },
  endsBeforeWeekEnd: {
    key: 'endsBeforeWeekEnd',
    question: '그 주에 퇴사하나요? 퇴사한다면 퇴사일(근로관계가 이어진 마지막 날)이 그 주(회사가 정한 연속 7일)의 마지막 날보다 앞서나요? 퇴사하는 주가 아니면 「아니요」입니다.',
    why: '퇴사하는 주는 그 주 7일째까지 근로관계가 이어져야 주휴수당이 생깁니다(고용노동부 임금근로시간과-1736, 2021. 8. 4.).',
  },
  joinedMidWeek: {
    key: 'joinedMidWeek',
    question: '그 주에 입사했나요? 입사했다면 입사일이 그 주(회사가 정한 연속 7일)의 첫날보다 늦은가요? 입사한 주가 아니면 「아니요」입니다.',
    why: '그 주 첫날보다 늦게 입사한 주는 읽는 방법이 둘이라 금액을 내지 않습니다. 입사한 주가 아니거나 첫날 입사면 평소대로 계산합니다.',
  },
};

/**
 * paid = 생긴다 · under15 = 주 15시간 미만 · ended = 7일째 전에 퇴사 · absent = 개근하지 않음
 * · joined-unclear = 그 주 첫날보다 늦게 입사 — 해석이 갈려 금액을 내지 않는다(amount·monthly = null). 사실이 빠진 것이 아니라 needs 가 아니다
 * · needs-input = 금액을 바꾸는 사실(개근·퇴사 주·입사 주)을 넣지 않음 — 금액 없음, needs 에 물을 사실(261127)
 * assumptions = 넣지 않아 기본값을 쓴 것(통상근로자 1주 소정근로일 수 5일)
 */
export type WeeklyHolidayResult =
  | {
    status: 'paid' | 'under15' | 'ended' | 'absent';
    dailyHours: number;
    /** 1주 주휴수당 */
    amount: number;
    /** 한 달 평균(1주 금액 × 365 ÷ 7 ÷ 12) */
    monthly: number;
    needs: Need[];
    assumptions: Assumption[];
  }
  | { status: 'joined-unclear'; dailyHours: number; amount: null; monthly: null; needs: Need[]; assumptions: Assumption[] }
  | { status: 'needs-input'; dailyHours: number; amount: null; monthly: null; needs: Need[]; assumptions: Assumption[] };

export function calcWeeklyHoliday(input: WeeklyHolidayInput): WeeklyHolidayResult {
  const { hourlyWage, weeklyHours, fullAttendance } = input;
  const days = input.fullTimeDays ?? 5;
  if (!(hourlyWage > 0) || !Number.isFinite(hourlyWage)) throw new Error('시급을 확인해 주세요');
  if (!(weeklyHours >= 0) || weeklyHours > 168) throw new Error('1주 소정근로시간을 확인해 주세요');
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error('통상근로자 소정근로일 수를 확인해 주세요');

  const capped = weeklyHours >= days * 8;
  // 화면에 보이는 시간은 소수 둘째 자리까지, 금액은 나누기 전 값으로 센다(23 ÷ 6 = 3.83… 을 깎지 않는다)
  const dailyHours = capped ? 8 : Math.round((weeklyHours / days) * 100) / 100;
  // 퇴사 주는 1주(연속 7일)의 마지막 날(7일째)까지 근로관계가 이어져야 생긴다 — 주휴일 요일과 상관없다(G4 D1, 261126 재홍님 결정).
  // 존속 요건은 조문에 없다(§2①7 「1주」 = 휴일 포함 7일, 시행령 §30①은 개근 요건). 원문 확인한 근거:
  //   · 첫 근거 = 임금근로시간과-1736(2021. 8. 4.) — 법제처 DB 에는 없고 고용노동부 정책자료 「주휴수당 및 연차휴가 산정방법 관련
  //     행정해석 변경 안내」(www.moel.go.kr/policy/policydata/view.do?bbs_seq=20210802167) 첨부 안내문으로 확인(2026-11-27).
  //     「법령상 그 다음주까지 근로관계가 유지되어야 한다는 내용은 없으며」, 「최소한 1주 동안의 근로관계 존속을 전제로 한다고 봄이
  //     타당」, 예 「월요일 ~ 금요일까지 근로관계 유지(토요일에 퇴직) → 주휴수당 미발생」. 일할계산(pay-proration)도 같은 번호다.
  //   · 보조 = 고용노동부 1350 실시간 상담 목록(rtmview.do?id=1000299736 — 문답이 계속 쌓이는 목록이라 id 로 답변 하나를 고정할 수
  //     없다. 2026-11-27 조회 22건)의 2025. 9. 15. 답변 「1주 7일의 마지막날(7일째가 되는 날)에 … 사업장에 소속되어 있는 경우에는
  //     1주간 근로관계가 유지된 것」. 같은 목록 2026. 2. 24. 답변은 1736 을 근거로 들고, 모바일 상담은 법적 효력을 부여하는 결정이나
  //     판단이 아니라고 적는다.
  //   · 근로기준정책과-6551(2015. 12. 7., DRF 22546)은 1736 으로 폐기된 종전 해석이다 — 안내문 「(변경전) … 1주를 초과하여 (예: 8일째)
  //     근로가 예정되어 있는 경우 주휴수당 발생 (근로기준정책과 -6551, 2015.12.7. 등)」, 정책자료 본문 「동 첨부 해석과 배치되는 기존의
  //     행정해석은 2021.8.4.부터 폐기됨」. 그래서 화면 근거에 넣지 않는다.
  // 입사 주(G4 E1, 261126 재홍님 결정): 0원으로 단정하지 않고 금액 없이 멈춘다. 입사 주를 직접 다룬 행정해석은 찾지 못했고,
  //   1743 은 「기산 시점은 … 근로를 시작한이후에 특정 시점에서 과거 1주간」을 보라고 해(일용근로자 사안) 입사일부터 7일을
  //   채우면 생긴다고 읽힐 수 있다. 1350 실시간 상담(id=1000236183, 2026. 5. 29.·9. 7.)은 첫 지정 주휴일은 무급이어도 법 위반이
  //   아니나 입사일 기준 1주 평균 1회에 못 미치면 뒤에 정산하라고 답했다(화면 확인 안내 JOINED_NEXT).
  //   다만 15시간 미만·같은 주 7일째 전 퇴사·결근은 어느 해석으로도 0원이라 먼저 본다(화면도 입사·퇴사를 함께 고를 수 있다, G4 R7).
  // 261127 — 그 밖에는 개근·퇴사 주·입사 주 가운데 비운 것을 needs 로 묻고 금액을 내지 않는다(비운 칸을 평상 주로 채우지 않는다)
  const assumptions: Assumption[] = input.fullTimeDays === undefined
    ? [{ key: 'fullTimeDays', value: 5, note: '같은 일을 하는 통상근로자의 1주 소정근로일 수를 5일로 보았습니다. 6일이면 1일 소정근로시간이 달라져 금액이 바뀝니다.' }]
    : [];
  const zero = (status: 'under15' | 'ended' | 'absent') => ({ status, dailyHours, amount: 0, monthly: 0, needs: [], assumptions });
  if (weeklyHours < 15) return zero('under15');
  if (input.endsBeforeWeekEnd === true) return zero('ended');
  if (fullAttendance === false) return zero('absent');
  const needs = (['fullAttendance', 'endsBeforeWeekEnd', 'joinedMidWeek'] as const)
    .filter((k) => input[k] === undefined)
    .map((k) => WEEKLY_HOLIDAY_NEEDS[k]);
  if (needs.length) return { status: 'needs-input', dailyHours, amount: null, monthly: null, needs, assumptions };
  if (input.joinedMidWeek) return { status: 'joined-unclear', dailyHours, amount: null, monthly: null, needs: [], assumptions };

  const amount = payableWon(capped ? hourlyWage * 8 : (hourlyWage * weeklyHours) / days);
  return { status: 'paid', dailyHours, amount, monthly: Math.round((amount * 365) / 84), needs: [], assumptions };
}
