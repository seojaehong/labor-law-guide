// 근로계약서 점검 엔진 — 608f3e9 재검토(opus) C1~C3·W1~W3·작은 것 회귀시험. 시험값은 전부 가상값이다.
// 분기가 갈리는 것은 양쪽을 다 넣는다.

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import { includesWeeklyHoliday } from '@/lib/contract-check/rules/wage';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { applyExtracted } from '@/app/tools/contract-check/extractMap';
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
  c.contract_id = 'syn-review5';
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
const textItem = (basis_text: string): WageItem => ({ code: 'BASE', label: '기본급', amount: 1, basis_text });
/** 사이트 폼 — 주 5일 09:00~18:00, 휴게 60분(주 40H) */
const SITE40: Partial<FormState> = {
  periodType: 'indefinite',
  fivePlus: 'yes',
  startDate: '2026-03-01',
  daysPerWeek: '5',
  workStart: '09:00',
  workEnd: '18:00',
  breakMinutes: '60',
  nightWork: 'no',
  payday: '익월 10일',
  paymentMethod: '계좌이체',
  weeklyRest: 'specified',
};
const form = (p: Partial<FormState>) => ({ ...INITIAL, ...SITE40, ...p }) as FormState;
const site = (p: Partial<FormState>) => run(buildContract(form(p)));
/** 시급 11,000 × 87H, 주 20H(09~13 × 5) — 주휴 포함이면 기준액 12,384 라 B 로는 위반 */
const h11000 = (more: Partial<WageItem>) => contract(5, '09:00', '13:00', [base(11000 * 87, 87, more)]);

const NOT_INCLUDED_PHRASES = [
  '주휴수당 포함 안함',
  '주휴수당 포함안함',
  '주휴수당:미포함',
  '주휴수당 「미포함」',
  '주휴수당-미포함',
  '주휴수당 포함 X',
  '주휴수당 포함 여부: 미포함',
];
/** fable 재검토(608f3e9) 재현 문구 — 시급 10,320 + 구조화 칸 비어 있음이면 어느 것도 위반이 아니다 */
const FABLE_PHRASES = [
  '포함 안됩니다',
  '포함 안된다',
  '포함 안되며',
  '포함 불가',
  '포함X',
  '포함 ×',
  '포함 X, 별도 지급',
  '포함 여부 미기재',
  '포함 여부 확인 필요',
  '포함 여부 불명',
  '포함 여부는 별도 협의',
  '포함 시 시급 12,384원',
  '미 포함',
  '포함되어 있는 것이 아님',
];

describe('C1 법리 B 는 구조화 칸(includes_weekly_holiday)이 true 일 때만 — 문구는 확인 필요만', () => {
  it.each(NOT_INCLUDED_PHRASES)('스캐너: %s → 포함 아님', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(false);
  });
  it.each(['주휴수당 포함 여부: 포함', '시급 10,320(주휴수당 포함) × 174H', '주휴수당 포함 x 209H'])('스캐너: %s → 포함', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(true);
  });
  it.each(NOT_INCLUDED_PHRASES)('문구 「%s」만 있고 칸이 비면 위반이 아니다', (t) => {
    expect(run(h11000({ basis_text: t })).get('MINWAGE').status).not.toBe('violation');
  });
  it.each(FABLE_PHRASES)('fable 재현 — 시급 10,320 + 문구 「주휴수당 %s」 + 칸 비어 있음 → 위반 아님', (t) => {
    const c = contract(5, '09:00', '13:00', [base(10320 * 87, 87, { basis_text: `주휴수당 ${t}` })]);
    expect(run(c).get('MINWAGE').status).not.toBe('violation');
  });
  it('문구가 「포함」으로 읽혀도 칸이 비면 B 위반이 아니라 「주휴수당 포함 여부 확인 필요」 리스크', () => {
    const f = run(h11000({ basis_text: '시급 11,000(주휴수당 포함)' })).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('주휴수당 포함 여부 확인 필요');
  });
  it('반대편 — 칸이 true 면 B: 11,000 < 12,384 위반', () => {
    const f = run(h11000({ includes_weekly_holiday: true })).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('12,384');
  });
  it('반대편 — 칸이 false 면 확인 필요 없이 A(§17② 확인)', () => {
    const f = run(h11000({ includes_weekly_holiday: false, basis_text: '시급 11,000(주휴수당 포함)' })).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).not.toContain('포함 여부 확인 필요');
  });
  // 261102 K2·F1 로 뒤집음 — 사진 경로도 문구로 포함 칸을 채우지 않는다(구조화 값만)
  it('사진 경로 — extractMap 은 문구로 포함 칸을 채우지 않는다', () => {
    const photo = (basis_text: string) =>
      applyExtracted({
        contract: {
          period: { start_date: '2026-03-01' },
          wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 957000, basis_hours: 87, basis_text }] },
        },
      }).form.weeklyHolidayIncluded;
    expect(photo('시급 11,000(주휴수당 포함)')).toBe('');
    expect(photo('시급 11,000(주휴수당 포함 안함)')).toBe('');
    expect(photo('시급 11,000')).toBe('');
  });
});

describe('C2 시급 — 「금액 ÷ 산출시간」이 띠 안이면 그 몫, 아니고 금액이 띠 안일 때만 금액', () => {
  it('폼 시급제 9,000 × 5H → 9,000 위반', () => {
    const f = site({ payType: 'hourly', hourlyWage: '9000', basisHours: '5' }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('9,000');
  });
  it('BASE 50,000 / 8H → 6,250 위반', () => {
    const f = run(contract(5, '09:00', '17:00', [base(50000, 8)])).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('6,250');
  });
  it('fable 재현 — pay_type 없음 BASE 40,000 / 8H, 주 40H → 5,000 위반', () => {
    const f = run(contract(5, '09:00', '17:00', [base(40000, 8)])).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('5,000');
  });
  it('반대편 — 10,320 / 87H → 몫이 띠 밖이라 금액 10,320', () => {
    const { n, get } = run(contract(5, '09:00', '13:00', [base(10320, 87)]));
    expect(n.wage.ordinary_hourly_rate).toBe(10320);
    expect(get('MINWAGE').detail).toContain('10,320');
  });
  it('사진 pay_type hourly 45,000 / 5H → 시급 9,000', () => {
    const r = applyExtracted({
      contract: { period: { start_date: '2026-03-01' }, wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 45000, basis_hours: 5 }] } },
    });
    expect([r.form.hourlyWage, r.form.basisHours]).toEqual(['9000', '5']);
  });
  it('엔진·사진 매핑이 같은 normalize 함수 하나를 쓴다(로컬 띠 판정 없음)', () => {
    const src = (p: string) => fs.readFileSync(p, 'utf8');
    expect(src('src/app/tools/contract-check/extractMap.ts')).not.toMatch(/isPlausibleHourly|HOURLY_PLAUSIBLE/);
    expect(src('src/lib/contract-check/rules/wage.ts')).not.toMatch(/isPlausibleHourly|HOURLY_PLAUSIBLE|hourlyRateOf/);
  });
});

describe('C3 명시적 시급제는 209±1 창이 월급제로 바꾸지 않는다 — 산출시간에 주휴가 들어 있어 A', () => {
  it('시급제 10,320 × 208.57H → 위반 아님', () => {
    expect(site({ payType: 'hourly', hourlyWage: '10320', basisHours: '208.57' }).get('MINWAGE').status).not.toBe('violation');
  });
  it('시급제 9,000 × 209H + 주휴 항목 300,000 → 9,000 < 10,320 위반', () => {
    const wh: WageItem = { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 300000 };
    const f = run(contract(5, '09:00', '18:00', [base(9000 * 209, 209), wh], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('9,000');
  });
  it('시급제 10,320 × 209 포함 — amount 를 10,320 으로 넣든 2,156,880 으로 넣든 같은 판정(위반 아님)', () => {
    const a = run(contract(5, '09:00', '17:00', [base(10320, 209, { includes_weekly_holiday: true })], { pay_type: 'hourly' })).get('MINWAGE');
    const b = run(contract(5, '09:00', '17:00', [base(2156880, 209, { includes_weekly_holiday: true })], { pay_type: 'hourly' })).get('MINWAGE');
    expect(a.status).toBe(b.status);
    expect(a.status).not.toBe('violation');
    expect(b.detail).toContain('주휴가 들어간 월 시간');
  });
  /** 시급 × 산출시간 — pay_type hourly, 주 days 일 start~end(휴게 없음) */
  const hourlyMonthly = (rate: number, hours: number, days: number, start: string, end: string, extra: Partial<Contract['wage']> = {}) =>
    run(contract(days, start, end, [base(rate * hours, hours)], { pay_type: 'hourly', ...extra })).get('MINWAGE');
  it('fable 재현 — 40H 시급제 10,320 × 208H → 위반 아님', () => {
    expect(hourlyMonthly(10320, 208, 5, '09:00', '17:00').status).not.toBe('violation');
  });
  it('fable 재현 — 40H 시급제 10,300 × 210H → 10,300 위반', () => {
    const f = hourlyMonthly(10300, 210, 5, '09:00', '17:00');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('10,300');
  });
  it('fable 재현 — 단시간 20H 시급제 10,300 × 105H → 위반 / 10,320 × 103H → 위반 아님', () => {
    expect(hourlyMonthly(10300, 105, 5, '09:00', '13:00').status).toBe('violation');
    expect(hourlyMonthly(10320, 103, 5, '09:00', '13:00').status).not.toBe('violation');
  });
  it('fable 재현 — 포괄 45H(연장 5H) 시급제 10,320 × 241H → 위반 아님', () => {
    expect(hourlyMonthly(10320, 241, 5, '09:00', '18:00', { inclusive_wage: true }).status).not.toBe('violation');
  });
  it('fable 재현 — JSON BASE(10,320, 209H, 포함 true)와 사진→폼 경로(2,156,880)가 같은 판정', () => {
    const json = run(contract(5, '09:00', '17:00', [base(10320, 209, { includes_weekly_holiday: true })], { pay_type: 'hourly' })).get('MINWAGE');
    const photo = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01' },
        wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 2156880, basis_hours: 209, includes_weekly_holiday: true }] },
      },
    }).form;
    const viaForm = site({ payType: photo.payType, hourlyWage: photo.hourlyWage, basisHours: photo.basisHours, weeklyHolidayIncluded: photo.weeklyHolidayIncluded }).get('MINWAGE');
    expect([photo.payType, photo.hourlyWage, photo.basisHours, photo.weeklyHolidayIncluded]).toEqual(['hourly', '10320', '209', 'yes']);
    expect(viaForm.status).toBe(json.status);
    expect(json.status).not.toBe('violation');
  });
  it('반대편 — pay_type 없음 2,156,880 / 209H → 월급제(C) 적정', () => {
    const f = run(contract(5, '09:00', '17:00', [base(2156880, 209)])).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('최저임금 적용기준 월 209H');
  });
});

// 261102 K4·F5 로 뒤집음 — 식대·상여 합이 (총액 − 산입 제외 합) 이상이면 남는 기본 임금이 없어 자료 필요(「시간당 0」 없음).
// 아래 넷은 3차(W1·fable)에서 위반·「자료 필요 아님」이었다. 3단계 그대로인 쪽은 review6 K4 반대편.
describe('W1 포괄 총액 ≤ 산입 제외 합계, 또는 식대·상여가 남은 금액 이상이면 자료 필요', () => {
  const incl = (items: WageItem[], monthly_total: number) => {
    const c = contract(5, '09:00', '19:00', items, { inclusive_wage: true, monthly_total });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    return run(c).get('MINWAGE');
  };
  it('포괄 1,500,000 + 식대 1,600,000 → 자료 필요', () => {
    expect(incl([{ code: 'MEAL', label: '식대', amount: 1600000 }], 1500000).status).toBe('needs_data');
  });
  it('상여 3,000,000 = 총액 3,000,000 → 자료 필요', () => {
    expect(incl([{ code: 'BONUS', label: '상여', amount: 3000000 }], 3000000).status).toBe('needs_data');
  });
  it('fable 재현 — 포괄 45H [연차 200,000·식대 300,000·상여 1,500,000] 총액 2,000,000 → 자료 필요(남는 기본 임금 0)', () => {
    const items: WageItem[] = [
      { code: 'ANNUAL_LEAVE', label: '연차수당', amount: 200000 },
      { code: 'MEAL', label: '식대', amount: 300000 },
      { code: 'BONUS', label: '상여', amount: 1500000 },
    ];
    expect(incl(items, 2000000).status).toBe('needs_data');
  });
  it('fable 재현 — 포괄 45H [연차 100,000·상여 2,000,000] 총액 2,100,000 → 자료 필요(남는 기본 임금 0)', () => {
    const items: WageItem[] = [
      { code: 'ANNUAL_LEAVE', label: '연차수당', amount: 100000 },
      { code: 'BONUS', label: '상여', amount: 2000000 },
    ];
    expect(incl(items, 2100000).status).toBe('needs_data');
  });
  it('반대편 — 총액 = 연차수당(산입 제외) → 자료 필요', () => {
    expect(incl([{ code: 'ANNUAL_LEAVE', label: '연차수당', amount: 300000 }], 300000).status).toBe('needs_data');
  });
});

describe('W2 근로일별 행이 있으면 소정은 행에서 — 출근·퇴근 칸으로 깎지 않는다', () => {
  /** opus 재현 — 월·화 09~18, 수·목·금 09~13, 시각 없는 휴게 60분 */
  const opus = (start: string, end: string) => {
    const c = contract(5, start, end, [base(1200000)]);
    c.work_time.breaks = [{ minutes: 60 }];
    c.work_time.daily_schedules = [
      { day: '월', start: '09:00', end: '18:00' },
      { day: '화', start: '09:00', end: '18:00' },
      { day: '수', start: '09:00', end: '13:00' },
      { day: '목', start: '09:00', end: '13:00' },
      { day: '금', start: '09:00', end: '13:00' },
    ];
    return run(c).n.work_time.weekly_scheduled_hours;
  };
  it('출근·퇴근 09~13 이든 09~18 이든 소정 26.5H', () => {
    expect([opus('09:00', '13:00'), opus('09:00', '18:00')]).toEqual([26.5, 26.5]);
  });
  it('출근·퇴근 10~14 + 근로일별 09~18 × 5 → 소정은 행(하루 8시간 상한 → 40H, 261103), 출근·퇴근(20H)으로 깎지 않는다', () => {
    const c = contract(5, '10:00', '14:00', [base(2200000)]);
    c.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '09:00', end: '18:00' }));
    expect(run(c).n.work_time.weekly_scheduled_hours).toBe(40);
  });
  it('fable 재현 — 출근·퇴근 09~17(휴게 60분) + 근로일별 09~19 × 5 → 소정은 행(하루 8시간 상한 → 40H, 261103), 35H 로 깎지 않는다', () => {
    const c = contract(5, '09:00', '17:00', [base(2200000)]);
    c.work_time.breaks = [{ minutes: 60 }];
    c.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '09:00', end: '19:00' }));
    expect(run(c).n.work_time.weekly_scheduled_hours).toBe(40);
  });
  it('반대편 — 0004(출근·퇴근 10:00~17:30, 근로일별 10:00~14:30)는 소정 20H·실근로 35H 그대로', () => {
    const { n } = run(raw('syn-part-ot-0004'));
    expect([n.work_time.weekly_scheduled_hours, n.work_time.weekly_actual_hours]).toEqual([20, 35]);
  });
});

describe('W3 명시적 시급제·산출시간 없음 — 띠 아래도 시급, 띠 위만 「시급으로 볼 수 없음」', () => {
  it('pay_type hourly + 기본급 5,159 → 5,159 위반', () => {
    const f = run(contract(5, '09:00', '13:00', [base(5159)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('5,159');
  });
  it('pay_type hourly + 기본급 4,000(띠 하한 0.5배 아래) → 4,000 위반', () => {
    const f = run(contract(5, '09:00', '13:00', [base(4000)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('4,000');
  });
  it('반대편 — 기본급 51,601(5배 초과) → 자료 필요', () => {
    const f = run(contract(5, '09:00', '13:00', [base(51601)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급으로 볼 수 없');
  });
  it('fable 재현 — 폼 시급제 5,000(산출시간 없음) → 위반, WAGE-MATH 도 통상시급 5,000 으로 돈다(양쪽)', () => {
    const r = (otAmount: string) => site({ payType: 'hourly', hourlyWage: '5000', otAmount, otHours: '10' });
    const ok = r('50000');
    expect(ok.get('MINWAGE').status).toBe('violation');
    expect(ok.n.wage.ordinary_hourly_rate).toBe(5000);
    expect(ok.get('WAGE-MATH').status).toBe('ok');
    const bad = r('75000').get('WAGE-MATH');
    expect(bad.status).toBe('violation');
    expect(bad.detail).toContain('기대 50,000');
  });
});

describe('작은 것', () => {
  // 261102 K2 로 뒤집음 — 칸은 시급제에서만 보이지만(화면 조건 그대로) 값은 급여 형태와 관계없이 싣는다(숨김 ≠ 버림)
  it('① 주휴 포함 선택은 급여 형태와 관계없이 싣는다', () => {
    const items = (payType: FormState['payType']) =>
      buildContract(form({ payType, baseWage: '12384', hourlyWage: '12384', weeklyHolidayIncluded: 'yes' })).wage.items!;
    expect(items('').find((i) => i.code === 'BASE')!.includes_weekly_holiday).toBe(true);
    expect(items('hourly').find((i) => i.code === 'BASE')!.includes_weekly_holiday).toBe(true);
  });
  it('① 사진 — 구조화 포함 값은 pay_type 과 관계없이 채운다', () => {
    const photo = (pay_type: string | null) =>
      applyExtracted({
        contract: { wage: { pay_type, items: [{ code: 'BASE', amount: 12384, includes_weekly_holiday: true }] } },
      }).form.weeklyHolidayIncluded;
    expect([photo(null), photo('hourly')]).toEqual(['yes', 'yes']);
  });
  /** 단시간 폼 — 주 5일, §17 다른 항목은 모두 기재 */
  const partTime = (rows: FormState['daily']) =>
    form({
      workStart: '09:00',
      workEnd: '13:30',
      breakMinutes: '30',
      baseWage: '1100000',
      basisWritten: true,
      annualLeaveClause: true,
      jobWritten: true,
      hasDaily: true,
      daily: rows,
    });
  const row = (day: string, start = '09:00', end = '13:30') => ({ day, start, end });
  it('② 폼에서 덜 채운 근로일별 행 → §17 위반이 아니라 「근로일별 시간 일부 미입력」 자료 필요', () => {
    const f = run(buildContract(partTime([row('월'), row('화'), row('수'), row('목'), row('금', '', '')]))).get('REQUIRED-TERMS-FIXED');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('근로일별 시간 일부 미입력');
  });
  it('② 반대편 — 다섯 행을 다 채우면 적정', () => {
    expect(run(buildContract(partTime(['월', '화', '수', '목', '금'].map((d) => row(d))))).get('REQUIRED-TERMS-FIXED').status).toBe('ok');
  });
  it('② 다른 §17 항목도 빠졌으면 위반 — 그 항목을 적고 일부 미입력도 함께 알린다', () => {
    const f = run(buildContract({ ...partTime([row('월'), row('화'), row('수', '', '')]), jobWritten: false })).get('REQUIRED-TERMS-FIXED');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('취업장소·종사업무 미명시');
    expect(f.detail).toContain('근로일별 시간 일부 미입력');
  });
  it('③ wage.ts 는 상수를 다시 내보내지 않고, entry.ts 는 normalize 에서 가져온다', () => {
    expect(fs.readFileSync('src/lib/contract-check/rules/wage.ts', 'utf8')).not.toMatch(/^export \{/m);
    const entry = fs.readFileSync('src/offline/contract-check/entry.ts', 'utf8');
    expect(entry).not.toContain("from '@/lib/contract-check/rules/wage'");
    expect(entry).toMatch(/MINWAGE_TABLE[^;]*from '@\/lib\/contract-check\/normalize'/);
  });
});
