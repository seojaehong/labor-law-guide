// 해고예고수당 — 해고하려면 적어도 30일 전에 예고하고, 하지 않았으면 30일분 이상의 통상임금(근로기준법 §26 본문).
// 1일 통상임금 = 시간급 × 1일 소정근로시간(시행령 §6③). 시간급은 시행령 §6② — 월급이면 주 40시간 기준 209시간으로 나눈다.
// 계속 근로 3개월 미만은 적용하지 않는다(§26 단서 1호). 2호(천재·사변 등)·3호(고의 손해, 시행규칙 별표)는 화면에서 안내만 한다.
// 날짜는 YYYY-MM-DD, 해고일 = 근로관계가 끝나는 날(보통 마지막 근무일).
// 예고했지만 30일이 안 된 경우도 30일분 전액이다 — 모자란 날만큼으로 줄이지 않는다(30일 예고는 강행규정. 근기1451-20718, 1984.10.12 — 「미경과 일수분만」설을 받지 않고 「통상임금의 30일분 이상」).
import { unitHours, type MinWageInput } from './min-wage';

export interface NoticePayInput {
  unit: MinWageInput['unit'];
  /** 통상임금(단위 기간 금액) */
  amount: number;
  weeklyHours?: number;
  /** 1일 소정근로시간 */
  dailyHours: number;
  hireDate: string;
  dismissalDate: string;
  /** 해고를 알린 날. 없으면 예고하지 않은 것 */
  noticeDate?: string;
}

export interface NoticePayResult {
  /** pay = 예고 없음 · short = 30일 안 되게 예고 · noticed = 30일 전에 예고 · under3m = 계속 근로 3개월 미만 */
  status: 'pay' | 'short' | 'noticed' | 'under3m';
  noticeDays: number | null;
  hourly: number;
  dailyOrdinary: number;
  amount: number;
}

const DAY = 86_400_000;
function parse(s: string, what: string): number {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new Error(`${what}을 확인해 주세요`);
  return t;
}

export function calcNoticePay(input: NoticePayInput): NoticePayResult {
  const hire = parse(input.hireDate, '입사일');
  const dismissal = parse(input.dismissalDate, '해고일');
  if (dismissal < hire) throw new Error('해고일이 입사일보다 앞섭니다');
  if (!(input.dailyHours > 0) || input.dailyHours > 24) throw new Error('1일 소정근로시간을 확인해 주세요');
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) throw new Error('통상임금을 확인해 주세요');

  let noticeDays: number | null = null;
  if (input.noticeDate) {
    const notice = parse(input.noticeDate, '예고일');
    if (notice > dismissal) throw new Error('예고일이 해고일보다 뒤입니다');
    noticeDays = Math.round((dismissal - notice) / DAY);
  }

  const hours = unitHours(input.unit, input.weeklyHours, input.unit === 'day' ? input.dailyHours : undefined);
  const hourly = input.amount / hours;
  // 금액 = 화면에 보이는 1일 통상임금(원 단위) × 30 — 화면 식대로 곱하면 같은 값이 나와야 한다
  const dailyOrdinary = Math.round(hourly * input.dailyHours);
  const amount = dailyOrdinary * 30;

  // 3개월이 차는 날 = 입사일 3개월 뒤 같은 날의 전날(9.1 입사 → 11.30).
  // 그 달에 같은 날이 없으면 그 달 말일(민법 §160③ — 11.30 입사 → 2.28, 1.31 입사 → 4.30)
  const d = new Date(hire);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 3, day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const threeMonths = day > lastDay ? Date.UTC(y, m, lastDay) : Date.UTC(y, m, day) - DAY;
  const status = dismissal < threeMonths ? 'under3m' : noticeDays === null ? 'pay' : noticeDays >= 30 ? 'noticed' : 'short';
  const paid = status === 'pay' || status === 'short';
  return { status, noticeDays, hourly, dailyOrdinary: paid ? dailyOrdinary : 0, amount: paid ? amount : 0 };
}
