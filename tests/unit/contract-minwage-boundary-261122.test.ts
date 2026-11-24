// 261122 원격 MCP 전수 점검 kl-contract P1 두 건.
// ① 최저임금 비교를 시간급 원 단위 반올림 뒤에 해서 월 1~104원 미달(2,156,776~2,156,879원 / 209H)을 적정으로 보던 결함.
//    최저임금법 제6조·시행령 제5조제1항은 「월 임금 ÷ 월 소정근로시간」을 그대로 최저임금과 비교하고 끝수 처리 규정이 없다.
//    판정은 금액 쪽(산입 임금 ≥ 최저시급 × 시간)으로 하고, 원 미만 끝수(금액이 원 단위라 생기는 1원 미만 차이)만 허용한다.
// ② MINWAGE-PROBATION 이 1년 미만 기간제의 수습 90% 감액을 「요건 충족」으로 보던 결함(최저임금법 제5조제2항).
// 값은 모두 가상값이다. 2026 최저시급은 minwage_table.json 에서 읽는다.
import { describe, expect, it } from 'vitest';

import { amendContract } from '@/lib/contract-check/amendments';
import minwageJson from '@/lib/contract-check/data/minwage_table.json';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';
import { INITIAL, toWriteForm } from '@/app/tools/contract-write/formState';
import { checkWritten, designFromForm, reviewWritten, toContract, type WriteForm } from '@/lib/contract-write/contract';
import { pinToday } from './_pin-today';

// 최저임금 비교 연도가 오늘에 걸린다 — 날짜를 고정한다(261124 P1)
pinToday();

const MIN_2026 = (minwageJson as Record<string, number>)['2026'];
const MONTHLY_2026 = MIN_2026 * 209;

function contract(over: { items?: WageItem[]; wage?: Partial<NonNullable<Contract['wage']>>; period?: Partial<NonNullable<Contract['period']>>; employment_type?: string; work_end?: string } = {}): Contract {
  return {
    contract_id: 'MW-261122',
    workplace: { name: '테스트상사', employee_count_5plus: true },
    employee: { name: '가상01', hire_date: '2026-12-01', is_minor: false, employment_type: over.employment_type ?? 'regular' },
    period: {
      start_date: '2026-12-01',
      end_date: null,
      indefinite: true,
      probation: { applied: false, months: null, wage_rate_pct: null, simple_labor_job: null },
      ...over.period,
    },
    job: { location: '서울 본사', duty: '사무 보조' },
    work_time: { days_per_week: 5, start: '09:00', end: over.work_end ?? '18:00', breaks: [{ minutes: 60 }], daily_schedules: [], night_work: false },
    wage: {
      monthly_total: null,
      pay_type: 'monthly',
      payment_method: '계좌이체',
      payday: '매월 10일',
      items: over.items ?? [],
      ...over.wage,
    },
    holidays_leave: { weekly_rest: '일', weekly_rest_day_specified: true, annual_leave_clause: '근로기준법에 따라 연차유급휴가를 부여한다' },
    signatures: { written_date: '2026-11-25', employer_signed: true, employee_signed: true, copy_delivered_confirmed: true },
  } as unknown as Contract;
}

const monthlyBase = (amount: number): WageItem =>
  ({ code: 'BASE', label: '기본급', amount, basis_hours: 209, rate_multiplier: 1, basis_text: '통상시급 × 209시간(주휴 포함)', includes_weekly_holiday: true }) as WageItem;

const get = (c: Contract, code: string): Finding => {
  const [n] = normalize([c]);
  return checkContract(n).find((f) => f.rule_code === code) as Finding;
};

describe('① 최저임금 — 시간급 반올림 뒤 비교하지 않는다(월급제 209H)', () => {
  it('2026 월 환산액은 10,320 × 209 = 2,156,880', () => {
    expect(MONTHLY_2026).toBe(2_156_880);
  });

  it.each([2_156_879, 2_156_800, 2_156_776])('월 %d원은 위반', (amount) => {
    const f = get(contract({ items: [monthlyBase(amount)], wage: { monthly_total: amount } }), 'MINWAGE');
    expect(f.status).toBe('violation');
    // 표시 시급이 최저시급과 같거나 높게 보이면 안 된다(「시간당 10,320 < 10,320」 모순 금지)
    expect(f.detail).not.toMatch(/시간당 10,320 </);
    expect(f.detail).not.toContain('0원 미달');
  });

  it('2,156,879원 위반 문장은 10,319.99 를 적는다', () => {
    const f = get(contract({ items: [monthlyBase(2_156_879)], wage: { monthly_total: 2_156_879 } }), 'MINWAGE');
    expect(f.detail).toBe(
      '월 산입 임금 2,156,879(기본급) ÷ 최저임금 적용기준 월 209H = 시간당 10,319.99 < 2026년 최저시급 10,320 (시간당 0.01원 미달, 최저임금법 시행령 §5①3호)',
    );
  });

  it('정확히 2,156,880원은 적정 — 문장은 종전 그대로', () => {
    const f = get(contract({ items: [monthlyBase(MONTHLY_2026)], wage: { monthly_total: MONTHLY_2026 } }), 'MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('월 209H = 시간당 10,320 ≥ 2026년 최저시급 10,320');
  });

  it('시급제 표시(pay_type hourly)라도 기본급 2,156,879 ÷ 209H 는 위반', () => {
    const f = get(contract({ items: [monthlyBase(2_156_879)], wage: { pay_type: 'hourly', monthly_total: 2_156_879 } }), 'MINWAGE');
    expect(f.status).toBe('violation');
  });

  it('포괄 총액(소수 시간 분모)도 경계에서 1원 미달이면 위반, 정확히 맞으면 적정', () => {
    // 09:00~19:00 휴게 60분 × 5일 = 주 45H(연장 5H) — 분모 = 209 + round1(5 × 4.345 × 1.5) = 241.6H
    const denom = 209 + Math.round(5 * 4.345 * 1.5 * 10) / 10;
    const exact = Math.round(MIN_2026 * denom);
    const inc = (total: number) =>
      get(contract({ work_end: '19:00', items: [], wage: { inclusive_wage: true, monthly_total: total, pay_type: 'monthly' } }), 'MINWAGE');
    expect(inc(exact).status).toBe('ok');
    const under = inc(exact - 1);
    expect(under.status).toBe('violation');
  });

  it('원 단위 금액의 1원 미만 끝수는 미달로 보지 않는다 — 시급 10,320 × 17.38H = 179,361.6 → 179,361 은 위반 아님, 179,360 은 위반', () => {
    const hourly = (amount: number) =>
      get(
        contract({
          work_end: '13:00',
          items: [
            { code: 'BASE', label: '기본급', amount, basis_hours: 17.38 } as WageItem,
            { code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 100_000 } as WageItem,
          ],
          wage: { pay_type: 'hourly' },
        }),
        'MINWAGE',
      );
    expect(hourly(179_361).status).not.toBe('violation');
    expect(hourly(179_360).status).toBe('violation');
  });
});

describe('① 근로계약서 작성(design_contract_wage) — 최저임금 한 줄', () => {
  const FORM: WriteForm = {
    workplaceName: '합성테스트 사업장',
    employeeCount5plus: true,
    employeeName: '합성01',
    startDate: '2026-12-01',
    endDate: null,
    location: '합성테스트 본점',
    duty: '사무 보조',
    workDays: ['월', '화', '수', '목', '금'],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    weeklyRestDay: '일',
    writtenDate: '2026-11-25',
    monthlyTotal: 2_156_800,
    holidayDaysPerYear: 0,
    overrides: { leaveHours: 0 },
    payday: '매월 10일',
    paymentMethod: '근로자 명의 계좌이체',
  };
  const line = (monthlyTotal: number) => reviewWritten({ ...FORM, monthlyTotal }, designFromForm({ ...FORM, monthlyTotal })).minimumWage;

  it.each([2_156_800, 2_156_879])('월 %d원은 경고 — 「10,320원 이상」 이라고 하지 않는다', (total) => {
    const l = line(total);
    expect(l.warn).toBe(true);
    expect(l.text).not.toContain('원 이상');
    expect(l.text).not.toContain('10,320.00원');
  });

  it('2,156,800원 경고 문장은 10,319.61 이하로 적는다', () => {
    expect(line(2_156_800).text).toContain('통상시급 10,319.61원 — 2026년 최저시급 10,320원보다 낮습니다');
  });

  it('정확히 2,156,880원은 경고 없음', () => {
    const l = line(MONTHLY_2026);
    expect(l.warn).toBe(false);
    expect(l.text).toBe('통상시급 10,320.00원 (2026년 최저시급 10,320원 이상)');
  });
});

describe('② 수습 감액 — 1년 이상 기간을 정한 계약에만(최저임금법 제5조제2항)', () => {
  // 261124 P1 — 감액 후 임금을 최저임금과 비교한다. 감액 전 임금 = 2027년 월 최저(10,700 × 209 = 2,236,300원):
  // 90% = 2,012,670원은 특례 기준(2026 9,288 · 2027 9,630 × 209) 이상, 100% 기준(2026 2,156,880원) 미만
  const MONTHLY_2027 = (minwageJson as Record<string, number>)['2027'] * 209;
  const prob = (end: string | null) =>
    get(
      contract({
        employment_type: end ? 'fixed_term' : 'regular',
        items: [monthlyBase(MONTHLY_2027)],
        period: {
          end_date: end,
          indefinite: end == null,
          probation: { applied: true, months: 3, wage_rate_pct: 90, simple_labor_job: false },
        },
      }),
      'MINWAGE-PROBATION',
    );

  it('6개월 기간제(2026-12-01~2027-05-31) 수습 90% 감액은 위반', () => {
    const f = prob('2027-05-31');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('1년');
  });

  it('수정 방향은 1년 미만 사유를 말한다(「감액 미적용 사업장」 문안이 아니다)', () => {
    const c = contract({
      employment_type: 'fixed_term',
      items: [monthlyBase(Math.ceil(MONTHLY_2026 * 0.9))],
      period: { end_date: '2027-05-31', indefinite: false, probation: { applied: true, months: 3, wage_rate_pct: 90, simple_labor_job: false } },
    });
    const [n] = normalize([c]);
    const row = amendContract(n).rows.find((r) => r.rule_code === 'MINWAGE-PROBATION')!;
    expect(row.amendment).toContain('1년 미만');
    expect(row.amendment).not.toContain('미적용 사업장');
  });

  it('하루 모자란 1년(~2027-11-29)도 위반', () => {
    expect(prob('2027-11-29').status).toBe('violation');
  });

  it('정확히 1년(~2027-11-30)은 적정', () => {
    expect(prob('2027-11-30').status).toBe('ok');
  });

  it('날짜가 YYYY-MM-DD 가 아니면 던지지 않고 기간을 보지 않는다', () => {
    const c = contract({
      employment_type: 'fixed_term',
      items: [monthlyBase(Math.ceil(MONTHLY_2026 * 0.9))],
      period: { end_date: '2027-05', indefinite: false, probation: { applied: true, months: 3, wage_rate_pct: 90, simple_labor_job: false } },
    });
    expect(() => get(c, 'MINWAGE-PROBATION')).not.toThrow();
  });

  it('기간의 정함이 없으면 적정', () => {
    expect(prob(null).status).toBe('ok');
  });

  it('작성 도구와 점검 규칙이 같은 1년 경계를 쓴다 — 정확히 1년 기간제 + 감액은 작성 도구도 받는다', () => {
    const form: WriteForm = {
      workplaceName: '합성테스트 사업장',
      employeeCount5plus: true,
      employeeName: '합성01',
      startDate: '2026-12-01',
      endDate: '2027-11-30',
      location: '합성테스트 본점',
      duty: '사무 보조',
      workDays: ['월', '화', '수', '목', '금'],
      start: '09:00',
      end: '18:00',
      breakMinutes: 60,
      weeklyRestDay: '일',
      writtenDate: '2026-11-25',
      monthlyTotal: 2_500_000,
      holidayDaysPerYear: 0,
      probation: { months: 3, reduced: true, simpleLabor: false },
      payday: '매월 10일',
      paymentMethod: '근로자 명의 계좌이체',
    };
    // checkWritten 은 손볼 항목만 돌려준다 — 정확히 1년이면 수습 감액이 거기 없어야 한다
    expect(checkWritten(form, designFromForm(form)).map((x) => x.rule_code)).not.toContain('MINWAGE-PROBATION');
    const [n] = normalize([toContract(form, designFromForm(form))]);
    expect(checkContract(n).find((x) => x.rule_code === 'MINWAGE-PROBATION')!.status).toBe('ok');
    expect(() => designFromForm({ ...form, endDate: '2027-11-29' })).toThrow(/1년/);
  });
});

// 261122 PR #250 검토 — 단시간·짧은 주의 월 시간. MINWAGE 가 월 시간을 정수로 반올림한 뒤 비교해(주 20H 104.2857H → 104H)
// 월 약 2,900원 미달을 적정으로 보고(반대로 주 21H 109.5H → 110H 는 충족을 위반으로 보고), 작성 화면은 다른 분모(×4.345)로 낸
// 통상시급을 그 판정 옆에 적어 모순됐다. 시행령 제5조제1항제3호는 「1주 시간 × 1년 평균 주 수 ÷ 12」에 끝수 처리를 두지 않는다.
// 예외는 최저임금 고시가 밝힌 주 40H + 주휴 8H 의 209시간 하나.
describe('① 단시간 월 시간 — 반올림하지 않는다(주 20H = 104.2857H, 주 21H = 109.5H)', () => {
  const H20 = (24 * 365) / 7 / 12; // (20 + 주휴 4) × 365/7/12 = 104.2857…
  const noBasis = (amount: number) => [monthlyBase(amount)].map((i) => ({ ...i, basis_hours: null, basis_text: null })) as WageItem[];
  const part = (amount: number) => get(contract({ work_end: '14:00', items: noBasis(amount), wage: { monthly_total: amount } }), 'MINWAGE');

  it('주 20H 월 1,073,282원(÷ 104.2857H = 10,291.9)은 위반, 수정 방향도 식 값으로', () => {
    const f = part(1_073_282);
    expect(f.status).toBe('violation');
    expect(f.detail).toBe(
      '월 산입 임금 1,073,282(기본급) ÷ 최저임금 적용기준 월 104.2857H = 시간당 10,292 < 2026년 최저시급 10,320 (시간당 28원 미달, 최저임금법 시행령 §5①3호)',
    );
    const [n] = normalize([contract({ work_end: '14:00', items: noBasis(1_073_282), wage: { monthly_total: 1_073_282 } })]);
    expect(amendContract(n).rows.find((r) => r.rule_code === 'MINWAGE')!.amendment).toContain('월 104.2857H = 1,076,229원');
  });

  it('경계 — 10,320 × 104.2857H = 1,076,228.57 → 1,076,228 은 적정, 1,076,227 은 위반', () => {
    expect(Math.floor(MIN_2026 * H20)).toBe(1_076_228);
    expect(part(1_076_228).status).toBe('ok');
    expect(part(1_076_227).status).toBe('violation');
  });

  it('주 21H(월·화·수 09:00~17:00 휴게 60분) — 10,320 × 109.5H = 1,130,040 은 적정(110H 로 올려 위반으로 보지 않는다)', () => {
    const three = (amount: number) =>
      get(
        { ...contract({ work_end: '17:00', items: noBasis(amount), wage: { monthly_total: amount } }), work_time: { days_per_week: 3, start: '09:00', end: '17:00', breaks: [{ minutes: 60 }], daily_schedules: [], night_work: false } } as unknown as Contract,
        'MINWAGE',
      );
    expect(three(1_130_040).status).toBe('ok');
    expect(three(1_130_039).status).toBe('violation');
    expect(three(1_130_040).detail).toContain('월 109.5H');
  });

  it('주 40H 5일은 고시 월 환산 209H 그대로', () => {
    expect(get(contract({ items: [monthlyBase(MONTHLY_2026)], wage: { monthly_total: MONTHLY_2026 } }), 'MINWAGE').detail).toContain('209H');
  });
});

describe('① 작성 화면 최저임금 한 줄 — 보이는 시급과 판정이 어긋나지 않는다(단시간·짧은 주·6일·단위 올림)', () => {
  const BASE_FORM: WriteForm = {
    workplaceName: '합성테스트 사업장',
    employeeCount5plus: true,
    employeeName: '합성01',
    startDate: '2026-12-01',
    endDate: null,
    location: '합성테스트 본점',
    duty: '사무 보조',
    workDays: ['월', '화', '수', '목', '금'],
    start: '09:00',
    end: '13:00',
    breakMinutes: 0,
    weeklyRestDay: '일',
    writtenDate: '2026-11-25',
    holidayDaysPerYear: 0,
    overrides: { leaveHours: 0 },
    payday: '매월 10일',
    paymentMethod: '근로자 명의 계좌이체',
  };
  const review = (over: Partial<WriteForm>) => {
    const form = { ...BASE_FORM, ...over };
    return reviewWritten(form, designFromForm(form)).minimumWage;
  };
  const num = (s: string) => Number(s.replace(/,/g, ''));
  /** 줄이 스스로 모순되지 않는가 — 「이상」이면 적힌 시급 ≥ 최저시급, 「낮습니다」면 적힌 시급 < 최저시급 */
  function coherent(l: { text: string; warn: boolean }): string | null {
    const up = l.text.match(/^통상시급 ([\d,.]+)원 \(\d{4}년 최저시급 [\d,]+원 이상\)$/);
    if (up) return num(up[1]) >= MIN_2026 && !l.warn ? null : `이상인데 ${up[1]}`;
    const down = l.text.match(/^통상시급 ([\d,.]+)원 — \d{4}년 최저시급 [\d,]+원보다 낮습니다$/);
    if (down) return num(down[1]) < MIN_2026 && l.warn ? null : `낮다는데 ${down[1]}`;
    // 통상시급이 판정과 어긋나 MINWAGE 계산 문장이 앞에 오는 줄 — 첫 비교 부호 바로 앞의 시급(비교 시급)을 본다
    const calc = l.text.match(/^최저임금 비교: [^≥<]*?([\d,.]+)[^\d≥<]*(≥|<) \d{4}년 최저시급/);
    if (calc) return (calc[2] === '≥' ? num(calc[1]) >= MIN_2026 && !l.warn : num(calc[1]) < MIN_2026 && l.warn) ? null : `계산 ${calc[1]} ${calc[2]}`;
    return `모르는 문장: ${l.text}`;
  }

  const SIX_DAYS: Partial<WriteForm> = { workDays: ['월', '화', '수', '목', '금', '토'], end: '15:40', weeklyRestDay: '일' };
  const THREE_DAYS: Partial<WriteForm> = { workDays: ['월', '화', '수'], end: '17:00', breakMinutes: 60 };

  it('주 20H 1,073,282원 — 「10,292.31원 (… 이상)」 이 아니라 경고', () => {
    const l = review({ monthlyTotal: 1_073_282 });
    expect(l).toEqual({ text: '통상시급 10,292.30원 — 2026년 최저시급 10,320원보다 낮습니다', warn: true });
  });

  it('주 22.5H(09:00~14:00 휴게 30분) 1,210,687원 — 「10,319.97원 (… 이상)」 이 아니다', () => {
    const l = review({ end: '14:00', breakMinutes: 30, monthlyTotal: 1_210_687 });
    expect(l).toEqual({ text: '통상시급 10,319.96원 — 2026년 최저시급 10,320원보다 낮습니다', warn: true });
  });

  it('월·화·수 09:00~17:00(주 21H) 1,129,981원 — 「10,320.02원 — … 낮습니다」 가 아니다', () => {
    const l = review({ ...THREE_DAYS, monthlyTotal: 1_129_981 });
    expect(l).toEqual({
      text:
        '최저임금 비교: 월 산입 임금 1,129,981(기본급(주휴 포함)) ÷ 최저임금 적용기준 월 109.5H = 시간당 10,319 < 2026년 최저시급 10,320' +
        ' (시간당 1원 미달, 최저임금법 시행령 §5①3호) — 통상시급 10,320.03원은 월 총액을 표의 시간(109.49시간)으로 나눈 값이라 비교 시급과 다릅니다',
      warn: true,
    });
    // 10,320 × 109.5H = 1,130,040 부터는 적정 — 110H 로 올려 1,135,200 까지 위반으로 보던 구간이 없다
    expect(review({ ...THREE_DAYS, monthlyTotal: 1_130_040 }).warn).toBe(false);
  });

  it('주 6일 40H(09:00~15:40) 2,100,000원 — 통상시급(÷ 209시간) 10,047.85원 옆에 「이상」 을 붙이지 않는다', () => {
    const l = review({ ...SIX_DAYS, monthlyTotal: 2_100_000 });
    expect(l).toEqual({
      text:
        '최저임금 비교: 월 산입 임금 2,100,000(기본급(주휴 포함)) ÷ 최저임금 적용기준 월 202.7778H = 시간당 10,356 ≥ 2026년 최저시급 10,320' +
        ' — 통상시급 10,047.85원은 월 총액을 표의 시간(209.00시간)으로 나눈 값이라 비교 시급과 다릅니다',
      warn: false,
    });
  });

  // 가운데 = MINWAGE 경계(10,320 × 식 시간) — 작성 쪽 경계(10,320 × 4.345 시간)도 ±3,000원 안에 든다. 주 6일은 두 경계가 멀어 따로 훑는다
  const SCHEDULES: Array<[string, Partial<WriteForm>, number]> = [
    ['주 20H', {}, 1_076_228],
    ['주 22.5H', { end: '14:00', breakMinutes: 30 }, 1_210_782],
    ['주 21H 3일', THREE_DAYS, 1_130_040],
    ['주 40H 6일(점검 경계 202.78H)', SIX_DAYS, 2_092_667],
    ['주 40H 6일(작성 경계 209H)', SIX_DAYS, 2_156_880],
    ['주 40H 5일', { end: '18:00', breakMinutes: 60 }, 2_156_880],
    ['주 20H 100원 올림', { rounding: 'ceil100' }, 1_076_228],
  ];
  it.each(SCHEDULES)('%s — 경계 ±3,000원을 7원 간격으로 훑어도 모순 0건', (_name, over, center) => {
    const bad: string[] = [];
    for (let t = center - 3_000; t <= center + 3_000; t += 7) {
      const r = coherent(review({ ...over, monthlyTotal: t }));
      if (r) bad.push(`${t}: ${r}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  // verify-llg contract-write 「주 20H 경계」 단계의 기대값 — 사이트 폼 기본값(연차 시간 기본 = 주 20H 면 4시간) 그대로
  it('사이트 폼 기본값 · 월~금 09:00~13:00 휴게 0 · 1,117,504원 — 통상시급 10,320.5 이지만 최저임금 비교 시급은 미달', () => {
    const parsed = toWriteForm(
      { ...INITIAL, workplaceName: '합성', employeeName: '합성', startDate: '2026-03-01', writtenDate: '2026-02-26', location: '합성', duty: '합성', start: '09:00', end: '13:00', breakMinutes: '0', monthlyTotal: '1117504' },
      '2026-02-26',
    );
    const form = parsed.form!;
    // 기본급 = 10,320.5 × 104.28H(4.345주) = 1,076,222 — 시행령 식 104.2857H 의 1,076,228 에 6원 모자란다
    expect(reviewWritten(form, designFromForm(form)).minimumWage).toEqual({
      text:
        '최저임금 비교: 월 산입 임금 1,076,222(기본급(주휴 포함)) ÷ 최저임금 적용기준 월 104.2857H = 시간당 10,319.93 < 2026년 최저시급 10,320' +
        ' (시간당 0.07원 미달, 최저임금법 시행령 §5①3호) — 통상시급 10,320.50원은 월 총액을 표의 시간(108.28시간)으로 나눈 값이라 비교 시급과 다릅니다',
      warn: true,
    });
  });

  it('시급제 주 20H — 시급을 훑어도 모순 0건', () => {
    const bad: string[] = [];
    for (let w = 10_250; w <= 10_400; w += 1) {
      const r = coherent(review({ payType: 'hourly', hourlyWage: w }));
      if (r) bad.push(`${w}: ${r}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
