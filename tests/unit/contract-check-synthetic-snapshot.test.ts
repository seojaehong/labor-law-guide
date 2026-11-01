// 합성 4건 전체 findings 고정 + 사이트 폼 경로 골든.
//
// tests/fixtures/contract-check/synthetic-findings.json 은 엔진 출력을 뽑아 사람이 한 줄씩 읽고 고친 기대값이다
// (자동 스냅숏이 아니다). 행 형식은 row.ts — 코드 | 이름 | 근거 조문 | 상태 | 심각도 | 설명(261101 부터 이름·조문 포함).
// 고친 이력:
// - 261031 단시간 2건(0002·0004) MINWAGE·WAGE-MATH violation → ok: 기본급 897,840 은 산출근거 87H(시급 10,320) 기준.
// - 261101 D1·D2: 0002·0004 MINWAGE ok → violation(주휴 포함 104.3H), 0004 PART-TIME-OT 에 「50% 가산 항목 없음」.
// - 261101 재홍님 확정 법리 A~E 로 다시(D1 번복): 0002·0004 MINWAGE violation → risk·minor — 시급제(시급 10,320 × 87H)는
//   주휴수당 항목이 없어도 위반이 아니고(근기법 §55① 법정 발생) 주휴 산정·지급 방법 서면 명시 확인 필요(근기법 §17②).
//   0001·0003 MINWAGE detail 은 월급제 계산식(월 산입 임금 ÷ 209H)으로 바뀌고 상태 ok 그대로.
//   0004 요일별 근무표 종업 14:00 → 14:30: 휴게(12:00~12:30)를 소정에서 빼게 되면서 「주 20H」 산출근거와 맞추려고 데이터를
//   고쳤다. 소정 20H·초과 15H 그대로, PART-TIME-OT detail 문구만 바뀜.

import { describe, expect, it } from 'vitest';

import { goldenRow as row } from '../fixtures/contract-check/row';
import siteGolden from '../fixtures/contract-check/site-form-findings.json';
import expected from '../fixtures/contract-check/synthetic-findings.json';
import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract } from '@/lib/contract-check/types';
import { type FormState, INITIAL, buildContract } from '@/app/tools/contract-check/formState';

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
  it('basis_hours 가 없고 근로시간도 모르면 209 로 나눈다', () => {
    for (const h of [undefined, null, 0]) {
      expect(normalize(contract(h))[0].wage.ordinary_hourly_rate).toBe(4296);
    }
  });
});

/** 사이트 폼 골든 — 사례마다 INITIAL 위에 덮어쓸 폼 값과 기대 출력. 기대 출력은 엔진 출력을 사람이 읽고 고정했다. */
const SITE_BASE: Partial<FormState> = {
  periodType: 'indefinite',
  startDate: '2026-03-01',
  baseWage: '897840',
  monthlyTotal: '897840',
  daysPerWeek: '5',
  workStart: '09:00',
  workEnd: '13:30',
  breakMinutes: '30',
  nightWork: 'no',
  payday: '익월 10일',
  paymentMethod: '계좌이체',
  weeklyRest: 'specified',
};
// 요일별 근무표(소정 10:00~15:30, 휴게 30분 차감 5H × 5 = 25H) + 실근로 10:00~17:30(35H, 초과 10H) + 연장수당 금액만(가산율·시간 칸 없음)
const SITE_DAILY_OT: Partial<FormState> = {
  ...SITE_BASE,
  baseWage: '1400000',
  monthlyTotal: '1500000',
  workStart: '10:00',
  workEnd: '17:30',
  hasDaily: true,
  daily: ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '10:00', end: '15:30' })),
  otAmount: '100000',
};
const SITE_CASES: Record<string, Partial<FormState>> = {
  'part-time-monthly': SITE_BASE,
  'daily-schedule-ot': SITE_DAILY_OT,
  'daily-schedule-ot-4-or-fewer': { ...SITE_DAILY_OT, fivePlus: 'no' },
};

describe('사이트 폼 경로 골든(site-form-findings.json)', () => {
  it('buildContract 의 BASE 에는 basis_hours 칸이 없다 — 월급제(C)로 판정된다', () => {
    const base = buildContract({ ...INITIAL, ...SITE_BASE }).wage.items?.find((x) => x.code === 'BASE');
    expect(base).toBeDefined();
    expect(base && 'basis_hours' in base).toBe(false);
  });

  it('골든 사례 목록이 같다', () => {
    expect(siteGolden.map((g) => g.id)).toEqual(Object.keys(SITE_CASES));
  });

  for (const g of siteGolden) {
    it(`${g.id}: 전체 findings`, () => {
      const [c] = normalize(buildContract({ ...INITIAL, ...SITE_CASES[g.id] }));
      expect(c.wage.ordinary_hourly_rate).toBe(g.rate);
      expect(checkContract(c).map(row)).toEqual(g.findings);
    });
  }
});
