// 1일 소정근로시간 상한 8시간(근로기준법 §50②, 재홍님 261103).
// 주4일·하루 9.42시간처럼 주 40시간 아래지만 하루 8시간을 넘는 근무는, 넘는 시간이 연장이라 소정은 8시간 × 근로일이다.
import { describe, expect, it } from 'vitest';

import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract } from '@/lib/contract-check/types';

function contract(workTime: Contract['work_time'], items: NonNullable<Contract['wage']['items']>, monthly: number): Contract {
  return {
    contract_id: 'syn-8h',
    workplace: { name: '합성테스트 사업장', employee_count_5plus: true } as Contract['workplace'],
    employee: { name: '합성01', hire_date: '2026-03-01' },
    period: { start_date: '2026-03-01', indefinite: true },
    work_time: workTime,
    wage: { monthly_total: monthly, inclusive_wage: false, pay_type: 'monthly', items },
    holidays_leave: { weekly_rest: '매주 일요일', weekly_rest_day_specified: true },
    signatures: { written_date: '2026-03-01' },
  };
}

const FOUR_DAYS = { days_per_week: 4, start: '10:00', end: '22:00', breaks: [{ minutes: 155 }] };

describe('1일 소정 8시간 상한', () => {
  it('주4일 10:00~22:00 휴게 155분 → 실근로 37.67H, 소정 32H', () => {
    const [c] = normalize([contract(FOUR_DAYS, [{ code: 'BASE', amount: 1_870_364 }], 1_870_364)]);
    expect(c.work_time.weekly_actual_hours).toBeCloseTo(37.67, 2);
    expect(c.work_time.weekly_scheduled_hours).toBe(32);
  });

  it('같은 근무에 기본급 1,870,364 는 최저임금 위반이 아니다(166.85H 기준 11,210)', () => {
    const [c] = normalize([contract(FOUR_DAYS, [{ code: 'BASE', amount: 1_870_364 }], 1_870_364)]);
    const minwage = checkContract(c).find((f) => f.rule_code === 'MINWAGE');
    expect(minwage?.status).toBe('ok');
  });

  it('경계: 기본급을 최저 아래(166.85H × 10,319)로 낮추면 위반', () => {
    const [c] = normalize([contract(FOUR_DAYS, [{ code: 'BASE', amount: 1_721_000 }], 1_721_000)]);
    expect(checkContract(c).find((f) => f.rule_code === 'MINWAGE')?.status).toBe('violation');
  });

  it('근로일별 행도 하루 8시간까지만 소정으로 센다', () => {
    const rows = ['월', '화', '수', '목'].map((day) => ({ day, start: '10:00', end: '22:00' }));
    const [c] = normalize([contract({ ...FOUR_DAYS, daily_schedules: rows }, [{ code: 'BASE', amount: 1_870_364 }], 1_870_364)]);
    expect(c.work_time.weekly_scheduled_source).toBe('daily');
    expect(c.work_time.weekly_scheduled_hours).toBe(32);
  });

  it('주간 연장 = 하루 8시간 넘는 시간 포함(주4일 9.42H → 5.67H, 주5일 10H → 10H, 주6일 8H → 8H)', () => {
    const ot = (wt: Contract['work_time']) => normalize([contract(wt, [{ code: 'BASE', amount: 2_000_000 }], 2_000_000)])[0].work_time.weekly_overtime_hours;
    expect(ot(FOUR_DAYS)).toBeCloseTo(5.67, 2);
    expect(ot({ days_per_week: 5, start: '09:00', end: '20:00', breaks: [{ minutes: 60 }] })).toBe(10);
    expect(ot({ days_per_week: 6, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] })).toBe(8);
    expect(ot({ days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] })).toBe(0);
  });

  it('OT-COVER 는 가산율이 적혀 있으면 시간 × 가산율로 본다(43.47H × 1.5 = 65.2H ≥ 필요 65.2H)', () => {
    const wt = { days_per_week: 5, start: '09:00', end: '20:00', breaks: [{ minutes: 60 }] };
    const items = [
      { code: 'BASE' as const, amount: 2_163_001, basis_hours: 209 },
      { code: 'OT_WEEKDAY' as const, amount: 674_774, basis_hours: 43.4667, rate_multiplier: 1.5 },
    ];
    const [c] = normalize([contract(wt, items, 2_837_775)]);
    expect(checkContract(c).find((f) => f.rule_code === 'OT-COVER')?.status).toBe('ok');
    const [short] = normalize([contract(wt, [items[0], { ...items[1], basis_hours: 40 }], 2_837_775)]);
    expect(checkContract(short).find((f) => f.rule_code === 'OT-COVER')?.status).toBe('violation');
  });

  it('통상시급을 소수까지 적었고 기본급 ÷ 시간과 원 단위로 같으면 그 값을 쓴다(수원 10,349.29)', () => {
    const wt = { days_per_week: 5, start: '09:00', end: '20:00', breaks: [{ minutes: 60 }] };
    const c0 = contract(wt, [{ code: 'BASE', amount: 2_163_001, basis_hours: 209 }], 2_163_001);
    c0.wage.ordinary_hourly_rate = 10_349.29;
    expect(normalize([c0])[0].wage.ordinary_hourly_rate).toBe(10_349.29);
    const c1 = contract(wt, [{ code: 'BASE', amount: 2_163_001, basis_hours: 209 }], 2_163_001);
    c1.wage.ordinary_hourly_rate = 11_000;
    expect(normalize([c1])[0].wage.ordinary_hourly_rate).toBe(10_349);
  });

  it('하루 8시간 이하 근무는 그대로(주5일 09:00~18:00 휴게 60분 → 40H)', () => {
    const [c] = normalize([contract({ days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] }, [{ code: 'BASE', amount: 2_156_880 }], 2_156_880)]);
    expect(c.work_time.weekly_scheduled_hours).toBe(40);
  });
});
