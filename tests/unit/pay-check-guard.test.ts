// 월급 대조 — 엔진 결과 위에 얹는 범위·최저임금 확인(guarded-check). 전부 합성 값이다.
// 261124 도구 검수(오푸스·페이블·아스트라): 최저임금보다 낮은 시급, 재직일보다 많은 인정일수, 1일 8시간·주 40시간을 넘는 약정시간이
// 「대조 일치」·「어긋남」으로 나왔다. 엔진 사본(src/lib/pay-check)은 원본과 같아야 해서 손대지 않고 화면·MCP 공용 감싸개에서 멈춘다.
import { describe, expect, it } from 'vitest';
import { check } from '@/lib/pay-check/check';
import type { CheckInput, Confirmed } from '@/lib/pay-check/types';
import { checkGuarded } from '@/app/tools/pay-check/guarded-check';
import { buildInput, FACT_FIELDS } from '@/app/tools/pay-check/build-input';
import * as monthlyPay from '../../tools/k-labor/groups/more/check_monthly_pay.mjs';

const APR = { pay_period_start: '2026-04-01', pay_period_end: '2026-04-30' };
const DOC = { calculation_basis_documented: true };
const join = (policy: CheckInput['policy_id'], c: Confirmed): CheckInput => ({ scenario: 'MID_JOIN', policy_id: policy, confirmed: { ...APR, ...DOC, ...c } });
const hw = (c: Confirmed): CheckInput => ({
  scenario: 'HOURLY_WEEKLY_HOLIDAY',
  policy_id: 'WEEKLY_HOLIDAY_FIXED',
  confirmed: {
    averaging_weeks: 4, full_time_scheduled_days_4w: 20, holiday_weeks: 4,
    employment_continued_for_7_days: true, weekly_holiday_designated: true, all_scheduled_days_attended: true, ...DOC, ...c,
  },
});

describe('1. 최저임금 시간급과 비교 (최저임금법 제6조제1항 · rates.ts minWageHourly)', () => {
  it('시급 6,250원 × 160시간, 명세서 1,000,000원 — 엔진은 일치, 감싸개는 확인 필요로 멈추고 금액을 내지 않는다', () => {
    const input = join('HOUR_ACTUAL', { employment_start: '2026-04-02', hourly_rate: 6250, paid_hours: 160, payslip_amount: 1_000_000 });
    expect(check(input).status).toBe('MATCH');
    const r = checkGuarded(input);
    expect([r.status, r.expected_amount, r.difference]).toEqual(['NEEDS_CONFIRMATION', null, null]);
    expect(r.reasons).toContain('MIN_WAGE_BELOW');
    expect(r.observation).toContain('10,320원');
    expect(r.citations).toContain('최저임금법 제6조제1항');
  });

  it('최저시급과 같은 10,320원은 일치 그대로', () => {
    const r = checkGuarded(join('HOUR_ACTUAL', { employment_start: '2026-04-02', hourly_rate: 10320, paid_hours: 100, payslip_amount: 1_032_000 }));
    expect([r.status, r.expected_amount, r.reasons]).toEqual(['MATCH', 1_032_000, ['COMPARED_EQUAL']]);
  });

  it('결근 공제 시급도 비교한다 — 급여기간이 있으면 낮을 때 멈추고, 없으면 「비교하지 못함」을 남긴다', () => {
    const ab = (c: Confirmed): CheckInput => ({
      scenario: 'ABSENCE_DEDUCTION', policy_id: 'ABSENCE_HOUR',
      confirmed: { unpaid_absence_hours: 8, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, ...DOC, ...c },
    });
    expect(checkGuarded(ab({ ...APR, hourly_rate: 9000, payslip_absence_deduction: 72_000 })).reasons).toContain('MIN_WAGE_BELOW');
    expect(checkGuarded(ab({ ...APR, hourly_rate: 11000, payslip_absence_deduction: 88_000 })).status).toBe('MATCH');
    const noDate = checkGuarded(ab({ hourly_rate: 11000, payslip_absence_deduction: 88_000 }));
    expect([noDate.status, noDate.expected_amount]).toEqual(['MATCH', 88_000]);
    expect(noDate.reasons).toContain('MIN_WAGE_NOT_COMPARED');
    expect(noDate.open_confirmations.some((t) => t.includes('최저임금'))).toBe(true);
  });

  it('기준일의 최저시급이 표에 없으면 다른 해 값으로 비교하지 않고 「비교하지 못함」', () => {
    const r = checkGuarded({
      scenario: 'MID_JOIN', policy_id: 'HOUR_ACTUAL',
      confirmed: { pay_period_start: '2025-04-01', pay_period_end: '2025-04-30', ...DOC, employment_start: '2025-04-02', hourly_rate: 6250, paid_hours: 160, payslip_amount: 1_000_000 },
    });
    expect([r.status, r.reasons]).toEqual(['MATCH', ['COMPARED_EQUAL', 'MIN_WAGE_NOT_COMPARED']]);
  });

  it('30일 기준(월급)은 시간급을 알 수 없어 비교하지 않는다', () => {
    const r = checkGuarded(join('DAY_30', { employment_start: '2026-04-16', monthly_base_pay: 1_500_000, eligible_days: 15, payslip_amount: 750_000 }));
    expect([r.status, r.reasons]).toEqual(['MATCH', ['COMPARED_EQUAL']]);
  });
});

describe('2. 인정일수·시간 범위 (재직 달력일수)', () => {
  it('입사 4/15 · 인정일수 45 → 엔진은 4,500,000원 어긋남, 감싸개는 재직 16일보다 많고 월 기본급을 넘어 멈춘다', () => {
    const input = join('DAY_30', { employment_start: '2026-04-15', monthly_base_pay: 3_000_000, eligible_days: 45, payslip_amount: 1_600_000 });
    expect([check(input).status, check(input).expected_amount]).toEqual(['POTENTIAL_MISMATCH', 4_500_000]);
    const r = checkGuarded(input);
    expect([r.status, r.expected_amount]).toEqual(['NEEDS_CONFIRMATION', null]);
    expect(r.reasons).toEqual(['ELIGIBLE_DAYS_OVER_EMPLOYED_DAYS', 'EXPECTED_OVER_MONTHLY_BASE']);
    expect(r.observation).toContain('16일');
  });

  it('4/30 입사(1일 재직)에 30일분 → 엔진 일치, 감싸개는 멈춘다 · 1일분 100,000원은 일치', () => {
    const thirty = join('DAY_30', { employment_start: '2026-04-30', monthly_base_pay: 3_000_000, eligible_days: 30, payslip_amount: 3_000_000 });
    expect(check(thirty).status).toBe('MATCH');
    expect(checkGuarded(thirty).reasons).toEqual(['ELIGIBLE_DAYS_OVER_EMPLOYED_DAYS']);
    const one = checkGuarded(join('DAY_30', { employment_start: '2026-04-30', monthly_base_pay: 3_000_000, eligible_days: 1, payslip_amount: 100_000 }));
    expect([one.status, one.expected_amount]).toEqual(['MATCH', 100_000]);
  });

  it('경계: 인정일수 = 재직일수는 통과, +1 은 멈춤 (2월 입사 포함)', () => {
    const feb = { pay_period_start: '2026-02-01', pay_period_end: '2026-02-28', employment_start: '2026-02-15', monthly_base_pay: 3_000_000 };
    const at = checkGuarded({ scenario: 'MID_JOIN', policy_id: 'DAY_30', confirmed: { ...feb, ...DOC, eligible_days: 14, payslip_amount: 1_400_000 } });
    expect(at.status).toBe('MATCH');
    const over = checkGuarded({ scenario: 'MID_JOIN', policy_id: 'DAY_30', confirmed: { ...feb, ...DOC, eligible_days: 15, payslip_amount: 1_500_000 } });
    expect([over.status, over.reasons]).toEqual(['NEEDS_CONFIRMATION', ['ELIGIBLE_DAYS_OVER_EMPLOYED_DAYS']]);
  });

  it('중도퇴사: 급여기간 첫날부터 퇴사일까지 센다 (4/1~4/15 = 15일)', () => {
    const leave = (d: number): CheckInput => ({
      scenario: 'MID_LEAVE', policy_id: 'DAY_30',
      confirmed: { ...APR, ...DOC, employment_end: '2026-04-15', last_scheduled_workday: '2026-04-15', paid_holiday_treatment: 'paid', monthly_base_pay: 3_000_000, eligible_days: d, payslip_amount: d * 100_000 },
    });
    expect(checkGuarded(leave(15)).status).toBe('MATCH');
    expect(checkGuarded(leave(16)).reasons).toEqual(['ELIGIBLE_DAYS_OVER_EMPLOYED_DAYS']);
  });

  it('시간 기준: 유급시간이 음수이거나 재직일 × 24시간을 넘으면 멈춘다', () => {
    const h = (paid: number) => checkGuarded(join('HOUR_ACTUAL', { employment_start: '2026-04-30', hourly_rate: 11000, paid_hours: paid, payslip_amount: 11000 * paid }));
    expect(h(24).status).toBe('MATCH');
    expect(h(25).reasons).toEqual(['PAID_HOURS_OUT_OF_RANGE']);
    expect(h(-8).reasons).toEqual(['PAID_HOURS_OUT_OF_RANGE']);
  });

  it('인정일수 음수는 멈춘다', () => {
    expect(checkGuarded(join('DAY_30', { employment_start: '2026-04-15', monthly_base_pay: 3_000_000, eligible_days: -1, payslip_amount: -100_000 })).reasons)
      .toEqual(['ELIGIBLE_DAYS_OUT_OF_RANGE']);
  });
});

describe('3. 주휴 — 소정근로시간은 제50조 범위 (근로기준법 제2조제1항제8호)', () => {
  it('시급 9,000 · 4주 200시간 · 20일 · 4주분 · 명세서 288,000 → 엔진 어긋남 72,000, 감싸개는 1일 8시간·주 40시간 초과로 멈춘다', () => {
    const input = hw({ four_week_scheduled_hours: 200, hourly_rate: 9000, payslip_weekly_holiday_pay: 288_000 });
    const e = check(input);
    expect([e.status, e.expected_amount, e.difference]).toEqual(['POTENTIAL_MISMATCH', 360_000, 72_000]);
    const r = checkGuarded(input);
    expect([r.status, r.expected_amount]).toEqual(['NEEDS_CONFIRMATION', null]);
    expect(r.reasons).toEqual(['WEEKLY_HOURS_OVER_40', 'DAILY_HOURS_OVER_8', 'MIN_WAGE_NOT_COMPARED']);
    expect(r.citations).toEqual(expect.arrayContaining(['근로기준법 제2조제1항제8호', '근로기준법 제50조']));
  });

  it('같은 사례에 급여기간을 넣으면 최저시급보다 낮다는 이유도 함께 낸다', () => {
    const r = checkGuarded(hw({ ...APR, four_week_scheduled_hours: 200, hourly_rate: 9000, payslip_weekly_holiday_pay: 288_000 }));
    expect(r.reasons).toEqual(['WEEKLY_HOURS_OVER_40', 'DAILY_HOURS_OVER_8', 'MIN_WAGE_BELOW']);
  });

  it('경계: 4주 160시간 · 20일(주 40·1일 8) 은 통과', () => {
    const r = checkGuarded(hw({ ...APR, four_week_scheduled_hours: 160, hourly_rate: 11000, payslip_weekly_holiday_pay: 352_000 }));
    expect([r.status, r.expected_amount]).toEqual(['MATCH', 352_000]);
  });

  it('주 평균은 40 이하여도 1일(4주 시간 ÷ 통상 근로자 소정근로일)이 8시간을 넘으면 멈춘다', () => {
    const r = checkGuarded(hw({ ...APR, four_week_scheduled_hours: 160, full_time_scheduled_days_4w: 16, hourly_rate: 11000, payslip_weekly_holiday_pay: 440_000 }));
    expect(r.reasons).toEqual(['DAILY_HOURS_OVER_8']);
  });

  it('엔진이 이미 멈춘 결과(범위 밖·확인 필요)는 그대로 둔다', () => {
    const out = hw({ four_week_scheduled_hours: 40, hourly_rate: 5000, payslip_weekly_holiday_pay: 0 });
    expect(checkGuarded(out)).toEqual(check(out));
  });
});

describe('화면 입력: 결근 공제·주휴에도 급여기간 칸(최저시급 비교용)', () => {
  it('두 예외에 급여기간 칸이 있고 buildInput 이 넘긴다', () => {
    for (const s of ['ABSENCE_DEDUCTION', 'HOURLY_WEEKLY_HOLIDAY'] as const) {
      expect(FACT_FIELDS[s].map((f) => f.key)).toEqual(expect.arrayContaining(['pay_period_start', 'pay_period_end']));
    }
    const c = buildInput({ scenario: 'ABSENCE_DEDUCTION', values: { ...APR }, policy: 'ABSENCE_HOUR', rounding: 'UNKNOWN' }).confirmed;
    expect([c.pay_period_start, c.pay_period_end]).toEqual([APR.pay_period_start, APR.pay_period_end]);
  });
});

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function mcp(): Handler {
  let h: Handler | null = null;
  monthlyPay.register({ registerTool: (_n: string, _c: unknown, handler: Handler) => { h = handler; } });
  return h!;
}
const call = async (a: Record<string, unknown>) => JSON.parse((await mcp()(a)).content[0]!.text);

describe('4. check_monthly_pay — 확인되지 않은 전제를 구조화 필드로', () => {
  const base = { scenario: 'MID_JOIN', policy: 'HOUR_ACTUAL', ...APR, employment_start: '2026-04-16', hourly_rate: 11000, paid_hours: 80, payslip_amount: 880_000 };

  it('문서 미확인(false·생략) → status MATCH 여도 confirmed:false 와 warnings 에 BASIS_NOT_DOCUMENTED', async () => {
    for (const extra of [{ basisDocumented: false }, {}, { basisDocumented: null }]) {
      const o = await call({ ...base, ...extra });
      expect(o.result.status).toBe('MATCH');
      expect(o.confirmed).toBe(false);
      expect(o.warnings.map((w: { code: string }) => w.code)).toEqual(['BASIS_NOT_DOCUMENTED']);
    }
  });

  it('문서 확인 → confirmed:true · warnings 없음', async () => {
    const o = await call({ ...base, basisDocumented: true });
    expect([o.result.status, o.confirmed, o.warnings]).toEqual(['MATCH', true, []]);
  });

  it('MCP 도 같은 감싸개를 쓴다 — 시급 6,250원은 확인 필요, confirmed:false', async () => {
    const o = await call({ ...base, basisDocumented: true, hourly_rate: 6250, paid_hours: 160, payslip_amount: 1_000_000 });
    expect([o.result.status, o.confirmed, o.amounts]).toEqual(['NEEDS_CONFIRMATION', false, null]);
    expect(o.result.reasons).toContain('MIN_WAGE_BELOW');
  });

  it('smoke-more 기대값도 감싸개를 거친 도구에서 그대로 맞는다', async () => {
    const run = (await import('../../tools/k-labor/smoke-more/check_monthly_pay.mjs')).default;
    const failed: string[] = [];
    await run((_n: string, a: Record<string, unknown>) => call(a), (label: string, ok: boolean) => { if (!ok) failed.push(label); });
    expect(failed).toEqual([]);
  });

  it('결근 공제에 급여기간이 오면 무시 목록(ignoredFields)에 넣지 않는다', async () => {
    const o = await call({ scenario: 'ABSENCE_DEDUCTION', policy: 'ABSENCE_HOUR', basisDocumented: true, ...APR, unpaid_absence_hours: 8, hourly_rate: 11000, scheduled_workday_confirmed: true, paid_leave_or_holiday: false, payslip_absence_deduction: 88_000 });
    expect([o.result.status, o.confirmed, o.ignoredFields]).toEqual(['MATCH', true, undefined]);
  });
});
