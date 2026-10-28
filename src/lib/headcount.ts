/**
 * 상시 사용하는 근로자 수 산정 — 근로기준법 시행령 제7조의2.
 * 날짜는 모두 'YYYY-MM-DD' 문자열이고 UTC 자정으로 다뤄 시간대에 흔들리지 않는다.
 */

/** regular = 통상·기간제·단시간 등 고용형태 불문(④1), dispatched = 파견(연인원 제외), family = 동거친족(④2) */
export type WorkerKind = 'regular' | 'dispatched' | 'family';

export interface HeadcountWorker {
  name: string;
  start: string;
  /** 마지막 근무일. 비우면 계속 근무 */
  end?: string;
  /** 0=일 … 6=토. 이 요일이 아닌 날은 근로의무가 없는 날로 보고 세지 않는다(대법원 2023다275998) */
  workWeekdays: number[];
  kind: WorkerKind;
}

export interface HeadcountInput {
  /** 사업장이 문을 여는 요일 */
  operatingWeekdays: number[];
  /** 영업 요일 중 문을 닫은 날(공휴일 휴무 등) */
  closedDates: string[];
  /** 5명, 취업규칙(제93조)은 10명 */
  threshold: 5 | 10;
  /** 사업 성립일. 기준일 전 1개월보다 늦으면 이날부터 센다(①괄호) */
  businessStart?: string;
  workers: HeadcountWorker[];
}

export interface DayCount { date: string; count: number }

export interface HeadcountResult {
  baseDate: string;
  periodStart: string;
  periodEnd: string;
  operatingDays: number;
  personDays: number;
  average: number;
  belowDays: number;
  /** 법 적용 사업장으로 보는가 */
  covered: boolean;
  /** rule1 = 평균대로, rule2-1 = 평균 미달이나 ②1로 해당, rule2-2 = 평균 이상이나 ②2로 해당 안 함 */
  basis: 'rule1' | 'rule2-1' | 'rule2-2';
  days: DayCount[];
}

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => toDate(toTime(d) + n * DAY);

/** 같은 날짜의 앞 달. 앞 달에 그날이 없으면 그 달 말일 */
export function minusOneMonth(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

const weekday = (d: string) => new Date(toTime(d)).getUTCDay();

function isOperating(input: HeadcountInput, d: string): boolean {
  return input.operatingWeekdays.includes(weekday(d)) && !input.closedDates.includes(d);
}

function worksOn(w: HeadcountWorker, d: string): boolean {
  return d >= w.start && (!w.end || d <= w.end) && w.workWeekdays.includes(weekday(d));
}

/** 하루 인원: 파견 제외, 동거친족은 그날 다른 근로자가 1명이라도 있을 때만 */
export function countOn(input: HeadcountInput, d: string): number {
  const present = input.workers.filter((w) => worksOn(w, d));
  const regulars = present.filter((w) => w.kind === 'regular').length;
  const family = present.filter((w) => w.kind === 'family').length;
  return regulars + (regulars > 0 ? family : 0);
}

/** 기준일(법 적용 사유 발생일)의 산정 결과 */
export function computeHeadcount(input: HeadcountInput, baseDate: string): HeadcountResult {
  let periodStart = minusOneMonth(baseDate);
  if (input.businessStart && input.businessStart > periodStart) periodStart = input.businessStart;
  const periodEnd = addDays(baseDate, -1);

  const days: DayCount[] = [];
  for (let d = periodStart; d <= periodEnd; d = addDays(d, 1)) {
    if (isOperating(input, d)) days.push({ date: d, count: countOn(input, d) });
  }
  const operatingDays = days.length;
  const personDays = days.reduce((s, x) => s + x.count, 0);
  const average = operatingDays ? personDays / operatingDays : 0;
  const belowDays = days.filter((x) => x.count < input.threshold).length;

  // ②는 평균이 어느 쪽이든 미달일 수로 결론을 정한다
  const covered = operatingDays > 0 && belowDays * 2 < operatingDays;
  const byAverage = average >= input.threshold;
  const basis = covered === byAverage ? 'rule1' : covered ? 'rule2-1' : 'rule2-2';

  return { baseDate, periodStart, periodEnd, operatingDays, personDays, average, belowDays, covered, basis, days };
}

export interface CoverageSpan { from: string; to: string }

/** 기준일을 하루씩 옮기며 5인(10인) 이상으로 보는 구간을 묶는다 */
export function coverageTimeline(input: HeadcountInput, from: string, to: string): CoverageSpan[] {
  return spansWhere(from, to, (d) => computeHeadcount(input, d).covered);
}

/** ③ 연차 요건(1년 계속 5명 이상)을 채우는 기준일 구간 */
export function annualLeaveTimeline(input: HeadcountInput, from: string, to: string): CoverageSpan[] {
  // annualLeaveCoverage 와 같은 판단. 날짜 D 의 열두 달은 D, D-1개월, D-2개월… 이 기준일이라
  // 앞 날짜들과 겹치므로 기준일마다 한 번만 센다.
  const monthly = { ...input, threshold: 5 as const, businessStart: undefined };
  const seen = new Map<string, boolean>();
  const covered = (d: string) => {
    let v = seen.get(d);
    if (v === undefined) seen.set(d, (v = computeHeadcount(monthly, d).covered));
    return v;
  };
  return spansWhere(from, to, (d) => {
    let end = d;
    for (let i = 0; i < 12; i++) {
      if (!covered(end)) return false;
      end = minusOneMonth(end);
    }
    return !input.businessStart || input.businessStart <= end;
  });
}

/** minusOneMonth 의 반대. 다음 달에 그날이 없으면 그 달 말일 */
export function plusOneMonth(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function spansWhere(from: string, to: string, holds: (d: string) => boolean): CoverageSpan[] {
  const spans: CoverageSpan[] = [];
  let open: CoverageSpan | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (holds(d)) {
      if (open) open.to = d;
      else open = { from: d, to: d };
    } else if (open) {
      spans.push(open);
      open = null;
    }
  }
  if (open) spans.push(open);
  return spans;
}

export interface AnnualLeaveResult {
  covered: boolean;
  months: { periodStart: string; periodEnd: string; average: number; covered: boolean }[];
}

/**
 * ③ 연차(제60조, 제2항 제외)·제61조·제62조: 기준일 전 1년을 월 단위로 나눠
 * 각 달을 ①②로 산정하고 12개 달이 모두 5명 이상이어야 해당한다.
 */
export function annualLeaveCoverage(input: HeadcountInput, baseDate: string): AnnualLeaveResult {
  const months: AnnualLeaveResult['months'] = [];
  let end = baseDate;
  for (let i = 0; i < 12; i++) {
    const r = computeHeadcount({ ...input, threshold: 5, businessStart: undefined }, end);
    months.unshift({ periodStart: r.periodStart, periodEnd: r.periodEnd, average: r.average, covered: r.covered });
    end = r.periodStart;
  }
  const started = !input.businessStart || input.businessStart <= months[0].periodStart;
  return { covered: started && months.every((m) => m.covered), months };
}
