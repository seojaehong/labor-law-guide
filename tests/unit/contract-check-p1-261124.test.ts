// 261124 사이트 도구 전수 검수 P1 — 근로계약서 점검·작성의 틀린 판정.
// ① 수습 감액 후 임금을 최저임금과 비교하지 않음(70% 감액을 「요건 충족」) — 최저임금법 §5②·시행령 §3: 1년 이상 계약·수습 시작일부터
//    3개월 이내·단순노무 아님이면 시간급 최저임금의 90%, 그 밖은 100%.
// ② 반대로 최저임금 이상인 감액을 위반으로 보고 근로계약서 작성이 막던 것.
// ③ 최저임금을 계약 시작 연도만 비교(2025 시작 시급 10,030원 → 2026년 10,320원 미달인데 적정).
// ④ 필수 명시사항 — 상시 4명 이하 연차(시행령 §7 별표1), 주 15시간 미만 주휴·연차(근기법 §18③)를 누락으로 보던 것.
// ⑤ 근로계약서 작성 MCP 가 다음 해 최저임금 미달(minimumWageLater)을 싣지 않아 「손볼 항목 없음」을 내던 것.
// 값은 모두 합성값이다. 오늘은 2026-11-24 로 고정한다(최저임금 비교 연도가 오늘에 걸린다).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import minwageJson from '@/lib/contract-check/data/minwage_table.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { designFromForm, reviewWritten, toContract, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument, documentLines } from '@/lib/contract-write/document';
import { registerContract, reviewSummary } from '../../tools/k-labor/groups/contract.mjs';

const MIN = minwageJson as Record<string, number>;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T03:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

interface Over {
  amount?: number;
  start?: string;
  end?: string | null;
  probation?: Record<string, unknown>;
  workplace?: Record<string, unknown>;
  employment_type?: string;
  work?: Record<string, unknown>;
  holidays?: Record<string, unknown>;
  items?: WageItem[];
}

const base = (amount: number): WageItem =>
  ({ code: 'BASE', label: '기본급', amount, basis_hours: 209, rate_multiplier: 1, basis_text: '통상시급 × 209시간(주휴 포함)', includes_weekly_holiday: true }) as WageItem;

function contract(o: Over = {}): Contract {
  return {
    contract_id: 'P1-261124',
    workplace: { name: '합성테스트 사업장', employee_count_5plus: true, ...o.workplace },
    employee: { name: '합성01', hire_date: o.start ?? '2026-12-01', is_minor: false, employment_type: o.employment_type ?? 'regular' },
    period: {
      start_date: o.start ?? '2026-12-01',
      end_date: o.end ?? null,
      indefinite: !o.end,
      probation: { applied: false, months: null, wage_rate_pct: null, simple_labor_job: null, ...o.probation },
    },
    job: { location: '합성 본점', duty: '사무 보조' },
    work_time: { days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }], daily_schedules: [], night_work: false, ...o.work },
    wage: { monthly_total: null, pay_type: 'monthly', payment_method: '계좌이체', payday: '매월 10일', items: o.items ?? [base(o.amount ?? 3_000_000)] },
    holidays_leave: { weekly_rest: '일요일', weekly_rest_day_specified: true, annual_leave_clause: '근로기준법에 따라 부여', ...o.holidays },
    signatures: { written_date: '2026-11-20', employer_signed: true, employee_signed: true, copy_delivered_confirmed: true },
  } as unknown as Contract;
}

const find = (c: Contract, code: string): Finding => {
  const [n] = normalize([c]);
  return checkContract(n).find((f) => f.rule_code === code) as Finding;
};

const prob = (pct: number, extra: Record<string, unknown> = {}) => ({ applied: true, months: 3, wage_rate_pct: pct, simple_labor_job: false, ...extra });

describe('① 수습 감액 — 1년 이상 계약은 최저시급의 90% 와 비교', () => {
  it('무기계약 월 2,156,880원/209H 70% 감액 → 위반(감액 후 시간당 7,224원 < 9,288원)', () => {
    const f = find(contract({ amount: 2_156_880, probation: prob(70) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('9,288');
    expect(f.detail).toContain('7,224');
  });

  it('90% 기준 경계 — 월 2,156,880원 90% 는 적정, 1원 낮으면 위반', () => {
    expect(MIN['2026'] * 0.9).toBe(9_288);
    expect(find(contract({ amount: 2_156_880, start: '2026-03-02', probation: prob(90) }), 'MINWAGE-PROBATION').status).toBe('ok');
    expect(find(contract({ amount: 2_156_879, start: '2026-03-02', probation: prob(90) }), 'MINWAGE-PROBATION').status).toBe('violation');
  });

  it('감액 기간이 다음 해로 넘어가면 그 해 기준으로도 본다(2026-12 시작 → 2027년 90% = 9,630원)', () => {
    const f = find(contract({ amount: 2_156_880, start: '2026-12-01', probation: prob(90) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('2027년');
    expect(find(contract({ amount: 2_236_300, start: '2026-12-01', probation: prob(90) }), 'MINWAGE-PROBATION').status).toBe('ok');
  });

  it('임금이 없으면 감액 후 임금을 비교하지 못해 확인 필요', () => {
    const f = find(contract({ items: [], probation: prob(90) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('needs_data');
  });
});

describe('② 특례가 없는 감액 — 최저시급 100% 이상이면 적정, 미만이면 위반', () => {
  const sixMonths = { start: '2026-03-02', end: '2026-09-01', employment_type: 'fixed_term' };

  it('6개월 기간제 월 300만 원 90% → 270만 원 ≥ 월 최저 2,156,880원 → 적정', () => {
    const f = find(contract({ ...sixMonths, amount: 3_000_000, probation: prob(90) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('1년 미만');
  });

  it('6개월 기간제 100% 기준 경계 — 90% 가 2,156,880원 이상이면 적정, 아래면 위반', () => {
    // 2,396,534 × 0.9 = 2,156,880.6 / 2,396,533 × 0.9 = 2,156,879.7
    expect(find(contract({ ...sixMonths, amount: 2_396_534, probation: prob(90) }), 'MINWAGE-PROBATION').status).toBe('ok');
    const f = find(contract({ ...sixMonths, amount: 2_396_533, probation: prob(90) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('1년 미만');
  });

  it('단순노무 — 300만 원 90% 는 적정, 230만 원 90% 는 위반', () => {
    expect(find(contract({ start: '2026-03-02', amount: 3_000_000, probation: prob(90, { simple_labor_job: true }) }), 'MINWAGE-PROBATION').status).toBe('ok');
    const f = find(contract({ start: '2026-03-02', amount: 2_300_000, probation: prob(90, { simple_labor_job: true }) }), 'MINWAGE-PROBATION');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('단순노무');
  });

  it('감액 4개월 — 3개월 넘는 감액은 100% 기준(300만 원 적정, 230만 원 위반)', () => {
    expect(find(contract({ start: '2026-03-02', amount: 3_000_000, probation: prob(90, { months: 4 }) }), 'MINWAGE-PROBATION').status).toBe('ok');
    expect(find(contract({ start: '2026-03-02', amount: 2_300_000, probation: prob(90, { months: 4 }) }), 'MINWAGE-PROBATION').status).toBe('violation');
  });
});

describe('② 근로계약서 작성 — 감액 후 최저시급 미만일 때만 막는다', () => {
  const FORM: WriteForm = {
    workplaceName: '합성테스트 사업장',
    employeeCount5plus: true,
    employeeName: '합성01',
    startDate: '2026-03-02',
    endDate: '2026-09-01',
    location: '합성 본점',
    duty: '사무 보조',
    workDays: ['월', '화', '수', '목', '금'],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    weeklyRestDay: '일',
    writtenDate: '2026-02-26',
    monthlyTotal: 3_000_000,
    holidayDaysPerYear: 0,
    overrides: { leaveHours: 0 },
    probation: { months: 3, reduced: true, simpleLabor: false },
    payday: '매월 10일',
    paymentMethod: '근로자 명의 계좌이체',
  };

  it('6개월 기간제 월 300만 원 90% 는 막지 않고, 수습 규칙도 손볼 것에 없다', () => {
    const design = designFromForm(FORM);
    const review = reviewWritten(FORM, design);
    expect(review.problems.find((f) => f.rule_code === 'MINWAGE-PROBATION')).toBeUndefined();
    const text = documentLines(buildContractDocument(FORM, design)).join('\n');
    expect(text).toContain('시간급 최저임금 이상이 되게 한다(최저임금법 제6조 제1항)');
    expect(text).not.toContain('시간급 최저임금의 100분의 90');
  });

  it('6개월 기간제 월 220만 원 90% 는 최저시급 미만이라 막는다', () => {
    expect(() => designFromForm({ ...FORM, monthlyTotal: 2_200_000 })).toThrow(/최저시급보다 낮아집니다/);
  });

  it('단순노무 300만 원 90% 는 막지 않고, 220만 원은 막는다', () => {
    const simple = { ...FORM, endDate: null, probation: { months: 3, reduced: true, simpleLabor: true } };
    expect(() => designFromForm(simple)).not.toThrow();
    expect(() => designFromForm({ ...simple, monthlyTotal: 2_200_000 })).toThrow(/단순노무/);
  });

  it('1년 이상 계약은 종전 특례 문구(100분의 90)를 적는다', () => {
    const year = { ...FORM, endDate: null };
    const text = documentLines(buildContractDocument(year, designFromForm(year))).join('\n');
    expect(text).toContain('시간급 최저임금의 100분의 90');
  });
});

describe('③ 최저임금 — 시작 연도부터 오늘(또는 종료일)까지 해마다 비교', () => {
  const m2025 = MIN['2025'] * 209; // 2,096,270

  it('2025-01-02 시작 무기계약 월 2,096,270원(시급 10,030원) → 2026년 10,320원 미달로 위반, 그 해를 밝힌다', () => {
    const f = find(contract({ start: '2025-01-02', amount: m2025 }), 'MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('2026년');
  });

  it('시급제 10,030원도 같다', () => {
    const items = [{ code: 'BASE', label: '시급', amount: 10_030, basis_text: '시급' } as WageItem];
    const c = contract({ start: '2025-01-02', items });
    (c.wage as { pay_type: string }).pay_type = 'hourly';
    const f = find(c, 'MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('2026년');
  });

  it('2025년 안에 끝난 계약은 2025년만 본다 → 적정', () => {
    expect(find(contract({ start: '2025-01-02', end: '2025-12-31', amount: m2025, employment_type: 'fixed_term' }), 'MINWAGE').status).toBe('ok');
  });

  it('2026년 최저도 넘으면 적정이고 이어진 해를 밝힌다', () => {
    const f = find(contract({ start: '2025-01-02', amount: MIN['2026'] * 209 }), 'MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('2025~2026');
  });

  it('표에 없는 해(2023) — 이어진 해가 모두 충족이면 확인 필요, 개발용 문구를 보이지 않는다', () => {
    const f = find(contract({ start: '2023-03-01', amount: MIN['2026'] * 209 }), 'MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('2023년');
    expect(f.detail).not.toContain('minwage_table');
  });

  it('표에 없는 해가 있어도 미달인 해가 있으면 위반', () => {
    expect(find(contract({ start: '2023-03-01', amount: m2025 }), 'MINWAGE').status).toBe('violation');
  });

  it('시작일이 오늘보다 뒤면 시작 연도만 본다(2026-12-01 시작 월 2,156,880원 → 적정)', () => {
    expect(find(contract({ start: '2026-12-01', amount: MIN['2026'] * 209 }), 'MINWAGE').status).toBe('ok');
  });

  it('오늘이 2027-02-01 이면 같은 계약은 2027년 미달로 위반', () => {
    vi.setSystemTime(new Date('2027-02-01T03:00:00Z'));
    try {
      const f = find(contract({ start: '2026-12-01', amount: MIN['2026'] * 209 }), 'MINWAGE');
      expect(f.status).toBe('violation');
      expect(f.detail).toContain('2027년');
    } finally {
      vi.setSystemTime(new Date('2026-11-24T03:00:00Z'));
    }
  });
});

describe('④ 필수 명시사항 — 적용되지 않는 연차·주휴는 누락으로 보지 않는다', () => {
  const noLeave = { holidays: { annual_leave_clause: null } };

  it('상시 4명 이하 — 연차 없어도 적정, 5명 이상·미상은 누락 위반', () => {
    const under5 = find(contract({ ...noLeave, workplace: { employee_count_5plus: false } }), 'REQUIRED-TERMS');
    expect(under5.status).toBe('ok');
    expect(under5.detail).toContain('연차 해당 없음');
    expect(find(contract({ ...noLeave }), 'REQUIRED-TERMS').status).toBe('violation');
    expect(find(contract({ ...noLeave, workplace: { employee_count_5plus: null } }), 'REQUIRED-TERMS').status).toBe('violation');
  });

  it('상시 4명 이하라도 주휴일이 없으면 누락 위반(§55①은 적용)', () => {
    const f = find(contract({ holidays: { weekly_rest: null, annual_leave_clause: null }, workplace: { employee_count_5plus: false } }), 'REQUIRED-TERMS');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('주휴일');
    expect(f.detail).not.toContain('연차');
  });

  const part = (hoursPerDay: number) => {
    const end = `${String(9 + hoursPerDay).padStart(2, '0')}:00`;
    return contract({
      employment_type: 'part_time',
      amount: 1_000_000,
      work: {
        days_per_week: 3,
        start: '09:00',
        end,
        breaks: [{ minutes: 0 }],
        daily_schedules: ['월', '수', '금'].map((day) => ({ day, start: '09:00', end })),
      },
      holidays: { weekly_rest: null, weekly_rest_day_specified: null, annual_leave_clause: null },
    });
  };

  it('주 9시간(15시간 미만) 단시간 — 주휴·연차 없어도 REQUIRED-TERMS·REQUIRED-TERMS-FIXED 적정', () => {
    const c = part(3);
    expect(find(c, 'REQUIRED-TERMS').status).toBe('ok');
    expect(find(c, 'REQUIRED-TERMS').detail).toContain('15시간 미만');
    expect(find(c, 'REQUIRED-TERMS-FIXED').status).toBe('ok');
  });

  it('주 15시간 단시간 — 주휴·연차 없으면 누락 위반', () => {
    const c = part(5);
    expect(find(c, 'REQUIRED-TERMS').status).toBe('violation');
    expect(find(c, 'REQUIRED-TERMS-FIXED').detail).toContain('휴일·휴가');
  });
});

describe('⑤ 근로계약서 작성 MCP — 다음 해 최저임금 미달을 싣고 요약을 바꾼다', () => {
  const args = {
    workDays: ['월', '화', '수', '목', '금'],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    startDate: '2026-12-01',
    writtenDate: '2026-11-24',
    monthlyTotal: 2_250_000,
  };

  function tools() {
    const handlers: Record<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>> = {};
    registerContract({ registerTool: (name: string, _def: unknown, h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>) => { handlers[name] = h; } });
    return handlers;
  }

  it('2026-12-01 시작 무기 월 225만 원 → 2027년 최저시급(10,700원) 미달을 minimumWageLater 로 싣고 「손볼 항목 없음」이라 하지 않는다', async () => {
    expect(MIN['2027'] * 209).toBe(2_236_300);
    const r = await tools().design_contract_wage(args);
    const out = JSON.parse(r.content[0].text);
    expect(out.ok).toBe(true);
    expect(out.minimumWageLater).toEqual([expect.objectContaining({ warn: true, text: expect.stringContaining('2027년') })]);
    expect(out.review.summary).not.toBe('손볼 항목이 없습니다.');
    expect(out.review.summary).toContain('최저임금 확인');
  });

  it('2027년 최저도 넘는 계약은 minimumWageLater 가 없고 「손볼 항목이 없습니다」', async () => {
    const r = await tools().design_contract_wage({ ...args, monthlyTotal: 2_600_000 });
    const out = JSON.parse(r.content[0].text);
    expect(out.minimumWageLater).toBeUndefined();
    expect(out.review.summary).toBe('손볼 항목이 없습니다.');
  });

  it('reviewSummary — 손볼 항목·경고 조합', () => {
    const ok = { text: '', warn: false };
    const warn = { text: '', warn: true };
    expect(reviewSummary({ problems: [], minimumWage: ok, minimumWageLater: [] })).toBe('손볼 항목이 없습니다.');
    expect(reviewSummary({ problems: [], minimumWage: ok, minimumWageLater: [warn] })).toContain('최저임금 확인이 1건');
    expect(reviewSummary({ problems: [{}], minimumWage: warn, minimumWageLater: [] })).toBe('손볼 항목 1개 · 최저임금 확인 1건(minimumWage·minimumWageLater)');
  });

  it('웹 되먹임(reviewWritten)도 같은 경고를 낸다', () => {
    const form: WriteForm = {
      workplaceName: '합성', employeeCount5plus: true, employeeName: '합성01', startDate: '2026-12-01', endDate: null,
      location: '합성', duty: '사무', workDays: ['월', '화', '수', '목', '금'], start: '09:00', end: '18:00', breakMinutes: 60,
      weeklyRestDay: '일', writtenDate: '2026-11-24', monthlyTotal: 2_250_000, holidayDaysPerYear: 0, payday: '매월 10일', paymentMethod: '계좌이체',
    };
    const review = reviewWritten(form, designFromForm(form));
    expect(review.minimumWageLater.some((l) => l.warn && l.text.includes('2027년'))).toBe(true);
    expect(toContract(form, designFromForm(form)).period.start_date).toBe('2026-12-01');
  });
});
