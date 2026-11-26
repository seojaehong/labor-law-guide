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
  return countPeriod(input, baseDate, periodStart);
}

/** periodStart(포함)부터 baseDate 전날까지를 ①②로 산정한다 */
function countPeriod(input: HeadcountInput, baseDate: string, periodStart: string): HeadcountResult {
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
  // annualLeaveCoverage 와 같은 판단. 날짜마다 열두 달 구간(leaveMonths)이 다르지만 같은 달 구간이
  // 이웃 날짜와 겹치므로 구간마다 한 번만 센다.
  const monthly = { ...input, threshold: 5 as const, businessStart: undefined };
  const seen = new Map<string, boolean>();
  const covered = (start: string, base: string) => {
    const key = `${start}|${base}`;
    let v = seen.get(key);
    if (v === undefined) seen.set(key, (v = countPeriod(monthly, base, start).covered));
    return v;
  };
  return spansWhere(from, to, (d) => {
    const months = leaveMonths(d);
    if (input.businessStart && input.businessStart > months[0].start) return false;
    return months.every((m) => covered(m.start, m.base));
  });
}

/** 같은 날짜의 n개월 앞. 그 달에 그날이 없으면 그 달 말일 */
function monthsBefore(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  const py = Math.floor(idx / 12);
  const pm = (idx % 12) + 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/**
 * 기준일 전 1년의 열세 경계 — [12개월 전, 11개월 전, …, 1개월 전, 기준일]. 모두 기준일에서 바로 센다.
 * 한 달씩 거슬러 이어 세면 짧은 달에서 날짜가 잘린 채 다음 경계로 넘어가(3-31 → 2-28 → 1-28 …) 1년의 시작이 늦어진다(시행령 제7조의2 제3항 「발생일 전 1년」).
 */
function yearBounds(baseDate: string): string[] {
  return Array.from({ length: 13 }, (_, i) => monthsBefore(baseDate, 12 - i));
}

/**
 * ③ 연차의 열두 달. 달마다 기준일(yearBounds 의 11개월 전 … 기준일)을 두고, 그날의 ① 산정 구간
 * [그날 1개월 전(minusOneMonth), 그날 전날]을 쓴다 — 「날짜별 계산 보기」(computeHeadcount)와 같은 구간이다(G4 I3, 261126).
 * 제3항이 「제1항 및 제2항에 따라 월 단위로」 세라고 하므로 달마다 ①의 「그날 전 1개월」을 그대로 쓴다.
 * 짧은 달 뒤에는 앞 달과 며칠 겹친다(기준일 3-31 이면 2-28 의 달 1-28~2-27, 1-31 의 달 12-31~1-30). 빈틈은 없다.
 * 첫 달만 기준일 12개월 전에서 자른다 — 1년 밖으로 나가지 않게(제3항 「발생일 전 1년」). 그 달은 날짜별 산정보다 최대 3일 짧다.
 * 고용노동부가 월 경계 나누는 방식을 정한 해석은 찾지 못했다 — 두 화면이 같은 기준일에 다른 결론을 내지 않게 맞춘 선택이다.
 */
function leaveMonths(baseDate: string): { start: string; base: string }[] {
  const b = yearBounds(baseDate);
  return b.slice(1).map((base, i) => ({ start: i === 0 ? b[0] : minusOneMonth(base), base }));
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
  /** 달마다 실제로 센 구간과 그 값 — 근거 보기가 이 값을 그대로 그린다(첫 달은 날짜별 산정보다 짧을 수 있다, G4 R8) */
  months: { periodStart: string; periodEnd: string; average: number; operatingDays: number; belowDays: number; covered: boolean }[];
}

/**
 * ③ 연차(제60조, 제2항 제외)·제61조·제62조: 기준일 전 1년을 월 단위로 나눠(leaveMonths)
 * 각 달을 ①②로 산정하고 12개 달이 모두 5명 이상이어야 해당한다.
 */
export function annualLeaveCoverage(input: HeadcountInput, baseDate: string): AnnualLeaveResult {
  const monthly = { ...input, threshold: 5 as const, businessStart: undefined };
  const months: AnnualLeaveResult['months'] = leaveMonths(baseDate).map(({ start, base }) => {
    const r = countPeriod(monthly, base, start);
    return {
      periodStart: r.periodStart, periodEnd: r.periodEnd, average: r.average, operatingDays: r.operatingDays, belowDays: r.belowDays, covered: r.covered,
    };
  });
  const started = !input.businessStart || input.businessStart <= months[0].periodStart;
  return { covered: started && months.every((m) => m.covered), months };
}
