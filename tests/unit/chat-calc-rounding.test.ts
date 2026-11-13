// 261113 — 챗봇 계산 도구(calc_ordinary_wage·calc_overtime)도 사이트 계산기와 같은 끝수 규칙을 따른다.
// 규칙 정본 = src/lib/calc/wage-rounding.ts — 시간급·1일 통상임금은 끝수 그대로, 원 미만은 마지막 지급액에서 한 번 올린다.
// 예전에는 통상시급을 원 단위로 버린 뒤(14,354원) 곱해 연장수당이 정확값보다 적게 나왔다.
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: null }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));
import { calcOrdinaryWage, calcOvertime } from '@/lib/labor-calc';
import { TOOLS as tools } from '@/lib/chat/tools/definitions';

it('통상임금 — 시간급·1일 통상임금을 버리지 않고 끝수 그대로 낸다(사이트 계산기와 같은 114,832.54원)', () => {
  const r = calcOrdinaryWage({ monthly_fixed_pay: 3_000_000 });
  expect(r.ordinary_hourly).toBeCloseTo(3_000_000 / 209, 9);
  expect(r.ordinary_daily).toBeCloseTo(114_832.5358, 3);
  expect(r.ordinary_hourly_text).toBe('14,354.07');
  expect(r.ordinary_daily_text).toBe('114,832.54');
});

it('연장·야간 — 월 고정급을 주면 곱셈 먼저 하고 원 미만을 올린다(정확값보다 적게 나오지 않는다)', () => {
  const r = calcOvertime({ monthly_fixed_pay: 3_000_000, overtime_hours: 10, night_hours: 4 });
  // 3,000,000 × 1.5 × 10 ÷ 209 = 215,311.004… → 215,312 (예전 버림 시급 14,354 × 15 = 215,310)
  expect(r.overtime_pay).toBe(215_312);
  // 3,000,000 × 0.5 × 4 ÷ 209 = 28,708.13… → 28,709
  expect(r.night_pay).toBe(28_709);
  expect(r.total).toBe(215_312 + 28_709);
});

it('연장 — calc_ordinary_wage 가 낸 끝수 있는 시급을 그대로 받아도 같은 금액이 나온다', () => {
  const h = calcOrdinaryWage({ monthly_fixed_pay: 3_000_000 }).ordinary_hourly;
  expect(calcOvertime({ ordinary_hourly: h, overtime_hours: 10 }).overtime_pay).toBe(215_312);
});

it('정수로 떨어지는 값은 1원을 더 붙이지 않는다(부동소수 잡음)', () => {
  // 10,000 × 1.5 × 3 = 45,000 정확
  expect(calcOvertime({ ordinary_hourly: 10_000, overtime_hours: 3 }).overtime_pay).toBe(45_000);
  // 2,090,000 ÷ 209 = 10,000 → × 2.0 × 1 = 20,000
  expect(calcOvertime({ monthly_fixed_pay: 2_090_000, holiday_hours_over_8: 1 }).holiday_pay_over_8).toBe(20_000);
});

it('시급도 월 고정급도 없으면 오류를 낸다', () => {
  expect(() => calcOvertime({ overtime_hours: 1 })).toThrow();
});

it('도구 정의 — 통상시급은 정수가 아니라 끝수 있는 수로 받고, 월 고정급으로도 받는다', () => {
  const def = tools.find((t) => t.function.name === 'calc_overtime')!;
  const props = def.function.parameters.properties as unknown as Record<string, { type: string }>;
  expect(props.ordinary_hourly.type).toBe('number');
  expect(props.monthly_fixed_pay.type).toBe('integer');
});
