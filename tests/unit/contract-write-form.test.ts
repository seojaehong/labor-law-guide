// 근로계약서 작성 — 파트·야간·5명 미만·수습·기간제·실수령액 역산(261103 전수 개선).
// 화면 입력(WriteForm) → 설계 → 점검 되먹임 → 계약서 본문까지 한 줄로 본다. 값은 모두 합성.
import { describe, expect, it } from 'vitest';

import { calcTakeHomePay, takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import { checkWritten, designFromForm, nightHoursOf, reviewWritten, toContract, type WriteForm } from '@/lib/contract-write/contract';
import { buildContractDocument, documentLines } from '@/lib/contract-write/document';
import { netToGross } from '@/lib/contract-write/net-gross';
import { bannedHits } from '@/lib/tool-kit/banned';
import { checkContract } from '@/lib/contract-check/engine';
import { normalize } from '@/lib/contract-check/normalize';

const MONTHLY: WriteForm = {
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  employeeCount5plus: true,
  employeeName: '합성01',
  startDate: '2026-11-01',
  endDate: null,
  location: '합성테스트 본점',
  duty: '홀 서비스',
  workDays: ['월', '화', '수', '목', '금'],
  start: '10:00',
  end: '22:30',
  breakMinutes: 150,
  weeklyRestDay: '일',
  writtenDate: '2026-10-25',
  monthlyTotal: 3_300_000,
  holidayDaysPerYear: 18.75,
  payday: '매월 10일',
  paymentMethod: '근로자 명의 계좌이체',
};

// 수원 파트 양식 a — 평일 11:00~17:00 · 휴게 30분 · 시간당 13,000원
const PART: WriteForm = {
  ...MONTHLY,
  payType: 'hourly',
  hourlyWage: 13_000,
  monthlyTotal: undefined,
  start: '11:00',
  end: '17:00',
  breakMinutes: 30,
  holidayDaysPerYear: 16,
  duty: '홀 보조',
};

const text = (form: WriteForm) => documentLines(buildContractDocument(form, designFromForm(form))).join('\n');

describe('야간시간', () => {
  it('22:00~06:00 과 겹친 시간(자정 넘김 포함)', () => {
    expect(nightHoursOf({ start: '10:00', end: '22:30', breakMinutes: 0 })).toBeCloseTo(0.5, 10);
    expect(nightHoursOf({ start: '18:00', end: '02:00', breakMinutes: 0 })).toBeCloseTo(4, 10);
    expect(nightHoursOf({ start: '05:00', end: '14:00', breakMinutes: 0 })).toBeCloseTo(1, 10);
    expect(nightHoursOf({ start: '09:00', end: '18:00', breakMinutes: 0 })).toBe(0);
    expect(nightHoursOf({ start: '21:00', end: '07:00', breakMinutes: 0 })).toBeCloseTo(8, 10);
  });
});

describe('월급제 야간 → 점검·본문', () => {
  it('야간근로수당 항목이 생기고 점검에서 손볼 것이 없다', () => {
    const design = designFromForm(MONTHLY);
    expect(design.items.map((i) => i.key)).toContain('night');
    const contract = toContract(MONTHLY, design);
    expect(contract.work_time.night_work).toBe(true);
    expect(contract.wage.items!.some((i) => i.code === 'NIGHT')).toBe(true);
    expect(checkWritten(MONTHLY, design)).toEqual([]);
    expect(text(MONTHLY)).toContain('야간근로수당');
  });

  it('5명 미만이면 가산 항목 없이 점검을 통과하고 본문에 가산·연차 미적용을 적는다', () => {
    const form = { ...MONTHLY, employeeCount5plus: false };
    const design = designFromForm(form);
    expect(design.items.map((i) => i.key)).toEqual(['base', 'overtime']);
    expect(checkWritten(form, design)).toEqual([]);
    expect(text(form)).toContain('상시 5명 미만');
  });
});

describe('시급·일급 파트 → 점검·본문', () => {
  it('일 지급액 78,000원을 나누고 점검에서 손볼 것이 없다', () => {
    const design = designFromForm(PART);
    expect(design.period).toBe('day');
    expect(design.total).toBe(78_000);
    expect(checkWritten(PART, design)).toEqual([]);
    const t = text(PART);
    expect(t).toContain('78,000원');
    expect(t).toContain('주휴수당');
    expect(t).toContain('하루 인정시간');
  });

  it('주 15시간 미만이면 주휴·연차를 넣지 않고 본문에 그 사유를 적는다', () => {
    const form: WriteForm = { ...PART, workDays: ['토', '일'] };
    const design = designFromForm(form);
    expect(design.hours.weeklyHoliday).toBe(0);
    expect(checkWritten(form, design)).toEqual([]);
    expect(text(form)).toContain('제18조 제3항');
  });

  it('시간당 지급액이 낮아 통상시급이 최저 아래면 점검이 최저임금 위반을 낸다(자기시험)', () => {
    const form = { ...PART, hourlyWage: 10_320 };
    const codes = checkWritten(form, designFromForm(form)).map((f) => `${f.rule_code}:${f.status}`);
    expect(codes).toContain('MINWAGE:violation');
  });

  it('본문·표에 금지어가 없다', () => {
    expect(bannedHits(text(PART))).toEqual([]);
    expect(text(PART)).not.toContain('포괄');
  });
});

describe('수습', () => {
  const PROB: WriteForm = { ...MONTHLY, probation: { months: 3, reduced: true, simpleLabor: false } };

  it('감액 수습은 90%와 최저임금 바닥을 본문에 적고, 점검 수습 규칙이 통과한다', () => {
    const t = text(PROB);
    expect(t).toContain('수습기간: 계약 시작일부터 3개월');
    expect(t).toContain('100분의 90');
    expect(t).toContain('2,970,000원');
    const findings = checkWritten(PROB, designFromForm(PROB));
    expect(findings.find((f) => f.rule_code === 'MINWAGE-PROBATION')).toBeUndefined();
  });

  it('단순노무 업무는 감액할 수 없다', () => {
    expect(() => designFromForm({ ...PROB, probation: { months: 3, reduced: true, simpleLabor: true } })).toThrow(/단순노무/);
  });

  it('1년 미만 기간제는 감액할 수 없다(최저임금법 제5조 제2항)', () => {
    expect(() => designFromForm({ ...PROB, endDate: '2027-10-30' })).toThrow(/1년/);
    expect(() => designFromForm({ ...PROB, endDate: '2027-10-31' })).not.toThrow();
  });

  it('감액 없는 수습은 기간만 적는다', () => {
    const t = text({ ...MONTHLY, probation: { months: 2, reduced: false, simpleLabor: false } });
    expect(t).toContain('수습기간: 계약 시작일부터 2개월');
    expect(t).not.toContain('100분의 90');
  });
});

describe('기간제 + 소수 통상시급 표본', () => {
  const FIXED: WriteForm = {
    ...MONTHLY,
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    monthlyTotal: 2_345_678,
    holidayDaysPerYear: 0,
    startDate: '2026-04-01',
    writtenDate: '2026-03-30',
    endDate: '2027-03-31',
  };

  it('통상시급을 소수 둘째 자리로 적고, 계약기간을 적고, 점검에서 손볼 것이 없다', () => {
    const design = designFromForm(FIXED);
    expect(design.totalHours).toBeCloseTo(217, 10);
    const rate = (Math.round((2_345_678 / 217) * 100) / 100).toLocaleString('ko-KR', { minimumFractionDigits: 2 });
    const t = text(FIXED);
    expect(t).toContain(`통상시급: ${rate}원`);
    expect(t).toContain('2026년 4월 1일부터 2027년 3월 31일까지');
    expect(checkWritten(FIXED, design)).toEqual([]);
  });
});

describe('실수령액 → 월 총액', () => {
  const rates = takeHomeRatesOn('2026-11-01')!;
  const take = (pay: number) => {
    const r = calcTakeHomePay({ pay, family: 1 }, rates);
    if (r.status !== 'ok') throw new Error('표 밖');
    return r.takeHome;
  };

  it('찾은 총액의 실수령액은 목표 이상이고, 1원 적으면 목표 아래다', () => {
    for (const net of [2_000_000, 2_345_670, 2_900_000]) {
      const r = netToGross(net, { family: 1, date: '2026-11-01' });
      expect(take(r.gross)).toBeGreaterThanOrEqual(net);
      expect(take(r.gross - 1)).toBeLessThan(net);
      expect(r.takeHome).toBe(take(r.gross));
    }
  });

  it('총액을 실수령액으로 바꿨다가 되돌리면 원래 총액 이하가 나온다', () => {
    const net = take(3_200_000);
    expect(netToGross(net, { family: 1, date: '2026-11-01' }).gross).toBeLessThanOrEqual(3_200_000);
  });

  it('요율이 없는 날짜는 오류', () => {
    expect(() => netToGross(2_000_000, { family: 1, date: '1999-01-01' })).toThrow();
  });
});

// #139 적대 검토 1 — 주 6일 근무: 1주 40시간을 넘는 시간을 연장으로 설계하고, 점검 엔진이 계산한 1주 연장과 같아야 한다
describe('주 6일 — 1주 40시간 넘는 연장', () => {
  const SIX: WriteForm = {
    ...MONTHLY,
    workDays: ['월', '화', '수', '목', '금', '토'],
    start: '09:00',
    end: '18:00',
    breakMinutes: 60,
    monthlyTotal: 3_000_000,
    holidayDaysPerYear: 0,
  };
  it('설계 연장 = 엔진 weekly_overtime_hours(8시간) × 1.5 × 4.345, 점검에서 손볼 것이 없다', () => {
    const design = designFromForm(SIX);
    const [contract] = normalize([toContract(SIX, design)]);
    expect(contract.work_time?.weekly_overtime_hours).toBe(8);
    expect(design.hours.overtime).toBeCloseTo(8 * 1.5 * 4.345, 6);
    expect(checkWritten(SIX, design)).toEqual([]);
  });
  it('본문은 1주 소정 40시간과 그것을 넘는 연장을 함께 적는다(하루 8시간 × 6일 = 48시간과 어긋나지 않게)', () => {
    const t = text(SIX);
    expect(t).toContain('1주 40시간을 넘는');
    expect(t).toContain('1주 8시간');
    expect(t).not.toMatch(/하루 8시간, 1주 40시간/);
  });
});

// #139 적대 검토 2·8 — 계약서에 없는 사실(서명·교부·주휴일 특정)을 상수로 넘기지 않는다. 작성일은 입력에서
describe('toContract — 상수 대신 입력에서', () => {
  it('서명·교부 여부는 모른다(null), 작성일은 작성일 칸', () => {
    const c = toContract({ ...MONTHLY, writtenDate: '2026-10-20' }, designFromForm(MONTHLY));
    expect(c.signatures).toEqual({ written_date: '2026-10-20', employer_signed: null, employee_signed: null, copy_delivered_confirmed: null });
  });
  it('입사 후 31일 넘겨 작성하면 점검이 소급 작성을 짚는다(자기시험)', () => {
    const late = { ...MONTHLY, writtenDate: '2026-12-15' };
    expect(checkWritten(late, designFromForm(late)).map((f) => f.rule_code)).toContain('WRITTEN-TERMS');
  });
  it('본문 서명 날짜 = 작성일', () => {
    expect(text({ ...MONTHLY, writtenDate: '2026-10-20' })).toContain('2026년 10월 20일');
  });
  it('연차 미리 지급 시간 = 설계 연차 시간(월)', () => {
    const design = designFromForm(MONTHLY);
    expect(toContract(MONTHLY, design).holidays_leave!.annual_leave_prepaid_hours_per_month).toBeCloseTo(design.hours.leave, 6);
    const pd = designFromForm(PART);
    expect(toContract(PART, pd).holidays_leave!.annual_leave_prepaid_hours_per_month).toBeCloseTo(pd.hours.leave * 5 * 4.345, 6);
  });
  it('연차 조항은 본문과 같은 문장 — 5명 미만이면 「적용하지 않는다」', () => {
    const small = { ...MONTHLY, employeeCount5plus: false };
    const c = toContract(small, designFromForm(small));
    expect(c.holidays_leave!.annual_leave_clause).toContain('적용하지 않는다');
    expect(text(small)).toContain(c.holidays_leave!.annual_leave_clause!);
  });
  it('주휴일은 요일로 받고 계약서에 「매주 ○요일」로 적는다', () => {
    const c = toContract(MONTHLY, designFromForm(MONTHLY));
    expect(c.holidays_leave!.weekly_rest).toBe('주휴일: 매주 일요일(유급)');
    expect(c.holidays_leave!.weekly_rest_day_specified).toBe(true);
  });
});

// #139 적대 검토 5 — 최저임금 줄은 설계 검사가 아니라 점검 규칙 MINWAGE 판정에서. 표에 없는 해는 마지막 해로 대신하지 않는다
describe('최저임금 한 줄(점검 규칙에서)', () => {
  const line = (form: WriteForm) => reviewWritten(form, designFromForm(form)).minimumWage;
  it('충족이면 그해 최저시급 이상', () => {
    expect(line(MONTHLY)).toEqual({ text: expect.stringContaining('(2026년 최저시급 10,320원 이상)'), warn: false });
  });
  it('미달이면 낮다고 말하고 손볼 것에 최저임금 위반', () => {
    const low = { ...MONTHLY, monthlyTotal: 2_000_000 };
    expect(line(low)).toEqual({ text: expect.stringContaining('2026년 최저시급 10,320원보다 낮습니다'), warn: true });
    expect(checkWritten(low, designFromForm(low)).map((f) => `${f.rule_code}:${f.status}`)).toContain('MINWAGE:violation');
  });
  it('2027년은 10,700원(최저임금 고시 2026. 8. 5.)', () => {
    const y = { ...MONTHLY, startDate: '2027-01-04', writtenDate: '2027-01-02' };
    expect(line(y).text).toContain('2027년 최저시급 10,700원');
  });
  it('표에 없는 해(2028)는 「미등록」 — 다른 해 값으로 비교하지 않는다', () => {
    const y = { ...MONTHLY, startDate: '2028-01-03', writtenDate: '2028-01-02' };
    expect(line(y)).toEqual({ text: expect.stringContaining('2028년 최저시급 미등록'), warn: true });
  });
  it('1주 연장 12시간 초과는 점검 규칙이 짚는다(주 5일 × 하루 11시간 = 15시간)', () => {
    const long = { ...MONTHLY, start: '09:00', end: '21:00', breakMinutes: 60 };
    expect(checkWritten(long, designFromForm(long)).map((f) => f.rule_code)).toContain('WH-52CAP');
  });
  it('점검 규칙 글에 「포괄」이 나오지 않는다', () => {
    const odd = { ...MONTHLY, monthlyTotal: 1_000_000 };
    for (const f of checkWritten(odd, designFromForm(odd))) expect(f.detail).not.toContain('포괄');
  });
});

// #139 적대 검토 10 — 「월 평균」 자리에 연 일수(19일)를 적었다. 월 평균 일수를 적고, 점검 규칙도 그 일수를 읽는다
describe('공휴일 메모(HOLIDAY-COVER 입력)', () => {
  it('월 평균 일수 = 연 18.75일 ÷ 12 = 1.56일, 점검 결과 글에도 1.56일', () => {
    const design = designFromForm(MONTHLY);
    const c = toContract(MONTHLY, design);
    expect(c.wage.public_holiday_note).toMatch(/월 평균 1\.56일\/\d+(\.\d+)?H/);
    const [n] = normalize([c]);
    const f = checkContract(n).find((x) => x.rule_code === 'HOLIDAY-COVER')!;
    expect(f.status).toBe('ok');
    expect(f.detail).toContain('공휴일 1.56일');
  });
});

// 재홍님 261103 — 파트 계약에서 결근한 주의 주휴를 뺄지 말지 고른다(기본 = 뺀다, 근로기준법 제55조 제1항·시행령 제30조 제1항)
describe('파트 결근 주 주휴', () => {
  it('기본은 결근한 주에 미리 준 주휴수당을 공제한다고 적는다', () => {
    const t = text(PART);
    expect(t).toContain('결근한 주에는 그 주 근무일에 미리 지급한 주휴수당을 그 달 임금에서 공제한다');
  });
  it('공제하지 않음을 고르면 그렇게 적는다', () => {
    const t = text({ ...PART, absentWeekHoliday: 'keep' });
    expect(t).toContain('결근한 주에도 그 주 근무일에 지급한 주휴수당은 공제하지 않는다');
    expect(t).not.toContain('그 달 임금에서 공제한다');
  });
  it('주휴가 없는 경우(월급제·주 15시간 미만)에는 이 문장을 넣지 않는다', () => {
    expect(text(MONTHLY)).not.toContain('결근한 주');
    const under15 = { ...PART, workDays: ['토', '일'], weeklyRestDay: '월' as const };
    expect(text(under15)).not.toContain('결근한 주');
  });
});
