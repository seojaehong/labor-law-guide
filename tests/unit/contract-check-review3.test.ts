// 근로계약서 점검 엔진 — 교차 검토 3차(fable·opus)가 엔진을 돌려 찾은 결함 13건의 회귀시험.
// 법리 A~E 는 b4fc9bd 커밋 메시지·contract-check-part-time-law.test.ts 머리말. 2·8·12 는 재홍님 승인안.
// 시험값은 전부 가상값이다. 분기가 갈리는 것은 양쪽을 다 넣는다.

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { sanitizeExtracted } from '@/lib/contract-check/extract-output';
import { computeWeeklyHours, monthlyStandardHours, normalize, weeklyHoliday } from '@/lib/contract-check/normalize';
import { includesWeeklyHoliday, payBasis } from '@/lib/contract-check/rules/wage';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { applyExtracted, keepFormOnlyFields } from '@/app/tools/contract-check/extractMap';
import { type FormState, INITIAL, buildContract } from '@/app/tools/contract-check/formState';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const raw = (id: string) => clone((casesJson as unknown as Contract[]).find((c) => c.contract_id === id)!);
const run = (c: Contract) => {
  const [n] = normalize(c);
  const findings = checkContract(n);
  return { n, findings, get: (code: string) => findings.find((f) => f.rule_code === code) as Finding };
};

/** 주 days 일 start~end(휴게 없음) 계약. 5인 이상·무기·야간 없음. */
function contract(days: number, start: string, end: string, items: WageItem[], extra: Partial<Contract['wage']> = {}) {
  const c = raw('syn-part-nosched-0002');
  c.contract_id = 'syn-review3';
  delete c.employee.employment_type;
  c.work_time = { days_per_week: days, start, end, breaks: [], daily_schedules: null, night_work: false };
  c.wage = { ...c.wage, monthly_total: null, inclusive_wage: false, ...extra, items };
  return c;
}
const base = (amount: number, basis_hours?: number, more: Partial<WageItem> = {}): WageItem => ({
  code: 'BASE',
  label: '기본급',
  amount,
  ...(basis_hours != null ? { basis_hours } : {}),
  ...more,
});
const textItem = (basis_text: string, label = '기본급'): WageItem => ({ code: 'BASE', label, amount: 1, basis_text });

describe('1 주휴 포함 문구 — 부정은 「포함」 바로 옆 토큰에 묶는다', () => {
  it.each([
    '시급 10,320(주휴수당 포함되지 않음)',
    '시급 10,320, 주휴수당 포함하지 않음',
    '주휴수당을 포함하지 아니함',
    '주휴수당 포함 안 됨',
    '시급 10,320(주휴 미포함)',
    '주휴수당 불포함',
    '주휴수당은 별도 지급',
  ])('%s → false', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(false);
  });
  it.each(['주휴 포함(연장 별도)', '시급 11,000(주휴수당, 식대 포함)', '시급 12,384(주휴수당 포함)'])('%s → true', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(true);
  });
  it('주휴일 일요일 식대 포함 — 주휴일은 주휴수당이 아니다', () => {
    expect(includesWeeklyHoliday(textItem('주휴일 일요일, 식대 포함'))).toBeNull();
    expect(includesWeeklyHoliday(textItem('주휴일 일요일 식대 포함'))).toBeNull();
  });
  it('부정·긍정이 둘 다 잡히면 null', () => {
    expect(includesWeeklyHoliday(textItem('주휴수당 별도', '주휴포함 시급'))).toBeNull();
  });
  it('주휴 문구 없음 → null', () => {
    expect(includesWeeklyHoliday(textItem('시급 10,320×월 87H'))).toBeNull();
  });
  it('0002 + 「주휴수당 포함되지 않음」 → B(1.2배) 위반이 아니라 A 확인 필요', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items![0].basis_text = '시급 10,320×월 87H(주휴수당 포함되지 않음)';
    expect(run(c).get('MINWAGE').status).toBe('risk');
  });
});

/** 사이트 폼 — 주 5일 09:00~13:30, 휴게 30분(소정 20H). */
const SITE: Partial<FormState> = {
  periodType: 'indefinite',
  fivePlus: 'yes',
  startDate: '2026-03-01',
  daysPerWeek: '5',
  workStart: '09:00',
  workEnd: '13:30',
  breakMinutes: '30',
  nightWork: 'no',
  payday: '익월 10일',
  paymentMethod: '계좌이체',
  weeklyRest: 'specified',
};
const site = (p: Partial<FormState>) => run(buildContract({ ...INITIAL, ...SITE, ...p } as FormState));

describe('2 폼·사진 경로가 A·B 에 닿는다(승인안)', () => {
  it('시급제 + 시급 10,320 × 월 87시간 → BASE amount·basis_hours·pay_type, A 확인 필요', () => {
    const c = buildContract({ ...INITIAL, ...SITE, payType: 'hourly', hourlyWage: '10320', basisHours: '87' } as FormState);
    expect(c.wage.pay_type).toBe('hourly');
    const b = c.wage.items!.find((i) => i.code === 'BASE')!;
    expect([b.amount, b.basis_hours]).toEqual([897840, 87]);
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.severity).toBe('minor');
  });
  it('시급제 + 시급만(시간 비움) → 시급 그대로 A, 통상시급도 시급', () => {
    const { n, get } = site({ payType: 'hourly', hourlyWage: '10320' });
    expect(get('MINWAGE').status).toBe('risk');
    expect(n.wage.ordinary_hourly_rate).toBe(10320);
  });
  it('시급에 주휴 포함 표시 → B: 20H 단시간 기준 12,384 — 12,000 위반·12,384 충족', () => {
    expect(site({ payType: 'hourly', hourlyWage: '12000', weeklyHolidayIncluded: 'yes' }).get('MINWAGE').status).toBe('violation');
    expect(site({ payType: 'hourly', hourlyWage: '12384', weeklyHolidayIncluded: 'yes' }).get('MINWAGE').status).toBe('ok');
  });
  it('주휴수당 금액 칸 → WEEKLY_HOLIDAY 항목, A 충족', () => {
    const { n, get } = site({ payType: 'hourly', hourlyWage: '10320', basisHours: '87', weeklyHolidayPay: '179361' });
    expect(n.wage.items!.some((i) => i.code === 'WEEKLY_HOLIDAY' && i.amount === 179361)).toBe(true);
    expect(get('MINWAGE').status).toBe('ok');
  });
  it('형태를 고르지 않음 + 산출시간 없음 + 주 40H 미만 → 위반 대신 「시급제·월급제 확인 필요」', () => {
    const f = site({ baseWage: '897840', monthlyTotal: '897840' }).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급제·월급제 확인 필요');
  });
  it('월급제를 고르면 월급제(C)로 위반', () => {
    const f = site({ payType: 'monthly', baseWage: '897840', monthlyTotal: '897840' }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('104H');
  });
  it('형태 미상이어도 주 40H 이면 월급제(209H)로 위반', () => {
    const f = run(contract(5, '09:00', '17:00', [base(2000000)])).get('MINWAGE');
    expect(f.status).toBe('violation');
  });
  it('형태 미상 단시간이라도 월급제로 충족이면 적정 그대로', () => {
    expect(run(contract(5, '09:00', '13:00', [base(1100000)])).get('MINWAGE').status).toBe('ok');
  });

  it('추출: pay_type hourly + BASE 시급×시간 → 시급제·시급·월 산출시간', () => {
    const r = applyExtracted({
      contract: { wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 897840, basis_hours: 87 }] } },
    });
    expect([r.form.payType, r.form.hourlyWage, r.form.basisHours]).toEqual(['hourly', '10320', '87']);
    expect(r.filled.has('payType')).toBe(true);
  });
  it('추출: pay_type 없음 + BASE 209H → 형태 비움, 기본급·산출시간 살림(엔진이 산출근거로 추론)', () => {
    const r = applyExtracted({
      contract: { wage: { items: [{ code: 'BASE', amount: 2156880, basis_hours: 209 }] } },
    });
    expect([r.form.payType, r.form.baseWage, r.form.basisHours]).toEqual(['', '2156880', '209']);
  });
  // 261102 R2: 주휴 포함 표시만으로 시급제로 추론하지 않는다 — 형태는 비우고 기본급·포함 표시를 살린다(엔진이 가른다)
  it('추출: 주휴 포함 표시 → 형태 비움·기본급·포함, WEEKLY_HOLIDAY → 주휴수당 금액 칸(안내로 버리지 않음)', () => {
    const r = applyExtracted({
      contract: {
        wage: {
          items: [
            { code: 'BASE', amount: 12384, includes_weekly_holiday: true },
            { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 80000 },
          ],
        },
      },
    });
    // 261102 K2: 구조화 포함 값은 형태와 관계없이 옮긴다(칸은 시급제에서만 보이지만 버리지 않는다)
    expect([r.form.payType, r.form.baseWage, r.form.weeklyHolidayIncluded]).toEqual(['', '12384', 'yes']);
    expect(r.form.weeklyHolidayPay).toBe('80000');
    expect(r.warnings.join()).not.toContain('주휴수당');
  });
  it('추출 → 폼 → 엔진: 사진 경로도 A 로 간다', () => {
    const r = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01', indefinite: true },
        work_time: { days_per_week: 5, start: '09:00', end: '13:00' },
        wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 897840, basis_hours: 87 }] },
      },
    });
    expect(run(buildContract(r.form)).get('MINWAGE').status).toBe('risk');
  });
  it('사진을 올려도 「상시 5인 이상」 선택은 지워지지 않는다', () => {
    const prev: FormState = { ...INITIAL, fivePlus: 'no' };
    const next = applyExtracted({ contract: { period: { start_date: '2026-03-01' } } }).form;
    expect(keepFormOnlyFields(prev, next).fivePlus).toBe('no');
    expect(keepFormOnlyFields(prev, next).startDate).toBe('2026-03-01');
  });
  it('추출 정제: pay_type 은 hourly·monthly 만 남긴다', () => {
    expect(sanitizeExtracted({ wage: { pay_type: 'hourly' } })!.contract.wage.pay_type).toBe('hourly');
    expect(sanitizeExtracted({ wage: { pay_type: 'weekly' } })!.contract.wage.pay_type ?? null).toBeNull();
  });
});

describe('3 D 포괄 총액만 — 단시간이면 연장 항에 소정 초과를 쓴다', () => {
  /** 요일별 10:00~14:30 ×5(휴게 30분 → 소정 20H), 실근로 10:00~17:30(35H), 포괄 총액 1,200,000 */
  const partIncl = (fivePlus: boolean | null) => {
    const c = raw('syn-part-ot-0004');
    delete c.employee.employment_type;
    c.workplace.employee_count_5plus = fivePlus;
    c.wage = { ...c.wage, inclusive_wage: true, monthly_total: 1200000, items: [] };
    return c;
  };
  it('5인 이상 단시간 → 초과 15H 반영, 위반', () => {
    const f = run(partIncl(true)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('15H');
  });
  it('5인 여부 미기재도 같다', () => {
    expect(run(partIncl(null)).get('MINWAGE').status).toBe('violation');
  });
  it('4인 이하 → 기존(주 40H 초과 연장만, 0H) 그대로 적정', () => {
    expect(run(partIncl(false)).get('MINWAGE').status).toBe('ok');
  });
  it('정규직 포괄 총액만은 기존 — 209H + 주 연장 5H', () => {
    const c = contract(5, '09:00', '19:00', [], { inclusive_wage: true, monthly_total: 2500000 });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    expect(run(c).get('MINWAGE').detail).toContain('241.6H');
  });
});

describe('4 payBasis — 근로시간 미상이면 209H 와 비교, 주휴 미상이면 §17② 리스크 없음', () => {
  it('work_time {} + 기본급 2,156,880 / 209H → 월급제, 적정', () => {
    const c = contract(5, '09:00', '18:00', [base(2156880, 209)]);
    c.work_time = {};
    const { n, get } = run(c);
    expect(payBasis(n)).toBe('monthly');
    expect(get('MINWAGE').status).toBe('ok');
  });
  it('work_time {} + 시급 10,320 × 87H → 시급제, 주휴 산정 불가라 리스크 아닌 적정', () => {
    const c = contract(5, '09:00', '13:00', [base(897840, 87)]);
    c.work_time = {};
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('1주 소정근로시간 미상');
  });
});

describe('5 pay_type hourly 인데 산출시간 없음', () => {
  it('BASE 10,320 → 그 값을 시급으로 A(「시간당 99」가 아니다)', () => {
    const { n, get } = run(contract(5, '09:00', '13:00', [base(10320)], { pay_type: 'hourly' }));
    const f = get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('10,320');
    expect(f.detail).not.toContain('시간당 99');
    expect(n.wage.ordinary_hourly_rate).toBe(10320);
  });
  it('BASE 897,840(시급으로 볼 수 없는 값) → 자료 필요', () => {
    const f = run(contract(5, '09:00', '13:00', [base(897840)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급제인데 산출근거 시간 없음');
  });
});

describe('6 시급 경로는 반올림한 시급으로 비교', () => {
  it('179,361 / 17.38H = 10,319.96 → 10,320 으로 보아 위반 아님', () => {
    const f = run(contract(5, '09:00', '13:00', [base(179361, 17.38)])).get('MINWAGE');
    expect(f.status).not.toBe('violation');
  });
  it('10,319 × 87H → 위반', () => {
    expect(run(contract(5, '09:00', '13:00', [base(10319 * 87, 87)])).get('MINWAGE').status).toBe('violation');
  });
});

describe('7 1주 소정의 출처(daily|actual)', () => {
  it('0004(5일·5행) → daily', () => {
    const { n } = run(raw('syn-part-ot-0004'));
    expect(n.work_time.weekly_scheduled_source).toBe('daily');
    expect(n.work_time.weekly_scheduled_hours).toBe(20);
  });
  it('0001(주 5일 40H) + 토요일 한 줄 → daily 불채택, 단시간 아님', () => {
    const c = raw('syn-fixed-1y-0001');
    c.work_time.daily_schedules = [{ day: '토', start: '09:00', end: '13:00' }];
    const { n, get } = run(c);
    expect(n.work_time.weekly_scheduled_source).toBe('actual');
    expect(n.work_time.weekly_scheduled_hours).toBe(40);
    expect(n.employee.employment_type).toBe('fixed_term');
    expect(get('PART-TIME-OT').status).toBe('ok');
  });
  it('근로일별 행 하나가 무효 → actual, 「근로일별 시간 미명시」', () => {
    const c = raw('syn-part-ot-0004');
    c.work_time.daily_schedules![2] = { day: '수', start: '', end: '' };
    const { n, get } = run(c);
    expect(n.work_time.weekly_scheduled_source).toBe('actual');
    expect(get('PART-TIME-OT').detail).toContain('근로일별 시간 미명시');
  });
});

describe('8 포괄이어도 시급제(산출시간 있음)·구성 수당 없음이면 A·B', () => {
  it('20H/5일, 포괄, 총액 897,840 = 시급 10,320 × 87H → 포괄 아님과 같은 결과', () => {
    const items = [base(897840, 87)];
    const incl = run(contract(5, '09:00', '13:00', clone(items), { inclusive_wage: true, monthly_total: 897840 })).get('MINWAGE');
    const plain = run(contract(5, '09:00', '13:00', clone(items), { inclusive_wage: false, monthly_total: 897840 })).get('MINWAGE');
    expect(incl.status).toBe('risk');
    expect([incl.status, incl.detail]).toEqual([plain.status, plain.detail]);
  });
  // 261102 R7: 연장 항목이 있어도 시급제면 A — 연장 충분성은 OT-COVER 몫(종전 C 는 시간당 8,633 위반을 냈다)
  it('연장 항목이 있어도 시급제(A)', () => {
    const ot: WageItem = { code: 'OT_WEEKDAY', label: '고정연장수당', amount: 100000, basis_hours: 6.5, rate_multiplier: 1.5 };
    const f = run(contract(5, '09:00', '13:00', [base(897840, 87), ot], { inclusive_wage: true })).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('계약 시급 10,320');
  });
});

describe('9 주휴시간 — 1일 소정은 40H 클램프 전 값으로', () => {
  it('48H/6일 → 주휴 8H, 209H, 산출근거 209H 는 월급제', () => {
    const { n } = run(contract(6, '09:00', '17:00', [base(2156880, 209)]));
    const wh = weeklyHoliday(n)!;
    expect([wh.weekly, wh.holiday]).toEqual([40, 8]);
    expect(monthlyStandardHours(n)).toBe(209);
    expect(payBasis(n)).toBe('monthly');
  });
  it('40H/6일 → 주휴 40÷6 ≒ 6.67H, 203H 유지', () => {
    const { n } = run(contract(6, '09:00', '15:40', [base(2100000)]));
    expect(weeklyHoliday(n)!.holiday).toBeCloseTo(6.67, 2);
    expect(monthlyStandardHours(n)).toBe(203);
  });
});

describe('10 자정 넘는 근무', () => {
  it('22:00~06:00 × 5 → 주 40H', () => {
    expect(computeWeeklyHours({ days_per_week: 5, start: '22:00', end: '06:00', breaks: [] })).toEqual([40, 0]);
  });
  it('휴게 02:00~03:00 도 근무 창 안으로 본다 → 35H', () => {
    expect(
      computeWeeklyHours({ days_per_week: 5, start: '22:00', end: '06:00', breaks: [{ from: '02:00', to: '03:00', minutes: 60 }] }),
    ).toEqual([35, 0]);
  });
  it('요일별 근무표도 같은 헬퍼 — 22:00~06:00 5행, 휴게 02:00~03:00 → 소정 35H', () => {
    const c = contract(5, '22:00', '06:00', [base(2156880)]);
    c.work_time.breaks = [{ from: '02:00', to: '03:00', minutes: 60 }];
    c.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '22:00', end: '06:00' }));
    const { n } = run(c);
    expect(n.work_time.weekly_scheduled_hours).toBe(35);
    expect(n.work_time.weekly_actual_hours).toBe(35);
  });
});

// 법정 휴게(근기법 §54)는 하한이라 더 길게 준 휴게도 근로시간이 아니다 — 기본 근무시간(시업·종업)에서는 적힌 분을
// 전부 빼고 0 미만만 막는다. 법정 휴게 상한은 근로일별 행(daily_schedules)에 시각 없는 하루 휴게가 일괄 적용될 때만
// (폼 「하루 휴게 60」이 3.5시간 행에서도 60분 빠지던 문제). 261102 재홍님 결정.
describe('11 시각 없는 분 휴게 — 기본 근무시간은 전부 차감, 근로일별 행만 법정 휴게까지, 0 미만 금지', () => {
  const wk = (start: string, end: string, minutes: number) =>
    computeWeeklyHours({ days_per_week: 5, start, end, breaks: [{ minutes }] })[0];
  /** 근로일별 start~end × 5행, 기본 근무시간 09:00~18:00, 시각 없는 휴게 minutes */
  const dailyRows = (start: string, end: string, minutes: number) => {
    const c = contract(5, '09:00', '18:00', [base(2156880)]);
    c.work_time.breaks = [{ minutes }];
    c.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start, end }));
    return run(c).n;
  };
  it('① 기본 근무시간 09:00~18:00 휴게 90분 → 37.5H 유지(법정 60분으로 줄이지 않는다)', () => {
    expect(wk('09:00', '18:00', 90)).toBe(37.5);
  });
  it('② 기본 근무시간 08:00~20:00 휴게 120분 → 50H 유지', () => {
    expect(wk('08:00', '20:00', 120)).toBe(50);
  });
  it('기본 근무시간 09:00~18:00 휴게 60 → 40H', () => {
    expect(wk('09:00', '18:00', 60)).toBe(40);
  });
  it('③ 근로일별 10:00~13:30 × 5 + 휴게 60 → 3.5H 행(법정 0분)이라 빼지 않음 → 소정 17.5H, 주휴 대상', () => {
    const n = dailyRows('10:00', '13:30', 60);
    expect(n.work_time.weekly_scheduled_source).toBe('daily');
    expect(n.work_time.weekly_scheduled_hours).toBe(17.5);
    expect(weeklyHoliday(n)!.holiday).toBeGreaterThan(0);
  });
  it('근로일별 10:00~15:30 × 5 + 휴게 60 → 5.5H 행은 30분까지만 → 소정 25H', () => {
    expect(dailyRows('10:00', '15:30', 60).work_time.weekly_scheduled_hours).toBe(25);
  });
  it('④ 10:00~10:30 + 휴게 60 → 0 미만 없음(기본 근무시간 0H, 근로일별 행 2.5H)', () => {
    expect(wk('10:00', '10:30', 60)).toBe(0);
    expect(dailyRows('10:00', '10:30', 60).work_time.weekly_scheduled_hours).toBe(2.5);
  });
});

describe('12 D 포괄 총액만 — 산입 제외 항목을 빼고 식대·상여는 3단계', () => {
  const incl = (items: WageItem[], monthly_total: number, night: boolean | null = false) => {
    const c = contract(5, '09:00', '19:00', items, { inclusive_wage: true, monthly_total });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    c.work_time.night_work = night;
    return c;
  };
  const annual: WageItem = { code: 'ANNUAL_LEAVE', label: '연차수당', amount: 200000 };
  const meal: WageItem = { code: 'MEAL', label: '식대', amount: 100000 };
  it('총액 2,520,000 − 연차수당 200,000 → 2,320,000 ÷ 241.6H 위반', () => {
    const f = run(incl([base(2320000), annual], 2520000)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('2,320,000');
  });
  it('식대를 빼고도 충족 → 적정', () => {
    expect(run(incl([base(2520000), meal], 2620000)).get('MINWAGE').status).toBe('ok');
  });
  it('식대를 넣어야만 충족 → 리스크', () => {
    expect(run(incl([base(2420000), meal], 2520000)).get('MINWAGE').status).toBe('risk');
  });
  it('식대를 넣어도 미달 → 위반', () => {
    expect(run(incl([base(2300000), meal], 2400000)).get('MINWAGE').status).toBe('violation');
  });
  it('야간근무 여부 미상 → 자료 필요', () => {
    expect(run(incl([], 2500000, null)).get('MINWAGE').status).toBe('needs_data');
  });
});

describe('13 B 기준액은 반올림 전 주휴시간으로', () => {
  const incl6 = (rate: number) =>
    contract(6, '09:00', '15:40', [base(rate * 174, 174, { includes_weekly_holiday: true })]);
  it('주 6일 40H, 주휴 포함 시급 12,040 → 기준액 12,040 충족', () => {
    expect(run(incl6(12040)).get('MINWAGE').status).toBe('ok');
  });
  it('12,039 → 위반', () => {
    expect(run(incl6(12039)).get('MINWAGE').status).toBe('violation');
  });
});

describe('PART-TIME-OT 문구 — 통상시급 미상', () => {
  it('연장 항목에 시간·가산율이 있는데 통상시급을 모를 때 「시간·가산율이 없어」라고 하지 않는다', () => {
    const c = raw('syn-part-ot-0004');
    c.workplace.employee_count_5plus = true;
    c.work_time.daily_schedules = c.work_time.daily_schedules!.map((s) => ({ ...s, end: '15:30' }));
    c.wage.items = [{ code: 'OT_WEEKDAY', label: '초과근로수당', amount: 100000, basis_hours: 10, rate_multiplier: 1.5 }];
    c.wage.ordinary_hourly_rate = null;
    const f = run(c).get('PART-TIME-OT');
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간·가산율이 없어');
    expect(f.detail).toContain('통상시급');
  });
});
