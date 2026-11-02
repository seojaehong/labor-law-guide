// 근로계약서 점검 엔진 — 7113cf1 재검토(opus) K1~K6·F1~F7, d20abe2 재검토 P1~P4 회귀시험. 시험값은 전부 가상값이다.
// 원칙: 두 신호가 어긋나면 두 해석을 다 본다 — 같은 결론이면 그 결론(두 값을 문장에), 갈리면 자료 필요(261102 P2).
// 분기가 갈리는 것은 양쪽을 다 넣는다.

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { applyExtracted } from '@/app/tools/contract-check/extractMap';
import { type FormState, INITIAL, buildContract, withPayType } from '@/app/tools/contract-check/formState';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const raw = (id: string) => clone((casesJson as unknown as Contract[]).find((c) => c.contract_id === id)!);
const run = (c: Contract) => {
  const [n] = normalize(c);
  const findings = checkContract(n);
  return { n, findings, get: (code: string) => findings.find((f) => f.rule_code === code) as Finding };
};
/** 주 days 일 start~end(휴게 없음) 계약. 5인 이상·무기·야간 없음. 시작일 2026-03-01 */
function contract(days: number, start: string, end: string, items: WageItem[], extra: Partial<Contract['wage']> = {}) {
  const c = raw('syn-part-nosched-0002');
  c.contract_id = 'syn-review6';
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
const site = (p: Partial<FormState>) => run(buildContract({ ...INITIAL, ...SITE40, ...p } as FormState));
const DAYS = ['월', '화', '수', '목', '금', '토'];
const rows = (n: number, start: string, end: string) => DAYS.slice(0, n).map((day) => ({ day, start, end }));

describe('K1 산출시간이 있으면 몫이 시급 — 금액 예외는 월 규모(40H 이상)에서 몫이 띠 밖일 때만', () => {
  /** 주 40H(09~17), pay_type 없음 */
  const at = (amount: number, hours: number, extra: Partial<Contract['wage']> = {}) =>
    run(contract(5, '09:00', '17:00', [base(amount, hours)], extra));
  it.each([
    [41280, 8, '5,160'],
    [40000, 8, '5,000'],
    [33024, 8, '4,128'],
    [33016, 8, '4,127'],
    [32000, 8, '4,000'],
    [24000, 8, '3,000'],
    [45000, 10, '4,500'],
    [40000, 10, '4,000'],
    [45000, 5, '9,000'],
  ])('%i ÷ %iH → 몫 %s 위반', (amount, hours, rate) => {
    const f = at(amount, hours).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain(`계약 시급 ${rate}`);
  });
  it('39H — 10,320 ÷ 39H 는 몫 265 위반(금액으로 되돌아가지 않는다)', () => {
    const f = at(10320, 39).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 265');
  });
  it('반대편 40H — 10,320 ÷ 40H 는 월 규모라 금액 시급 예외(10,320)', () => {
    const { n, get } = at(10320, 40);
    expect(n.wage.ordinary_hourly_rate).toBe(10320);
    expect(get('MINWAGE').status).not.toBe('violation');
    expect(get('MINWAGE').detail).toContain('산출근거 40H 로 나누지 않음');
  });
  it('반대편 87H — 10,320 이면 시급 10,320', () => {
    expect(run(contract(5, '09:00', '13:00', [base(10320, 87)])).n.wage.ordinary_hourly_rate).toBe(10320);
  });
  it('사진 경로 — 시급제 32,000 / 8H 를 읽으면 시급 4,000, 위반', () => {
    const photo = applyExtracted({
      contract: { period: { start_date: '2026-03-01' }, wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 32000, basis_hours: 8 }] } },
    }).form;
    expect([photo.hourlyWage, photo.basisHours]).toEqual(['4000', '8']);
    const f = site({ payType: 'hourly', hourlyWage: photo.hourlyWage, basisHours: photo.basisHours }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 4,000');
  });
  // P2 로 기대값을 바꿈(이전 needs_data): 몫 1,149(시급제)도 100,000 ÷ 월 104H = 962(월급제)도 미달 — 두 해석이 같은 결론
  it.each([
    ['hourly', { pay_type: 'hourly' as const }],
    ['없음', {}],
  ])('월 규모인데 몫도 금액도 띠 밖(pay_type %s, 100,000 ÷ 87H) — 두 해석 모두 미달이라 위반, 두 값을 적는다', (_, extra) => {
    const f = run(contract(5, '09:00', '13:00', [base(100000, 87)], extra)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('금액과 산출시간이 맞지 않음');
    expect(f.detail).toContain('100,000');
    expect(f.detail).toContain('87H');
    expect(f.detail).toContain('계약 시급 1,149');
    expect(f.detail).toContain('시간당 962');
  });
  it('P2 갈림 — 1,100,000 ÷ 220H(주 20H): 몫 5,000 미달·월급 1,100,000 ÷ 104H = 10,577 충족 → 자료 필요', () => {
    const f = run(contract(5, '09:00', '13:00', [base(1100000, 220)])).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('금액과 산출시간이 맞지 않음');
    expect(f.detail).toContain('시간당 5,000');
    expect(f.detail).toContain('시간당 10,577');
  });
  it('P2 둘 다 충족 — 시급제 20,000,000 ÷ 87H(주 20H)는 몫·금액 모두 띠 위지만 어느 쪽으로 보아도 충족', () => {
    const f = run(contract(5, '09:00', '13:00', [base(20000000, 87)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).not.toBe('violation');
    expect(f.status).not.toBe('needs_data');
    expect(f.detail).toContain('어느 쪽으로 보아도');
  });
  it('반대편 — pay_type 없음·산출시간이 주휴 포함 월 시간(209H)이면 몫이 띠 밖이어도 월급제(C)', () => {
    expect(at(800000, 209).get('MINWAGE').status).toBe('violation');
    expect(at(20000000, 209).get('MINWAGE').status).toBe('ok');
  });
  // F2 — fable 4차 재검토 보강
  it.each([
    [40000, 9.5, '4,211'],
    [40000, 10, '4,000'],
  ])('F2 JSON — %i ÷ %iH → 몫 %s 위반', (amount, hours, rate) => {
    const f = at(amount, hours).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain(`계약 시급 ${rate}`);
  });
  it.each([
    ['4127', '8', '4,127'],
    ['4000', '10', '4,000'],
    ['1000', '20', '1,000'],
  ])('F2 폼 — 시급제 %s × %sH → 몫 %s 위반', (hourlyWage, basisHours, rate) => {
    const f = site({ payType: 'hourly', hourlyWage, basisHours }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain(`계약 시급 ${rate}`);
  });
  it('F2 사진 — 시급제 30,000 / 8H → 시급 3,750, 위반', () => {
    const photo = applyExtracted({
      contract: { period: { start_date: '2026-03-01' }, wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 30000, basis_hours: 8 }] } },
    }).form;
    expect(photo.hourlyWage).toBe('3750');
    const f = site({ payType: 'hourly', hourlyWage: photo.hourlyWage, basisHours: photo.basisHours }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 3,750');
  });
});

describe('F6 pay_type 없음 + 산출시간 174±1H(주휴를 뺀 월 소정) — 시급제로 추론하지 않는다', () => {
  const at = (amount: number, hours: number, extra: Partial<Contract['wage']> = {}) =>
    run(contract(5, '09:00', '17:00', [base(amount, hours)], extra)).get('MINWAGE');
  it.each([173, 174, 175])('1,900,000 ÷ %iH → 시급제·월급제 확인 필요(두 값을 적는다)', (hours) => {
    const f = at(1900000, hours);
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급제·월급제 확인 필요');
    expect(f.detail).toContain('209H');
  });
  it('반대편 — 시급제 명시 + 174H 는 지금처럼 계약 시급(10,920)', () => {
    const f = at(1900000, 174, { pay_type: 'hourly' });
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('계약 시급 10,920');
  });
  // P2 — 두 해석이 같은 결론이면 그 결론
  it('P2 1,000,000 ÷ 174H — 시급제 5,747·월급제 1,000,000 ÷ 209H = 4,785 모두 미달 → 위반, 두 값을 적는다', () => {
    const f = at(1000000, 174);
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('어느 쪽으로 보아도');
    expect(f.detail).toContain('계약 시급 5,747');
    expect(f.detail).toContain('209H = 시간당 4,785');
  });
  it('P2 2,500,000 ÷ 174H — 시급제 14,368·월급제 11,962 모두 충족 → 충족(위반·자료 필요 아님), 두 값을 적는다', () => {
    const f = at(2500000, 174);
    expect(f.status).not.toBe('violation');
    expect(f.status).not.toBe('needs_data');
    expect(f.detail).toContain('어느 쪽으로 보아도');
    expect(f.detail).toContain('계약 시급 14,368');
    expect(f.detail).toContain('209H = 시간당 11,962');
  });
});

describe('P2 두 해석이 같은 결론이면 그 결론 — 몫(시급제)과 기본급 ÷ 월 시간(월급제)을 둘 다 최저시급과 비교', () => {
  it('폼 시급제 4,000 × 209H → 위반(몫 4,000·월급 836,000 ÷ 209H 모두 미달)', () => {
    const f = site({ payType: 'hourly', hourlyWage: '4000', basisHours: '209' }).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 4,000');
  });
  it.each([
    ['hourly 1,000,000 ÷ 209H(주 40H)', 5, '09:00', '17:00', 1000000, 209, { pay_type: 'hourly' as const }],
    ['pay_type 없음 1,000,000 ÷ 200H(주 40H)', 5, '09:00', '17:00', 1000000, 200, {}],
    ['hourly 5,000 × 87H(주 20H)', 5, '09:00', '13:00', 5000 * 87, 87, { pay_type: 'hourly' as const }],
    ['hourly 5,000 × 209H(주 40H)', 5, '09:00', '17:00', 5000 * 209, 209, { pay_type: 'hourly' as const }],
  ])('%s → 위반', (_, days, start, end, amount, hours, extra) => {
    const f = run(contract(days, start, end, [base(amount, hours)], extra)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('어느 쪽으로 보아도');
  });
});

describe('F7 시급제도 매월 식대(산입범위)를 넣는다 — 계약 시급 + 식대 ÷ 월 소정(주휴 포함, 산출시간이 주휴 포함 월 시간이면 그 값)', () => {
  const meal = (amount: number): WageItem => ({ code: 'MEAL', label: '식대', amount });
  const bonus = (amount: number): WageItem => ({ code: 'BONUS', label: '상여', amount });
  const hourly = (days: number, start: string, end: string, items: WageItem[]) =>
    run(contract(days, start, end, items, { pay_type: 'hourly' })).get('MINWAGE');
  it('시급 10,000 × 209H + 식대 300,000 → 시간당 11,435 적정', () => {
    const f = hourly(5, '09:00', '17:00', [base(10000 * 209, 209), meal(300000)]);
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('계약 시급 10,000 + 식대 300,000 ÷ 209H = 시간당 11,435');
  });
  it('반대편 — 시급 10,000 × 209H, 산입 항목 없음 → 위반', () => {
    expect(hourly(5, '09:00', '17:00', [base(10000 * 209, 209)]).status).toBe('violation');
  });
  // P1 로 기대값을 바꿈 — 87H 는 주휴를 뺀 월 소정이라 분모가 아니다. 분모 = 주 20H 의 월 소정(주휴 포함) 104H
  it('시급 9,000 × 87H(주 20H) + 식대 50,000 → 9,000 + 50,000 ÷ 104H = 9,481 위반', () => {
    const f = hourly(5, '09:00', '13:00', [base(9000 * 87, 87), meal(50000)]);
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 9,000 + 식대 50,000 ÷ 104H = 시간당 9,481');
  });
  it('같은 조건에 식대 200,000 → 시간당 10,923 — 최저임금은 충족, 주휴 항목이 없어 §17② 확인 risk(minor)', () => {
    const f = hourly(5, '09:00', '13:00', [base(9000 * 87, 87), meal(200000)]);
    expect([f.status, f.severity]).toEqual(['risk', 'minor']);
    expect(f.detail).toContain('계약 시급 9,000 + 식대 200,000 ÷ 104H = 시간당 10,923 ≥');
  });
  // P1 — 분모는 산출시간이 주휴 포함 월 시간(209±1 등)일 때만 그 값, 그 밖에는 월 소정근로시간(주휴 포함)
  it('P1 주 40H 시급 1,740,000 ÷ 174H + 식대 60,000 → 10,000 + 60,000 ÷ 209H = 10,287 위반', () => {
    const f = hourly(5, '09:00', '17:00', [base(1740000, 174), meal(60000)]);
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('계약 시급 10,000 + 식대 60,000 ÷ 209H = 시간당 10,287');
  });
  it('P1 주 20H 시급 9,000 × 87H + 식대 120,000 → 9,000 + 120,000 ÷ 104H = 10,154 위반', () => {
    const f = hourly(5, '09:00', '13:00', [base(9000 * 87, 87), meal(120000)]);
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('식대 120,000 ÷ 104H = 시간당 10,154');
  });
  it('P1 주휴 포함 시급 12,000 × 87H(주 20H) + 식대 30,000 → 10,000 + 30,000 ÷ 104H = 10,288 위반', () => {
    const f = hourly(5, '09:00', '13:00', [base(12000 * 87, 87, { includes_weekly_holiday: true }), meal(30000)]);
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('식대 30,000 ÷ 104H = 시간당 10,288');
  });
  it('P1 산출시간 87H 인데 1주 소정을 모르면 분모가 없다 — 9,000 + 식대 200,000 → 자료 필요(87H 로 나누지 않는다)', () => {
    const c = contract(5, '09:00', '13:00', [base(9000 * 87, 87), meal(200000)], { pay_type: 'hourly' });
    c.work_time = { days_per_week: null, start: null, end: null, breaks: [], daily_schedules: null, night_work: false };
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('월 소정근로시간을 알 수 없어');
  });
  it('시급만 있고 월 소정근로시간을 구할 수 없음 + 식대 → 자료 필요(넣으면·빼면 두 경우를 적는다)', () => {
    const c = contract(5, '09:00', '17:00', [base(10000), meal(300000)], { pay_type: 'hourly' });
    c.work_time = { days_per_week: null, start: null, end: null, breaks: [], daily_schedules: null, night_work: false };
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('산입하면');
    expect(f.detail).toContain('빼면');
  });
  it('반대편 — 시간을 구할 수 없어도 계약 시급만으로 충족이면 자료 필요가 아니다', () => {
    const c = contract(5, '09:00', '17:00', [base(10500), meal(300000)], { pay_type: 'hourly' });
    c.work_time = { days_per_week: null, start: null, end: null, breaks: [], daily_schedules: null, night_work: false };
    expect(run(c).get('MINWAGE').status).toBe('ok');
  });
  it('B — 주휴 포함 시급 12,000 × 87H(주 20H)는 미달이지만 식대 100,000 을 넣으면 12,000×20/24 + 100,000 ÷ 104H = 10,962 충족', () => {
    const f = hourly(5, '09:00', '13:00', [base(12000 * 87, 87, { includes_weekly_holiday: true }), meal(100000)]);
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('100,000 ÷ 104H = 시간당 10,962');
    expect(hourly(5, '09:00', '13:00', [base(12000 * 87, 87, { includes_weekly_holiday: true })]).status).toBe('violation');
  });
  it('지급 주기를 알 수 없는 상여는 3단계 — 시급 10,000 × 209H + 상여 300,000 → 넣어야만 충족이라 risk', () => {
    const f = hourly(5, '09:00', '17:00', [base(10000 * 209, 209), bonus(300000)]);
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('상여');
  });
});

describe('F1 사진 경로는 문구로 주휴 포함 칸을 채우지 않는다 — 사진→폼 결과 == JSON 결과', () => {
  const PHRASES = [
    '주휴수당 포함 안됩니다',
    '포함 안된다',
    '포함 불가',
    '포함 ×',
    '미 포함',
    '포함되어 있는 것이 아님',
    '포함 (해당 없음)',
    '포함 시 시급 12,384원',
  ];
  it.each(PHRASES)('「%s」 + 시급 11,000 × 87H(주 20H) — 둘 다 risk(확인 필요), 위반 아님', (p) => {
    const basis_text = p.startsWith('주휴') ? p : `주휴수당 ${p}`;
    const json = run(contract(5, '09:00', '13:00', [base(957000, 87, { basis_text })], { pay_type: 'hourly' })).get('MINWAGE');
    const { form } = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01', indefinite: true },
        work_time: { days_per_week: 5, start: '09:00', end: '13:00', night_work: false },
        wage: { pay_type: 'hourly', items: [{ code: 'BASE', label: '기본급', amount: 957000, basis_hours: 87, basis_text }] },
      },
    });
    const photo = run(buildContract(form)).get('MINWAGE');
    expect(form.weeklyHolidayIncluded).toBe('');
    expect([photo.status, photo.severity]).toEqual([json.status, json.severity]);
    expect(json.status).toBe('risk');
    expect(json.detail).toContain('확인 필요');
    expect(photo.detail).toContain('확인 필요');
  });
});

describe('K2 사진 경로 — 추출한 주휴 포함 칸은 pay_type 과 관계없이 옮기고, 문구만으로는 채우지 않는다', () => {
  const TEXT = '시급 12,000(주휴수당 포함)×87H';
  const item = (includes?: boolean) => ({
    code: 'BASE' as const,
    label: '기본급',
    amount: 1044000,
    basis_hours: 87,
    basis_text: TEXT,
    ...(includes != null ? { includes_weekly_holiday: includes } : {}),
  });
  /** 주 20H(09~13 × 5) */
  const json = (payType: 'hourly' | null, includes?: boolean) =>
    run(contract(5, '09:00', '13:00', [item(includes)], payType ? { pay_type: payType } : {})).get('MINWAGE');
  const photo = (payType: 'hourly' | null, includes?: boolean) => {
    const { form } = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01', indefinite: true },
        work_time: { days_per_week: 5, start: '09:00', end: '13:00', night_work: false },
        wage: { pay_type: payType, items: [item(includes)] },
      },
    });
    return { form, f: run(buildContract(form)).get('MINWAGE') };
  };
  it('pay_type 없음·1,044,000 ÷ 87H·포함 true — JSON 과 사진 경로 모두 12,000 < 12,384 위반', () => {
    const p = photo(null, true);
    expect(p.form.weeklyHolidayIncluded).toBe('yes');
    expect([json(null, true).status, p.f.status]).toEqual(['violation', 'violation']);
    expect(p.f.detail).toContain('12,384');
  });
  it.each(['hourly', null] as const)('반대편 — 포함 칸이 비면(pay_type %s) 사진도 문구로 채우지 않고 JSON 과 같은 risk(minor)', (payType) => {
    const j = json(payType);
    const p = photo(payType);
    expect(p.form.weeklyHolidayIncluded).toBe('');
    expect(j.detail).toContain('주휴수당 포함 여부 확인 필요');
    expect(p.f.status).toBe('risk');
    expect([p.f.status, p.f.severity]).toEqual([j.status, j.severity]);
  });
});

describe('K3 근로일별 행 합 > 출근·퇴근 칸 합이면 모순 — 시간 근거 규칙은 자료 필요', () => {
  it('행 5×09~18, 칸 10~14, 휴게 60분, 월 1,100,000 → MINWAGE 위반 아님(두 시간을 적은 자료 필요)', () => {
    const c = contract(5, '10:00', '14:00', [base(1100000)]);
    c.work_time.breaks = [{ minutes: 60 }];
    c.work_time.daily_schedules = rows(5, '09:00', '18:00');
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('근로일별 시간(주 40H)이 출근·퇴근 시간(주 15H)보다 김');
  });
  it('포괄 단시간, 행 5×09~15, 칸 09~12, 총액 1,000,000 → MINWAGE 위반 아님, PART-TIME-OT 자료 필요', () => {
    const c = contract(5, '09:00', '12:00', [], { inclusive_wage: true, monthly_total: 1000000 });
    c.work_time.daily_schedules = rows(5, '09:00', '15:00');
    const r = run(c);
    expect(r.get('MINWAGE').status).toBe('needs_data');
    expect(r.get('PART-TIME-OT').status).toBe('needs_data');
    expect(r.get('PART-TIME-OT').detail).toContain('근로일별 시간(주 30H)이 출근·퇴근 시간(주 15H)보다 김');
  });
  it.each([
    [0, '72', '54'],
    [60, '66', '48'],
  ])('행 6×09~21, 칸 09~18(휴게 %i분) → WH-52CAP 가 ok 로 넘어가지 않는다', (minutes, rowH, boxH) => {
    const c = contract(6, '09:00', '18:00', [base(3000000)]);
    c.work_time.breaks = minutes ? [{ minutes }] : [];
    c.work_time.daily_schedules = rows(6, '09:00', '21:00');
    const f = run(c).get('WH-52CAP');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain(`근로일별 시간(주 ${rowH}H)이 출근·퇴근 시간(주 ${boxH}H)보다 김`);
  });
  // F4 — 55H 가 통상 근로자·적정으로 지나가면 안 된다
  it('F4 JSON — 칸 09~17(휴게 60분) + 행 09~21 × 5 → 시간 근거 규칙 모두 자료 필요', () => {
    const c = contract(5, '09:00', '17:00', [base(2156880)]);
    c.work_time.breaks = [{ minutes: 60 }];
    c.work_time.daily_schedules = rows(5, '09:00', '21:00');
    const r = run(c);
    expect([r.get('MINWAGE').status, r.get('WH-52CAP').status, r.get('PART-TIME-OT').status]).toEqual(['needs_data', 'needs_data', 'needs_data']);
    expect(r.get('WH-52CAP').detail).toContain('근로일별 시간(주 55H)이 출근·퇴근 시간(주 35H)보다 김');
  });
  it('F4 폼 — 출근·퇴근 09~18(휴게 60분) + 근로일별 09~20 × 5 → 자료 필요', () => {
    const r = site({ baseWage: '2156880', hasDaily: true, daily: rows(5, '09:00', '20:00') });
    expect([r.get('MINWAGE').status, r.get('WH-52CAP').status]).toEqual(['needs_data', 'needs_data']);
    expect(r.get('MINWAGE').detail).toContain('근로일별 시간(주 50H)이 출근·퇴근 시간(주 40H)보다 김');
  });
  it('F4 JSON — 행 09~16 × 5 + 칸 09~14 → 자료 필요', () => {
    const c = contract(5, '09:00', '14:00', [base(1500000)]);
    c.work_time.daily_schedules = rows(5, '09:00', '16:00');
    const r = run(c);
    expect([r.get('MINWAGE').status, r.get('WH-52CAP').status, r.get('PART-TIME-OT').status]).toEqual(['needs_data', 'needs_data', 'needs_data']);
  });
  it('반대편 — 행과 칸이 같으면(5×09~18, 휴게 60분) 모순 아님', () => {
    const c = contract(5, '09:00', '18:00', [base(2156880)]);
    c.work_time.breaks = [{ minutes: 60 }];
    c.work_time.daily_schedules = rows(5, '09:00', '18:00');
    const r = run(c);
    expect([r.get('MINWAGE').status, r.get('WH-52CAP').status]).toEqual(['ok', 'ok']);
    expect(r.findings.some((f) => (f.detail ?? '').includes('보다 김'))).toBe(false);
  });
  it('반대편 — 행 < 칸(0004)은 지금처럼 소정은 행, 실근로는 칸: PART-TIME-OT 15H 초과 위반', () => {
    const r = run(raw('syn-part-ot-0004'));
    expect(r.get('PART-TIME-OT').status).toBe('violation');
    expect(r.get('WH-52CAP').status).toBe('ok');
    expect(r.findings.some((f) => (f.detail ?? '').includes('보다 김'))).toBe(false);
  });
});

describe('K4 포괄 — 식대·상여 합이 총액 − 산입 제외 합을 넘으면 자료 필요(「시간당 0」 없음)', () => {
  /** 포괄 주 40H(09~18, 휴게 12~13) */
  const incl40 = (items: WageItem[], total: number) => {
    const c = contract(5, '09:00', '18:00', items, { inclusive_wage: true, monthly_total: total });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    return run(c).get('MINWAGE');
  };
  it('총액 2,000,000 + 식대 2,200,000 → 자료 필요', () => {
    const f = incl40([{ code: 'MEAL', label: '식대', amount: 2200000 }], 2000000);
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간당 0');
  });
  it('총액 2,000,000 + 연차 100,000 + 상여 2,000,000 → 자료 필요', () => {
    const f = incl40(
      [
        { code: 'ANNUAL_LEAVE', label: '연차수당', amount: 100000 },
        { code: 'BONUS', label: '상여', amount: 2000000 },
      ],
      2000000,
    );
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간당 0');
  });
  // F5 — 같아도(남는 기본 임금 0) 자료 필요
  it('F5 총액 2,000,000 + 식대 2,600,000(주 45H) → 자료 필요', () => {
    const c = contract(5, '09:00', '19:00', [{ code: 'MEAL', label: '식대', amount: 2600000 }], { inclusive_wage: true, monthly_total: 2000000 });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간당 0');
  });
  it('F5 총액 3,000,000 + 상여 3,000,000 → 자료 필요', () => {
    const f = incl40([{ code: 'BONUS', label: '상여', amount: 3000000 }], 3000000);
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간당 0');
  });
  it('반대편 — 식대가 남은 금액보다 작으면 3단계 그대로: 총액 2,300,000 + 식대 300,000 → risk, 총액 2,000,000 + 식대 200,000 → 위반', () => {
    expect(incl40([{ code: 'MEAL', label: '식대', amount: 300000 }], 2300000).status).toBe('risk');
    expect(incl40([{ code: 'MEAL', label: '식대', amount: 200000 }], 2000000).status).toBe('violation');
  });
});

describe('K5 근로일별 행 수 불일치 — 「일부 미입력」은 폼이 덜 채운 행을 버렸을 때만', () => {
  it('JSON — 주 5일에 2일만 적혀 있으면 §17 위반', () => {
    const c = raw('syn-part-nosched-0002');
    c.work_time.daily_schedules = rows(2, '09:00', '13:00');
    const f = run(c).get('REQUIRED-TERMS-FIXED');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('근로일 및 근로일별 근로시간 미명시');
  });
  it('사진 — 주 5일에 2일만 읽혔으면 §17 위반', () => {
    const { form } = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01', indefinite: true },
        job: { location: '본점', duty: '홀' },
        work_time: {
          days_per_week: 5,
          start: '09:00',
          end: '13:30',
          breaks: [{ minutes: 30 }],
          night_work: false,
          daily_schedules: rows(2, '09:00', '13:30'),
        },
        wage: {
          items: [{ code: 'BASE', label: '기본급', amount: 1100000, basis_text: '월 기본급' }],
          payment_method: '계좌이체',
          payday: '익월 10일',
        },
        holidays_leave: { weekly_rest: '일요일', weekly_rest_day_specified: true, annual_leave_clause: '근로기준법에 따름' },
      },
    });
    const f = run(buildContract(form)).get('REQUIRED-TERMS-FIXED');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('근로일 및 근로일별 근로시간 미명시');
  });
});

describe('K6 주휴수당 별도 지급 — 항목 확인이 문구 확인보다 먼저, 문구만이면 확인 필요 risk 는 minor', () => {
  it('문구 「주휴수당 별도 지급」 + 주휴 항목 → ok(항목 별도 명시)', () => {
    const wh: WageItem = { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 165120 };
    const f = run(contract(5, '09:00', '13:00', [base(10320 * 87, 87, { basis_text: '시급 10,320, 주휴수당 별도 지급' }), wh])).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('주휴수당 항목 별도 명시');
  });
  it('F3 「시급 10,320(주휴수당 별도 지급)×87H」 + 주휴 항목 → ok / 항목이 없으면 risk·minor', () => {
    const basis_text = '시급 10,320(주휴수당 별도 지급)×87H';
    const wh: WageItem = { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 165120 };
    expect(run(contract(5, '09:00', '13:00', [base(10320 * 87, 87, { basis_text }), wh])).get('MINWAGE').status).toBe('ok');
    const f = run(contract(5, '09:00', '13:00', [base(10320 * 87, 87, { basis_text })])).get('MINWAGE');
    expect([f.status, f.severity]).toEqual(['risk', 'minor']);
  });
  it.each([
    ['금액 0', 0],
    ['금액 없음', null],
  ])('P4 주휴 항목이 있어도 %s 이면 「별도 명시」 근거가 아니다 → §17② 확인 risk(minor)', (_, amount) => {
    const wh: WageItem = { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: amount as number };
    const f = run(contract(5, '09:00', '13:00', [base(10320 * 87, 87), wh])).get('MINWAGE');
    expect([f.status, f.severity]).toEqual(['risk', 'minor']);
    expect(f.detail).not.toContain('주휴수당 항목 별도 명시');
    expect(f.detail).toContain('근로기준법 §17②');
  });
  it('반대편 — 문구만 있고 칸이 비면 「주휴수당 포함 여부 확인 필요」 risk, severity minor', () => {
    const f = run(contract(5, '09:00', '13:00', [base(10320 * 87, 87, { basis_text: '시급 10,320(주휴수당 포함)' })])).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.severity).toBe('minor');
    expect(f.detail).toContain('주휴수당 포함 여부 확인 필요');
  });
});

describe('P3 폼에서 급여 형태를 시급제가 아닌 값으로 바꾸면 주휴 포함 선택을 비운다 — 사진이 채운 값은 형태를 바꾸기 전까지 둔다', () => {
  const start = { ...INITIAL, ...SITE40 } as FormState;
  it('시급제 → 포함 → 모름 + 기본급 12,000(주 40H) → 위반이 아니다(숨은 「포함」이 법리 B 를 태우지 않는다)', () => {
    let f = withPayType(start, 'hourly');
    f = { ...f, weeklyHolidayIncluded: 'yes' };
    f = { ...withPayType(f, ''), baseWage: '12000' };
    expect(f.weeklyHolidayIncluded).toBe('');
    expect(run(buildContract(f)).get('MINWAGE').status).not.toBe('violation');
    // 비우지 않았다면 숨은 「포함」이 실려 12,000 < 12,384(B) 위반이 됐다
    expect(run(buildContract({ ...f, weeklyHolidayIncluded: 'yes' })).get('MINWAGE').status).toBe('violation');
  });
  it('시급제 → 포함 → 월급제 도 비운다', () => {
    const f = withPayType({ ...start, payType: 'hourly', weeklyHolidayIncluded: 'yes' }, 'monthly');
    expect([f.payType, f.weeklyHolidayIncluded]).toEqual(['monthly', '']);
  });
  it('반대편 — 시급제로 바꾸면 그대로 둔다', () => {
    const f = withPayType({ ...start, payType: '', weeklyHolidayIncluded: 'yes' }, 'hourly');
    expect([f.payType, f.weeklyHolidayIncluded]).toEqual(['hourly', 'yes']);
  });
  it('반대편 — 사진이 채운 값(월급제 + 포함)은 같은 형태를 다시 눌러도 그대로 둔다', () => {
    const f = withPayType({ ...start, payType: 'monthly', weeklyHolidayIncluded: 'yes' }, 'monthly');
    expect(f.weeklyHolidayIncluded).toBe('yes');
  });
});
