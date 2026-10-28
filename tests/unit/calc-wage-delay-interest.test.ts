import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import { withinDaysFromRetirement } from '@/app/exit/exit-calc';
import { computeExitDates, fmtIso, parseYmd } from '@/app/exit-employer/exit-dates';

// 임금 지연이자 — 근로기준법 §37①(법률 제20520호, 2025. 10. 23. 시행) + 시행령 §17(연 100분의 20).
// 1호 퇴직·사망 금품: 지급 사유가 생긴 날부터 14일이 되는 날 = 마지막 근무일(사망이면 사망일) + 14 → 그다음 날부터.
//   퇴사 정리(/exit · /exit-employer)와 같은 셈이다 — 아래 「이음새」 묶음이 두 쪽을 묶는다.
// 2호 재직 중 임금: §43②의 정기지급일 → 그다음 날부터. 부칙 §2 — 2025. 10. 23. 이후 지급사유가 생긴 경우부터.
// 이자 = 원금 × 20/100 × 적용일수 ÷ 365, 원 미만 버림(항목마다). 365와 버림은 조문 숫자가 아니라 판결 계산 관행(잠정).
// 기대값은 리서치 독립 계산 스크립트(research_wage_delay_cases.py)와 검토 반영 스크립트(wdi_review_cases.py) —
// 둘 다 날짜 차이와 Fraction만 쓰고 엔진 코드와 무관하다. 리서치 스크립트의 「퇴직일」은 여기의 마지막 근무일과 같은 날을 넣어 셌다.
// 입력은 모두 합성 값이다.

const one = (input: WageDelayInput) => calcWageDelayInterest(input).items[0];

describe('1호 — 퇴직 금품(마지막 근무일 + 14일)', () => {
  it('A. 마지막 근무일 3.31 · 1,000만원 · 6.30 지급 → 기준일 4.14, 77일, 421,917원', () => {
    const r = one({ lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.baseDate).toBe('2026-04-14');
    expect(r.accrualStart).toBe('2026-04-15');
    expect(r.delayDays).toBe(77);
    expect(r.interest).toBe(421_917); // 154,000,000 ÷ 365 = 421,917.808…
  });

  it('B. 14일째 지급이면 0원, 15일째 지급이면 1일분 5,479원', () => {
    const base = { lastWorkDay: '2026-03-31' };
    const b1 = one({ ...base, items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-14' }] });
    expect(b1.delayDays).toBe(0);
    expect(b1.interest).toBe(0);
    const b2 = one({ ...base, items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-15' }] });
    expect(b2.delayDays).toBe(1);
    expect(b2.interest).toBe(5_479);
  });

  it('검토 지적 1 재현 — 마지막 근무일 3.30 · 1,000만원 · 6.30 지급 → 퇴사 정리 기한 4.13, 4.14부터 78일, 427,397원', () => {
    const r = one({ lastWorkDay: '2026-03-30', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] });
    expect(r.baseDate).toBe('2026-04-13');
    expect(r.accrualStart).toBe('2026-04-14');
    expect(r.delayDays).toBe(78);
    expect(r.interest).toBe(427_397);
    expect(r.interest).not.toBe(421_917); // 퇴직일(3.31) + 14로 하루 늦게 잡은 값
  });

  it('I. 광주지법 2010가합8213 날짜 계산 — 「퇴직한 2010. 2. 21.」을 마지막 근무일로 읽으면 14일째 3. 7., 3. 8.부터', () => {
    // 판결은 이 날짜 계산을 청구원인 판단에서 했고, 결론은 워크아웃을 시행령 §18 4호 사유로 보아 민법 연 5%만 인정했다(1심, 항소).
    // 3. 7.이 일요일이라는 점은 판결이 다루지 않았다 — 휴일을 미루지 않는 것은 이 계산기의 처리다.
    const r = one({ lastWorkDay: '2010-02-21', items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2010-03-31' }] });
    expect(r.baseDate).toBe('2010-03-07');
    expect(r.accrualStart).toBe('2010-03-08');
  });

  it('K. 기준일이 일요일이어도 미루지 않는다(이 계산기의 처리, 민법 §161 미적용) — 268,493원, 미루면 나오는 263,013원이 아니다', () => {
    const r = one({ lastWorkDay: '2026-03-29', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-05-31' }] });
    expect(r.baseDate).toBe('2026-04-12');
    expect(new Date(`${r.baseDate}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(r.delayDays).toBe(49);
    expect(r.interest).toBe(268_493);
    expect(r.interest).not.toBe(263_013);
  });
});

describe('이음새 — 1호 기준일은 퇴사 정리(/exit · /exit-employer)의 금품 청산 기한과 같은 날', () => {
  // 같은 사이트에서 14일 기한이 하루 다르게 나오면 안 된다(검토 지적 1·8). 평년·윤년 2월 말과 월말을 같이 본다.
  for (const last of ['2026-03-30', '2026-03-31', '2026-02-28', '2028-02-28', '2028-02-29', '2025-12-31']) {
    it(`마지막 근무일 ${last}`, () => {
      const r = one({ lastWorkDay: last, items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2029-12-31' }] });
      expect(r.baseDate).toBe(withinDaysFromRetirement(last, 14));
      expect(r.baseDate).toBe(fmtIso(computeExitDates(parseYmd(last)!).settle));
    });
  }
});

describe('2호 — 재직 중 정기지급 임금(정기지급일 다음 날부터)', () => {
  it('C. 정기지급일 1.25 · 300만원 · 2.24 지급 → 30일, 49,315원', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-01-25', paidDate: '2026-02-24' }] });
    expect(r.basis).toBe('2호');
    expect(r.baseDate).toBe('2026-01-25');
    expect(r.delayDays).toBe(30);
    expect(r.interest).toBe(49_315);
  });

  it('D. 2호 이자가 붙은 뒤 퇴직해도 정기지급일 기준(§37②) — 110,136원, 마지막 근무일 + 14로 잡은 60,821원이 아니다', () => {
    const r = one({ lastWorkDay: '2026-06-10', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-07-31' }] });
    expect(r.basis).toBe('2호');
    expect(r.reason).toBe('periodic-kept');
    expect(r.baseDate).toBe('2026-05-25');
    expect(r.delayDays).toBe(67);
    expect(r.interest).toBe(110_136);
    expect(r.interest).not.toBe(60_821);
  });

  it('퇴직 전에 지급을 마친 2호 임금은 §37②가 아니라 §37①2호 — 마지막 근무일 6.9 · 정기지급일 5.25 · 6.5 지급 11일, 18,082원', () => {
    const r = one({ lastWorkDay: '2026-06-09', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-06-05' }] });
    expect(r.basis).toBe('2호');
    expect(r.reason).toBe('periodic');
    expect(r.interest).toBe(18_082);
    // 마지막 근무일에 지급해도 재직 중 지급이다. 상실일(6.10)에 지급하면 퇴직 뒤라 §37②
    expect(one({ lastWorkDay: '2026-06-09', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-06-09' }] }).reason).toBe('periodic');
    expect(one({ lastWorkDay: '2026-06-09', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-06-10' }] }).reason).toBe('periodic-kept');
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
    expect(r.actEveInterest).toBeUndefined();
  });

  it('E2. 같은 임금을 못 받은 채 2025. 12. 31.까지 일하고 퇴직 → 1호(기준일 2026. 1. 14.) 44일, 72,328원', () => {
    const r = one({ lastWorkDay: '2025-12-31', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2026-02-27' }] });
    expect(r.basis).toBe('1호');
    expect(r.reason).toBe('before-act-retired');
    expect(r.baseDate).toBe('2026-01-14');
    expect(r.delayDays).toBe(44);
    expect(r.interest).toBe(72_328);
  });

  it('J1. 정기지급일 2025. 10. 22.(시행 전날) → 0원으로 계산하고, 지연이 시행일부터 시작한다고 보는 다른 해석의 값 54,246원을 같이 낸다', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-10-22', paidDate: '2025-11-24' }] });
    expect(r.basis).toBe('none');
    expect(r.interest).toBe(0);
    expect(r.actEveInterest).toBe(54_246); // 600,000 × 33 ÷ 365
  });

  it('J2. 정기지급일 2025. 10. 23.(시행일) → 2호 32일, 52,602원', () => {
    const r = one({ items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-10-23', paidDate: '2025-11-24' }] });
    expect(r.basis).toBe('2호');
    expect(r.delayDays).toBe(32);
    expect(r.interest).toBe(52_602);
    expect(r.actEveInterest).toBeUndefined();
  });
});

describe('퇴직 뒤에 정기지급일이 오는 임금은 1호(§37② 반대 해석 — 미확정 6)', () => {
  // 이 묶음의 기대값은 리서치 사례가 아니라 같은 식으로 손으로 센 값이다. 300만원 × 20% = 60만원.
  const lastWorkDay = '2026-05-31';
  it('정기지급일 6.10이 마지막 근무일 5.31 뒤 → 마지막 근무일 + 14 = 6.14 기준, 6.30 지급 16일 → 600,000 × 16 ÷ 365 = 26,301원', () => {
    const r = one({ lastWorkDay, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-06-10', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.reason).toBe('periodic-after-retire');
    expect(r.baseDate).toBe('2026-06-14');
    expect(r.interest).toBe(26_301);
  });

  it('정기지급일 5.30이 마지막 근무일 5.31 앞 → 2호 5.30 기준, 31일 → 600,000 × 31 ÷ 365 = 50,958원', () => {
    const r = one({ lastWorkDay, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-30', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('2호');
    expect(r.reason).toBe('periodic-kept');
    expect(r.interest).toBe(50_958);
  });

  it('정기지급일 = 마지막 근무일이면 2호로 본다(2호 의무가 상실일에 생겨 퇴직과 같은 때 — 미확정 13) → 30일, 49,315원', () => {
    const r = one({ lastWorkDay, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-31', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('2호');
    expect(r.baseDate).toBe('2026-05-31');
    expect(r.interest).toBe(49_315);
  });

  it('정기지급일이 마지막 근무일의 다음 날(상실일)이면 1호로 본다(그날은 이미 재직 중이 아니다 — 미확정 10)', () => {
    const r = one({ lastWorkDay, items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-06-01', paidDate: '2026-06-30' }] });
    expect(r.basis).toBe('1호');
    expect(r.baseDate).toBe('2026-06-14');
  });
});

describe('적용 제외 기간(§37③·시행령 §18) — 그 기간만 뺀다', () => {
  const F = { lastWorkDay: '2026-01-31', items: [{ kind: 'retirement' as const, amount: 20_000_000, paidDate: '2026-12-31' }] };

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
    lastWorkDay: '2026-02-20',
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
    const r = one({ lastWorkDay: '2026-01-01', items: [{ kind: 'retirement', amount: 12_345_678_901, paidDate: '2027-01-15' }] });
    expect(r.delayDays).toBe(365);
    expect(r.interest).toBe(2_469_135_780);
  });

  it('지연 1일이어도 원 미만이면 0원 — 1,000원 × 20% × 1 ÷ 365 = 0.547…', () => {
    const r = one({ lastWorkDay: '2026-03-30', items: [{ kind: 'retirement', amount: 1_000, paidDate: '2026-04-14' }] });
    expect(r.delayDays).toBe(1);
    expect(r.days).toBe(1);
    expect(r.interest).toBe(0);
  });

  it('이율은 rates.ts 의 시행령 §17 값(100만분의 200,000)', () => {
    expect(one({ lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 1, paidDate: '2026-06-30' }] }).ratePerMillion).toBe(200_000);
  });
});

describe('입력 오류', () => {
  it('퇴직 금품인데 마지막 근무일이 없으면 오류', () => {
    expect(() => calcWageDelayInterest({ items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2026-06-30' }] })).toThrow(/마지막 근무일/);
  });
  it('정기 임금인데 정기지급일이 없으면 오류', () => {
    expect(() => calcWageDelayInterest({ items: [{ kind: 'periodic', amount: 1_000_000, paidDate: '2026-06-30' }] })).toThrow(/정기지급일/);
  });
  it('없는 날짜·0원·소수 금액·거꾸로 된 제외 기간·빈 항목은 오류', () => {
    const ok = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement' as const, amount: 1_000_000, paidDate: '2026-06-30' }] };
    expect(() => calcWageDelayInterest({ ...ok, lastWorkDay: '2026-02-30' })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: 1000.5 }] })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, exclusions: [{ from: '2026-05-01', to: '2026-04-30' }] })).toThrow();
    expect(() => calcWageDelayInterest({ ...ok, items: [] })).toThrow();
  });
  it('0원·음수는 「1원 이상」, 소수는 「원 단위」로 이유를 가른다', () => {
    const ok = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement' as const, amount: 1_000_000, paidDate: '2026-06-30' }] };
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: 0 }] })).toThrow('항목 1의 금액을 1원 이상으로 넣어 주세요');
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: -5 }] })).toThrow('항목 1의 금액을 1원 이상으로 넣어 주세요');
    expect(() => calcWageDelayInterest({ ...ok, items: [{ ...ok.items[0], amount: 1000.5 }] })).toThrow('항목 1의 금액은 원 단위(소수점 없이)로 넣어 주세요');
  });
  it('이율 기준이 없는 날(2005. 7. 1. 전)이 들어가면 다른 해 값으로 대신하지 않고 오류', () => {
    expect(() => calcWageDelayInterest({ lastWorkDay: '2005-05-01', items: [{ kind: 'retirement', amount: 1_000_000, paidDate: '2005-12-31' }] })).toThrow(/이율/);
  });
});
