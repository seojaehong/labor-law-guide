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

  it('하루 8시간 이하 근무는 그대로(주5일 09:00~18:00 휴게 60분 → 40H)', () => {
    const [c] = normalize([contract({ days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] }, [{ code: 'BASE', amount: 2_156_880 }], 2_156_880)]);
    expect(c.work_time.weekly_scheduled_hours).toBe(40);
  });
});
