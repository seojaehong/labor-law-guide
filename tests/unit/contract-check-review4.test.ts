// 근로계약서 점검 엔진 — 재검토(fable·opus) R1~R7·작은 것 회귀시험. 증거 입력은 두 검토자가 엔진으로 실측한 값이다.
// 시험값은 전부 가상값이다. 분기가 갈리는 것은 양쪽을 다 넣는다.

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { checkContract } from '@/lib/contract-check/engine';
import * as normalizeModule from '@/lib/contract-check/normalize';
import { normalize } from '@/lib/contract-check/normalize';
import { includesWeeklyHoliday } from '@/lib/contract-check/rules/wage';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { applyExtracted } from '@/app/tools/contract-check/extractMap';
import * as formStateModule from '@/app/tools/contract-check/formState';
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
  c.contract_id = 'syn-review4';
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
const site = (p: Partial<FormState>) => run(buildContract({ ...INITIAL, ...SITE40, ...p } as FormState));

describe('R1 주휴 포함 문구 — 토큰 스캐너', () => {
  it.each([
    '시급 10,320(주휴수당 포함되어 있지 않음)',
    '주휴수당 포함되어 있지 아니함',
    '주휴수당 포함 아님',
    '주휴수당 포함 않음',
    '시급에는 주휴수당이 포함되어 있지 않습니다',
  ])('%s → false', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(false);
  });
  it.each([
    '시급 11,000(주휴수당, 식비 포함)',
    '시급 11,000(주휴수당 및 교통비 포함)',
    '주휴수당은 별도 없이 포함',
    '주휴수당은 별도로 지급하지 않고 포함',
    '시급 12,384 (주휴수당) 포함',
  ])('%s → true', (t) => {
    expect(includesWeeklyHoliday(textItem(t))).toBe(true);
  });
  it('같은 토큰에 부정·긍정이 함께 — 「주휴수당 별도 포함」 → null', () => {
    expect(includesWeeklyHoliday(textItem('주휴수당 별도 포함'))).toBeNull();
  });
  it('0002 + 「주휴수당 포함되어 있지 않음」 → B 위반이 아니라 A 확인 필요', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items![0].basis_text = '시급 10,320×월 87H(주휴수당 포함되어 있지 않음)';
    expect(run(c).get('MINWAGE').status).toBe('risk');
  });
  it('시급 11,000(주휴수당, 식비 포함) × 87H, 주 20H → B 기준 12,384 미달 위반', () => {
    const c = contract(5, '09:00', '13:00', [base(11000 * 87, 87, { basis_text: '시급 11,000(주휴수당, 식비 포함)' })]);
    expect(run(c).get('MINWAGE').status).toBe('violation');
  });
});

describe('R2 주휴가 들어간 월 시간(209H 등)은 형태 표시와 관계없이 월급제', () => {
  it('폼 시급제 10,320 × 209시간 + 주휴 포함 표시 → 위반 아님', () => {
    const f = site({ payType: 'hourly', hourlyWage: '10320', basisHours: '209', weeklyHolidayIncluded: 'yes' }).get('MINWAGE');
    expect(f.status).not.toBe('violation');
    expect(f.status).toBe('ok');
  });
  it('사진 BASE 2,156,880 / 209H + includes=true → 시급제로 추론하지 않고 적정', () => {
    const r = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01', indefinite: true },
        work_time: { days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] },
        wage: { items: [{ code: 'BASE', amount: 2156880, basis_hours: 209, includes_weekly_holiday: true }] },
      },
    });
    expect(r.form.payType).toBe('');
    expect(run(buildContract(r.form)).get('MINWAGE').status).toBe('ok');
  });
  it('pay_type hourly + 2,156,880 / 209H → 월급제, §17② 리스크 없음', () => {
    const f = run(contract(5, '09:00', '17:00', [base(2156880, 209)], { pay_type: 'hourly' })).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).not.toContain('§17②');
  });
  it('포괄 09–19×5: 2,536,800 / 241.6H(주휴·연장 포함) → B 가 아니라 포괄 총액 역산(D) 적정', () => {
    const c = contract(5, '09:00', '19:00', [base(2536800, 241.6, { basis_text: '시급 10,500×241.6H(주휴·연장 포함)' })], {
      inclusive_wage: true,
    });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('포괄');
  });
  it('반대편 — 시급 10,320 × 87H(주 20H) 는 그대로 시급제 A', () => {
    expect(run(contract(5, '09:00', '13:00', [base(897840, 87)])).get('MINWAGE').status).toBe('risk');
  });
});

describe('R3 시급제·산출시간 없음·기본급이 시급 띠 밖 → 통상시급 null', () => {
  const c0004 = () => {
    const c = raw('syn-part-ot-0004');
    c.wage.pay_type = 'hourly';
    c.wage.items = [
      { code: 'BASE', label: '기본급', amount: 897840 },
      { code: 'OT_WEEKDAY', label: '연장수당', amount: 281436, basis_hours: 32.6 },
    ];
    return c;
  };
  it('0004 + pay_type hourly + 기본급 897,840(시간 없음) → 통상시급 null, WAGE-MATH 자료 필요, 수천만 원 필요액 없음', () => {
    const { n, get } = run(c0004());
    expect(n.wage.ordinary_hourly_rate ?? null).toBeNull();
    expect(get('WAGE-MATH').status).toBe('needs_data');
    expect(get('PART-TIME-OT').detail).not.toContain('29,258,361');
  });
  it('반대편 — 기본급 10,320(띠 안) → 통상시급 10,320', () => {
    const c = c0004();
    c.wage.items![0].amount = 10320;
    expect(run(c).n.wage.ordinary_hourly_rate).toBe(10320);
  });
});

describe('R4 WAGE-MATH — 통상시급의 출처인 BASE 행은 검산하지 않는다', () => {
  it('폼 월급제 2,200,000 + 월 산출시간 209 → 반올림만으로 위반이 나지 않는다', () => {
    const f = site({ payType: 'monthly', baseWage: '2200000', basisHours: '209' }).get('WAGE-MATH');
    expect(f.status).toBe('ok');
  });
  it('반대편 — 연장 항목 금액이 산출근거와 다르면 위반', () => {
    const ot: WageItem = { code: 'OT_WEEKDAY', label: '연장수당', amount: 100000, basis_hours: 10, rate_multiplier: 1.5 };
    expect(run(contract(5, '09:00', '17:00', [base(2156880, 209), ot])).get('WAGE-MATH').status).toBe('violation');
  });
});

describe('R5 기본급이 이미 시급(띠 안)이면 산출시간으로 나누지 않는다', () => {
  it('pay_type hourly + 기본급 10,320 + 87H → 계약 시급 10,320(「119」 아님)', () => {
    const { n, get } = run(contract(5, '09:00', '13:00', [base(10320, 87)], { pay_type: 'hourly' }));
    const f = get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('10,320');
    expect(n.wage.ordinary_hourly_rate).toBe(10320);
  });
  it('사진 pay_type hourly + BASE 10,320 / 87H → 시급 10320(118.62 아님)', () => {
    const r = applyExtracted({
      contract: {
        period: { start_date: '2026-03-01' },
        wage: { pay_type: 'hourly', items: [{ code: 'BASE', amount: 10320, basis_hours: 87 }] },
      },
    });
    expect([r.form.hourlyWage, r.form.basisHours]).toEqual(['10320', '87']);
  });
  it('pay_type 없는 정규직 기본급 10,320 → 「시간당 49」 위반이 아니다', () => {
    const f = run(contract(5, '09:00', '17:00', [base(10320)])).get('MINWAGE');
    expect(f.status).not.toBe('violation');
    expect(f.detail).not.toContain('시간당 49');
  });
  it('반대편 — pay_type 없는 정규직 기본급 2,000,000 → 월급제 위반 그대로', () => {
    expect(run(contract(5, '09:00', '17:00', [base(2000000)])).get('MINWAGE').status).toBe('violation');
  });
});

describe('R6 근로일별 행이 기본 근무시간과 같은 길이면 휴게를 전부 뺀다', () => {
  /** 10:00~19:00 × 5, 시각 없는 휴게 90분, 기본급 2,100,000 */
  const c = (rows: boolean) => {
    const x = contract(5, '10:00', '19:00', [base(2100000)]);
    x.work_time.breaks = [{ minutes: 90 }];
    if (rows) x.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '10:00', end: '19:00' }));
    return run(x);
  };
  it('같은 행 5개가 있어도 소정 37.5H — 행이 없을 때와 MINWAGE 가 같다', () => {
    const withRows = c(true);
    const noRows = c(false);
    expect(withRows.n.work_time.weekly_scheduled_hours).toBe(37.5);
    const [a, b] = [withRows.get('MINWAGE'), noRows.get('MINWAGE')];
    expect([a.status, a.detail]).toEqual([b.status, b.detail]);
  });
  it('소정은 실근로를 넘지 않는다', () => {
    const x = contract(5, '10:00', '14:00', [base(1100000)]);
    x.work_time.daily_schedules = ['월', '화', '수', '목', '금'].map((day) => ({ day, start: '09:00', end: '18:00' }));
    const { n } = run(x);
    expect(n.work_time.weekly_scheduled_hours).toBeLessThanOrEqual(n.work_time.weekly_actual_hours!);
  });
});

describe('R7 포괄 + 시급제 + 연장 항목 → 시급제(A)', () => {
  const ot: WageItem = { code: 'OT_WEEKDAY', label: '고정연장수당', amount: 100000, basis_hours: 6.5, rate_multiplier: 1.5 };
  it('포괄 + 시급 10,320 × 87H + 연장 항목 → 8,633 위반이 아니라 A', () => {
    const f = run(contract(5, '09:00', '13:00', [base(897840, 87), clone(ot)], { inclusive_wage: true })).get('MINWAGE');
    expect(f.status).toBe('risk');
    expect(f.detail).not.toContain('8,633');
  });
  it('반대편 — 포괄 + 산출시간 없는 월급 + 연장 항목 → 월급제(C)', () => {
    const f = run(contract(5, '09:00', '17:00', [base(2000000), clone(ot)], { inclusive_wage: true })).get('MINWAGE');
    expect(f.detail).toContain('포괄');
  });
});

describe('작은 것', () => {
  it('① 형태 미상 단시간은 식대를 넣어야 충족이어도 「시급제·월급제 확인 필요」가 먼저', () => {
    const meal: WageItem = { code: 'MEAL', label: '식대', amount: 100000 };
    const f = run(contract(5, '09:00', '13:00', [base(1000000), meal])).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급제·월급제 확인 필요');
  });
  it('① 반대편 — 월급제로 밝히면 식대 3단계 리스크', () => {
    const meal: WageItem = { code: 'MEAL', label: '식대', amount: 100000 };
    expect(run(contract(5, '09:00', '13:00', [base(1000000), meal], { pay_type: 'monthly' })).get('MINWAGE').status).toBe('risk');
  });
  it('② 포괄 총액 < 산입 제외 합계 → 「시간당 0」 위반이 아니라 자료 필요', () => {
    const c = contract(5, '09:00', '19:00', [{ code: 'ANNUAL_LEAVE', label: '연차수당', amount: 400000 }], {
      inclusive_wage: true,
      monthly_total: 300000,
    });
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('시간당 0');
  });
  it('③ 근로일별 행 수 ≠ 주 근무일수 → PART-TIME-OT·REQUIRED-TERMS-FIXED 같은 문구', () => {
    const c = raw('syn-part-ot-0004');
    c.work_time.daily_schedules = c.work_time.daily_schedules!.slice(0, 4);
    const { get } = run(c);
    expect(get('PART-TIME-OT').detail).toContain('근로일별 시간이 주 근무일수와 맞지 않음');
    expect(get('REQUIRED-TERMS-FIXED').detail).toContain('근로일별 시간이 주 근무일수와 맞지 않음');
  });
  it('③ 반대편 — 행 결손은 「근로일별 시간 미명시」·「근로일 및 근로일별 근로시간 미명시」', () => {
    const c = raw('syn-part-ot-0004');
    c.work_time.daily_schedules![2] = { day: '수', start: '', end: '' };
    const { get } = run(c);
    expect(get('PART-TIME-OT').detail).toContain('근로일별 시간 미명시');
    expect(get('REQUIRED-TERMS-FIXED').detail).toContain('근로일 및 근로일별 근로시간 미명시');
  });
  it('④ 원 입력칸이 소수점을 먹지 않는다', () => {
    const fmt = (formStateModule as unknown as { formatNumericInput: (v: string, suffix?: string) => string }).formatNumericInput;
    expect(fmt('10320.', '원')).toBe('10,320.');
    expect(fmt('10320.5', '원')).toBe('10,320.5');
    expect(fmt('2200000', '원')).toBe('2,200,000');
    expect(fmt('87', '시간')).toBe('87');
  });
  it('⑤ 규칙 파일끼리 import 하지 않는다(공용 상수는 normalize)', () => {
    const dir = 'src/lib/contract-check/rules';
    const hits = fs
      .readdirSync(dir)
      .filter((f) => f !== 'index.ts')
      .flatMap((f) =>
        fs
          .readFileSync(`${dir}/${f}`, 'utf8')
          .split('\n')
          .filter((l) => /from '\.\/(?!index')/.test(l))
          .map((l) => `${f}: ${l.trim()}`),
      );
    expect(hits).toEqual([]);
  });
  it('⑥ 단시간 소정 초과는 normalize 의 함수 하나 — 0004 는 15H', () => {
    const fn = (normalizeModule as unknown as { partTimeExcessHours?: (c: Contract) => number | null }).partTimeExcessHours;
    expect(typeof fn).toBe('function');
    const { n } = run(raw('syn-part-ot-0004'));
    expect(fn!(n)).toBe(15);
  });
});
