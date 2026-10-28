// 연차수당 계산기 — 남은 연차 일수 × 1일 통상임금. 새 엔진을 만들지 않고 있는 것을 잇는다.
//   금액: src/lib/leave/leave-allowance.ts calculateAllowance(일수 × 1일 단가, 단가 기준·출처 기록, 원 미만은 마지막에 한 번 버림)
//   시간급: ./min-wage unitHours(시행령 §6② — 월급은 (1주 소정 + 주휴) × 365 ÷ 7 ÷ 12 반올림)
//     주휴: 통상 근로자 = 1일 소정근로시간분(8시간까지, 근로기준법 §55①·시행령 §30①의 1일 유급휴일),
//           단시간 근로자 = 4주 소정 ÷ 통상 근로자의 4주 소정근로일 20일(시행령 별표2 제2호나목, 제4호가목·라목)
//   퇴직 누계: src/lib/leave/leave-ledger.ts buildHireDateLedger(1년 미만 월 연차 — 첫 1년이 2018. 5. 29. 전에 끝났으면 1년차 15일에 포함)
// 청구권: 법조문에 「미사용수당」 명문은 없고 판례로 선다 — 대법원 2005.5.27. 2003다48549(근로관계가 끝나도 수당 청구권은 남는다),
//   2019.10.18. 2018다239110(취업규칙 등에 정함이 없으면 통상임금으로 산정).
// 1일 통상임금 = 시간급 × 1일 소정근로시간(근로기준법 시행령 §6③).
// 단시간 근로자는 「일수 × 1일 단가」가 아니라 「남은 시간 × 시간급」(시행령 별표2 제4호나목·마목).
// 적용 제외 두 갈래는 unitHours 앞에서 막는다 — 상시 4명 이하(시행령 §7 별표1에 §60·§61 없음), 4주 평균 주 15시간 미만(§18③).
// 하지 않는 것: 사용 촉진(§61)·소멸시효로 금액을 깎는 일. 촉진은 「했다면」 안내만 붙인다(leave-promotion.ts 게이트).
import { unitHours, type MinWageInput } from './min-wage';
import { calculateAllowance } from '../leave/leave-allowance';
import { buildHireDateLedger, type LedgerEntry } from '../leave/leave-ledger';

export type WageUnit = MinWageInput['unit'];

/** 근로기준법 일부개정(공포 2026-06-09) 시행일 — §60⑤(통상임금·평균임금 지급)이 ⑥으로 옮겨진다 */
export const ARTICLE_SHIFT = '2027-06-10';

/** 기준일에 맞는 「통상임금 또는 평균임금을 지급」 조문 번호 */
export function payArticle(date: string): string {
  return date >= ARTICLE_SHIFT ? '제60조제6항' : '제60조제5항';
}

/**
 * 1년차 연차(15일)가 이 날 이전에 생겼으면 구 근로기준법 제60조제3항이 적용된다 —
 * 최초 1년의 근로에 대한 휴가는 1년 미만 월 연차를 포함해 15일이고, 이미 쓴 월 연차는 15일에서 뺀다.
 *   법률 제15108호(공포 2017. 11. 28., 시행 2018. 5. 29.)가 제3항을 지웠고 적용례·경과조치는 두지 않았다.
 *   법제처 18-0067(2018. 4. 24.): 2018. 5. 29.을 기준으로 근로한 기간이 1년 이상인 근로자에게는 구법 제3항이 적용된다
 *     (1년이 되는 날 법률관계가 이미 확정됐으므로).
 *   법제처 18-0404(2018. 8. 6.): 2018. 5. 30. 이후 근로기간이 1년이 되는 근로자는 1년차 11일·2년차 15일을 각각 받는다.
 * 1년차 발생일 = 입사 1년이 끝난 다음 날(buildHireDateLedger 의 기념일, 대법원 2022다245419).
 *   2017-05-29 입사 → 2018-05-29 발생: 그날을 기준으로 근로한 기간이 이미 1년(2017-05-29~2018-05-28)이라 구법.
 *   2017-05-30 입사 → 2018-05-30 발생: 신법.
 */
export const OLD_60_3_LAST_ACCRUAL = '2018-05-29';

export type LeavePayRate =
  /** 통상임금(기본) — 단위 기간 금액을 시간급으로 바꾼다 */
  | { basis: 'ordinary-wage'; unit: WageUnit; amount: number }
  /** 취업규칙 등이 평균임금으로 정한 경우 — 1일 평균임금을 받아 기준만 기록한다(산정하지 않는다) */
  | { basis: 'average-wage'; dailyRate: number };

export type LeavePayDays =
  /** 남은 일수를 안다 */
  | { source: 'unused'; unusedDays: number }
  /** 퇴직 — 입사일부터 마지막 재직일까지 발생 누계에서 쓰거나 수당으로 받은 일수를 뺀다 */
  | { source: 'ledger'; hireDate: string; lastWorkDate: string; usedDays: number };

export interface LeavePayInput {
  /** 재직 중(쓸 수 있는 1년이 끝나서) / 퇴직 */
  timing: 'employed' | 'termination';
  /** 상시 근로자 5명 이상 */
  fivePlus: boolean;
  /** 1주 소정근로시간 */
  weeklyHours: number;
  /** 1일 소정근로시간 */
  dailyHours: number;
  rate: LeavePayRate;
  /** 통상 근로자의 남은 일수. 단시간이면 partTime 을 쓰고 이것은 보지 않는다 */
  days?: LeavePayDays;
  /** 단시간 근로자 — 같은 일을 하는 통상 근로자의 1주 소정근로시간, 통상 근로자라면 생겼을 연차일수, 이미 쓴 연차 시간 */
  partTime?: { fullTimeWeeklyHours: number; fullTimeDays: number; usedHours: number };
  /** 주휴 말고 소정근로시간 밖에 유급으로 정한 시간(토요일 유급 등)이 있다 — unitHours 가 넣지 않으므로 지원 범위 밖 */
  otherPaidHours?: boolean;
  /** 회사가 사용 촉진을 했다고 하는가. 금액은 바뀌지 않는다 */
  promotion?: 'none' | 'claimed' | 'unknown';
  /** 퇴직: 퇴직 전에 이미 지급 사유가 생겨 있던 수당인가(퇴직금 평균임금 산입 표시용) */
  arisenBeforeTermination?: boolean;
  /** 회사가 지급했거나 지급하려는 금액 — 대조용 */
  alreadyPaid?: number;
  /** 기준일(YYYY-MM-DD) — 조문 번호 표시 */
  asOf: string;
}

export interface LeavePayResult {
  /** calculated · under5 = 상시 4명 이하 · under15h = 주 15시간 미만 · out-of-scope = 주휴 밖 유급시간 */
  status: 'calculated' | 'under5' | 'under15h' | 'out-of-scope';
  timing: LeavePayInput['timing'];
  rateBasis: LeavePayRate['basis'];
  unit: WageUnit | null;
  /** 1일 소정근로시간(입력) */
  dailyHours: number;
  /** 1주 소정근로시간(입력) */
  weeklyHours: number;
  /** 단위 기간 시간 수(시급 1 · 일급 1일 소정 · 주급 주 소정 + 주휴 · 월급 그 × 365 ÷ 84 반올림) */
  hours: number | null;
  /** 1주 소정 + 주휴(주급·월급) */
  weekPaidHours: number | null;
  /** 시간급(원, 소수 그대로) */
  hourly: number | null;
  /** 1일 단가(원, 소수 그대로) — 통상 근로자 */
  dailyRate: number | null;
  /** 남은 일수 — 통상 근로자 */
  unusedDays: number | null;
  ledger: {
    entries: LedgerEntry[]; total: number; used: number;
    /** 1년 미만 월 연차 — separate = 따로 셈(또는 1년 미만 근속) · included-in-15 = 구 §60③으로 1년차 15일에 포함 */
    firstYearMonthly: 'separate' | 'included-in-15';
  } | null;
  partTime: {
    fullTimeWeeklyHours: number;
    fullTimeDays: number;
    /** 통상 연차일수 × (주 소정 ÷ 통상 주 소정) × 8, 올리기 전 */
    rawGrantHours: number;
    /** 1시간 미만은 1시간으로 본 연차 시간 */
    grantHours: number;
    usedHours: number;
    unusedHours: number;
  } | null;
  /** 원 미만을 버리기 전 금액 */
  raw: number | null;
  amount: number | null;
  rateSource: string;
  alreadyPaid: number | null;
  /** 계산한 금액 − 회사 지급액 */
  difference: number | null;
  /** 퇴직: 퇴직금 평균임금에 넣는가 — excluded = 퇴직으로 비로소 생김 · three-twelfths = 퇴직 전 이미 생김 · null = 모름/재직 중 */
  averageWage: 'excluded' | 'three-twelfths' | null;
  promotion: NonNullable<LeavePayInput['promotion']>;
  payArticle: string;
}

const UNIT_LABEL: Record<WageUnit, string> = { month: '월급', week: '주급', day: '일급', hour: '시급' };

/**
 * 부동소수 잡음만 지운다 — 참값이 정수인데 0.999…로 나온 것을 정수로 돌린다.
 * 참값의 소수 부분은 1/기준시간(209 등, 250 이하) 단위라 1e-6 안쪽에 오지 않는다.
 */
const snap = (x: number) => (Math.abs(x - Math.round(x)) < 1e-6 ? Math.round(x) : x);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function checkDate(s: string, what: string): string {
  const t = DATE.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return s;
}

const nonNeg = (n: number | undefined) => n !== undefined && Number.isFinite(n) && n >= 0;
const pos = (n: number | undefined) => n !== undefined && Number.isFinite(n) && n > 0;

export function calcLeavePay(input: LeavePayInput): LeavePayResult {
  const { timing, rate, weeklyHours, dailyHours } = input;
  const base: LeavePayResult = {
    status: 'calculated', timing, rateBasis: rate.basis, unit: rate.basis === 'ordinary-wage' ? rate.unit : null,
    dailyHours, weeklyHours, hours: null, weekPaidHours: null, hourly: null, dailyRate: null, unusedDays: null,
    ledger: null, partTime: null, raw: null, amount: null, rateSource: '', alreadyPaid: null, difference: null,
    averageWage: null, promotion: input.promotion ?? 'unknown', payArticle: payArticle(checkDate(input.asOf, '기준일')),
  };

  // 적용 제외 — 금액을 내지 않는다. 임금 칸이 비어 있어도 오류로 막지 않는다.
  if (!input.fivePlus) return { ...base, status: 'under5' };
  if (!pos(weeklyHours) || weeklyHours > 168) throw new Error('1주 소정근로시간을 확인해 주세요');
  if (weeklyHours < 15) return { ...base, status: 'under15h' };
  // 월급·주급만 1주 기준시간을 쓴다(시행령 §6②3·4). 일급·시급과 평균임금 단가는 영향이 없다
  if (input.otherPaidHours && rate.basis === 'ordinary-wage' && (rate.unit === 'month' || rate.unit === 'week')) {
    return { ...base, status: 'out-of-scope' };
  }

  if (input.alreadyPaid !== undefined && !nonNeg(input.alreadyPaid)) throw new Error('회사 지급액을 확인해 주세요');
  const averageWage = timing === 'termination' && input.arisenBeforeTermination !== undefined
    ? (input.arisenBeforeTermination ? 'three-twelfths' : 'excluded')
    : null;
  const finish = (r: LeavePayResult): LeavePayResult => ({
    ...r,
    averageWage,
    alreadyPaid: input.alreadyPaid ?? null,
    difference: input.alreadyPaid === undefined || r.amount === null ? null : r.amount - input.alreadyPaid,
  });

  // 시간급 — 통상임금일 때만(시행령 §6②)
  let hours: number | null = null;
  let weekPaidHours: number | null = null;
  let hourly: number | null = null;
  if (rate.basis === 'ordinary-wage') {
    if (!pos(rate.amount)) throw new Error('임금을 확인해 주세요');
    if (!pos(dailyHours) || dailyHours > 24) throw new Error('1일 소정근로시간을 확인해 주세요');
    // 주휴 — 통상 근로자는 1일 소정근로시간분(8시간까지). 주 6일 × 6시간이면 6시간이지 36 ÷ 5 = 7.2시간이 아니다.
    //        단시간 근로자는 unitHours 기본값(1주 ÷ 5 = 4주 소정 ÷ 20일, 별표2 제2호나목)을 그대로 쓴다.
    const holiday = input.partTime ? undefined : Math.min(dailyHours, 8);
    hours = unitHours(rate.unit, weeklyHours, rate.unit === 'day' ? dailyHours : undefined, holiday);
    weekPaidHours = rate.unit === 'week' || rate.unit === 'month' ? unitHours('week', weeklyHours, undefined, holiday) : null;
    hourly = rate.amount / hours;
  }

  // 단시간 — 남은 시간 × 시간급(별표2 제4호나목·마목)
  if (input.partTime) {
    const { fullTimeWeeklyHours: fw, fullTimeDays: g, usedHours } = input.partTime;
    if (rate.basis !== 'ordinary-wage') throw new Error('단시간 근로자의 연차수당은 시간급을 기준으로 합니다(시행령 별표2 제4호마목). 통상임금으로 넣어 주세요');
    if (!pos(fw) || fw > 168 || weeklyHours >= fw) throw new Error('단시간 근로자는 1주 소정근로시간이 통상 근로자보다 짧아야 합니다');
    // 1시간 미만 올림은 부여마다 한다 — 1년 미만 월 연차 11일과 1년차 15일이 함께 남았으면 26일로 합쳐 넣지 않고 따로 셈한다
    if (!nonNeg(g) || g > 25) throw new Error('통상 근로자 기준 연차일수는 한 번에 생기는 일수(25일 이하)로 넣어 주세요. 1년 미만 월 연차 11일과 1년차 15일이 함께 남았으면 따로 계산해 더합니다');
    if (!nonNeg(usedHours)) throw new Error('이미 쓴 연차 시간을 확인해 주세요');
    // 연차 시간 = 통상 연차일수 × (단시간 주 소정 ÷ 통상 주 소정) × 8, 1시간 미만은 1시간 — 나눗셈은 한 번만, 잡음을 지우고 올린다
    const rawGrantHours = (g * weeklyHours * 8) / fw;
    const grantHours = Math.ceil(snap(rawGrantHours));
    if (usedHours > grantHours) throw new Error('이미 쓴 시간이 연차 시간보다 많습니다');
    const unusedHours = snap(grantHours - usedHours);
    // 곱셈 먼저, 나눗셈 마지막(정수로 떨어지는 금액에서 1원 덜 나오지 않게) — 원 미만은 마지막에 한 번 버린다(법령에 정함 없음)
    const raw = snap((rate.amount * unusedHours) / hours!);
    return finish({
      ...base, hours, weekPaidHours, hourly, raw, amount: Math.floor(raw),
      partTime: { fullTimeWeeklyHours: fw, fullTimeDays: g, rawGrantHours, grantHours, usedHours, unusedHours },
      rateSource: `입력한 ${UNIT_LABEL[rate.unit]} ${rate.amount.toLocaleString('ko-KR')}원의 시간급(시행령 제6조제2항)`,
    });
  }

  // 통상 근로자 — 남은 일수
  const days = input.days;
  if (!days) throw new Error('남은 연차 일수를 넣어 주세요');
  let unusedDays: number;
  let ledger: LeavePayResult['ledger'] = null;
  if (days.source === 'ledger') {
    if (timing !== 'termination') throw new Error('입사일로 발생 누계를 세는 것은 퇴직할 때만 씁니다');
    const hire = checkDate(days.hireDate, '입사일');
    const last = checkDate(days.lastWorkDate, '마지막 재직일');
    if (last < hire) throw new Error('마지막 재직일이 입사일보다 앞섭니다');
    if (!nonNeg(days.usedDays)) throw new Error('이미 쓰거나 수당으로 받은 일수를 확인해 주세요');
    // 1년 미만 월 연차 — 1년 근로 후 바로 끝나면 11일, 그다음 날까지 재직하면 11 + 15 = 26일(대법원 2021다227100, 2022다245419).
    // 단, 1년차 15일이 2018. 5. 29. 이전에 생겼으면 구 §60③으로 월 연차가 그 15일에 포함된다(OLD_60_3_LAST_ACCRUAL).
    // 1년을 채우기 전에 끝나면 15일이 아직 없으므로 구법 시기라도 월 연차만 센다.
    const annual = buildHireDateLedger(hire, last);
    const firstAccrual = annual.entries[0]?.accruedOn;
    const includedIn15 = firstAccrual !== undefined && firstAccrual <= OLD_60_3_LAST_ACCRUAL;
    const l = includedIn15 ? annual : buildHireDateLedger(hire, last, { includeFirstYearMonthly: true });
    if (days.usedDays > l.total) throw new Error('이미 쓰거나 수당으로 받은 일수가 발생 누계보다 많습니다');
    ledger = { entries: l.entries, total: l.total, used: days.usedDays, firstYearMonthly: includedIn15 ? 'included-in-15' : 'separate' };
    unusedDays = l.total - days.usedDays;
  } else {
    if (!nonNeg(days.unusedDays)) throw new Error('남은 연차 일수를 확인해 주세요');
    unusedDays = days.unusedDays;
  }

  let dailyRate: number;
  let rateSource: string;
  if (rate.basis === 'ordinary-wage') {
    // 1일 통상임금 = 시간급 × 1일 소정근로시간(시행령 §6③). 곱셈 먼저 — 단가는 소수 그대로 넘기고 원 미만은 엔진이 마지막에 버린다
    dailyRate = (rate.amount * dailyHours) / hours!;
    rateSource = `입력한 ${UNIT_LABEL[rate.unit]} ${rate.amount.toLocaleString('ko-KR')}원의 시간급 × 1일 ${dailyHours}시간(시행령 제6조)`;
  } else {
    if (!pos(rate.dailyRate)) throw new Error('1일 평균임금을 확인해 주세요');
    dailyRate = rate.dailyRate;
    rateSource = '취업규칙 등이 정한 평균임금(입력한 1일 단가)';
  }

  const a = calculateAllowance({ unusedDays, dailyRate, rateBasis: rate.basis, rateSource });
  if (a.verdict !== 'calculated' || a.amount === null) throw new Error(a.blockedReason ?? '계산하지 못했습니다');
  return finish({
    ...base, hours, weekPaidHours, hourly, dailyRate, unusedDays, ledger,
    raw: unusedDays * dailyRate, amount: a.amount, rateSource,
  });
}
