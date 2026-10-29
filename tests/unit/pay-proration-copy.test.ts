import { describe, expect, it } from 'vitest';
import { calcAbsence, calcProration, type ProrationInput } from '@/lib/calc/pay-proration';
import { absenceEffectLines, absenceHeadline, absenceRowLines, allCopy, effectLines, formulaLines, headline, referenceLines } from '@/app/tools/pay-proration/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

// 급여 일할계산기의 문장. 합성 입력만 쓴다.
// 법은 일할 방식을 정하지 않는다 — 방식 하나를 고르는 문장(유리한 쪽·작은 쪽·가정)을 쓰지 않고, 갈리는 값은 나란히 둔다.

const BASE = 2_508_000;
const C1: ProrationInput = { month: '2026-03', monthlyPay: BASE, start: '2026-03-16', fivePlus: true, holidays: ['2026-03-02'] };
const C3A: ProrationInput = { month: '2026-02', monthlyPay: BASE, end: '2026-02-13', fivePlus: true };
const C4: ProrationInput = { month: '2026-12', monthlyPay: BASE, end: '2026-12-30', fivePlus: true, holidays: ['2026-12-25'] };
const C5_4: ProrationInput = { month: '2026-02', monthlyPay: BASE, start: '2026-02-02', fivePlus: false, holidays: ['2026-02-16', '2026-02-17', '2026-02-18'] };
const C6: ProrationInput = { month: '2026-03', monthlyPay: BASE, start: '2026-03-18', fivePlus: true, holidays: ['2026-03-01', '2026-03-02'] };
const R: ProrationInput = { month: '2026-03', monthlyPay: 2_500_000, start: '2026-03-16', fivePlus: true, payslip: 1_339_632 };
const LOW: ProrationInput = { month: '2026-03', monthlyPay: 2_090_000, start: '2026-03-16', fivePlus: true };
const Y25: ProrationInput = { month: '2025-03', monthlyPay: BASE, start: '2025-03-17', fivePlus: true };
const FULLM: ProrationInput = { month: '2026-03', monthlyPay: BASE, fivePlus: true };
const results = [C1, C3A, C4, C5_4, C6, R, LOW, Y25, FULLM].map(calcProration);
const A1 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-18'] });
const A6 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: [], lateHours: 8, companyDeduction: 192_000, avgDailyWage: 7_524_000 / 92 });
const A6_4 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: false, absences: [], lateHours: 8, companyDeduction: 192_000 });
const NEXT = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-30'], companyDeduction: 50_000 });
const DEC = calcAbsence({ month: '2026-12', monthlyPay: BASE, fivePlus: true, absences: ['2026-12-16'], companyDeduction: 80_903 });
const absences = [A1, A6, A6_4, NEXT, DEC];
const text = (xs: string[]) => xs.join(' ');

describe('급여 일할 — 답 문장', () => {
  it('회사 기준을 모르면 방식별 값의 폭과 근거, 회사에 물어볼 문장', () => {
    const r = calcProration(C1);
    expect(headline(r, 'unknown')[0]).toBe('일할 방식에 따라 3월 급여는 1,254,000원에서 1,433,142.86원까지 갈립니다.');
    expect(headline(r, 'unknown')[1]).toMatch(/근기68207-690/);
    expect(text(effectLines(r, 'unknown'))).toMatch(/회사에 물어볼 문장: 「3월에 입사한 달 급여를/);
    expect(text(effectLines(r, 'unknown'))).toMatch(/원 미만이 남는 값/);
  });

  it('회사 기준을 고르면 그 값 하나와 산식', () => {
    const r = calcProration(C1);
    expect(headline(r, 'DAY_30')).toEqual(['회사 기준(30일 기준(지급식))으로 3월 급여는 1,337,600원입니다.', '월급 2,508,000원 × 재직 16일 ÷ 30일']);
    expect(headline(r, 'HOUR_ACTUAL')[0]).toBe('회사 기준(시간 기준)으로 3월 급여는 1,344,000원입니다.');
    expect(headline(r, 'FULL')[0]).toBe('회사 규정이 그달 월급 전액 지급이면 일할하지 않고 2,508,000원입니다.');
    expect(text(effectLines(r, 'DAY_30'))).not.toMatch(/회사에 물어볼 문장|원 미만이 남는/);
  });

  it('사실·회사 기준으로 갈리는 값은 나란히 — 첫 주 주휴 · 4명 이하 공휴일 · 소정근로일 공휴일', () => {
    expect(headline(calcProration(C6), 'HOUR_ACTUAL')[0]).toBe('회사 기준(시간 기준)으로 3월 급여는 첫 주 주휴를 넣지 않으면 1,056,000원, 첫 주 주휴를 넣으면 1,152,000원입니다.');
    expect(text(effectLines(calcProration(C6), 'HOUR_ACTUAL'))).toMatch(/첫 주 주휴|행정해석을 찾지 못했습니다/);
    expect(headline(calcProration(C5_4), 'HOUR_ACTUAL')[0]).toMatch(/공휴일을 유급으로 했으면 2,208,000원, 공휴일을 무급으로 했으면 1,920,000원/);
    expect(text(effectLines(calcProration(C5_4), 'HOUR_ACTUAL'))).toMatch(/제55조 제2항/);
    expect(headline(calcProration(C1), 'WORKDAY')[0]).toMatch(/공휴일을 소정근로일에서 빼면 1,433,142\.86원, 공휴일을 소정근로일에 넣으면 1,368,000원/);
  });

  it('퇴사 주 주휴(1736) · 30일 기준 꼬리 · 주말 공휴일', () => {
    expect(text(effectLines(calcProration(C3A), 'HOUR_ACTUAL'))).toMatch(/임금근로시간과-1736/);
    expect(text(effectLines(calcProration(C4), 'DAY_30'))).toMatch(/월급 전액과 같습니다/);
    expect(text(effectLines(calcProration(C6), 'unknown'))).toMatch(/주말인 공휴일\(3월 1일\)/);
  });

  it('통상시급 끝수 시점 · 명세서 대조', () => {
    const r = calcProration(R);
    expect(text(effectLines(r, 'HOUR_ACTUAL'))).toMatch(/버림하면 1,339,632원, 반올림하면 1,339,744원/);
    expect(text(effectLines(r, 'unknown'))).toMatch(/명세서 금액 1,339,632원과 같은 값: 시간 기준에서 통상시급을 먼저 원 미만 버림한 값/);
  });

  it('최저임금 — 원금으로 대조, 고시 없는 해는 대조하지 않음, 참고 값은 단정하지 않음', () => {
    expect(text(effectLines(calcProration(LOW), 'unknown'))).toMatch(/월급 2,090,000원은 2026년 최저임금 월 환산액 2,156,880원\(시간당 10,320원 × 209시간\)보다 66,880원 적습니다/);
    expect(text(effectLines(calcProration(C1), 'unknown'))).toMatch(/월급 원금으로 대조합니다/);
    expect(text(effectLines(calcProration(Y25), 'unknown'))).toMatch(/2025년 최저임금 고시 값이 이 도구에 없어/);
    const ref = referenceLines(calcProration({ ...C1, monthlyPay: 2_156_880 }));
    expect(ref[0]).toBe('참고: 그 기간 유급시간 112시간 × 시간급 최저임금 10,320원 = 1,155,840원.');
    expect(text(ref)).toMatch(/30일 기준\(지급식\) 1,150,336원 — 시간당 10,270\.86원, 위 금액과 차이 −5,504원/);
    expect(text(ref)).toMatch(/모자라다고 정하지 않습니다/);
    expect(text(referenceLines(calcProration(C6)))).toMatch(/두 값으로 갈려/);
  });

  it('그달 내내 재직이면 일할하지 않는 달', () => {
    expect(headline(calcProration(FULLM), 'unknown')[0]).toBe('그달 내내 재직해 일할하지 않는 달입니다.');
    expect(formulaLines(calcProration(FULLM))).toEqual([]);
  });
});

describe('결근·지각 — 답 문장', () => {
  it('A1 결근일분만 / 그 주 주휴까지 나란히, 회사 규정·관행으로 정해짐', () => {
    expect(absenceHeadline(A1)).toEqual([
      '결근 1일 공제는 결근일분만이면 96,000원, 그 주 주휴 1일분까지 빼면 192,000원입니다(통상시급 × 8시간).',
      '주휴가 든 월급에서 결근한 주의 주휴분까지 빼는지는 법이 정하지 않아 회사 규정·관행으로 정해집니다.',
    ]);
    expect(absenceRowLines(A1)).toContain('월급 ÷ 30(1일 83,600원): 결근일분만 83,600원 · 그 주 주휴까지 167,200원');
  });

  it('A6 지각·조퇴는 주휴를 빼지 않는다 · 초과분은 감급 한도와 대조', () => {
    expect(absenceHeadline(A6)[0]).toBe('지각·조퇴 8시간 공제는 그 시간분 96,000원입니다.');
    const e = text(absenceEffectLines(A6));
    expect(e).toMatch(/무노동분 96,000원보다 96,000원 많습니다/);
    expect(e).toMatch(/1회 한도 40,891\.3원보다 큽니다/);
    expect(e).toMatch(/넣은 월급의 10분의 1은 250,800원이고 초과분은 그보다 크지 않습니다/);
    expect(text(absenceEffectLines(A6_4))).toMatch(/4명 이하 사업장에는 제95조가 적용되지 않아/);
  });

  it('주휴일이 다음 달인 주 · 31일 달 1일 단가', () => {
    expect(absenceHeadline(NEXT)[0]).toBe('결근 1일 공제는 96,000원입니다(통상시급 × 8시간).');
    expect(text(absenceEffectLines(NEXT))).toMatch(/주휴일이 다음 달이라/);
    expect(absenceRowLines(DEC)).toContain('월급 ÷ 31일(1일 80,903.23원): 결근일분만 80,903.23원 · 그 주 주휴까지 161,806.45원');
    expect(text(absenceEffectLines(DEC))).toMatch(/회사 공제액 80,903원과 같은 값: 월급 ÷ 그달 날수\(결근일분만\) 값을 버림·1원 단위로 처리한 금액/);
  });
});

describe('급여 일할 — 금지어', () => {
  it('모든 문장에 금지어가 없다', () => {
    const all = allCopy(results, absences);
    expect(all.length).toBeGreaterThan(100);
    expect(all.flatMap((l) => bannedHits(l).map((w) => `${w} | ${l.slice(0, 80)}`))).toEqual([]);
  });

  it('하나를 고르는 말을 쓰지 않는다', () => {
    expect(allCopy(results, absences).filter((l) => /유리한|작은 쪽|가정|미달/.test(l))).toEqual([]);
  });
});
