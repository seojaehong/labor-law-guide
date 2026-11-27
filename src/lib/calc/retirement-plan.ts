// 정년 대비 시뮬레이터의 계산 코어 — 회사용(#311)과 근로자용(#310)이 **같은 이 파일**을 쓴다.
// 퇴직금 금액은 직접 세지 않고 정본 엔진 calcSeverance 에 넘긴다(#311 §6 「공통 엔진 하나. 값이 갈리면 안 된다」).
//
// 🔴 이 파일이 계산하지 않는 것(#311 §4) — 정년연장 시행 시점·통과 가능성·확률·점수.
//    연도 표는 **인자로 받는다.** 코드에 박으면 안이 바뀔 때마다 배포해야 한다(2026-11-27 결정).
// 🔴 개인정보 — 주민등록번호도 이름도 받지 않는다. 식별은 호출자가 준 id 문자열뿐이고
//    생년은 **연월까지만** 받는다(#311 §3). 받지 않으면 샐 수 없다.
import { calcSeverance, periodSegments, type SeveranceResult } from './severance';

/**
 * 계산 도구 공통 형식 — 빠진 사실(needs)·가정한 값(assumptions).
 * 🔴 #314 가 master 에 들어오면 `import type { Need, Assumption } from './needs'` 로 바꾼다.
 *    모양을 그쪽과 **같게** 맞춰 두었다(구조적 호환이라 바꿀 때 고칠 곳이 없다).
 *    자체 형식을 만들면 안 된다 — 외부 AI 가 자연어로 되묻게 하려면 형식이 하나여야 한다(261127 재홍님 목표).
 */
export interface Need {
  key: string;
  question: string;
  why: string;
}
export interface Assumption {
  key: string;
  value: string | number | boolean;
  note: string;
}

/** 명단의 연봉 칸이 무엇인지 — 이게 정해지지 않으면 금액을 내지 않는다 */
export type PayBasis = 'total' | 'base';

/**
 * 🔴 가장 큰 구멍이었다 — 연봉 칸이 무엇을 포함하는지 묻지 않아서, 기본급만 넣은 사람과
 * 총액을 넣은 사람이 같은 칸에 넣고 다른 답을 받았다. 가정이 아니라 **입력이 모호한 것**이라 needs 다.
 */
export const PAY_BASIS_NEED: Need = {
  key: 'payBasis',
  question: '명단의 연봉 칸에 넣은 금액은 상여금과 고정수당을 포함한 연간 임금총액인가요, 기본급만인가요?',
  why: '퇴직금은 평균임금으로 계산하고 평균임금에는 상여금(연간 지급액의 3/12)과 고정수당이 들어갑니다(근로기준법 제2조제1항제6호). 기본급만 넣으면 퇴직금과 인건비가 실제보다 작게 나옵니다.',
};

/** 전일제인지 묻는다. 종전에는 주 40시간을 조용히 박아 넣었다 — 지급 대상 여부를 바꾸는 값이라 needs 가 맞다 */
export const WEEKLY_HOURS_NEED: Need = {
  key: 'allFullTime',
  question: '명단에 있는 사람들의 1주 소정근로시간이 근로계약서상 모두 15시간 이상인가요?',
  why: '4주 평균 1주 소정근로시간이 15시간 미만이면 퇴직금 지급 대상이 아닙니다(근로자퇴직급여 보장법 제4조제1항 단서). 15시간 미만인 사람이 섞여 있으면 그 사람은 이 도구로 계산하지 않습니다.',
};

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
  /**
   * 명단의 연봉 칸이 무엇인가. **주지 않으면 금액을 내지 않는다**(needs).
   * 인원 구조(정년 도달 연도·인원)는 연봉과 무관하게 참이므로 그대로 낸다.
   */
  payBasis?: PayBasis;
  /** 전원 1주 15시간 이상인가. **주지 않으면 금액을 내지 않는다**(needs) */
  allFullTime?: boolean;
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
  /** 정년 시점 퇴직금 추정액. 1년 미만이면 0. **needs 가 남으면 null** — 금액을 내지 않는다 */
  severance: number | null;
  /** 재고용 마지막 근무일 — 재고용 시나리오에서만 */
  rehireLastWorkDate?: string;
  /** 재고용 기간에 대한 퇴직금 추정액. 재고용이 1년 미만이면 0. needs 가 남으면 null */
  rehireSeverance?: number | null;
  /** 퇴직금 추정이 불가능한 사유 */
  note?: string;
}

export interface YearRow {
  year: number;
  /** 그 해에 정년에 도달하는 인원 */
  retiring: number;
  /** 그 해 말에 남아 있는 인원(재고용 포함) */
  headcount: number;
  /** 그 해 인건비(일수 비례. employerRate 를 주면 얹는다). **needs 가 남으면 null** */
  payroll: number | null;
  /** 그 해 퇴직금 지급액 추정. **needs 가 남으면 null** */
  severancePaid: number | null;
  /**
   * 직군별로 나눈 같은 수치. 「생산직만 2033년에 3명 빠진다」가 회사엔 전체 인원보다 중요하다.
   * 직군을 넣지 않은 사람은 NO_GROUP 으로 묶인다.
   */
  byGroup: Record<string, GroupRow>;
}

export interface GroupRow {
  retiring: number;
  headcount: number;
  payroll: number | null;
  severancePaid: number | null;
}

/** 직군을 넣지 않은 사람을 묶는 이름 */
export const NO_GROUP = '(직군 없음)';

export interface SimResult {
  scenario: string;
  /** 명단에 나온 직군 — 입력 순서를 지킨다. 직군이 하나뿐이면 화면에서 안 쪼갠다 */
  groups: string[];
  years: YearRow[];
  people: PersonRow[];
  totals: { payroll: number | null; severancePaid: number | null; retiring: number };
  /**
   * 결론을 바꾸는데 입력에 없는 사실. 하나라도 남으면 금액이 전부 null 이다.
   * 인원 구조(정년 도달 연도·인원·개인별 정년)는 그대로 낸다 — 연봉과 무관하게 참이기 때문이다.
   */
  needs: Need[];
  /** 우리가 가정한 값. 결론(정년·대상 여부)은 그대로이고 금액만 달라질 수 있는 것 — 접어 두지 말고 숫자 옆에 드러낸다 */
  assumptions: Assumption[];
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
  // 🔴 결론(금액)을 바꾸는데 입력에 없는 사실 — 종전에는 조용히 기본값을 박았다(주 40시간, 연봉 = 총액)
  const needs: Need[] = [];
  if (!opts.payBasis) needs.push(PAY_BASIS_NEED);
  if (opts.allFullTime !== true) needs.push(WEEKLY_HOURS_NEED);
  /** needs 가 비어야 금액을 낸다. 인원 구조는 needs 와 무관하게 낸다 */
  const money = needs.length === 0;

  // 가정한 값 — 접어 두지 말고 숫자 옆에 드러낸다
  const assumptions: Assumption[] = [
    { key: 'payRaise', value: 0,
      note: '임금 인상·승급을 넣지 않았습니다. 지금 연봉이 그대로 간다고 보고 계산했으므로, 정년이 밀리는 만큼 인건비는 실제보다 작게 나옵니다.' },
    { key: 'replacementHire', value: false,
      note: '정년으로 빠진 자리를 새로 채우지 않는다고 보고 계산했습니다. 신입으로 채우면 인건비가 내려가므로 연장안이 실제보다 불리하게 보입니다.' },
    { key: 'ordinaryWageCompare', value: false,
      note: '평균임금과 통상임금을 비교하지 않았습니다(근로기준법 제2조제2항 — 평균임금이 통상임금보다 낮으면 통상임금으로 계산합니다). 마지막 3개월에 받은 임금이 평소보다 적었던 사람은 퇴직금이 실제보다 작게 나옵니다.' },
    { key: 'retirementBoundary', value: opts.boundary === 'yearEnd' ? '그 해 말일' : '생월 말일',
      note: '정년 도달일을 그렇게 보았습니다. 취업규칙이 생일 기준이면 며칠 차이가 납니다 — 생년월일을 받지 않으므로 생일 당일은 고를 수 없습니다.' },
  ];
  if (opts.employerRate === undefined) {
    assumptions.push({ key: 'employerRate', value: 0,
      note: '4대보험 사용자부담분을 얹지 않았습니다. 연봉만 센 금액입니다.' });
  }
  if (opts.payBasis === 'base') {
    assumptions.push({ key: 'payBasis', value: 'base',
      note: '연봉 칸을 기본급으로 보고 계산했습니다. 상여금과 고정수당이 빠져 퇴직금과 인건비가 실제보다 작게 나옵니다.' });
  }

  // needs 가 남으면 이 값들은 버려지므로(금액 null) 계산 편의상 전일제로 센다.
  // 🔴 종전처럼 「조용한 기본값」이 아니다 — 답이 없으면 결과가 나가지 않는다
  const weeklyHours = 40;
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
      // 🔴 amount 는 null 일 수 있다 — 정본 엔진이 물을 사실(needs)이 남으면 금액을 내지 않는다.
      //    여기서는 전일제(weeklyHours)를 넘기므로 needs 가 비지만, 엔진이 바뀌어도 조용히 NaN 이 되지 않게 받는다
      row.severance = (r.eligible ? r.amount : 0) ?? 0;
      if (!r.eligible) row.note = r.status === 'under-1y' ? '정년까지 1년 미만 — 퇴직금 대상이 아닙니다' : undefined;
    }
    if (scenario.rehire && scenario.rehire.years > 0) {
      const start = addDays(lastWorkDate, 1);
      const end = addDays(reachDate(e.birthYM, age + scenario.rehire.years, opts.boundary), 0);
      row.rehireLastWorkDate = end;
      const rPay = Math.round((e.annualPay * scenario.rehire.payRate) / 100);
      const r2 = estimate(start, end, rPay, weeklyHours);
      row.rehireSeverance = (r2 && r2.eligible ? r2.amount : 0) ?? 0;
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
    type Acc = { retiring: number; headcount: number; payroll: number; severancePaid: number };
    const acc: Record<string, Acc> = {};
    for (const g of groups) acc[g] = { retiring: 0, headcount: 0, payroll: 0, severancePaid: 0 };
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const e = employees[i];
      const g = acc[e.group || NO_GROUP];
      if (p.retireYear === y) { retiring++; g.retiring++; }
      // 정년까지의 재직
      const d1 = overlapDays(e.hireDate, p.lastWorkDate, jan, dec);
      if (d1 > 0) { const v = (e.annualPay * rate * d1) / yd; payroll += v; g.payroll += v; }
      if (p.retireYear === y) { severancePaid += p.severance ?? 0; g.severancePaid += p.severance ?? 0; }
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
    const byGroup: Record<string, GroupRow> = {};
    for (const k of Object.keys(acc)) {
      const a = acc[k];
      byGroup[k] = {
        retiring: a.retiring,
        headcount: a.headcount,
        payroll: money ? Math.round(a.payroll) : null,
        severancePaid: money ? Math.round(a.severancePaid) : null,
      };
    }
    years.push({
      year: y, retiring, headcount,
      payroll: money ? Math.round(payroll) : null,
      severancePaid: money ? Math.round(severancePaid) : null,
      byGroup,
    });
  }

  // needs 가 남으면 개인별 금액도 내지 않는다 — 인원 구조(정년·마지막 근무일·근속)는 그대로 둔다
  if (!money) {
    for (const p of people) {
      p.severance = null;
      if (p.rehireLastWorkDate) p.rehireSeverance = null;
    }
  }

  return {
    scenario: scenario.key,
    groups,
    years,
    people,
    totals: {
      payroll: money ? years.reduce((a, r) => a + (r.payroll ?? 0), 0) : null,
      severancePaid: money ? years.reduce((a, r) => a + (r.severancePaid ?? 0), 0) : null,
      retiring: years.reduce((a, r) => a + r.retiring, 0),
    },
    needs,
    assumptions,
  };
}
