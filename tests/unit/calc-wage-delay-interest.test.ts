import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';

// 임금 지연이자 — 근로기준법 §37①(법률 제20520호, 2025. 10. 23. 시행) + 시행령 §17(연 100분의 20).
// 1호 퇴직·사망 금품: 지급 사유가 생긴 날(퇴직일)부터 14일이 되는 날 = 퇴직일 + 14 → 그다음 날부터.
// 2호 재직 중 임금: §43②의 정기지급일 → 그다음 날부터. 부칙 §2 — 2025. 10. 23. 이후 지급사유가 생긴 경우부터.
// 이자 = 원금 × 20/100 × 적용일수 ÷ 365, 원 미만 버림(항목마다). 365와 버림은 조문 숫자가 아니라 판결 계산 관행(잠정).
// 기대값은 리서치 독립 계산 스크립트(research_wage_delay_cases.py, 날짜 차이와 Fraction만 사용)와 손으로 다시 센 일수다.
// 입력은 모두 합성 값이다.

const one = (input: WageDelayInput) => calcWageDelayInterest(input).items[0];

describe('1호 — 퇴직 금품(퇴직일 + 14일)', () => {
  it('A. 퇴직일 3.31 · 1,000만원 · 6.30 지급 → 기준일 4.14, 77일, 421,917원', () => {
    const r = one({ retireDate: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.baseDate).toBe('2026-04-14');
    expect(r.accrualStart).toBe('2026-04-15');
    expect(r.delayDays).toBe(77);
    expect(r.interest).toBe(421_917); // 154,000,000 ÷ 365 = 421,917.808…
  });

  it('B. 14일째 지급이면 0원, 15일째 지급이면 1일분 5,479원', () => {
    const base = { retireDate: '2026-03-31' };
    const b1 = one({ ...base, items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-14' }] });
    expect(b1.delayDays).toBe(0);
    expect(b1.interest).toBe(0);
    const b2 = one({ ...base, items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-15' }] });
    expect(b2.delayDays).toBe(1);
    expect(b2.interest).toBe(5_479);
  });

  it('I. 광주지법 2010가합8213 — 퇴직 2010. 2. 21. → 14일째 3. 7.(일), 3. 8.부터(판결 원문과 같음)', () => {
    const r = one({ retireDate: '2010-02-21', items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2010-03-31' }] });
    expect(r.baseDate).toBe('2010-03-07');
    expect(r.accrualStart).toBe('2010-03-08');
  });

  it('K. 기준일이 일요일이어도 미루지 않는다(민법 §161 미적용) — 268,493원, 미루면 나오는 263,013원이 아니다', () => {
    const r = one({ retireDate: '2026-03-29', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-05-31' }] });
    expect(r.baseDate).toBe('2026-04-12');
    expect(new Date(`${r.baseDate}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(r.delayDays).toBe(49);
    expect(r.interest).toBe(268_493);
    expect(r.interest).not.toBe(263_013);
  });
});

describe('2호 — 재직 중 정기지급 임금(정기지급일 다음 날부터)', () => {
  it('C. 정기지급일 1.25 · 300만원 · 2.24 지급 → 30일, 49,315원', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-01-25', paidDate: '2026-02-24' }] });
    expect(r.basis).toBe('2호');
    expect(r.baseDate).toBe('2026-01-25');
    expect(r.delayDays).toBe(30);
    expect(r.interest).toBe(49_315);
  });

  it('D. 2호 이자가 붙은 뒤 퇴직해도 정기지급일 기준(§37②) — 110,136원, 퇴직일 + 14로 잡은 60,821원이 아니다', () => {
    const r = one({ retireDate: '2026-06-10', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-07-31' }] });
    expect(r.basis).toBe('2호');
    expect(r.reason).toBe('periodic-kept');
    expect(r.baseDate).toBe('2026-05-25');
    expect(r.delayDays).toBe(67);
    expect(r.interest).toBe(110_136);
    expect(r.interest).not.toBe(60_821);
  });

  it('H. 윤년(2028. 2. 29.)을 지나도 분모는 365 — 49,315원, 366으로 나눈 49,180원이 아니다', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2028-02-25', paidDate: '2028-03-26' }] });
    expect(r.delayDays).toBe(30);
    expect(r.interest).toBe(49_315);
    expect(r.interest).not.toBe(49_180);
  });
});

describe('부칙 §2 — 2호는 2025. 10. 23. 이후 지급사유가 생긴 임금부터', () => {
  it('E1. 정기지급일 2025. 9. 25. · 재직 중 → 0원', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2025-11-25' }] });
    expect(r.basis).toBe('none');
    expect(r.reason).toBe('before-act');
    expect(r.interest).toBe(0);
  });

  it('E2. 같은 임금을 못 받은 채 2025. 12. 31. 퇴직 → 1호(기준일 2026. 1. 14.) 44일, 72,328원', () => {
    const r = one({ retireDate: '2025-12-31', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2026-02-27' }] });
    expect(r.basis).toBe('1호');
    expect(r.reason).toBe('before-act-retired');
    expect(r.baseDate).toBe('2026-01-14');
    expect(r.delayDays).toBe(44);
    expect(r.interest).toBe(72_328);
  });

  it('J1. 정기지급일 2025. 10. 22.(시행 전날) → 0원(기본 해석). 경계 포함 해석의 54,246원이 아니다', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-10-22', paidDate: '2025-11-24' }] });
    expect(r.basis).toBe('none');
    expect(r.interest).toBe(0);
    expect(r.interest).not.toBe(54_246);
  });

  it('J2. 정기지급일 2025. 10. 23.(시행일) → 2호 32일, 52,602원', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-10-23', paidDate: '2025-11-24' }] });
    expect(r.basis).toBe('2호');
    expect(r.delayDays).toBe(32);
    expect(r.interest).toBe(52_602);
  });
});

describe('퇴직 뒤에 정기지급일이 오는 임금은 1호(§37② 반대 해석 — 미확정 6)', () => {
  // 이 묶음의 기대값은 리서치 사례가 아니라 같은 식으로 손으로 센 값이다. 300만원 × 20% = 60만원.
  const retireDate = '2026-05-31';
  it('정기지급일 6.10이 퇴직일 5.31 뒤 → 퇴직일 + 14 = 6.14 기준, 6.30 지급 16일 → 600,000 × 16 ÷ 365 = 26,301원', () => {
    const r = one({ retireDate, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-06-10', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.reason).toBe('periodic-after-retire');
    expect(r.baseDate).toBe('2026-06-14');
    expect(r.interest).toBe(26_301);
  });

  it('정기지급일 5.30이 퇴직일 5.31 앞 → 2호 5.30 기준, 31일 → 600,000 × 31 ÷ 365 = 50,958원', () => {
    const r = one({ retireDate, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-30', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('2호');
    expect(r.reason).toBe('periodic-kept');
    expect(r.interest).toBe(50_958);
  });

  it('정기지급일이 퇴직일과 같은 날이면 1호로 본다(퇴직일 = 근로관계가 끝난 날이라 그날은 이미 재직 중이 아니다)', () => {
    const r = one({ retireDate, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-31', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.baseDate).toBe('2026-06-14');
  });
});

describe('적용 제외 기간(§37③·시행령 §18) — 그 기간만 뺀다', () => {
  const F = { retireDate: '2026-01-31', items: [{ kind: 'retirement' as const, amount: 20_000_000, paidDate: '2026-12-31' }] };

  it('F. 제외 없음 — 기준일 2. 14.(토, 미루지 않음) 320일, 3,506,849원', () => {
    const r = one(F);
    expect(r.baseDate).toBe('2026-02-14');
    expect(new Date(`${r.baseDate}T00:00:00Z`).getUTCDay()).toBe(6);
    expect(r.delayDays).toBe(320);
    expect(r.excludedDays).toBe(0);
    expect(r.interest).toBe(3_506_849);
  });

  it('F. 제외 2. 15.~9. 30.(다툼) — 228일 빼고 92일, 1,008,219원', () => {
    const r = one({ ...F, exclusions: [{ from: '2026-02-15', to: '2026-09-30' }] });
    expect(r.delayDays).toBe(320);
    expect(r.excludedDays).toBe(228);
    expect(r.days).toBe(92);
    expect(r.interest).toBe(1_008_219);
  });

  it('겹친 제외 기간은 한 번만 뺀다', () => {
    const r = one({ ...F, exclusions: [{ from: '2026-02-15', to: '2026-06-30' }, { from: '2026-06-01', to: '2026-09-30' }] });
    expect(r.excludedDays).toBe(228);
    expect(r.interest).toBe(1_008_219);
  });

  it('지연 기간 밖의 제외 기간은 빼지 않는다', () => {
    const r = one({ ...F, exclusions: [{ from: '2026-01-01', to: '2026-02-14' }] });
    expect(r.excludedDays).toBe(0);
    expect(r.interest).toBe(3_506_849);
  });
});

describe('G. 여러 건(일부 지급 포함) — 항목마다 원 미만 버림 후 합계(미확정 1)', () => {
  const r = calcWageDelayInterest({
    retireDate: '2026-02-20',
    items: [
      { kind: 'retirement', amount: 2_345_678, paidDate: '2026-04-10' },
      { kind: 'retirement', amount: 4_000_000, paidDate: '2026-03-20' },
      { kind: 'retirement', amount: 6_000_000, paidDate: '2026-05-15' },
    ],
  });

  it('기준일 3. 6.(금), 항목별 35·14·70일', () => {
    expect(r.items.map((i) => i.baseDate)).toEqual(['2026-03-06', '2026-03-06', '2026-03-06']);
    expect(r.items.map((i) => i.delayDays)).toEqual([35, 14, 70]);
  });

  it('항목별 44,985 · 30,684 · 230,136원, 합계 305,805원 — 합계 후 버린 305,807원이 아니다', () => {
    expect(r.items.map((i) => i.interest)).toEqual([44_985, 30_684, 230_136]);
    expect(r.total).toBe(305_805);
    expect(r.total).not.toBe(305_807);
  });
});

describe('정수 계산', () => {
  it('큰 금액도 원 단위까지 맞는다 — 12,345,678,901원 × 20% × 365 ÷ 365 = 2,469,135,780원', () => {
    const r = one({ retireDate: '2026-01-01', items: [{ kind: 'retirement', amount: 12_345_678_901, paidDate: '2027-01-15' }] });
    expect(r.delayDays).toBe(365);
    expect(r.interest).toBe(2_469_135_780);
  });

  it('이율은 rates.ts 의 시행령 §17 값(100만분의 200,000)', () => {
    expect(one({ retireDate: '2026-03-31', items: [{ kind: 'retirement', amount: 1, paidDate: '2026-06-30' }] }).ratePerMillion).toBe(200_000);
  });
});

describe('입력 오류', () => {
  it('퇴직 금품인데 퇴직일이 없으면 오류', () => {
    expect(() => calcWageDelayInterest({ items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2026-06-30' }] })).toThrow(/퇴직일/);
  });
  it('정기 임금인데 정기지급일이 없으면 오류', () => {
    expect(() => calcWageDelayInterest({ items: [{ kind: 'periodic', amount: 1_000_000, paidDate: '2026-06-30' }] })).toThrow(/정기지급일/);
  });
  it('없는 날짜·0원·소수 금액·거꾸로 된 제외 기간·빈 항목은 오류', () => {
    const ok = { retireDate: '2026-03-31', items: [{ kind: 'retirement' as const, amount: 1_000_000, paidDate: '2026-06-30' }] };
    expect(() => calcWageDelayInterest({ ...ok, retireDate: '2026-02-30' })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: 0 }] })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: 1000.5 }] })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, exclusions: [{ from: '2026-05-01', to: '2026-04-30' }] })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, items: [] })).toThrow();
  });
  it('이율 기준이 없는 날(2005. 7. 1. 전)이 들어가면 다른 해 값으로 대신하지 않고 오류', () => {
    expect(() => calcWageDelayInterest({ retireDate: '2005-05-01', items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2005-12-31' }] })).toThrow(/이율/);
  });
});
