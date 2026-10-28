/**
 * 상시 근로자 수 계산기 화면이 쓰는 유일한 입구.
 * 화면은 「N명이 이 기간에 일한다」는 묶음(Crew) 목록만 다루고, 엔진 입력(HeadcountInput)은 toInput 한 곳에서만 만든다.
 * 법 규칙은 headcount.ts 에 있고 여기서는 살펴볼 기간을 정해 답을 모은다.
 */
import {
  addDays,
  annualLeaveCoverage,
  annualLeaveTimeline,
  computeHeadcount,
  coverageTimeline,
  minusOneMonth,
  plusOneMonth,
  type CoverageSpan,
  type HeadcountInput,
  type HeadcountResult,
  type WorkerKind,
} from './headcount';

export type { HeadcountResult, WorkerKind };

export interface Site {
  /** 문을 여는 요일(0=일 … 6=토) */
  openDays: number[];
  /** 문을 연 요일 중 쉰 날 */
  closedDates: string[];
  /** 사업 시작일. 1개월이 안 됐을 때만 결과가 달라진다 */
  businessStart?: string;
}

/** 같은 기간·같은 요일·같은 구분으로 일하는 N명 */
export interface Crew {
  id: string;
  /** 1~99 */
  count: number;
  /** 첫 근무일. 없으면 원래부터 일하던 사람(1년 넘게) */
  from?: string;
  /** 마지막 근무일. 없으면 계속 */
  to?: string;
  /** 'site' = 문을 여는 날 모두. 읽을 때 Site.openDays 로 바꾼다 */
  days: 'site' | number[];
  kind: WorkerKind;
}

export interface Plan { site: Site; crews: Crew[] }

/** 해당 기간의 끝 날짜와 그 날짜를 설명하는 계산. start 는 그날, end 는 다음 날(빠지는 날)의 계산 */
export interface Edge { date: string; why: HeadcountResult }
/** 'open' = 살펴본 기간의 끝에 닿음 — 화면 문구는 「이미」(시작)·「계속」(끝) */
export interface CoveredSpan { start: Edge | 'open'; end: Edge | 'open' }

export type Coverage =
  | { kind: 'none'; nearest: HeadcountResult }
  | { kind: 'always' }
  | { kind: 'spans'; spans: CoveredSpan[] };

/** ③ 1년 이상 근속자 연차(제60조 제1항)·제61조·제62조 */
export type LeaveAnswer =
  | { kind: 'none'; coveredMonths: number }
  | { kind: 'always' }
  | { kind: 'from'; date: string }
  | { kind: 'spans'; spans: CoverageSpan[] };

export type Note =
  | { kind: 'staff-assumed'; count: number }
  | { kind: 'holidays-counted' }
  | { kind: 'period-reversed'; crewId: string }
  | { kind: 'change-outside-window'; date: string };

export interface PlanAnswer {
  /** 하루씩 살펴본 기간 */
  window: { from: string; to: string };
  five: Coverage;
  /** 10명 이상(제93조 취업규칙)으로 보는 구간 */
  ten: CoverageSpan[];
  leave: LeaveAnswer;
  notes: Note[];
}

const LONG_AGO = '1900-01-01';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(raw: string): string | undefined {
  if (!ISO.test(raw)) return undefined;
  const t = Date.parse(`${raw}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== raw ? undefined : raw;
}

/** 다음 달 1일 ~ 말일 */
export function nextMonthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const from = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(plusOneMonth(from), -1) };
}

/** 첫 화면: 원래부터 4명 + 다음 달 한 달 1명, 월~금 */
export function defaultPlan(today: string): Plan {
  return {
    site: { openDays: [1, 2, 3, 4, 5], closedDates: [] },
    crews: [
      { id: 'c1', count: 4, days: 'site', kind: 'regular' },
      { id: 'c2', count: 1, ...nextMonthRange(today), days: 'site', kind: 'regular' },
    ],
  };
}

export type PlanEdit =
  | { type: 'count'; id: string; count: number }
  /** <input type=date> 값 그대로. '' 는 지운다 */
  | { type: 'period'; id: string; from?: string; to?: string }
  | { type: 'crew'; id: string; patch: Partial<Pick<Crew, 'days' | 'kind'>> }
  | { type: 'add'; from: string; to: string }
  | { type: 'remove'; id: string }
  | { type: 'site'; patch: { openDays?: number[]; closedDates?: string[]; businessStart?: string } };

/** 화면 입력은 여기로만 들어온다. 날짜는 검사하고, 인원은 1~99로 맞춘다 */
export function editPlan(plan: Plan, edit: PlanEdit): Plan {
  const crew = (id: string, f: (c: Crew) => Crew) => ({ ...plan, crews: plan.crews.map((c) => (c.id === id ? f(c) : c)) });
  const date = (raw: string | undefined, prev: string | undefined) => (raw === undefined ? prev : raw === '' ? undefined : parseIsoDate(raw) ?? prev);
  switch (edit.type) {
    case 'count':
      return crew(edit.id, (c) => ({ ...c, count: Math.min(99, Math.max(1, Math.round(edit.count) || 1)) }));
    case 'period':
      return crew(edit.id, (c) => ({ ...c, from: date(edit.from, c.from), to: date(edit.to, c.to) }));
    case 'crew':
      return crew(edit.id, (c) => ({ ...c, ...edit.patch }));
    case 'add': {
      const n = Math.max(0, ...plan.crews.map((c) => Number(c.id.slice(1)) || 0)) + 1;
      return { ...plan, crews: [...plan.crews, { id: `c${n}`, count: 1, from: edit.from, to: edit.to, days: 'site', kind: 'regular' }] };
    }
    case 'remove':
      return { ...plan, crews: plan.crews.filter((c) => c.id !== edit.id) };
    case 'site': {
      const { openDays, closedDates, businessStart } = edit.patch;
      return {
        ...plan,
        site: {
          ...plan.site,
          ...(openDays ? { openDays: [...openDays].sort() } : {}),
          ...(closedDates ? { closedDates: closedDates.filter((d) => parseIsoDate(d)) } : {}),
          ...(businessStart !== undefined ? { businessStart: date(businessStart, plan.site.businessStart) } : {}),
        },
      };
    }
  }
}

const reversed = (c: Crew) => !!c.from && !!c.to && c.to < c.from;

/** 엔진 입력을 만드는 유일한 곳 */
function toInput(plan: Plan, threshold: 5 | 10 = 5): HeadcountInput {
  return {
    operatingWeekdays: plan.site.openDays,
    closedDates: plan.site.closedDates,
    threshold,
    businessStart: plan.site.businessStart,
    workers: plan.crews.filter((c) => !reversed(c)).flatMap((c) =>
      Array.from({ length: c.count }, (_, i) => ({
        name: `${c.id}-${i + 1}`,
        start: c.from ?? LONG_AGO,
        end: c.to,
        workWeekdays: c.days === 'site' ? plan.site.openDays : c.days,
        kind: c.kind,
      })),
    ),
  };
}

const plusMonths = (d: string, n: number) => Array.from({ length: n }).reduce<string>((x) => plusOneMonth(x), d);
const minusMonths = (d: string, n: number) => Array.from({ length: n }).reduce<string>((x) => minusOneMonth(x), d);

/**
 * 살펴볼 기간: 오늘과 바뀌는 날(입사·퇴사 다음 날·사업 시작) 중 가장 이른 날부터,
 * 가장 늦은 날 1개월 + 1일 뒤까지. 그 뒤로는 전 1개월에 변화가 없어 답이 굳는다.
 * 오늘에서 12개월 넘게 떨어진 날은 넣지 않는다.
 */
function windowFor(plan: Plan, today: string, notes: Note[]) {
  const lo = minusMonths(today, 12);
  const hi = plusMonths(today, 12);
  const changes: string[] = [];
  for (const c of plan.crews.filter((x) => !reversed(x))) {
    if (c.from) changes.push(c.from);
    if (c.to) changes.push(addDays(c.to, 1));
  }
  if (plan.site.businessStart) changes.push(plan.site.businessStart);
  const inside = changes.filter((d) => {
    const ok = d >= lo && d <= hi;
    if (!ok) notes.push({ kind: 'change-outside-window', date: d });
    return ok;
  });
  const from = [today, ...inside].sort()[0];
  const last = [today, ...inside].sort().at(-1)!;
  return { from, to: addDays(plusOneMonth(last), 1) };
}

/** 화면이 부르는 단 하나의 함수 */
export function answerPlan(plan: Plan, today: string): PlanAnswer {
  const notes: Note[] = [];
  const input = toInput(plan);
  const window = windowFor(plan, today, notes);

  const raw = coverageTimeline(input, window.from, window.to);
  let five: Coverage;
  if (raw.length === 0) {
    let nearest = computeHeadcount(input, window.from);
    for (let d = window.from; d <= window.to; d = addDays(d, 1)) {
      const r = computeHeadcount(input, d);
      const share = (x: HeadcountResult) => (x.operatingDays ? x.belowDays / x.operatingDays : 1);
      if (share(r) < share(nearest)) nearest = r;
    }
    five = { kind: 'none', nearest };
  } else if (raw.length === 1 && raw[0].from === window.from && raw[0].to === window.to) {
    five = { kind: 'always' };
  } else {
    five = {
      kind: 'spans',
      spans: raw.map((s) => ({
        start: s.from === window.from ? 'open' : { date: s.from, why: computeHeadcount(input, s.from) },
        end: s.to === window.to ? 'open' : { date: s.to, why: computeHeadcount(input, addDays(s.to, 1)) },
      })),
    };
  }

  const ten = coverageTimeline(toInput(plan, 10), window.from, window.to);

  // 연차는 1년이 지나야 채워질 수 있으므로 1년 더 본다
  const leaveTo = plusMonths(window.to, 12);
  const leaveSpans = annualLeaveTimeline(input, window.from, leaveTo);
  let leave: LeaveAnswer;
  if (leaveSpans.length === 0) {
    const at = five.kind === 'spans' ? lastCovered(five.spans, window.to) : window.to;
    leave = { kind: 'none', coveredMonths: annualLeaveCoverage(input, at).months.filter((m) => m.covered).length };
  } else if (leaveSpans.length === 1 && leaveSpans[0].from === window.from && leaveSpans[0].to === leaveTo) {
    leave = { kind: 'always' };
  } else if (leaveSpans.length === 1 && leaveSpans[0].to === leaveTo) {
    leave = { kind: 'from', date: leaveSpans[0].from };
  } else {
    leave = { kind: 'spans', spans: leaveSpans };
  }

  const assumed = plan.crews.filter((c) => !c.from && !reversed(c)).reduce((s, c) => s + c.count, 0);
  if (assumed) notes.push({ kind: 'staff-assumed', count: assumed });
  if (plan.site.closedDates.length === 0) notes.push({ kind: 'holidays-counted' });
  for (const c of plan.crews.filter(reversed)) notes.push({ kind: 'period-reversed', crewId: c.id });

  return { window, five, ten, leave, notes };
}

function lastCovered(spans: CoveredSpan[], windowTo: string): string {
  const end = spans.at(-1)!.end;
  return end === 'open' ? windowTo : end.date;
}

/** 날짜 하나의 1개월 산정(①②) — 근거 보기용 */
export function explainDate(plan: Plan, date: string): HeadcountResult {
  return computeHeadcount(toInput(plan), date);
}
