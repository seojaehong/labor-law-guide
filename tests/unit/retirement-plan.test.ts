import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ageInEffect, reachDate, resolveRetirement, simulate,
  CURRENT_STEPS, PROPOSED_STEPS, NO_GROUP, type Employee, type Scenario,
} from '@/lib/calc/retirement-plan';
import { calcSeverance, periodSegments } from '@/lib/calc/severance';

const CUR: Scenario = { key: 'cur', label: '현행 60세', steps: CURRENT_STEPS };
const PRO: Scenario = { key: 'pro', label: '단계적 연장안', steps: PROPOSED_STEPS };
const OPT = { boundary: 'monthEnd' as const, fromYear: 2027, toYear: 2040 };

describe('정년 표', () => {
  it('현행은 어느 해든 60세다', () => {
    for (const y of [2026, 2030, 2037, 2050]) expect(ageInEffect(CURRENT_STEPS, y)).toBe(60);
  });

  it('단계적 연장안은 연도별로 올라간다', () => {
    expect(ageInEffect(PROPOSED_STEPS, 2028)).toBe(60);
    expect(ageInEffect(PROPOSED_STEPS, 2029)).toBe(61);
    expect(ageInEffect(PROPOSED_STEPS, 2030)).toBe(61);
    expect(ageInEffect(PROPOSED_STEPS, 2037)).toBe(65);
    expect(ageInEffect(PROPOSED_STEPS, 2099)).toBe(65);
  });
});

describe('정년 도달일', () => {
  it('monthEnd 는 생월의 말일이다 — 생일 당일은 쓸 수 없다(생년월일을 받지 않는다)', () => {
    expect(reachDate('1969-06', 60, 'monthEnd')).toBe('2029-06-30');
    expect(reachDate('1969-02', 60, 'monthEnd')).toBe('2029-02-28');
    expect(reachDate('1964-02', 60, 'monthEnd')).toBe('2024-02-29'); // 윤년
  });

  it('yearEnd 는 그 해 말일이다', () => {
    expect(reachDate('1969-06', 60, 'yearEnd')).toBe('2029-12-31');
  });

  it('출생연월 형식이 아니면 멈춘다 — 생년월일(YYYY-MM-DD)도 거부한다', () => {
    expect(() => reachDate('1969-06-15', 60, 'monthEnd')).toThrow(/출생연월/);
    expect(() => reachDate('1969', 60, 'monthEnd')).toThrow(/출생연월/);
    expect(() => reachDate('1969-13', 60, 'monthEnd')).toThrow(/출생연월/);
  });
});

describe('적용 정년 — 고정점으로 푼다', () => {
  it('현행에서는 전원 60세다', () => {
    expect(resolveRetirement('1969-06', CURRENT_STEPS, 'monthEnd')).toEqual({ age: 60, lastWorkDate: '2029-06-30' });
  });

  it('60세가 되는 해에 이미 정년이 올라가 있으면 그 사람의 정년도 올라간다', () => {
    // 1969-06 → 2029년에 60세. 2029년 정년은 61세 → 2030년(61세)에 퇴직. 2030년 정년도 61세라 거기서 멈춘다
    expect(resolveRetirement('1969-06', PROPOSED_STEPS, 'monthEnd')).toEqual({ age: 61, lastWorkDate: '2030-06-30' });
  });

  it('표가 계속 오르는 구간에서는 여러 번 밀린다', () => {
    // 1972-03 → 2032년 60세, 그 해 정년 62 → 2034년 62세, 그 해 정년 63 → 2035년 63세, 그 해 정년 64 → 2036년 64세, 2036년 정년 64 → 멈춤
    expect(resolveRetirement('1972-03', PROPOSED_STEPS, 'monthEnd')).toEqual({ age: 64, lastWorkDate: '2036-03-31' });
  });

  it('해마다 오르는 병적인 표라도 유한하므로 수렴한다 — 가드는 뒷배일 뿐이다', () => {
    const steep = Array.from({ length: 60 }, (_, i) => ({ fromYear: 2020 + i, age: 60 + i }));
    const r = resolveRetirement('1969-06', steep, 'monthEnd');
    expect(r.age).toBeLessThanOrEqual(119); // 표의 최대 나이
    // 수렴한 값은 고정점이다 — 그 해에 적용되는 정년이 자기 나이보다 높지 않다
    expect(ageInEffect(steep, Number(r.lastWorkDate.slice(0, 4)))).toBeLessThanOrEqual(r.age);
  });
});

describe('퇴직금은 정본 엔진 calcSeverance 를 지난다 (#311 §6)', () => {
  const emp: Employee = { id: 'A1', birthYM: '1969-06', hireDate: '2005-03-01', annualPay: 60_000_000 };

  it('simulate 의 금액이 calcSeverance 를 직접 부른 값과 같다 — 식을 다시 구현하지 않았다', () => {
    const r = simulate([emp], CUR, OPT);
    const lastWorkDate = '2029-06-30';
    const periodDays = periodSegments(emp.hireDate, '2029-07-01').reduce((a, s) => a + s.days, 0);
    const direct = calcSeverance({
      hireDate: emp.hireDate,
      lastWorkDate,
      wageTotal: Math.round((emp.annualPay * periodDays) / 365),
      weeklyHours: 40,
    });
    expect(r.people[0].severance).toBe(direct.amount);
    expect(direct.amount).toBeGreaterThan(0);
  });

  it('정년까지 1년 미만이면 0원이고 사유를 적는다', () => {
    const late: Employee = { id: 'B1', birthYM: '1969-06', hireDate: '2029-01-01', annualPay: 60_000_000 };
    const r = simulate([late], CUR, OPT);
    expect(r.people[0].severance).toBe(0);
    expect(r.people[0].note).toMatch(/1년 미만/);
  });
});

describe('연도별 집계', () => {
  const emp: Employee = { id: 'A1', birthYM: '1969-06', hireDate: '2005-03-01', annualPay: 60_000_000 };

  it('정년 도달 인원과 퇴직금 지급이 같은 해에 찍힌다', () => {
    const r = simulate([emp], CUR, OPT);
    const y29 = r.years.find((x) => x.year === 2029)!;
    expect(y29.retiring).toBe(1);
    expect(y29.severancePaid).toBe(r.people[0].severance);
    expect(r.years.find((x) => x.year === 2030)!.retiring).toBe(0);
  });

  it('인건비는 재직 일수에 비례한다 — 퇴직한 해는 1년분이 아니다', () => {
    const r = simulate([emp], CUR, OPT);
    const full = r.years.find((x) => x.year === 2028)!.payroll;
    const part = r.years.find((x) => x.year === 2029)!.payroll;
    expect(full).toBe(60_000_000);
    expect(part).toBeLessThan(full);
    expect(part).toBeGreaterThan(0);
    expect(r.years.find((x) => x.year === 2030)!.payroll).toBe(0);
  });

  it('정년이 밀리면 인건비와 퇴직금 지급도 같이 밀린다 — 현금 흐름이 바뀐다', () => {
    const cur = simulate([emp], CUR, OPT);
    const pro = simulate([emp], PRO, OPT);
    expect(cur.people[0].retireYear).toBe(2029);
    expect(pro.people[0].retireYear).toBe(2030);
    expect(pro.years.find((x) => x.year === 2030)!.severancePaid).toBeGreaterThan(0);
    expect(cur.years.find((x) => x.year === 2030)!.severancePaid).toBe(0);
    expect(pro.totals.payroll).toBeGreaterThan(cur.totals.payroll);
  });

  it('4대보험 사용자부담 요율을 켜면 인건비가 그만큼 오른다', () => {
    const base = simulate([emp], CUR, OPT).years.find((x) => x.year === 2028)!.payroll;
    const with11 = simulate([emp], CUR, { ...OPT, employerRate: 11 }).years.find((x) => x.year === 2028)!.payroll;
    expect(with11).toBe(Math.round(base * 1.11));
  });

  it('재고용은 임금률대로 더 쓰고 그 기간 퇴직금이 한 번 더 난다', () => {
    const re: Scenario = { key: 're', label: '재고용', steps: CURRENT_STEPS, rehire: { years: 1, payRate: 70 } };
    const r = simulate([emp], re, OPT);
    const p = r.people[0];
    expect(p.rehireLastWorkDate).toBe('2030-06-30');
    expect(p.rehireSeverance).toBeGreaterThan(0);
    expect(r.years.find((x) => x.year === 2030)!.payroll).toBeGreaterThan(0);
    // 재고용 기간 임금이 70% 이므로 그 해 인건비는 정년 전 연봉보다 작다
    expect(r.years.find((x) => x.year === 2030)!.payroll).toBeLessThan(60_000_000);
    expect(r.years.find((x) => x.year === 2030)!.severancePaid).toBe(p.rehireSeverance);
  });
});

describe('개인정보 — 받지 않으면 샐 수 없다 (#311 §3)', () => {
  // 주석을 떼고 본다. 설명 문구가 금지어에 걸려 시험이 벽지가 되는 일을 막는다
  const src = readFileSync('src/lib/calc/retirement-plan.ts', 'utf-8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('주민등록번호·이름 입력칸이 없다', () => {
    expect(code).not.toMatch(/rrn|residentNumber|ssn|\bname\b/i);
  });

  it('서버로 보내지 않는다 — 네트워크 호출이 0건이다', () => {
    expect(code).not.toMatch(/fetch\(|axios|XMLHttpRequest|\/api\//);
  });

  it('확률·점수를 내지 않는다 (#311 §4)', () => {
    expect(code).not.toMatch(/확률|적중률|probability|score/i);
  });

  it('생년은 연월까지만 받는다 — 형식 검사가 YYYY-MM 이다', () => {
    expect(code).toMatch(/\\d\{4\}\)-\(\\d\{2\}\)\$/);
  });
});

describe('직군별 집계 — 「생산직만 몇 명 빠진다」가 전체 인원보다 중요하다', () => {
  const crew: Employee[] = [
    { id: 'P1', birthYM: '1969-06', hireDate: '2005-03-01', annualPay: 60_000_000, group: '생산' },
    { id: 'P2', birthYM: '1969-09', hireDate: '2006-03-01', annualPay: 50_000_000, group: '생산' },
    { id: 'S1', birthYM: '1972-03', hireDate: '2010-03-01', annualPay: 70_000_000, group: '사무' },
    { id: 'X1', birthYM: '1975-01', hireDate: '2012-03-01', annualPay: 40_000_000 },
  ];
  const opt = { boundary: 'monthEnd' as const, fromYear: 2027, toYear: 2040 };

  it('직군 목록은 명단에 나온 순서를 지키고 미지정은 따로 묶는다', () => {
    const r = simulate(crew, CUR, opt);
    expect(r.groups).toEqual(['생산', '사무', NO_GROUP]);
  });

  it('같은 해에 생산직 2명이 빠지는 것이 직군 칸에서 보인다', () => {
    const r = simulate(crew, CUR, opt);
    const y29 = r.years.find((x) => x.year === 2029)!;
    expect(y29.retiring).toBe(2);
    expect(y29.byGroup['생산'].retiring).toBe(2);
    expect(y29.byGroup['사무'].retiring).toBe(0);
  });

  it('직군 합이 전체와 어긋나지 않는다 — 모든 해에서', () => {
    for (const sc of [CUR, PRO]) {
      const r = simulate(crew, sc, opt);
      for (const y of r.years) {
        const g = Object.values(y.byGroup);
        expect(g.reduce((a, x) => a + x.retiring, 0)).toBe(y.retiring);
        expect(g.reduce((a, x) => a + x.headcount, 0)).toBe(y.headcount);
        expect(g.reduce((a, x) => a + x.severancePaid, 0)).toBe(y.severancePaid);
        // 인건비는 직군별로 따로 반올림하므로 합이 1원 단위로 어긋날 수 있다
        expect(Math.abs(g.reduce((a, x) => a + x.payroll, 0) - y.payroll)).toBeLessThanOrEqual(g.length);
      }
    }
  });

  it('재고용 퇴직금도 직군 칸에 들어간다', () => {
    const re: Scenario = { key: 're', label: '재고용', steps: CURRENT_STEPS, rehire: { years: 1, payRate: 70 } };
    const r = simulate(crew, re, opt);
    const y30 = r.years.find((x) => x.year === 2030)!;
    expect(y30.byGroup['생산'].severancePaid).toBeGreaterThan(0);
    expect(y30.byGroup['생산'].severancePaid).toBe(
      (r.people[0].rehireSeverance ?? 0) + (r.people[1].rehireSeverance ?? 0),
    );
  });
});
