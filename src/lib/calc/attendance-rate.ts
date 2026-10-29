// 연차 발생 출근율 — 근로기준법 §60①(1년간 80퍼센트 이상 출근 → 15일) · §60②(1년 미만이거나 80퍼센트 미만 → 1개월 개근 시 1일)
//   · §60④(근속 가산, 25일 한도) · §60⑥(출근한 것으로 보는 기간).
// 출근율 = 연간 소정근로일수 중 출근일수의 비율(대법원 2013. 12. 26. 선고 2011다4629 판결 등의 공통 문구).
//
// 소정근로일을 넷으로 나눈다 — S = A + D + X + B
//   A 출근(지각·조퇴한 날 포함 — 근기1455.9-10029, 출결은 하루 단위)
//   D 출근 간주 — 분자·분모에 모두 넣는다(§60⑥, 예비군법 §10, 민방위기본법 §27, 2011다95519, 2015다66052, 2007 판단기준)
//   X 소정근로일수에서 뺀다(2011다4629 쟁의, 2015다66052 직장폐쇄·노조전임, 임금근로시간과-1818 약정휴직 등)
//   B 결근 — 분모에만(근로기준과-3937 무단결근, 근로기준과-3296·2008다41666 정당한 정직)
//
// 3분기(대법원 2019. 2. 14. 선고 2015다66052 판결 — 「출근일수가 연간 소정근로일수의 8할을 밑도는 경우에 한하여」 비례)
//   ① (A+D)/S ≥ 80%                          → 기본일수 전부(빼는 날이 있어도 줄이지 않는다 — 임금근로시간과-906·636)
//   ② (A+D)/S < 80% · X>0 · (A+D)/(S−X) ≥ 80% → 기본일수 × (S−X)/S (기본일수에 근속 가산 포함 — 근로개선정책과-3370)
//   ③ 그 밖                                   → §60② 1개월 개근 시 1일
//   ④ X = S                                   → 생기지 않는다(2015다66052 노조전임 1년 전부, 근로기준과-2373)
//   D = S 면 ①(100%)이다(2014다232296, 2011다95519).
//
// 80% 비교는 정수로 한다 — 5 × (A+D) ≥ 4 × S. §60① 이 「80퍼센트 이상」이라 정확히 80%는 채운 것이다.
//   leave-advanced.ts 의 ATTENDANCE_THRESHOLD(0.8)와 같은 기준이다(시험이 1~366일 전부 대조). 그 모듈은 잠금(🔒) 절이 있어 import 하지 않는다.
// 비례 일수는 끝수를 처리하지 않는다 — 법령에 정함이 없다(행정해석 예시는 7.5일처럼 소수를 그대로 둔다). 분수 {num, den} 로 돌려준다.
//
// 해석이 갈리는 원인(alt)은 하나를 고르지 않는다 — 일수가 있으면 「출근 간주로 본 값」을 나란히 낸다(261029 결정).
//   부당하다고 확정된 정직: 근로기준과-3296(제외·비례) ↔ 2011다95519 부당해고 법리 유추(출근 간주)
//   회사 사정 휴업(§46): 근로개선정책과-3190·근로기준정책과-8676(제외) ↔ 2011다95519·2015다66052 「사용자 귀책 기간」 법리(출근 간주)
//
// 날짜 축: 80% 미만 출근자에게 §60②를 주는 규정은 법률 제11270호(2012. 8. 2. 시행)로 생겼다. 그 전에 생긴 연차는 다루지 않는다
//   (다른 시점의 규칙으로 대신하지 않는다). 육아휴직 출근 간주(§60⑥3)는 2018. 5. 29. 이후 신청분 — 화면 칸 이름이 그 범위를 밝힌다.
import { calculateEntitlement } from '../leave/annual-leave';

export type AttendanceClass = 'deemed' | 'excluded' | 'absent';

/** 원인 → 기본 분류. alt 가 있으면 해석이 갈려 출근 간주로 본 값을 함께 낸다 */
export const CAUSES = {
  'work-injury': { cls: 'deemed' }, // §60⑥1
  maternity: { cls: 'deemed' }, // §60⑥2
  'parental-leave': { cls: 'deemed' }, // §60⑥3, 2018. 5. 29. 이후 신청(법률 제15108호 부칙 §2)
  'leave-used': { cls: 'deemed' }, // 연차·생리휴가 사용, 공민권 행사(2007 판단기준)
  'reserve-forces': { cls: 'deemed' }, // 예비군법 §10, 민방위기본법 §27
  'unfair-dismissal': { cls: 'deemed' }, // 2011다95519
  'unjust-lockout': { cls: 'deemed' }, // 2015다66052(정당성이 없는 직장폐쇄)
  'statutory-leave': { cls: 'deemed' }, // 배우자 출산휴가 등 — 조문 없음, 행정해석(여성고용정책과-510, 임금근로시간과-1818)
  'company-deemed': { cls: 'deemed' }, // 단체협약·취업규칙이 출근으로 보는 날
  'lawful-strike': { cls: 'excluded' }, // 2011다4629
  'lawful-lockout': { cls: 'excluded' }, // 2015다66052
  'union-fulltime': { cls: 'excluded' }, // 2015다66052
  'agreed-leave': { cls: 'excluded' }, // 임금근로시간과-1818(2021. 8. 4. -1736 해석 변경)
  'employer-shutdown': { cls: 'excluded', alt: 'deemed' }, // 근로개선정책과-3190 ↔ 판례 법리
  'unfair-suspension': { cls: 'excluded', alt: 'deemed' }, // 근로기준과-3296 ↔ 2011다95519 유추
  absence: { cls: 'absent' }, // 근로기준과-3937
  suspension: { cls: 'absent' }, // 근로기준과-3296, 2008다41666
  'unjust-strike': { cls: 'absent' }, // 2015다66052(정당성이 없는 쟁의행위)
} as const satisfies Record<string, { cls: AttendanceClass; alt?: AttendanceClass }>;

export type AttendanceCause = keyof typeof CAUSES;
export const CAUSE_IDS = Object.keys(CAUSES) as AttendanceCause[];

export interface AttendanceRateInput {
  hireDate: string;
  /** 연차가 생기는 날 — 출근율을 따진 1년이 끝난 다음 날(입사일 기준이면 입사 기념일) */
  accrualDate: string;
  /** 그 1년의 소정근로일수 S */
  scheduledDays: number;
  /** 원인별 일수. 소정근로일 중 여기에 없는 날은 출근한 날(A)로 센다 */
  days?: Partial<Record<AttendanceCause, number>>;
}

/** 약분한 분수 */
export interface Ratio { num: number; den: number }

export interface Tally { scheduled: number; attended: number; deemed: number; excluded: number; absent: number }

export interface AttendanceOutcome {
  status: 'full' | 'prorated' | 'monthly' | 'none';
  tally: Tally;
  /** (A+D)/S */
  rate: Ratio;
  /** (A+D)/(S−X) — 빼는 날이 있고 S > X 일 때만 */
  realRate: Ratio | null;
  meets: boolean;
  realMeets: boolean | null;
  /** 생기는 일수 — full = 기본일수, prorated = 기본일수 × (S−X)/S, 그 밖 null */
  days: Ratio | null;
}

export interface AttendanceRateResult {
  status: 'under1y' | AttendanceOutcome['status'];
  serviceYears: number;
  /** §60①④ 기본일수(가산 포함). 1년 미만이면 null */
  baseDays: number | null;
  /** 기본 분류로 센 결과. 1년 미만이면 null */
  primary: AttendanceOutcome | null;
  /** 갈리는 원인을 출근 간주로 본 결과. 그 원인에 일수가 없으면 null */
  alt: AttendanceOutcome | null;
  /** 일수가 들어간 갈리는 원인 */
  disputed: AttendanceCause[];
}

/** §60② 80% 미만 출근자 규정 시행일(법률 제11270호) */
export const MONTHLY_RULE_FROM = '2012-08-02';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const ratio = (num: number, den: number): Ratio => {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
};

/** 80퍼센트 「이상」 — 5 × 분자 ≥ 4 × 분모(부동소수 비교를 하지 않는다) */
export const reaches80 = (n: number, d: number) => 5 * n >= 4 * d;

const isDate = (s: string) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const isCount = (n: number) => Number.isInteger(n) && n >= 0;

function outcome(S: number, counts: Record<AttendanceClass, number>, baseDays: number): AttendanceOutcome {
  const { deemed: D, excluded: X, absent: B } = counts;
  const A = S - D - X - B;
  const n = A + D;
  const tally: Tally = { scheduled: S, attended: A, deemed: D, excluded: X, absent: B };
  const rate = ratio(n, S);
  const meets = reaches80(n, S);
  const realRate = X > 0 && S > X ? ratio(n, S - X) : null;
  const realMeets = realRate ? reaches80(n, S - X) : null;
  if (X === S) return { status: 'none', tally, rate, realRate, meets, realMeets, days: null };
  if (meets) return { status: 'full', tally, rate, realRate, meets, realMeets, days: ratio(baseDays, 1) };
  if (realMeets) return { status: 'prorated', tally, rate, realRate, meets, realMeets, days: ratio(baseDays * (S - X), S) };
  return { status: 'monthly', tally, rate, realRate, meets, realMeets, days: null };
}

export function calcAttendanceRate(input: AttendanceRateInput): AttendanceRateResult {
  if (!isDate(input.hireDate)) throw new Error('입사일을 확인해 주세요');
  if (!isDate(input.accrualDate)) throw new Error('연차가 생기는 날을 확인해 주세요');
  if (input.accrualDate < input.hireDate) throw new Error('연차가 생기는 날이 입사일보다 앞섭니다');
  if (input.accrualDate < MONTHLY_RULE_FROM) throw new Error('2012. 8. 2. 전에 생긴 연차는 이 도구가 다루지 않습니다');

  const ent = calculateEntitlement({ hireDate: input.hireDate, asOf: input.accrualDate });
  if (ent.serviceYears < 1) {
    return { status: 'under1y', serviceYears: ent.serviceYears, baseDays: null, primary: null, alt: null, disputed: [] };
  }

  const S = input.scheduledDays;
  if (!Number.isInteger(S) || S < 1 || S > 366) throw new Error('1년 소정근로일수를 1~366 사이 정수로 넣어 주세요');
  const days = input.days ?? {};
  let sum = 0;
  const primary: Record<AttendanceClass, number> = { deemed: 0, excluded: 0, absent: 0 };
  const alt: Record<AttendanceClass, number> = { deemed: 0, excluded: 0, absent: 0 };
  const disputed: AttendanceCause[] = [];
  for (const c of CAUSE_IDS) {
    const v = days[c] ?? 0;
    if (!isCount(v)) throw new Error('날 수는 0 이상의 정수로 넣어 주세요');
    sum += v;
    const def: { cls: AttendanceClass; alt?: AttendanceClass } = CAUSES[c];
    primary[def.cls] += v;
    alt[def.alt ?? def.cls] += v;
    if (def.alt && v > 0) disputed.push(c);
  }
  if (sum > S) throw new Error(`아래 날을 더하면 ${sum}일이라 1년 소정근로일수 ${S}일보다 많습니다`);

  const p = outcome(S, primary, ent.days);
  return {
    status: p.status,
    serviceYears: ent.serviceYears,
    baseDays: ent.days,
    primary: p,
    alt: disputed.length ? outcome(S, alt, ent.days) : null,
    disputed,
  };
}

export interface MonthInput {
  /** 그 달 소정근로일수 */
  scheduled: number;
  /** 그중 소정근로일수에서 빼는 날 */
  excluded: number;
  /** 그중 결근한 날 */
  absent: number;
}

/**
 * §60② 한 달 개근 — 그 달 빼는 날을 뺀 소정근로일을 모두 출근(출근 간주 포함)했으면 1일.
 * 비례해 0.5일로 하지 않는다(근로기준정책과-8676, 임금근로시간과-636). 그 달 전부가 빼는 날이면 0일(근로기준과-2373).
 * 그 달 전부가 출근 간주여도 1일(§60⑥이 ②에도 걸리고 임금근로시간과-30이 「월 전부 미출근 미부여」를 폐지).
 */
export function monthlyLeaveDay(m: MonthInput): { day: 0 | 1; reason: 'perfect' | 'absent' | 'all-excluded' } {
  if (!Number.isInteger(m.scheduled) || m.scheduled < 1 || m.scheduled > 31) throw new Error('그 달 소정근로일수를 1~31 사이 정수로 넣어 주세요');
  if (!isCount(m.excluded) || !isCount(m.absent)) throw new Error('날 수는 0 이상의 정수로 넣어 주세요');
  if (m.excluded + m.absent > m.scheduled) throw new Error('빼는 날과 결근한 날을 더하면 그 달 소정근로일수보다 많습니다');
  if (m.excluded === m.scheduled) return { day: 0, reason: 'all-excluded' };
  if (m.absent > 0) return { day: 0, reason: 'absent' };
  return { day: 1, reason: 'perfect' };
}
