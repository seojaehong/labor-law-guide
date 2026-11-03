// 근로계약서 작성 — PR #140 전수 검토(기준 2511fe4) 1·2·3·4·5·8번과 「추가 경계 입력」.
// 재현값은 검토 댓글 그대로다. 값은 모두 합성.
import { describe, expect, it } from 'vitest';

import { amountInput, INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';
import type { Contract } from '@/lib/contract-check/types';
import { checkWritten, dailyWorkHours, designFromForm, nightHoursOf, reviewWritten, toContract, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument, documentLines } from '@/lib/contract-write/document';
import { bannedHits } from '@/lib/tool-kit/banned';

const BASE: WriteForm = {
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-11-04',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  workDays: ['월', '화', '수', '목', '금'],
  start: '09:00',
  end: '18:00',
  breakMinutes: 60,
  weeklyRestDay: '일',
  writtenDate: '2026-11-03',
  monthlyTotal: 3_000_000,
  holidayDaysPerYear: 0,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

const text = (form: WriteForm) => documentLines(buildContractDocument(form, designFromForm(form))).join('\n');
const codes = (form: WriteForm) => checkWritten(form, designFromForm(form)).map((f) => `${f.rule_code}:${f.status}`);

// 1 — 주 15시간 미만 월급제: 제4·6조가 주휴·연차 미적용이면 표에도 연차·휴일수당·「주휴 포함」이 없어야 한다(근로기준법 제18조 제3항)
describe('검토 1 · 주 15시간 미만 월급제', () => {
  const UNDER15: WriteForm = { ...BASE, monthlyTotal: 1_000_000, workDays: ['월', '화'], start: '09:00', end: '15:30', breakMinutes: 30, holidayDaysPerYear: 16 };

  it('표에 연차·휴일수당이 없고 기본급이 총액 전부다', () => {
    const design = designFromForm(UNDER15);
    expect(design.hours.leave).toBe(0);
    expect(design.hours.holiday).toBe(0);
    expect(design.items.map((i) => i.key)).toEqual(['base', 'overtime']);
    const base = design.items.find((i) => i.key === 'base')!;
    expect(base.hours).toBeCloseTo(12 * 4.345, 6);
    expect(base.amount).toBe(1_000_000);
    expect(base.label).toBe('기본급');
  });

  it('본문 표·산정 기준에 「주휴」가 없고, 제4·6조는 미적용 사유를 적는다', () => {
    const t = text(UNDER15);
    expect(t).not.toContain('주휴 포함');
    expect(t).not.toContain('소정근로 + 주휴');
    expect(t).not.toContain('연차수당');
    expect(t).not.toContain('휴일근로수당');
    expect(t).toContain('제18조 제3항');
  });

  it('점검 입력의 기본급은 주휴를 담지 않고, 점검에서 손볼 것이 없다', () => {
    const design = designFromForm(UNDER15);
    const base = toContract(UNDER15, design).wage.items!.find((i) => i.code === 'BASE')!;
    expect(base.includes_weekly_holiday).toBe(false);
    expect(checkWritten(UNDER15, design)).toEqual([]);
  });

  it('주 15시간 이상이면 그대로(주휴 포함 기본급·연차·휴일 항목)', () => {
    const over = { ...UNDER15, workDays: ['월', '화', '수'] };
    const design = designFromForm(over);
    expect(design.items.find((i) => i.key === 'base')!.label).toBe('기본급(주휴 포함)');
    expect(design.hours.leave).toBeGreaterThan(0);
    expect(design.hours.holiday).toBeGreaterThan(0);
  });
});

// 2 — 근무 전체가 22~06시면 휴게도 야간 구간 안이다. 야간시간은 실근로를 넘지 않는다
describe('검토 2 · 야간시간 ≤ 실근로', () => {
  const NIGHT: WriteForm = { ...BASE, start: '22:00', end: '06:00', breakMinutes: 60, weeklyRestDay: '일' };

  it('22:00~06:00 휴게 60분 → 야간 7시간, 월 야간 인정시간 7 × 0.5 × 5 × 4.345 = 76.0375', () => {
    expect(nightHoursOf(NIGHT)).toBeCloseTo(7, 10);
    const design = designFromForm(NIGHT);
    expect(design.hours.night).toBeCloseTo(76.0375, 6);
    expect(checkWritten(NIGHT, design)).toEqual([]);
  });

  it('섞인 시간대는 휴게를 야간 밖에 둘 수 있으면 겹친 시간 그대로(21:00~07:00 휴게 60분 → 8)', () => {
    expect(nightHoursOf({ start: '21:00', end: '07:00', breakMinutes: 60 })).toBeCloseTo(8, 10);
    // 낮 구간(21~22·06~07 = 2시간)이 휴게(150분)보다 짧으면 실근로가 상한
    expect(nightHoursOf({ start: '21:00', end: '07:00', breakMinutes: 150 })).toBeCloseTo(7.5, 10);
  });

  it('어느 근무형태든 야간시간은 하루 실근로를 넘지 않는다', () => {
    const shapes: Array<[string, string, number]> = [
      ['22:00', '06:00', 60],
      ['23:00', '05:00', 30],
      ['20:00', '08:00', 120],
      ['18:00', '02:00', 60],
      ['10:00', '22:30', 150],
    ];
    for (const [start, end, breakMinutes] of shapes) {
      expect(nightHoursOf({ start, end, breakMinutes })).toBeLessThanOrEqual(dailyWorkHours({ start, end, breakMinutes }) + 1e-9);
    }
  });
});

// 3 — 기간제 2년 초과 위험은 화면에서 지우지 않는다(예외가 있어 「확인 필요」로)
describe('검토 3 · 기간제 2년 초과', () => {
  const LONG: WriteForm = { ...BASE, startDate: '2026-11-04', endDate: '2029-11-03' };

  it('계약기간 3년 → 손볼 것에 FIXED-TERM-2Y 가 남고, 예외를 말하며 단정하지 않는다', () => {
    const f = checkWritten(LONG, designFromForm(LONG)).find((x) => x.rule_code === 'FIXED-TERM-2Y');
    expect(f).toBeDefined();
    expect(f!.detail).toContain('확인');
    expect(f!.detail).toContain('기간제법 제4조');
    expect(f!.detail).toMatch(/고령자|사업의 완료/);
    expect(f!.detail).not.toMatch(/불법|위법/);
    expect(bannedHits(f!.detail ?? '')).toEqual([]);
  });

  it('2년 이내 기간제는 그대로 손볼 것이 없다', () => {
    const short = { ...LONG, endDate: '2028-11-03' };
    expect(codes(short)).not.toContain('FIXED-TERM-2Y:risk');
  });
});

// 4 — 상시 5명 미만은 주 52시간 상한(근로기준법 제50조·제53조)이 적용되지 않는다(시행령 제7조 별표 1)
describe('검토 4 · 5명 미만 주 52시간', () => {
  const LONG_WEEK: WriteForm = {
    ...BASE,
    employeeCount5plus: false,
    monthlyTotal: 4_000_000,
    workDays: ['월', '화', '수', '목', '금', '토'],
    start: '09:00',
    end: '19:00',
    breakMinutes: 60,
  };

  it('5명 미만 성인 주 54시간 → WH-52CAP 를 손볼 것으로 내지 않는다', () => {
    expect(codes(LONG_WEEK).some((c) => c.startsWith('WH-52CAP'))).toBe(false);
  });

  it('같은 근무가 5명 이상이면 위반 그대로', () => {
    expect(codes({ ...LONG_WEEK, employeeCount5plus: true })).toContain('WH-52CAP:violation');
  });
});

// 5 — 수습 기간(6개월)과 감액 기간(처음 3개월)을 따로 넘긴다
describe('검토 5 · 수습 기간과 감액 기간', () => {
  const PROB6: WriteForm = { ...BASE, probation: { months: 6, reduced: true, simpleLabor: false } };

  it('문서는 「수습 6개월, 처음 3개월 감액」이고 점검도 그 3개월로 본다', () => {
    const t = text(PROB6);
    expect(t).toContain('수습기간: 계약 시작일부터 6개월');
    expect(t).toContain('수습을 시작한 날부터 3개월 동안');
    const contract = toContract(PROB6, designFromForm(PROB6));
    expect(contract.period.probation).toMatchObject({ months: 6, reduced_months: 3, wage_rate_pct: 90 });
    expect(codes(PROB6).filter((c) => c.startsWith('MINWAGE-PROBATION'))).toEqual([]);
  });

  it('감액하지 않는 수습은 감액 기간을 넘기지 않는다', () => {
    const contract = toContract({ ...PROB6, probation: { months: 6, reduced: false, simpleLabor: false } }, designFromForm(BASE));
    expect(contract.period.probation?.reduced_months ?? null).toBeNull();
  });
});

describe('검토 5 · 점검 규칙 MINWAGE-PROBATION', () => {
  const contract = (probation: NonNullable<Contract['period']>['probation']): Contract => ({
    contract_id: 'syn-probation',
    workplace: { name: '합성테스트 사업장', employee_count_5plus: true },
    employee: { name: '합성01', hire_date: '2026-03-01' },
    period: { start_date: '2026-03-01', indefinite: true, probation },
    work_time: {},
    wage: {},
    signatures: { written_date: '2026-03-01' },
  });
  const status = (c: Contract) => checkContract(normalize([c])[0]).find((f) => f.rule_code === 'MINWAGE-PROBATION')!;

  it('감액 기간을 따로 적으면 그 기간으로 본다(수습 6개월 · 감액 3개월 → 적정)', () => {
    const f = status(contract({ applied: true, months: 6, reduced_months: 3, wage_rate_pct: 90 }));
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('6개월');
    expect(f.detail).toContain('3개월');
  });

  it('감액 기간이 3개월을 넘으면 위반', () => {
    expect(status(contract({ applied: true, months: 6, reduced_months: 4, wage_rate_pct: 90 })).status).toBe('violation');
  });

  it('감액 기간을 적지 않은 계약(점검 화면·사진 추출)은 기존대로 수습 기간 전체를 감액 기간으로 본다', () => {
    expect(status(contract({ applied: true, months: 6, wage_rate_pct: 90 })).status).toBe('violation');
    expect(status(contract({ applied: true, months: 3, wage_rate_pct: 90 })).status).toBe('ok');
  });
});

// 8 — 다음 해까지 이어지는 계약은 그 해 최저시급과도 비교한다(시작 연도만 보지 않는다)
describe('검토 8 · 계약 기간에 걸친 해의 최저임금', () => {
  // 주 40시간 · 공휴일 0일 → 월 인정시간 209 + 연차 8 = 217, 2,278,500 ÷ 217 = 10,500
  const SPAN: WriteForm = { ...BASE, startDate: '2026-12-01', endDate: '2027-12-31', writtenDate: '2026-11-30', monthlyTotal: 2_278_500 };
  const review = (form: WriteForm) => reviewWritten(form, designFromForm(form));

  it('통상시급 10,500원 — 2026년은 이상, 2027년(10,700원)부터 조정이 필요하다고 안내한다', () => {
    const r = review(SPAN);
    expect(designFromForm(SPAN).rate).toBeCloseTo(10_500, 6);
    expect(r.minimumWage.text).toContain('2026년 최저시급 10,320원 이상');
    expect(r.minimumWageLater).toHaveLength(1);
    expect(r.minimumWageLater[0]).toEqual({ text: expect.stringContaining('2027년 최저시급 10,700원'), warn: true });
    expect(r.minimumWageLater[0].text).toContain('2027년 1월 1일부터');
    expect(r.minimumWageLater[0].text).not.toMatch(/불법|위법/);
    expect(bannedHits(r.minimumWageLater[0].text)).toEqual([]);
  });

  it('기간의 정함이 없는 계약도 등록된 다음 해와 비교한다', () => {
    expect(review({ ...SPAN, endDate: null }).minimumWageLater.map((l) => l.text).join()).toContain('2027년 최저시급 10,700원');
  });

  it('그 해 안에 끝나는 계약은 다음 해를 보지 않는다', () => {
    expect(review({ ...SPAN, endDate: '2026-12-31' }).minimumWageLater).toEqual([]);
  });

  it('다음 해 최저시급 이상이면 안내하지 않는다', () => {
    expect(review({ ...SPAN, monthlyTotal: 2_400_000 }).minimumWageLater).toEqual([]);
  });

  it('계약 기간에 걸친 미등록 해(2028)는 「미등록」이라 적고 다른 해 값으로 비교하지 않는다', () => {
    const later = review({ ...SPAN, monthlyTotal: 2_400_000, endDate: '2028-06-30' }).minimumWageLater;
    expect(later).toEqual([{ text: expect.stringContaining('2028년 최저시급 미등록'), warn: false }]);
  });

  it('시급·일급 파트도 같은 점검 규칙으로 다음 해와 비교한다(수원 파트 a: 시간당 13,000원 → 통상시급 약 10,599원)', () => {
    const part: WriteForm = { ...BASE, payType: 'hourly', hourlyWage: 13_000, monthlyTotal: undefined, start: '11:00', end: '17:00', breakMinutes: 30, holidayDaysPerYear: 16 };
    const design = designFromForm(part);
    expect(design.rate).toBeGreaterThan(10_320);
    expect(design.rate).toBeLessThan(10_700);
    expect(review(part).minimumWageLater.map((l) => l.text).join()).toContain('2027년 최저시급 10,700원');
    expect(review({ ...part, hourlyWage: 14_000 }).minimumWageLater).toEqual([]);
  });

  it('미등록 해가 여럿이면 한 줄로 적는다(3년 기간제 2026~2029 → 2028·2029년)', () => {
    const later = review({ ...SPAN, startDate: '2026-11-04', endDate: '2029-11-03', monthlyTotal: 3_000_000 }).minimumWageLater;
    expect(later).toEqual([{ text: expect.stringContaining('2028·2029년 최저시급 미등록'), warn: false }]);
  });
});

// 추가 경계 입력 — 극소액 + 단위 올림, 소수점 금액
describe('경계 · 단위 올림 뒤 잔액', () => {
  it('올린 항목 합이 총액을 넘어 기본급이 음수가 되면 계약서를 만들지 않고 이유를 말한다(월급제)', () => {
    const tiny: WriteForm = { ...BASE, start: '10:00', end: '22:30', breakMinutes: 150, holidayDaysPerYear: 16, monthlyTotal: 300, rounding: 'ceil100' };
    expect(() => designFromForm(tiny)).toThrow(/100원 단위/);
  });

  it('시급·일급 파트도 같다', () => {
    const tiny: WriteForm = { ...BASE, payType: 'hourly', hourlyWage: 1, monthlyTotal: undefined, start: '11:00', end: '17:00', breakMinutes: 30, holidayDaysPerYear: 16, rounding: 'ceil10' };
    expect(() => designFromForm(tiny)).toThrow(/10원 단위/);
  });

  it('정상 금액은 그대로 만든다(잔액이 음수가 아니다)', () => {
    const design = designFromForm({ ...BASE, rounding: 'ceil100', holidayDaysPerYear: 16 });
    expect(design.items.every((i) => i.amount >= 0)).toBe(true);
  });
});

describe('경계 · 소수점 금액 입력', () => {
  const OK: WriteState = {
    ...INITIAL,
    workplaceName: '합성테스트 사업장',
    employeeName: '합성01',
    startDate: '2026-11-01',
    location: '합성테스트 본점',
    duty: '홀 서비스',
    monthlyTotal: '2,600,000',
  };
  const parse = (p: Partial<WriteState>) => toWriteForm({ ...OK, ...p }, '2026-11-03');

  it.each<[string, Partial<WriteState>, string]>([
    ['월 임금 총액', { monthlyTotal: '2,600,000.5' }, '월 임금 총액'],
    ['시간당 지급액', { payType: 'hourly', hourlyWage: '10,500.5' }, '시간당 지급액'],
    ['월 실수령액', { amountMode: 'net', netPay: '2,300,000.7' }, '월 실수령액'],
  ])('%s에 소수점이 있으면 금액을 바꾸지 않고 원 단위로 다시 넣어 달라고 한다', (_, patch, label) => {
    const r = parse(patch);
    expect(r.form).toBeNull();
    expect(r.error).toContain('원 단위');
    expect(r.error).toContain(label);
  });

  it('입력 거르개는 소수점을 지우지 않는다(「10,500.5」가 「105,005」로 바뀌지 않게)', () => {
    expect(amountInput('10,500.5원')).toBe('10,500.5');
    expect(parse({ payType: 'hourly', hourlyWage: amountInput('10,500.5') }).error).toContain('원 단위');
  });

  it('쉼표 붙은 정수 금액은 그대로 읽는다', () => {
    expect(parse({}).form?.monthlyTotal).toBe(2_600_000);
    expect(parse({ payType: 'hourly', hourlyWage: '10,500' }).form?.hourlyWage).toBe(10_500);
  });

  it('연장·휴일·연차 인정시간은 소수를 그대로 받는다', () => {
    expect(parse({ overtimeHours: '65.2' }).form?.overrides?.overtimeHours).toBe(65.2);
  });
});
