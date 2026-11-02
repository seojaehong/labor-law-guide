// 최저임금 비교·단시간 초과근로 — 261101 재홍님(공인노무사) 확정 법리 A~E.
// A 시급제(기본급 산출근거가 「시급 × 시간」)는 주휴수당 항목이 없어도 위반이 아니다 — 주휴수당은 근기법 §55① 법정 발생,
//   최저임금은 계약 시급으로만 비교한다. 주휴 산정·지급 방법이 없으면 근기법 §17② 서면 명시 「확인 필요」(risk·minor).
// B 시급에 「주휴 포함」 표시 → 주휴포함 시급 ≥ 최저시급 × (1주 소정 + 주휴)/1주 소정.
// C 월급제 → 산입 임금 합계 ÷ 법정 월 환산시간((1주 소정 + 주휴) × 365/7/12, 정수 반올림 — 40H 는 209H).
// D 포괄 → 구성항목이 있으면 산입 임금 ÷ 환산시간, 총액만이면 총액 ÷ (환산시간 + 고정 연장 × 1.5), 시간 없으면 자료 필요.
// E 단시간 초과근로(기간제법 §6) — 상시 5인 이상에만, 가산은 이름이 아니라 금액으로.
// 종전 D1(시급제 + 주휴 항목 없음 → 위반)은 A 로 뒤집었다. 시험값은 전부 가상값이다.

import { describe, expect, it } from 'vitest';

import casesJson from '@/lib/contract-check/data/synthetic_edge_cases.json';
import { amendmentMap } from '@/lib/contract-check/present';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract, Finding, WageItem } from '@/lib/contract-check/types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const raw = (id: string) =>
  clone((casesJson as unknown as Contract[]).find((c) => c.contract_id === id)!);
const run = (c: Contract) => {
  const [n] = normalize(c);
  const findings = checkContract(n);
  return { n, findings, get: (code: string) => findings.find((f) => f.rule_code === code) as Finding };
};

/** 주 days 일 start~end(휴게 없음) 계약. items 는 그대로 넣는다. 5인 이상·무기. */
function contract(days: number, start: string, end: string, items: WageItem[], extra: Partial<Contract['wage']> = {}) {
  const c = raw('syn-part-nosched-0002');
  c.contract_id = 'syn-test';
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

describe('A 시급제 — 주휴 항목이 없어도 위반이 아니다', () => {
  it('0002(시급 10,320 × 87H, 주휴 항목 없음) → 위반 아님, 확인 필요(risk·minor)', () => {
    const f = run(raw('syn-part-nosched-0002')).get('MINWAGE');
    expect(f.status).not.toBe('violation');
    expect(f.status).toBe('risk');
    expect(f.severity).toBe('minor');
    expect(f.detail).toContain('10,320');
    expect(f.detail).toContain('§17');
    expect(f.statute).toBe('최저임금법 §6');
  });

  it('주휴수당 항목(WEEKLY_HOLIDAY)이 있으면 적정', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items!.push({ code: 'WEEKLY_HOLIDAY', label: '주휴수당', amount: 179361, basis_hours: 17.38 });
    expect(run(c).get('MINWAGE').status).toBe('ok');
  });

  it('유급휴일수당이라는 이름의 OTHER 항목 — 이름으로 판정하지 않는다, 위반 아님', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items!.push({ code: 'OTHER', label: '유급휴일수당', amount: 179361 });
    expect(run(c).get('MINWAGE').status).not.toBe('violation');
  });

  it('「주휴수당 미포함」 문구 — 포함으로 읽지 않는다(위반 아님)', () => {
    const c = raw('syn-part-nosched-0002');
    c.wage.items![0].basis_text = '시급 10,320×월 87H(주휴수당 미포함)';
    expect(run(c).get('MINWAGE').status).toBe('risk');
  });

  it('계약 시급이 최저시급 미만이면 위반', () => {
    const f = run(contract(5, '09:00', '13:00', [base(10000 * 87, 87)])).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('10,000');
  });

  it('주 15시간 미만 시급제는 주휴가 없으니 확인 필요도 없다 → 적정', () => {
    expect(run(contract(2, '09:00', '16:00', [base(10320 * 56, 56)])).get('MINWAGE').status).toBe('ok');
  });

  it('수정 방향 — 주휴 산정·지급 방법 명시, 209H 인상 문구가 아니다', () => {
    const { n, findings } = run(raw('syn-part-nosched-0002'));
    const a = amendmentMap(n, findings)['MINWAGE'];
    expect(a).toContain('주휴');
    expect(a).not.toContain('209H');
  });
});

describe('B 주휴 포함 시급 — 최저시급 × (소정+주휴)/소정', () => {
  const incl = (rate: number, days = 5, start = '09:00', end = '17:00', basis = 174) =>
    contract(days, start, end, [base(rate * basis, basis, { includes_weekly_holiday: true })]);

  it('주 40H·5일: 10,320 × 48/40 = 12,384 — 12,383 위반', () => {
    const f = run(incl(12383)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('12,384');
  });
  it('주 40H·5일: 12,384 적정', () => {
    expect(run(incl(12384)).get('MINWAGE').status).toBe('ok');
  });
  // 261102 C1: 문구는 판정을 바꾸지 않는다 — 구조화 칸이 비면 B 위반이 아니다.
  // 261102 F6 로 기대값을 바꿈: pay_type 없음 + 산출시간 174H(주휴를 뺀 월 소정)는 시급제·월급제가 갈리지 않아 자료 필요
  // (이전 기대값 risk「주휴수당 포함 여부 확인 필요」 — 그 분기는 review5 C1·review6 F1 이 본다)
  it('「주휴수당 포함」 문구만 있으면 B 가 아니다 — 174H 는 시급제·월급제 확인 필요', () => {
    const c = contract(5, '09:00', '17:00', [base(10320 * 174, 174, { basis_text: '시급 10,320(주휴수당 포함)×174H' })]);
    const f = run(c).get('MINWAGE');
    expect(f.status).toBe('needs_data');
    expect(f.detail).toContain('시급제·월급제 확인 필요');
  });
  it('주 6일 40H 정규직 — 주휴 = 40÷6 ≒ 6.67H, 12,100 적정(÷5 로 보면 위반이 되는 값)', () => {
    const f = run(incl(12100, 6, '09:00', '15:40')).get('MINWAGE');
    expect(f.status).toBe('ok');
  });
  it('주 4일 × 10H — 1일 소정 10H 이지만 주휴는 8H 상한', () => {
    const f = run(incl(12384, 4, '08:00', '18:00')).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('주휴 8H');
    expect(run(incl(12383, 4, '08:00', '18:00')).get('MINWAGE').status).toBe('violation');
  });
  it('단시간 주 15H — 주휴 15÷5 = 3H(통상근로자 주 5일 가정을 밝힌다), 10,320 은 위반', () => {
    const f = run(incl(10320, 3, '09:00', '14:00', 65)).get('MINWAGE');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('5일 가정');
  });
  it('주 15H 미만에 주휴 포함 표시 — 주휴 없음, 배수 1 → 10,320 적정', () => {
    expect(run(incl(10320, 2, '09:00', '16:00', 56)).get('MINWAGE').status).toBe('ok');
  });
});

describe('C 월급제 — 산입 임금 합계 ÷ 법정 월 환산시간', () => {
  const full = (items: WageItem[]) => contract(5, '09:00', '17:00', items);

  it('주 40H → 209H (208.6H 가 아니다)', () => {
    const f = run(full([base(2156880)])).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('209H');
  });
  it('기본급 2,000,000 + 직무수당 200,000 → 합산해 적정', () => {
    const f = run(full([base(2000000), { code: 'OTHER', label: '직무수당', amount: 200000 }])).get('MINWAGE');
    expect(f.status).toBe('ok');
  });
  it('연장수당은 산입하지 않는다', () => {
    const f = run(full([base(2000000), { code: 'OT_WEEKDAY', label: '연장수당', amount: 300000 }])).get('MINWAGE');
    expect(f.status).toBe('violation');
  });
  it('식대를 넣어야만 충족 → 산입 비율 미확인, risk', () => {
    const f = run(full([base(2100000), { code: 'MEAL', label: '식대', amount: 100000 }])).get('MINWAGE');
    expect(f.status).toBe('risk');
  });
  it('단시간 주 20H 월급 → 104H 로 나눈다, 수정 방향도 209H 가 아니다', () => {
    // 월급제라고 밝힌다 — 형태 미상(산출시간·pay_type 없음) 단시간은 위반 대신 「시급제·월급제 확인 필요」(review3 #2)
    const { n, findings } = run(contract(5, '09:00', '13:00', [base(897840)], { pay_type: 'monthly' }));
    const f = findings.find((x) => x.rule_code === 'MINWAGE')!;
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('104H');
    const a = amendmentMap(n, findings)['MINWAGE'];
    expect(a).toContain('104H');
    expect(a).not.toContain('209H');
  });
  it('주 6일 40H 월급 → (40 + 6.67) × 365/7/12 ≒ 203H', () => {
    expect(run(contract(6, '09:00', '15:40', [base(2100000)])).get('MINWAGE').detail).toContain('203H');
  });
  it('산출근거가 주휴 포함 월 시간(209H)이면 월급제로 본다', () => {
    const f = run(raw('syn-fixed-1y-0001')).get('MINWAGE');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('209H');
  });
});

describe('D 포괄임금', () => {
  /** 09~19시(휴게 1H) 주 5일 = 실근로 45H, 연장 주 5H */
  const incl = (items: WageItem[], monthly_total: number | null = null) =>
    contract(5, '09:00', '19:00', items, { inclusive_wage: true, monthly_total });
  const withBreak = (c: Contract) => {
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    return c;
  };

  it('구성항목 있음 — 기본급 ÷ 209H 로 본다(연장수당은 산입 안 함)', () => {
    const ot: WageItem = { code: 'OT_WEEKDAY', label: '고정연장수당', amount: 336000, basis_hours: 32.6, rate_multiplier: 1.5 };
    const low = run(withBreak(incl([base(2000000), ot]))).get('MINWAGE');
    expect(low.status).toBe('violation');
    expect(low.detail).toContain('포괄');
    expect(run(withBreak(incl([base(2156880), ot]))).get('MINWAGE').status).toBe('ok');
  });
  it('총액만 — 총액 ÷ (209H + 연장 5H × 4.345 × 1.5) 로 역산', () => {
    const ok = run(withBreak(incl([], 2500000))).get('MINWAGE');
    expect(ok.status).toBe('ok');
    expect(ok.detail).toContain('241.6H');
    expect(run(withBreak(incl([], 2400000))).get('MINWAGE').status).toBe('violation');
  });
  it('총액만인데 근로시간 정보가 없으면 자료 필요', () => {
    const c = incl([], 2500000);
    c.work_time = { night_work: false };
    expect(run(c).get('MINWAGE').status).toBe('needs_data');
  });
});

describe('정규화 — 휴게 차감 1주 소정근로시간 하나를 모든 규칙이 쓴다', () => {
  it('요일별 근무표 10:00~14:30 에 휴게 12:00~12:30 → 하루 4H, 주 20H', () => {
    const { n } = run(raw('syn-part-ot-0004'));
    expect(n.work_time.weekly_scheduled_hours).toBe(20);
    expect(n.work_time.weekly_scheduled_days).toBe(5);
  });
  it('요일별 소정 20H 인데 실근로가 45H 로 늘어도 단시간으로 본다', () => {
    const c = raw('syn-part-ot-0004');
    delete c.employee.employment_type;
    c.work_time.start = '09:00';
    c.work_time.end = '18:00';
    c.work_time.breaks = [{ from: '12:00', to: '13:00', minutes: 60 }];
    c.work_time.daily_schedules = c.work_time.daily_schedules!.map((s) => ({ ...s, start: '09:00', end: '13:00' }));
    const { n, get } = run(c);
    expect(n.employee.employment_type).toBe('part_time');
    expect(get('PART-TIME-OT').status).toBe('violation');
  });
});

describe('E 단시간 초과근로 — 5인 이상, 금액으로 가산 판정', () => {
  /** 0004 에서 요일별 소정을 10:00~15:30(휴게 30분 차감 5H, 주 25H)으로 → 실근로 35H, 초과 10H(한도 안) */
  const within = (extra: WageItem[] = [], fivePlus: boolean | null = true) => {
    const c = raw('syn-part-ot-0004');
    c.workplace.employee_count_5plus = fivePlus;
    c.work_time.daily_schedules = c.work_time.daily_schedules!.map((s) => ({ ...s, end: '15:30' }));
    c.wage.items = [...c.wage.items!, ...extra];
    return c;
  };
  // 필요액 = 10,320 × 10H × 4.345 × 1.5 = 672,606원
  const ot = (more: Partial<WageItem>): WageItem => ({ code: 'OT_WEEKDAY', label: '초과근로수당', amount: 672606, ...more });

  it('0004(초과 15H) → 위반, 가산 항목 없음도 적는다', () => {
    const f = run(raw('syn-part-ot-0004')).get('PART-TIME-OT');
    expect(f.status).toBe('violation');
    expect(f.detail).toContain('초과 15H > 한도 12H');
    expect(f.statute).toBe('기간제법 §6');
  });
  it('상시 4인 이하 → 비적용 적정', () => {
    const f = run(within([], false)).get('PART-TIME-OT');
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('4인 이하');
    expect(run(raw('syn-part-ot-0004')).get('PART-TIME-OT').detail).not.toContain('전제');
  });
  it('5인 여부 미기재 → 5인 이상 사업장 전제를 밝힌다', () => {
    expect(run(within([], null)).get('PART-TIME-OT').detail).toContain('5인 이상 사업장 전제');
  });
  it('초과 10H + 연장 항목 없음 → 리스크', () => {
    const f = run(within()).get('PART-TIME-OT');
    expect(f.status).toBe('risk');
    expect(f.detail).toContain('초과 10H');
  });
  it('가산율 1.5 + 금액 충분 → 적정', () => {
    expect(run(within([ot({ basis_hours: 43.45, rate_multiplier: 1.5 })])).get('PART-TIME-OT').status).toBe('ok');
  });
  it('가산율 1.0 + 이름 「가산」 → 리스크(이름으로 통과시키지 않는다)', () => {
    const f = run(within([ot({ label: '초과근로 가산수당', rate_multiplier: 1.0, amount: 1000000 })])).get('PART-TIME-OT');
    expect(f.status).toBe('risk');
  });
  it('금액 0 + 「가산」 문구 OTHER → 리스크', () => {
    const item: WageItem = { code: 'OTHER', label: '초과근로 가산수당', amount: 0, basis_text: '소정 초과 시 통상임금 50% 가산' };
    expect(run(within([item])).get('PART-TIME-OT').status).toBe('risk');
  });
  it('「1.5배」 문구 + 가산율 칸 비어 있음 + 금액 충분 → 적정(거짓 리스크 없음)', () => {
    const f = run(within([ot({ basis_text: '초과근로 시간 × 시급 × 1.5배' })])).get('PART-TIME-OT');
    expect(f.status).toBe('ok');
  });
  it('가산율·시간 없는 연장 항목(사이트 폼 모양) + 금액 부족 → 자료 필요, OT-RATE 문구와 겹치지 않는다', () => {
    const f = run(within([{ code: 'OT_WEEKDAY', label: '연장수당', amount: 100000 }])).get('PART-TIME-OT');
    expect(f.status).toBe('needs_data');
    expect(f.detail).not.toContain('가산율 미표기');
  });
  it('금액 부족(가산율 1.5 명시) → 리스크', () => {
    expect(run(within([ot({ amount: 400000, rate_multiplier: 1.5, basis_hours: 25.8 })])).get('PART-TIME-OT').status).toBe('risk');
  });
  it('수정 방향 — 50% 가산 문구', () => {
    const { n, findings } = run(within());
    expect(amendmentMap(n, findings)['PART-TIME-OT']).toContain('50%');
  });
});
