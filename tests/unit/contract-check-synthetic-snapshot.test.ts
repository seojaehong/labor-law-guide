// 합성 4건 전체 findings 고정 + 사이트 폼 경로 불변.
//
// tests/fixtures/contract-check/synthetic-findings.json 은 엔진 출력을 뽑아 사람이 한 줄씩 읽고 고친 기대값이다
// (자동 스냅숏이 아니다 — 처음 돌려도 통과하지 않는다). 261031 단시간 2건(0002·0004)의 MINWAGE·WAGE-MATH 를
// violation → ok 로 고쳤다: 기본급 897,840 은 산출근거 87H(시급 10,320) 기준인데 엔진이 209H 로 나눠 4,296 을 냈다.
// 261101 D1·D2 를 넣고 사람이 다시 읽어 세 칸을 고쳤다 — 0002·0004 MINWAGE ok → violation(주휴 포함 104.3H 로 나눠
// 8,608 < 10,320, 시행령 §5①3호), 0004 PART-TIME-OT detail 에 「50% 가산 항목 없음」(기간제법 §6③). 통상시급 10,320 은 그대로.
// D3~D7 은 결정 목록으로 남겼다(커밋 본문).

import { describe, expect, it } from 'vitest';

import siteGolden from '../fixtures/contract-check/site-form-findings.json';
import expected from '../fixtures/contract-check/synthetic-findings.json';
import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract } from '@/lib/contract-check/types';
import { INITIAL, buildContract } from '@/app/tools/contract-check/formState';

const row = (f: { rule_code: string; status: string; severity: string; detail: string | null }) =>
  `${f.rule_code} | ${f.status} | ${f.severity} | ${f.detail}`;

describe('합성 4건 — 전체 findings 기대값', () => {
  const cases = normalize(casesJson as unknown as Contract[]);
  it('4건', () => expect(cases).toHaveLength(4));
  for (const [i, exp] of expected.entries()) {
    it(`${exp.id}: 파생값과 findings ${exp.findings.length}건이 기대값과 같다`, () => {
      const c = cases[i];
      expect(c.contract_id).toBe(exp.id);
      expect({
        rate: c.wage.ordinary_hourly_rate,
        wh: c.work_time.weekly_actual_hours,
        et: c.employee.employment_type,
      }).toEqual({ rate: exp.rate, wh: exp.wh, et: exp.et });
      expect(checkContract(c).map(row)).toEqual(exp.findings);
    });
  }
});

describe('통상시급 파생 — BASE.basis_hours', () => {
  const contract = (basis_hours?: number | null) =>
    ({
      contract_id: 't',
      workplace: { name: '가상' },
      employee: { name: '가상' },
      period: { start_date: '2026-03-01' },
      work_time: {},
      wage: { items: [{ code: 'BASE', amount: 897840, basis_hours }] },
    }) as unknown as Contract;

  it('basis_hours 가 양수면 그 시간으로 나눈다', () => {
    expect(normalize(contract(87))[0].wage.ordinary_hourly_rate).toBe(10320);
  });
  it('basis_hours 가 없거나 0·null 이면 209 로 나눈다', () => {
    for (const h of [undefined, null, 0]) {
      expect(normalize(contract(h))[0].wage.ordinary_hourly_rate).toBe(4296);
    }
  });
});

describe('사이트 폼 경로 — 고친 뒤에도 출력 불변', () => {
  // 폼(buildContract)은 BASE 에 basis_hours 를 넣지 않는다. 그러니 단시간 금액을 넣어도 종전처럼 209 로 나눈다.
  const form = {
    ...INITIAL,
    periodType: 'indefinite' as const,
    startDate: '2026-03-01',
    baseWage: '897840',
    monthlyTotal: '897840',
    daysPerWeek: '5',
    workStart: '09:00',
    workEnd: '13:30',
    breakMinutes: '30',
    nightWork: 'no' as const,
    payday: '익월 10일',
    paymentMethod: '계좌이체',
    weeklyRest: 'specified' as const,
  };

  it('buildContract 의 BASE 에는 basis_hours 칸이 없다', () => {
    const base = buildContract(form).wage.items?.find((x) => x.code === 'BASE');
    expect(base).toBeDefined();
    expect(base && 'basis_hours' in base).toBe(false);
  });

  it('폼 경로 전체 findings 골든(고치기 전 출력을 뽑아 고정 — site-form-findings.json)', () => {
    const [c] = normalize(buildContract(form));
    expect(c.wage.ordinary_hourly_rate).toBe(siteGolden.rate);
    expect(checkContract(c).map(row)).toEqual(siteGolden.findings);
  });
});
