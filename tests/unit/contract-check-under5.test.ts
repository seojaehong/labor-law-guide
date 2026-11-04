// 상시 5명 미만 — 근로기준법 제56조(연장·야간·휴일 가산)는 적용되지 않는다(시행령 제7조 별표 1).
// 연장시간 자체는 지급해야 하므로 OT-COVER 는 가산 없이(1.0배) 시간을 덮는지만 보고, NIGHT-WORK 는 가산 항목을 요구하지 않는다.
import { describe, expect, it } from 'vitest';

import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract } from '@/lib/contract-check/types';

function contract(fivePlus: boolean | null, otHours: number): Contract {
  return {
    contract_id: 'syn-under5',
    workplace: { name: '합성테스트 사업장', employee_count_5plus: fivePlus } as Contract['workplace'],
    employee: { name: '합성01', hire_date: '2026-03-01' },
    period: { start_date: '2026-03-01', indefinite: true },
    work_time: { days_per_week: 5, start: '10:00', end: '22:30', breaks: [{ minutes: 150 }], night_work: true },
    wage: {
      monthly_total: 3_200_000,
      inclusive_wage: false,
      pay_type: 'monthly',
      items: [
        { code: 'BASE', amount: 2_649_237, basis_hours: 209 },
        { code: 'OT_WEEKDAY', amount: 550_763, basis_hours: otHours, rate_multiplier: 1 },
      ],
    },
    holidays_leave: { weekly_rest: '매주 일요일', weekly_rest_day_specified: true },
    signatures: { written_date: '2026-03-01' },
  };
}

const find = (c: Contract, code: string) => checkContract(normalize([c])[0]).find((f) => f.rule_code === code);

describe('상시 5명 미만 — 가산 미적용', () => {
  it('OT-COVER: 연장 실시간(주 10H × 4.345 = 43.45H)을 가산 없이 덮으면 통과', () => {
    expect(find(contract(false, 43.45), 'OT-COVER')?.status).toBe('ok');
  });

  it('OT-COVER: 5명 미만이어도 연장시간 자체가 모자라면 위반', () => {
    expect(find(contract(false, 30), 'OT-COVER')?.status).toBe('violation');
  });

  it('OT-COVER: 5명 이상이면 같은 시간이 1.5배를 못 덮어 위반(기존 그대로)', () => {
    expect(find(contract(true, 43.45), 'OT-COVER')?.status).toBe('violation');
  });

  it('NIGHT-WORK: 5명 미만은 야간 가산 항목이 없어도 통과, 5명 이상은 위험', () => {
    expect(find(contract(false, 43.45), 'NIGHT-WORK')?.status).toBe('ok');
    expect(find(contract(true, 43.45), 'NIGHT-WORK')?.status).toBe('risk');
  });
});

// PR #140 검토 4 — 월~토 09:00~19:00 휴게 60분 = 주 54시간. 제50조·제53조는 상시 5명 미만에 적용되지 않는다(시행령 제7조 별표 1)
describe('상시 5명 미만 — 주 52시간 상한 미적용', () => {
  const week54 = (fivePlus: boolean | null, isMinor = false): Contract => ({
    contract_id: 'syn-under5-52',
    workplace: { name: '합성테스트 사업장', employee_count_5plus: fivePlus } as Contract['workplace'],
    employee: { name: '합성01', hire_date: '2026-03-01', is_minor: isMinor },
    period: { start_date: '2026-03-01', indefinite: true },
    work_time: { days_per_week: 6, start: '09:00', end: '19:00', breaks: [{ minutes: 60 }], night_work: false },
    wage: { monthly_total: 4_000_000, inclusive_wage: false, pay_type: 'monthly', items: [{ code: 'BASE', amount: 4_000_000, basis_hours: 209 }] },
    holidays_leave: { weekly_rest: '매주 일요일', weekly_rest_day_specified: true },
    signatures: { written_date: '2026-03-01' },
  });

  it('5명 미만 성인은 주 54시간이어도 WH-52CAP 적정(미적용)', () => {
    const f = find(week54(false), 'WH-52CAP')!;
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('5명 미만');
  });

  it('5명 이상·규모 미기재는 기존대로 위반', () => {
    expect(find(week54(true), 'WH-52CAP')?.status).toBe('violation');
    expect(find(week54(null), 'WH-52CAP')?.status).toBe('violation');
  });

  it('연소자는 5명 미만이어도 그대로 보고(제69조는 5명 미만에도 적용), 연소자 규칙도 남는다', () => {
    expect(find(week54(false, true), 'WH-52CAP')?.status).toBe('violation');
    expect(find(week54(false, true), 'MINOR-WORKER')?.status).toBe('risk');
  });
});
