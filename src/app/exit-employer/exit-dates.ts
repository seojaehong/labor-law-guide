// 퇴사 처리 점검 — 날짜 계산 순수 함수. 브라우저 시간대와 관계없이 달력 날짜만 다룬다(UTC 자정 고정).
// 기한이 토·일과 겹쳐도 날짜를 미루지 않는다. 표시할 때 요일만 알린다.

export interface Ymd {
  y: number;
  m: number; // 1~12
  d: number;
}

const DAY = 86_400_000;

function toTime(x: Ymd) {
  return Date.UTC(x.y, x.m - 1, x.d);
}

function fromTime(t: number): Ymd {
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 'YYYY-MM-DD' → Ymd. 달력에 없는 날짜(2026-02-30 등)는 null. */
export function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const x = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const back = fromTime(toTime(x));
  return back.y === x.y && back.m === x.m && back.d === x.d ? x : null;
}

export function fmtIso(x: Ymd) {
  return `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function weekday(x: Ymd) {
  return new Date(toTime(x)).getUTCDay();
}

export function isWeekend(x: Ymd) {
  const w = weekday(x);
  return w === 0 || w === 6;
}

/** 2026.11.14.(토) */
export function fmtKo(x: Ymd) {
  return `${x.y}.${x.m}.${x.d}.(${WEEK[weekday(x)]})`;
}

export function addDays(x: Ymd, n: number): Ymd {
  return fromTime(toTime(x) + n * DAY);
}

export function compare(a: Ymd, b: Ymd) {
  return toTime(a) - toTime(b);
}

/** b − a 일수 */
export function daysBetween(a: Ymd, b: Ymd) {
  return Math.round((toTime(b) - toTime(a)) / DAY);
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** x 가 속한 달의 다음 달 n일 (n 이 그 달 말일보다 크면 말일) */
export function nextMonthDay(x: Ymd, n: number): Ymd {
  const y = x.m === 12 ? x.y + 1 : x.y;
  const m = x.m === 12 ? 1 : x.m + 1;
  return { y, m, d: Math.min(n, lastDayOfMonth(y, m)) };
}

/** x 가 속한 달의 다음 달 15일 — 4대보험 상실·고용종료 신고 */
export function nextMonth15(x: Ymd) {
  return nextMonthDay(x, 15);
}

/** x 가 속한 달의 다음 달 10일 — 원천징수세액 납부 */
export function nextMonth10(x: Ymd) {
  return nextMonthDay(x, 10);
}

/** x 가 속한 달의 다음 달 말일 — 원천징수영수증 발급 */
export function endOfNextMonth(x: Ymd) {
  return nextMonthDay(x, 31);
}

/** x 가 속한 해의 다음 해 3월 10일 — 근로·퇴직소득 지급명세서 제출 */
export function march10NextYear(x: Ymd): Ymd {
  return { y: x.y + 1, m: 3, d: 10 };
}

/**
 * 계속근로가 만 n개월 이상인지. 입사일 h, 마지막 근무일 l.
 * 입사일의 n개월 뒤 같은 날(없으면 그 달 말일 다음 날)의 전날까지 근무했으면 만 n개월.
 * 예) 2026-01-01 입사 → 2026-03-31 까지 근무하면 3개월.
 */
export function servedMonths(h: Ymd, l: Ymd, n: number) {
  const total = h.m - 1 + n;
  const y = h.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = lastDayOfMonth(y, m);
  const anniv: Ymd = h.d <= last ? { y, m, d: h.d } : addDays({ y, m, d: last }, 1);
  return compare(addDays(l, 1), anniv) >= 0;
}

export interface ExitDates {
  /** 마지막 근무일 */
  last: Ymd;
  /** 퇴직일 = 4대보험 자격 상실일·변동일 (마지막 근무일 다음 날) */
  lossDay: Ymd;
  /** 금품 청산·퇴직금 법정 기한 (마지막 근무일 + 14일) */
  settle: Ymd;
  /** 실제 지급일. 입력이 없으면 settle */
  pay: Ymd;
  /** 해고 예고를 늦어도 할 날 (마지막 근무일 − 30일) */
  noticeBy: Ymd;
  /** 고용보험 상실·고용종료·국민연금 상실 신고 (자격 상실일이 속한 달의 다음 달 15일) */
  report15: Ymd;
  /** 건강보험 자격상실 신고 (자격 변동일부터 14일 이내 = 마지막 근무일 + 14일) */
  health14: Ymd;
  /** 원천세 납부 (지급일이 속한 달의 다음 달 10일) */
  tax10: Ymd;
  /** 원천징수영수증 발급 (지급일이 속한 달의 다음 달 말일) */
  receipt: Ymd;
  /** 지급명세서 제출 (지급일이 속한 해의 다음 해 3월 10일) */
  statement: Ymd;
  /** 서류 보존 끝 (퇴직일부터 3년) */
  keepUntil: Ymd;
}

export function computeExitDates(last: Ymd, pay?: Ymd | null): ExitDates {
  const lossDay = addDays(last, 1);
  const settle = addDays(last, 14);
  const p = pay ?? settle;
  return {
    last,
    lossDay,
    settle,
    pay: p,
    noticeBy: addDays(last, -30),
    report15: nextMonth15(lossDay),
    health14: addDays(lossDay, 13),
    tax10: nextMonth10(p),
    receipt: endOfNextMonth(p),
    statement: march10NextYear(p),
    keepUntil: { y: lossDay.y + 3, m: lossDay.m, d: Math.min(lossDay.d, lastDayOfMonth(lossDay.y + 3, lossDay.m)) },
  };
}
