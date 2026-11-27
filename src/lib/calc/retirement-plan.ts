// 정년 대비 시뮬레이터의 계산 코어 — 회사용(#311)과 근로자용(#310)이 **같은 이 파일**을 쓴다.
// 퇴직금 금액은 직접 세지 않고 정본 엔진 calcSeverance 에 넘긴다(#311 §6 「공통 엔진 하나. 값이 갈리면 안 된다」).
//
// 🔴 이 파일이 계산하지 않는 것(#311 §4) — 정년연장 시행 시점·통과 가능성·확률·점수.
//    연도 표는 **인자로 받는다.** 코드에 박으면 안이 바뀔 때마다 배포해야 한다(2026-11-27 결정).
// 🔴 개인정보 — 주민등록번호도 이름도 받지 않는다. 식별은 호출자가 준 id 문자열뿐이고
//    생년은 **연월까지만** 받는다(#311 §3). 받지 않으면 샐 수 없다.
import { calcSeverance, periodSegments, type SeveranceResult } from './severance';

/** 그 연도부터 적용되는 정년 나이. fromYear 는 「그 해부터」다 */
export interface AgeStep {
  fromYear: number;
  age: number;
}

/** 현행 — 고령자고용법 §19① 「사업주는 근로자의 정년을 60세 이상으로 정하여야 한다」 */
export const CURRENT_STEPS: AgeStep[] = [{ fromYear: 0, age: 60 }];

/**
 * 2026-11-25 보도된 더불어민주당 정년연장특위 안의 기본값 — **입법 전 안이다.**
 * 2026-11-27 노사 소위는 합의 불발(간사 김주영 「접점을 찾기 어려웠다」)이고 12월 2일 마지막 전체회의가 남아 있다.
 * 일부 보도에 정부 자체안 발표 검토가 있어 **화면에서 사용자가 고쳐 쓸 수 있게 둔다.**
 */
export const PROPOSED_STEPS: AgeStep[] = [
  { fromYear: 0, age: 60 },
  { fromYear: 2029, age: 61 },
  { fromYear: 2031, age: 62 },
  { fromYear: 2033, age: 63 },
  { fromYear: 2035, age: 64 },
  { fromYear: 2037, age: 65 },
];

/** 정년 도달일을 어디로 보는가 — 취업규칙마다 다르다. 생년월일을 받지 않으므로 생일 당일은 쓸 수 없다 */
export type Boundary = 'monthEnd' | 'yearEnd';

/** 그 해에 적용되는 정년. 해당 step 이 없으면 60 */
export function ageInEffect(steps: AgeStep[], year: number): number {
  let age = 60;
  for (const s of steps) if (s.fromYear <= year && s.age > age) age = s.age;
  return age;
}

const lastDayOfMonth = (y: number, m1to12: number) =>
  new Date(Date.UTC(y, m1to12, 0)).toISOString().slice(0, 10);

/** 만 age 가 되는 해의 정년 도달일(= 마지막 근무일) */
export function reachDate(birthYM: string, age: number, boundary: Boundary): string {
  const m = /^(\d{4})-(\d{2})$/.exec(birthYM || '');
  if (!m) throw new Error(`출생연월이 올바르지 않습니다(YYYY-MM): ${birthYM}`);
  const y = Number(m[1]) + age;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`출생연월이 올바르지 않습니다(YYYY-MM): ${birthYM}`);
  return boundary === 'yearEnd' ? `${y}-12-31` : lastDayOfMonth(y, mo);
}

/**
 * 적용 정년과 그 도달일. 단계적 연장은 **고정점으로 푼다** —
 * 60세가 되는 해에 이미 정년이 61세로 올라가 있으면 그 사람의 정년은 61세이고,
 * 61세가 되는 해에 또 올라가 있으면 다시 밀린다. 표가 유한하므로 반드시 멈춘다.
 */
export function resolveRetirement(birthYM: string, steps: AgeStep[], boundary: Boundary) {
  let age = ageInEffect(steps, 0);
  for (let guard = 0; guard < 40; guard++) {
    const lastWorkDate = reachDate(birthYM, age, boundary);
    const eff = ageInEffect(steps, Number(lastWorkDate.slice(0, 4)));
    if (eff <= age) return { age, lastWorkDate };
    age = eff;
  }
  throw new Error('정년 표가 끝없이 올라갑니다 — 연도 표를 확인하세요');
}

export interface Employee {
  /** 사번이나 식별기호. **이름을 넣지 않는다**(#311 §3) */
  id: string;
  /** YYYY-MM. 일자는 받지 않는다 */
  birthYM: string;
  hireDate: string;
  /** 연간 임금총액(원) */
  annualPay: number;
  group?: string;
}

/** 재고용 — 정년 후 다시 쓰는 경우. 임금률은 정년 전 연봉 대비 % */
export interface Rehire {
  years: number;
  payRate: number;
}

export interface Scenario {
  key: string;
  label: string;
  steps: AgeStep[];
  rehire?: Rehire;
}

export interface SimOptions {
  boundary: Boundary;
  fromYear: number;
  toYear: number;
  /** 4대보험 사용자부담 요율(%). 주지 않으면 연봉 그대로 본다 */
  employerRate?: number;
  /** 4주 평균 1주 소정근로시간. 기본 40 — 전일제 가정이다 */
  weeklyHours?: number;
}

export interface PersonRow {
  id: string;
  group?: string;
  birthYM: string;
  hireDate: string;
  /** 적용 정년 나이 */
  retireAge: number;
  /** 정년 도달일 = 마지막 근무일 */
  lastWorkDate: string;
  retireYear: number;
  serviceYears: number;
  /** 정년 시점 퇴직금 추정액. 1년 미만이면 0 */
  severance: number;
  /** 재고용 마지막 근무일 — 재고용 시나리오에서만 */
  rehireLastWorkDate?: string;
  /** 재고용 기간에 대한 퇴직금 추정액. 재고용이 1년 미만이면 0 */
  rehireSeverance?: number;
  /** 퇴직금 추정이 불가능한 사유 */
  note?: string;
}

export interface YearRow {
  year: number;
  /** 그 해에 정년에 도달하는 인원 */
  retiring: number;
  /** 그 해 말에 남아 있는 인원(재고용 포함) */
  headcount: number;
  /** 그 해 인건비(일수 비례. employerRate 를 주면 얹는다) */
  payroll: number;
  /** 그 해 퇴직금 지급액 추정 */
  severancePaid: number;
  /**
   * 직군별로 나눈 같은 수치. 「생산직만 2033년에 3명 빠진다」가 회사엔 전체 인원보다 중요하다.
   * 직군을 넣지 않은 사람은 NO_GROUP 으로 묶인다.
   */
  byGroup: Record<string, GroupRow>;
}

export interface GroupRow {
  retiring: number;
  headcount: number;
  payroll: number;
  severancePaid: number;
}

/** 직군을 넣지 않은 사람을 묶는 이름 */
export const NO_GROUP = '(직군 없음)';

export interface SimResult {
  scenario: string;
  /** 명단에 나온 직군 — 입력 순서를 지킨다. 직군이 하나뿐이면 화면에서 안 쪼갠다 */
  groups: string[];
  years: YearRow[];
  people: PersonRow[];
  totals: { payroll: number; severancePaid: number; retiring: number };
}

const DAY = 86_400_000;
const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => new Date(t(s) + n * DAY).toISOString().slice(0, 10);
/** 그 해의 일수. 윤년이면 366 — 1년 꽉 재직한 해의 인건비가 연봉을 넘지 않게 이걸로 나눈다 */
const daysInYear = (y: number) => (Math.round((t(`${y + 1}-01-01`) - t(`${y}-01-01`)) / DAY));
/** [aFrom,aTo] 과 [bFrom,bTo] 가 겹치는 일수(양끝 포함) */
function overlapDays(aFrom: string, aTo: string, bFrom: string, bTo: string): number {
  const from = aFrom > bFrom ? aFrom : bFrom;
  const to = aTo < bTo ? aTo : bTo;
  if (from > to) return 0;
  return Math.round((t(to) - t(from)) / DAY) + 1;
}

/**
 * 장래 퇴직금 추정 — 정본 엔진에 넘긴다.
 * 산정기간(퇴직일 전 3개월) 임금총액은 연간 임금총액을 **그 기간 일수에 비례 배분**해 만든다.
 * 그래서 근로자용 계산기와 **같은 식·같은 끝수**를 지난다(#311 §6).
 * ⚠ 추정이다 — 실제 평균임금은 마지막 3개월 실지급액으로 갈린다. 화면에 그렇게 적는다.
 */
function estimate(hireDate: string, lastWorkDate: string, annualPay: number, weeklyHours: number): SeveranceResult | null {
  const retirementDate = addDays(lastWorkDate, 1);
  if (retirementDate <= hireDate) return null;
  const periodDays = periodSegments(hireDate, retirementDate).reduce((a, s) => a + s.days, 0);
  if (periodDays <= 0) return null;
  const wageTotal = Math.round((annualPay * periodDays) / 365);
  return calcSeverance({ hireDate, lastWorkDate, wageTotal, weeklyHours });
}

export function simulate(employees: Employee[], scenario: Scenario, opts: SimOptions): SimResult {
  const weeklyHours = opts.weeklyHours ?? 40;
  const rate = 1 + (opts.employerRate ?? 0) / 100;
  const people: PersonRow[] = [];

  for (const e of employees) {
    if (!(e.annualPay >= 0)) throw new Error(`${e.id}: 연봉이 올바르지 않습니다`);
    const { age, lastWorkDate } = resolveRetirement(e.birthYM, scenario.steps, opts.boundary);
    const row: PersonRow = {
      id: e.id,
      group: e.group,
      birthYM: e.birthYM,
      hireDate: e.hireDate,
      retireAge: age,
      lastWorkDate,
      retireYear: Number(lastWorkDate.slice(0, 4)),
      serviceYears: 0,
      severance: 0,
    };
    const r = estimate(e.hireDate, lastWorkDate, e.annualPay, weeklyHours);
    if (!r) {
      row.note = '정년 도달일이 입사일보다 앞섭니다 — 명단을 확인하세요';
    } else {
      row.serviceYears = Math.round((r.serviceDays / 365) * 10) / 10;
      row.severance = r.eligible ? r.amount : 0;
      if (!r.eligible) row.note = r.status === 'under-1y' ? '정년까지 1년 미만 — 퇴직금 대상이 아닙니다' : undefined;
    }
    if (scenario.rehire && scenario.rehire.years > 0) {
      const start = addDays(lastWorkDate, 1);
      const end = addDays(reachDate(e.birthYM, age + scenario.rehire.years, opts.boundary), 0);
      row.rehireLastWorkDate = end;
      const rPay = Math.round((e.annualPay * scenario.rehire.payRate) / 100);
      const r2 = estimate(start, end, rPay, weeklyHours);
      row.rehireSeverance = r2 && r2.eligible ? r2.amount : 0;
    }
    people.push(row);
  }

  // 직군은 명단에 나온 순서를 지킨다 — 화면 열 순서가 입력과 같아야 읽기 쉽다
  const groups: string[] = [];
  for (const e of employees) {
    const g = e.group || NO_GROUP;
    if (!groups.includes(g)) groups.push(g);
  }

  const years: YearRow[] = [];
  for (let y = opts.fromYear; y <= opts.toYear; y++) {
    const jan = `${y}-01-01`;
    const dec = `${y}-12-31`;
    const yd = daysInYear(y);
    let retiring = 0;
    let headcount = 0;
    let payroll = 0;
    let severancePaid = 0;
    const byGroup: Record<string, GroupRow> = {};
    for (const g of groups) byGroup[g] = { retiring: 0, headcount: 0, payroll: 0, severancePaid: 0 };
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const e = employees[i];
      const g = byGroup[e.group || NO_GROUP];
      if (p.retireYear === y) { retiring++; g.retiring++; }
      // 정년까지의 재직
      const d1 = overlapDays(e.hireDate, p.lastWorkDate, jan, dec);
      if (d1 > 0) { const v = (e.annualPay * rate * d1) / yd; payroll += v; g.payroll += v; }
      if (p.retireYear === y) { severancePaid += p.severance; g.severancePaid += p.severance; }
      let lastDay = p.lastWorkDate;
      // 재고용 기간
      if (p.rehireLastWorkDate) {
        const d2 = overlapDays(addDays(p.lastWorkDate, 1), p.rehireLastWorkDate, jan, dec);
        if (d2 > 0 && scenario.rehire) {
          const v = (e.annualPay * (scenario.rehire.payRate / 100) * rate * d2) / yd;
          payroll += v;
          g.payroll += v;
        }
        if (Number(p.rehireLastWorkDate.slice(0, 4)) === y) {
          severancePaid += p.rehireSeverance ?? 0;
          g.severancePaid += p.rehireSeverance ?? 0;
        }
        lastDay = p.rehireLastWorkDate;
      }
      if (e.hireDate <= dec && lastDay >= dec) { headcount++; g.headcount++; }
    }
    for (const g of Object.keys(byGroup)) {
      byGroup[g].payroll = Math.round(byGroup[g].payroll);
      byGroup[g].severancePaid = Math.round(byGroup[g].severancePaid);
    }
    years.push({ year: y, retiring, headcount, payroll: Math.round(payroll), severancePaid: Math.round(severancePaid), byGroup });
  }

  return {
    scenario: scenario.key,
    groups,
    years,
    people,
    totals: {
      payroll: years.reduce((a, r) => a + r.payroll, 0),
      severancePaid: years.reduce((a, r) => a + r.severancePaid, 0),
      retiring: years.reduce((a, r) => a + r.retiring, 0),
    },
  };
}
