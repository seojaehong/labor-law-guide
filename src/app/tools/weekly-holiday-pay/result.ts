// 주휴수당 결과 블록의 글자 — 계산(calcWeeklyHoliday)은 건드리지 않고 받은 결과를 화면 문장으로만 바꾼다.
import type { Rate } from '@/content/rates';
import type { WeeklyHolidayResult } from '@/lib/calc/weekly-holiday';
import { STATUS_ESTIMATE, STATUS_STOP, dotDate, lawLink, minWageAsOf, won, type ResultView } from '@/components/tool-result/result-view';

export { STATUS_STOP };

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

/** 퇴사일이 그 주 7일째 전 — 화면과 MCP(calc_weekly_holiday_pay)가 같은 문장을 쓴다(G4 D1, 261126) */
export const ENDED_VERDICT = ['이번 주는 주휴수당이 없습니다.', '퇴사일이 그 주(연속 7일)의 마지막 날 전이라 1주 동안 근로관계가 이어지지 않았습니다.'];

/** 그 주 첫날보다 늦게 입사 — 0원으로 단정하지 않고 금액 없이 멈춘다. 화면과 MCP 가 같은 문장을 쓴다(G4 E1, 261126) */
export const JOINED_VERDICT = [
  '이번 주 주휴수당은 금액을 내지 않습니다(확인 필요).',
  '입사한 주의 주휴는 직접 다룬 행정해석을 찾지 못했습니다. 근로를 시작한 날부터 7일을 채우면 생긴다고 보는 해석(임금근로시간과-1743 취지)도 있어 금액을 내지 않습니다.',
];

/**
 * 0원(ended)의 근거 — 근로관계 존속 요건은 조문에 없어 법령 링크만으로는 판단 근거가 비었다(G4 I2·D1, 261126).
 * 첫 근거 = 임금근로시간과-1736(일할계산 pay-proration 과 같은 번호), 보조 = 1350 실시간 상담 목록의 2025. 9. 15. 답변(G4 R1, 261127).
 * 「」 안은 원문 글자 그대로다(2026-11-27 조회): 고용노동부 정책자료(bbs_seq=20210802167) 첨부 안내문, 1350 rtmview.do?id=1000299736.
 * 근로기준정책과-6551 은 1736 으로 폐기된 종전 해석이라 넣지 않는다(lib/calc/weekly-holiday.ts 주석).
 */
export const ENDED_BASIS =
  '근로관계가 1주 동안 이어져야 한다는 요건은 조문에 없습니다(시행령 제30조 제1항은 개근만 정합니다). 고용노동부는 「법령상 그 다음주까지 근로관계가 유지되어야 한다는 내용은 없으며」, 주휴 규정은 「최소한 1주 동안의 근로관계 존속을 전제로 한다고 봄이 타당」하다고 봅니다(임금근로시간과-1736, 2021. 8. 4.). 1350 답변(2025. 9. 15.)도 「1주 7일의 마지막날(7일째가 되는 날)」에 사업장에 소속되어 있으면 1주간 근로관계가 유지된 것으로 봅니다.';

/**
 * 확인 필요(joined-unclear)의 근거 — 회사가 정한 1주(제2조)로 보면 없고, 1743 의 기산 방식으로 보면 입사일부터 7일을 채우면
 * 생길 수 있다(G4 E1). 「」 안은 법제처 DRF 법령해석 16858(임금근로시간과-1743) 회답 글자 그대로다(2026-11-26 조회).
 */
export const JOINED_BASIS =
  '1주는 휴일을 포함한 7일입니다(근로기준법 제2조 제1항 제7호). 고용노동부는 일용근로자 사안에서 「유급 주휴일의 기산 시점은 해당 사업장에서 근로를 시작한이후에 특정 시점에서 과거 1주간의 주휴일 부여 요건이 충족하는지를 판단」하면 된다고 보았습니다(임금근로시간과-1743, 2021. 8. 5.).';

/**
 * 입사 주 확인 안내의 공통 문장 — 화면 nextNote 와 MCP checkNote 가 같이 쓴다(G4 R4, 261127). 금액은 계속 내지 않는다(E1).
 * 다시 계산하는 방법(화면 = 체크, MCP = 입력 이름)은 쓰는 쪽이 뒤에 붙인다.
 * 「」 안은 1350 실시간 상담(rtmview.do?id=1000236183) 2026. 5. 29.·9. 7. 답변 글자 그대로다(두 답변이 같은 글, 2026-11-27 조회).
 * 1350 모바일 상담은 법적 효력을 부여하는 결정이나 판단이 아니라고 적는다(rtmview.do?id=1000299736 2026. 2. 24. 답변) —
 * 그래서 금액을 정하는 근거로 쓰지 않는다.
 */
export const JOINED_NEXT =
  '1350 답변(2026. 5. 29.·9. 7.)은 주중에 입사해 소정근로일을 개근했다면 처음 오는 지정 주휴일을 유급으로 주는 것이 바람직하다면서도 「입사 후 1주간(7일)을 채우지 못하였으므로 이를 무급으로 부여하더라도 법 위반이라고 할 수는 없으며」, 다만 「입사일을 기준으로 1주일에 평균 1회 이상의 주휴일을 부여하지 않았다면 이후에 이를 정산하여 추가로 유급 휴일을 부여하여야 할 것」이라고 했습니다. 1350 답변은 법적 효력이 있는 해석이 아닙니다. 근로계약·취업규칙과 노동부 해석을 확인하세요. 다음 주부터 7일 내내 재직하고 소정근로일을 모두 나오면 생깁니다.';

/** 화면 전용 — 다시 계산하는 방법(체크) */
const JOINED_NEXT_WEB = `${JOINED_NEXT} 입사일이 그 주 첫날이었다면 입사 체크를 풀고 다시 계산해 보세요.`;

/**
 * 화면 체크(그 주 첫날보다 늦게 입사했나 · 퇴사일이 7일째 전인가) — 둘 다 고를 수 있다(G4 R7, 261127).
 * 둘 다면 엔진 순서대로 퇴사(0원)가 앞선다 — MCP 에 두 입력을 함께 준 것과 같은 답이다.
 */
export interface WeekSpan { joined: boolean; endsBefore: boolean }
export const WEEK_SPANS: readonly WeekSpan[] = [
  { joined: false, endsBefore: false },
  { joined: true, endsBefore: false },
  { joined: false, endsBefore: true },
  { joined: true, endsBefore: true },
];

/**
 * 화면 체크 → 엔진 입력. 체크를 풀어 둔 것도 「아니요」라는 답이라 false 로 넘긴다 —
 * 엔진은 비운 입력을 needs 로 묻고 금액을 내지 않는다(261127). 화면은 체크가 보여서 비운 칸이 생기지 않는다.
 */
export function weekSpanInput(span: WeekSpan): { joinedMidWeek: boolean; endsBeforeWeekEnd: boolean } {
  return { joinedMidWeek: span.joined, endsBeforeWeekEnd: span.endsBefore };
}

/** 화면 체크 아래 설명 — 7일째 기준과 예시 */
export const WEEK_NOTE =
  '1주는 회사가 정한 연속 7일(보통 월~일)이고, 퇴사하는 주는 주휴일이 무슨 요일이든 그 주 마지막 날(7일째)까지 근로관계가 이어져야 생깁니다. 월~일 주에 금요일까지 일하고 퇴사일도 금요일이면 없고, 퇴사일이 일요일이면 생깁니다. 주휴일이 수요일이어도 목요일에 퇴사하면 없습니다. 수요일처럼 그 주 첫날보다 늦게 입사한 주는 직접 다룬 행정해석을 찾지 못해 금액을 내지 않습니다. 같은 주에 입사하고 퇴사했으면 둘 다 고릅니다.';

/** 퇴사일의 뜻 — 화면의 퇴사 주 설명과 0원 안내가 같이 쓴다. 상실일은 퇴사일 다음 날이다(pay-proration.ts 용어와 같다) */
export const EXIT_DAY_DEFINITION =
  '퇴사일은 근로관계가 이어진 마지막 날이고, 마지막으로 출근한 날과 다를 수 있습니다. 인사기록·4대보험에 적는 상실일은 그다음 날이라, 상실일을 기준으로 고르면 하루가 밀립니다.';

const BASIS = [
  lawLink('근로기준법 제55조(휴일)', '근로기준법', '제55조'),
  lawLink('근로기준법 시행령 제30조(휴일)', '근로기준법 시행령', '제30조'),
  lawLink('근로기준법 제18조(단시간근로자의 근로조건)', '근로기준법', '제18조'),
];
/** 「1주」 = 휴일을 포함한 7일(제2조 제1항 제7호) — 퇴사 주 0원·입사 주 확인 필요에만 붙인다 */
const WEEK_LAW = lawLink('근로기준법 제2조(정의)', '근로기준법', '제2조');

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
  if (r.status === 'ended') {
    return {
      ...base,
      verdict: ENDED_VERDICT,
      meta: [ENDED_BASIS],
      amounts: [],
      basis: [...BASIS, WEEK_LAW],
      nextNote: '퇴사일을 근로관계가 이어진 마지막 날로 보고 골랐는지 확인해 보세요. 인사기록·4대보험에 적는 상실일은 그다음 날이라, 상실일의 전날이 퇴사일입니다. 마지막으로 출근한 날이 금요일이어도 퇴사일이 그 주 마지막 날(월~일 주라면 일요일)이면 그 주 주휴수당이 생깁니다.',
      next: [
        { label: '급여 일할계산(퇴사한 달)', href: '/tools/pay-proration' },
        { label: '월급 대조(시급제 주휴)', href: '/tools/pay-check' },
      ],
    };
  }
  if (r.status === 'needs-input') {
    // 화면은 개근·입사·퇴사 체크를 늘 넘겨 여기에 오지 않는다. 오면 금액 없이 무엇을 알아야 하는지만 보인다(261127)
    return {
      ...base,
      status: STATUS_STOP,
      verdict: ['이번 주 주휴수당은 금액을 내지 않습니다.', ...r.needs.map((n) => n.question)],
      amounts: [],
      next: [{ label: '월급 대조(시급제 주휴)', href: '/tools/pay-check' }],
    };
  }
  if (r.status === 'joined-unclear') {
    // 금액을 내지 않는 멈춤 — 「추정 금액」 띠가 아니라 멈춤 띠(G4 E1)
    return {
      ...base,
      status: STATUS_STOP,
      verdict: JOINED_VERDICT,
      meta: [JOINED_BASIS],
      amounts: [],
      basis: [...BASIS, WEEK_LAW],
      nextNote: JOINED_NEXT_WEB,
      next: [
        { label: '급여 일할계산(입사한 달)', href: '/tools/pay-proration' },
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
