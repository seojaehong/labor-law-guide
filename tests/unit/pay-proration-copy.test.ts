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
const ONE_DAY: ProrationInput = { month: '2026-03', monthlyPay: BASE, start: '2026-03-31', fivePlus: true };
const MAY_4: ProrationInput = { month: '2026-05', monthlyPay: BASE, end: '2026-05-15', fivePlus: false, holidays: ['2026-05-01', '2026-05-05'] };
const results = [C1, C3A, C4, C5_4, C6, R, LOW, Y25, FULLM, ONE_DAY, MAY_4].map(calcProration);
const A1 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-18'] });
const A6 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: [], lateHours: 8, companyDeduction: 192_000, avgDailyWage: 7_524_000 / 92 });
const A6_4 = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: false, absences: [], lateHours: 8, companyDeduction: 192_000 });
const NEXT = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-30'], companyDeduction: 50_000 });
const DEC = calcAbsence({ month: '2026-12', monthlyPay: BASE, fivePlus: true, absences: ['2026-12-16'], companyDeduction: 80_903 });
const MIX = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: ['2026-11-18'], lateHours: 2, companyDeduction: 230_000, avgDailyWage: 80_000 });
const absences = [A1, A6, A6_4, NEXT, DEC, MIX];
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
    // 5명 이상의 관공서 공휴일은 유급휴일(§55②)이라 「소정근로일」이라는 말을 쓰지 않고 계산 방식 이름으로 쓴다
    expect(headline(calcProration(C1), 'WORKDAY')[0]).toMatch(/공휴일을 날수에서 빼면 1,433,142\.86원, 공휴일도 날수에 넣으면 1,368,000원/);
    expect(text(formulaLines(calcProration(C1)))).toMatch(/재직 기간 평일 12일 ÷ 그달 평일 22일\(쉬는 공휴일 포함\)/);
    expect(text(allCopy(results, absences))).not.toMatch(/공휴일을 소정근로일/);
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
    // 원금 대조는 이 도구의 선택이다 — 조문이 「일할액이 아니라 원금」을 정한 것처럼 쓰지 않는다(시행령 §5①3 은 환산식)
    const c1 = text(effectLines(calcProration(C1), 'unknown'));
    expect(c1).toMatch(/이 도구는 월급 원금을 209시간으로 나눠 대조합니다\(최저임금법 시행령 제5조 제1항 제3호의 환산식\)/);
    expect(c1).toMatch(/일할액을 최저임금과 대조하는 방법을 정한 조문·행정해석은 찾지 못했습니다/);
    expect(text(allCopy(results, absences))).not.toMatch(/일할한 금액이 아니라 월급 원금으로 대조합니다/);
    // 넣은 월급에 연장·야간·휴일 수당이 섞이면 산입하지 않는다(§6④1) — 충족 문장에 단서
    expect(c1).toMatch(/연장·야간·휴일 수당.*최저임금법 제6조 제4항 제1호.*최저임금 확인 계산기/);
    expect(text(effectLines(calcProration(Y25), 'unknown'))).toMatch(/2025년 최저임금 고시 값이 이 도구에 없어/);
    const ref = referenceLines(calcProration({ ...C1, monthlyPay: 2_156_880 }));
    expect(ref[0]).toBe('참고: 그 기간 유급시간 112시간 × 시간급 최저임금 10,320원 = 1,155,840원.');
    expect(text(ref)).toMatch(/30일 기준\(지급식\) 1,150,336원 — 시간당 10,270\.86원, 위 금액과 차이 −5,504원/);
    expect(text(ref)).toMatch(/모자라다고 정하지 않습니다/);
    expect(text(referenceLines(calcProration(C6)))).toMatch(/두 값으로 갈려/);
  });

  it('일할액이 그 기간 유급시간 × 시간급 최저임금보다 적은 방식은 답 카드에서 알린다 — 31일 달 하루 재직', () => {
    const r = calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-31', fivePlus: true });
    expect(headline(r, 'unknown')[0]).toBe('일할 방식에 따라 3월 급여는 0원에서 114,000원까지 갈립니다.');
    const e = text(effectLines(r, 'unknown'));
    expect(e).toMatch(/30일 기준\(공제식\) 0원, 그달 달력 일수 기준 80,903\.23원은 그 기간 유급시간 8시간 × 시간급 최저임금 10,320원 = 82,560원보다 적습니다/);
    expect(e).toMatch(/최저임금법 제6조 제1항/);
    expect(e).toMatch(/31일 달에 하루만 재직해 30일 기준\(공제식\)은 0원입니다/);
    // 회사 기준을 고르면 그 방식만 본다
    expect(text(effectLines(r, 'DAY_30'))).not.toMatch(/82,560원보다 적습니다/);
    expect(text(effectLines(r, 'DAY_30_DEDUCT'))).toMatch(/30일 기준\(공제식\) 0원은 .*82,560원보다 적습니다/);
    // 일요일 하루 재직 — 유급시간 0이면 참고 값을 내지 않는다
    expect(referenceLines(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-01', end: '2026-03-01', fivePlus: true }))).toEqual(['그 기간 유급시간이 0시간이라 참고 시간당 금액을 내지 않습니다.']);
  });

  it('토요일 입사는 첫 주 주휴 두 값이 없다 · 노동절은 4명 이하도 유급으로 센다 · 전액 지급 근거', () => {
    expect(text(effectLines(calcProration({ month: '2026-03', monthlyPay: BASE, start: '2026-03-21', fivePlus: true }), 'unknown'))).not.toMatch(/첫 주 주휴/);
    const may = calcProration({ month: '2026-05', monthlyPay: BASE, end: '2026-05-15', fivePlus: false, holidays: ['2026-05-01', '2026-05-05'] });
    expect(headline(may, 'HOUR_ACTUAL')[0]).toBe('회사 기준(시간 기준)으로 5월 급여는 공휴일을 유급으로 했으면 1,248,000원, 공휴일을 무급으로 했으면 1,152,000원입니다.');
    expect(text(effectLines(may, 'HOUR_ACTUAL'))).toMatch(/5월 1일 노동절.*근로개선정책과-1113/);
    expect(text(formulaLines(may))).toMatch(/노동절 8시간/);
    expect(headline(calcProration(C1), 'FULL')[1]).not.toMatch(/28199/);
  });

  it('퇴사 주 주휴 문서번호는 2차 출처라고 밝힌다', () => {
    expect(text(effectLines(calcProration(C3A), 'HOUR_ACTUAL'))).toMatch(/임금근로시간과-1736.*문서번호는 언론 보도 기준/);
  });

  it('그달 내내 재직이면 일할하지 않는 달', () => {
    expect(headline(calcProration(FULLM), 'unknown')[0]).toBe('그달 내내 재직해 일할하지 않는 달입니다.');
    expect(formulaLines(calcProration(FULLM))).toEqual([]);
  });
});

describe('결근·지각 — 답 문장', () => {
  it('A1 1일 단가 하나를 고르지 않고 폭으로 · 결근일분만 / 그 주 주휴까지 나란히, 회사 규정·관행으로 정해짐', () => {
    expect(absenceHeadline(A1)).toEqual([
      '결근 1일 공제는 1일 단가에 따라 결근일분만이면 83,600원에서 96,000원 사이, 그 주 주휴 1일분까지 빼면 167,200원에서 192,000원 사이입니다.',
      '1일 단가(통상시급 × 8시간, 월급 ÷ 30, 월급 ÷ 그달 날수)를 정한 행정해석은 찾지 못해 취업규칙·근로계약의 공제 기준으로 확인합니다. 주휴가 든 월급에서 결근한 주의 주휴분까지 빼는지도 법이 정하지 않아 회사 규정·관행으로 정해집니다.',
    ]);
    // 30일 달은 월급 ÷ 30 과 월급 ÷ 그달 날수가 같아 한 줄로
    expect(absenceRowLines(A1)).toEqual([
      '통상시급 × 8시간(1일 96,000원): 결근일분만 96,000원 · 그 주 주휴까지 192,000원',
      '월급 ÷ 30(그달 날수 30일과 같음, 1일 83,600원): 결근일분만 83,600원 · 그 주 주휴까지 167,200원',
    ]);
  });

  it('A6 지각·조퇴 — 취업규칙·근로계약에 정했는지로 두 값(법무811-21010), 주휴는 빼지 않는다', () => {
    expect(absenceHeadline(A6)).toEqual([
      '지각·조퇴 8시간 공제는 취업규칙·근로계약에 지각·조퇴 시간만큼 빼기로 정했으면 그 시간분 96,000원, 정한 것이 없으면 0원(월급 전액)입니다.',
      '월급자는 지각·조퇴를 해도 소정 임금 전액을 지급하고, 취업규칙으로 정하면 근로기준법 제95조 범위 안에서 감급할 수 있다는 회시가 있습니다(법무811-21010, 법무811-4808). 지각·조퇴는 결근이 아니어서 그 주 주휴는 빼지 않습니다(근로기준과-5560, 근기01254-1103).',
    ]);
  });

  it('A6 회사 공제액 — 시간분을 넘는 금액과, 지각·조퇴 공제 전체를 감급으로 볼 때의 금액을 나란히 한도와 대조', () => {
    const e = text(absenceEffectLines(A6));
    expect(e).toMatch(/결근일분·그 주 주휴·지각·조퇴 시간분을 더한 96,000원보다 96,000원 많습니다/);
    expect(e).toMatch(/취업규칙에 정한 감급이라면 근로기준법 제95조 한도 안이어야 합니다/);
    expect(e).toMatch(/한 번의 감급이라면 1회 한도 40,891\.3원보다 큽니다\. 여러 번의 감급을 합친 금액이면 회마다 40,891\.3원 이하인지 대조합니다\(근로기준팀-462\)/);
    expect(e).toMatch(/넣은 월급의 10분의 1은 250,800원이고 96,000원은 그보다 크지 않습니다/);
    expect(e).toMatch(/법무811-21010 처럼 지각·조퇴 공제 전체를 감급으로 보면 감급액은 결근일분·그 주 주휴\(0원\)를 넘는 192,000원입니다/);
    expect(e).not.toMatch(/실제 무노동분을 넘는 공제는 감급/);
    expect(text(absenceEffectLines(A6_4))).toMatch(/4명 이하 사업장에는 제95조가 적용되지 않아/);
  });

  it('초과분이 1회 한도보다 작으면 몇 번이든 한도 안', () => {
    const a = calcAbsence({ month: '2026-11', monthlyPay: BASE, fivePlus: true, absences: [], lateHours: 3, companyDeduction: 70_000, avgDailyWage: 80_000 });
    expect(text(absenceEffectLines(a))).toMatch(/34,000원은 1회 한도 40,000원보다 크지 않습니다/);
  });

  it('주휴일이 다음 달인 주 · 31일 달 1일 단가', () => {
    expect(absenceHeadline(NEXT)[0]).toBe('결근 1일 공제는 1일 단가에 따라 83,600원에서 96,000원 사이입니다.');
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
