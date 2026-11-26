// 퇴직금 정본 엔진 — 사이트의 퇴직금 계산은 모두 이것을 쓴다(/tools/severance.html 은 생성 스크립트로 안에 넣는다).
// 식 = 1일 평균임금 × 30 × 재직일수 ÷ 365 (퇴직급여법 §8①)
//   평균임금 = 퇴직일 전 3개월 임금총액(+ 상여·연차수당 3/12) ÷ 그 기간 총일수 (근로기준법 §2①6)
//   평균임금이 통상임금보다 낮으면 통상임금 (같은 조 ②)
// 끝수는 고용노동부 퇴직금 계산기와 같게 — 1일 평균임금은 소수 둘째 자리까지 올림, 퇴직금은 원 단위 반올림.
// 계산은 정수(BigInt, 1일 임금은 전 단위)로 한다. 날짜는 YYYY-MM-DD, 모두 UTC 달력으로 센다.
// ⚠ 이 파일은 import 없이 홀로 선다 — html 안에 그대로 옮겨 넣기 때문이다.

const DAY = 86_400_000;

function parse(s: string, what: string): number {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const t = ok ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what} 날짜가 올바르지 않습니다: ${s}`);
  return t;
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(parse(s, '날짜') + n * DAY);
const diffDays = (later: string, earlier: string) => Math.round((parse(later, '날짜') - parse(earlier, '날짜')) / DAY);

/**
 * 3개월 전 같은 날. 그 달에 그날이 없으면 말일(7.31 → 4.30).
 * 다만 2월에 그날이 없으면(5.29 평년·5.30·5.31) 3월 1일 — 고용노동부 퇴직금 계산기(retire_cal.js setDate)와 같은 규칙이다.
 */
function threeMonthsBefore(s: string): string {
  const d = new Date(parse(s, '날짜'));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - 3;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (d.getUTCDate() > last && new Date(Date.UTC(y, m, 1)).getUTCMonth() === 1) return ymd(Date.UTC(y, m + 1, 1));
  return ymd(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

export interface Segment {
  from: string;
  to: string;
  days: number;
  year: number;
  month: number;
}

/** 평균임금 산정기간 — 퇴직일 3개월 전 같은 날(입사일이 늦으면 입사일)부터 퇴직일 전날까지, 달마다 나눈다 */
export function periodSegments(hireDate: string, retirementDate: string): Segment[] {
  const start3 = threeMonthsBefore(retirementDate);
  let from = start3 < hireDate ? hireDate : start3;
  const end = addDays(retirementDate, -1);
  const out: Segment[] = [];
  while (from <= end) {
    const d = new Date(parse(from, '날짜'));
    const monthEnd = ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const to = monthEnd < end ? monthEnd : end;
    out.push({ from, to, days: diffDays(to, from) + 1, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    from = addDays(to, 1);
  }
  return out;
}

/** 입사일부터 1년이 차는 날(그날 퇴직하면 1년 근속). 2월 29일 입사면 다음 해 3월 1일 */
export function oneYearDate(hireDate: string): string {
  const d = new Date(parse(hireDate, '입사일'));
  return ymd(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

export interface SeveranceInput {
  hireDate: string;
  /** 마지막 근무일. 퇴직일은 그 다음 날 */
  lastWorkDate: string;
  /** 산정기간 임금총액 */
  wageTotal: number;
  /** 퇴직 전 1년 상여금 총액 */
  annualBonus?: number;
  /** 퇴직 전 1년 연차수당 중 평균임금에 넣는 금액 */
  annualLeavePay?: number;
  /** 넣으면 평균임금과 비교해 높은 쪽을 쓴다(근로기준법 §2②). 강제 선택은 두지 않는다(261124 — 낮은 쪽 적용 결함) */
  dailyOrdinaryWage?: number;
  /** 4주 평균 1주 소정근로시간. 15시간 미만이면 지급 대상이 아니다(퇴직급여법 §4① 단서). 넣지 않으면 지급 대상이라고 판정하지 않는다 */
  weeklyHours?: number;
  /**
   * 산정기간 중 평균임금에서 빼는 기간의 일수 — 근로기준법 시행령 §2①(수습을 시작한 날부터 3개월 이내·육아휴직 등)과
   * 남녀고용평등법 §19의3④(육아기 근로시간 단축 기간). 산정기간 일수에서 뺀다
   */
  excludedDays?: number;
  /**
   * 그 기간에 받은 임금 — wageTotal 에 들어 있는 금액이라 임금총액에서 뺀다.
   * excludedDays 가 0보다 크면 반드시 넣는다(받지 않았으면 0). 비우면 분모만 줄어 평균임금이 부풀므로 멈춘다(261126 G4 I8)
   */
  excludedWage?: number;
}

/** eligible = 1년 이상 + 주 15시간 이상. hours-unknown = 시간을 넣지 않아 판정하지 않음 */
export type SeveranceStatus = 'eligible' | 'under-1y' | 'under-15h' | 'hours-unknown';

export interface SeveranceResult {
  retirementDate: string;
  serviceDays: number;
  /** 계속근로 1년 이상(퇴직급여법 §4①) */
  oneYear: boolean;
  /** 4주 평균 주 15시간 이상(같은 항 단서). 시간을 넣지 않았으면 null */
  hours15: boolean | null;
  /** 지급 대상 — oneYear 이고 hours15 가 true 일 때만 true(시간을 모르면 false, 261124 P2 #13) */
  eligible: boolean;
  status: SeveranceStatus;
  segments: Segment[];
  /** 산정기간 달력 일수 */
  periodDays: number;
  /** 뺀 제외기간 일수 */
  excludedDays: number;
  /** 1일 평균임금의 분모 = periodDays − excludedDays */
  averageDays: number;
  bonusAdd: number;
  leaveAdd: number;
  /** 임금총액 + 가산(원 단위 아래 포함) */
  baseTotal: number;
  dailyAverage: number;
  applied: 'average' | 'ordinary';
  dailyApplied: number;
  amount: number;
}

export function calcSeverance(input: SeveranceInput): SeveranceResult {
  parse(input.hireDate, '입사일');
  const retirementDate = addDays(input.lastWorkDate, 1);
  const serviceDays = diffDays(retirementDate, input.hireDate);
  if (serviceDays <= 0) throw new Error('마지막 근무일이 입사일보다 앞섭니다');

  const w = input.weeklyHours;
  if (w !== undefined && !(typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 168)) throw new Error('1주 소정근로시간을 확인해 주세요');

  const segments = periodSegments(input.hireDate, retirementDate);
  const periodDays = segments.reduce((a, s) => a + s.days, 0);
  // 제외기간(근로기준법 시행령 §2① · 남녀고용평등법 §19의3④) — 그 일수와 그 기간 임금을 산정기간·임금총액에서 뺀다
  const excludedDays = input.excludedDays ?? 0;
  const excludedWage = input.excludedWage ?? 0;
  if (!Number.isInteger(excludedDays) || excludedDays < 0) throw new Error('제외기간 일수를 확인해 주세요');
  if (!(Number.isFinite(excludedWage) && excludedWage >= 0) || excludedWage > input.wageTotal) throw new Error('제외기간에 받은 임금을 확인해 주세요(3개월 임금총액보다 클 수 없습니다)');
  if (excludedDays === 0 && excludedWage > 0) throw new Error('제외기간 일수 없이 그 기간 임금만 넣었습니다');
  if (excludedDays >= periodDays) throw new Error('평균임금 산정기간 전부가 제외기간입니다. 이때는 이 계산식으로 셀 수 없습니다');
  // 261126 G4 I8 — 일수만 넣고 임금을 비우면 0 으로 보지 않는다(분모만 줄어 평균임금이 부푼다)
  if (excludedDays > 0 && input.excludedWage === undefined) throw new Error('제외기간에 받은 임금을 넣어 주세요. 그 기간에 받은 임금이 없으면 0을 넣습니다');
  // 261126 G4 I15 — 남은 기간 임금이 0 이 되는 입력은 멈춘다
  if (excludedDays > 0 && excludedWage > 0 && excludedWage === input.wageTotal) throw new Error('제외기간에 받은 임금이 3개월 임금총액과 같아 남은 기간 임금이 0원이 됩니다. 입력을 확인해 주세요');
  const averageDays = periodDays - excludedDays;
  const bonus = input.annualBonus ?? 0;
  const leave = input.annualLeavePay ?? 0;
  // 12배 해 두면 3/12 가산도 정수로 남는다
  const base12 = BigInt(Math.round(input.wageTotal - excludedWage)) * BigInt(12) + BigInt(Math.round(bonus)) * BigInt(3) + BigInt(Math.round(leave)) * BigInt(3);
  // 1일 평균임금(전) = 올림(임금총액 ÷ 일수, 소수 둘째 자리)
  const den = BigInt(12) * BigInt(averageDays);
  const avgCents = (base12 * BigInt(100) + den - BigInt(1)) / den;
  const ordCents = BigInt(Math.round((input.dailyOrdinaryWage ?? 0) * 100));
  const applied: 'average' | 'ordinary' = ordCents > avgCents ? 'ordinary' : 'average';
  const cents = applied === 'ordinary' ? ordCents : avgCents;

  // 퇴직금 = 반올림(1일 임금 × 30 × 재직일수 ÷ 365)
  const num = cents * BigInt(30) * BigInt(serviceDays);
  const amount = Number((num * BigInt(2) + BigInt(36_500)) / BigInt(73_000));

  const dailyAverage = Number(avgCents) / 100;
  const oneYear = retirementDate >= oneYearDate(input.hireDate);
  const hours15 = w === undefined ? null : w >= 15;
  const status: SeveranceStatus = !oneYear ? 'under-1y' : hours15 === false ? 'under-15h' : hours15 === null ? 'hours-unknown' : 'eligible';
  return {
    retirementDate,
    serviceDays,
    oneYear,
    hours15,
    eligible: status === 'eligible',
    status,
    segments,
    periodDays,
    excludedDays,
    averageDays,
    bonusAdd: (bonus * 3) / 12,
    leaveAdd: (leave * 3) / 12,
    baseTotal: Number(base12) / 12,
    dailyAverage,
    applied,
    dailyApplied: Number(cents) / 100,
    amount,
  };
}
