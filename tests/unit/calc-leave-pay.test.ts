import { describe, expect, it } from 'vitest';
import { calcLeavePay, payArticle, type LeavePayInput, type LeavePayResult } from '@/lib/calc/leave-pay';
import { allCopy, effectLines, formulaLines, headline, promotionLines, PROMOTION_REMAINS, SCOPE_ITEMS } from '@/app/tools/leave-pay/copy';
import { calculateAllowance } from '@/lib/leave/leave-allowance';
import { assertNoPrescriptionMath } from '@/lib/leave/leave-advanced';
import { unitHours } from '@/lib/calc/min-wage';
import { estimateLeavePay } from '@/app/exit/exit-calc';
import { bannedHits } from '@/lib/tool-kit/banned';

// 연차수당 계산기 — 미사용 연차 일수 × 1일 통상임금(근로기준법 시행령 §6③ = 시간급 × 1일 소정근로시간).
// 기대값은 조문 식을 Decimal 로 옮긴 독립 스크립트(leave_pay_cases.py)와 기존 엔진 실측(ledger_probe.mts)에서 왔다.
// 입력은 전부 합성 값이다.

const AS_OF = '2026-10-29';
const C2: LeavePayInput = {
  timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8,
  rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 },
  days: { source: 'unused', unusedDays: 5 }, asOf: AS_OF,
};
const amount = (i: LeavePayInput) => calcLeavePay(i).amount;

describe('C1 시급제 — 시간급 × 1일 소정근로시간 × 일수', () => {
  it('12,000 × 8 × 3 = 288,000', () => {
    const r = calcLeavePay({ ...C2, rate: { basis: 'ordinary-wage', unit: 'hour', amount: 12_000 }, days: { source: 'unused', unusedDays: 3 } });
    expect(r.status).toBe('calculated');
    expect(r.hourly).toBe(12_000);
    expect(r.dailyRate).toBe(96_000);
    expect(r.amount).toBe(288_000);
  });
});

describe('C2 월급 — 209시간 환산, 원 미만은 마지막에 한 번 버림', () => {
  it('2,600,000 ÷ 209 × 8 × 5 = 497,607.655 → 497,607', () => {
    const r = calcLeavePay(C2);
    expect(r.hours).toBe(209);
    expect(r.weekPaidHours).toBe(48);
    expect(r.hourly!).toBeCloseTo(12_440.1914, 4);
    expect(r.dailyRate!).toBeCloseTo(99_521.5311, 4);
    expect(r.amount).toBe(497_607);
  });

  it('대조 — 퇴사 정리(exit-calc)는 1일 단가를 먼저 버려 497,605, 반올림 없는 208.57시간이면 498,630', () => {
    expect(estimateLeavePay(2_600_000, 40, 5).amount).toBe(497_605);
    expect(Math.floor((2_600_000 * 8 * 5 * 84) / (48 * 365))).toBe(498_630);
    expect(amount(C2)).not.toBe(497_605);
    expect(amount(C2)).not.toBe(498_630);
  });
});

describe('C3 퇴직 시 수당 — 지급기한·평균임금 산입 표시', () => {
  const C3: LeavePayInput = {
    ...C2, timing: 'termination',
    rate: { basis: 'ordinary-wage', unit: 'month', amount: 3_135_000 },
    days: { source: 'unused', unusedDays: 7 },
  };

  it('3,135,000 ÷ 209 = 15,000 × 8 × 7 = 840,000', () => {
    const r = calcLeavePay(C3);
    expect(r.hourly).toBe(15_000);
    expect(r.dailyRate).toBe(120_000);
    expect(r.amount).toBe(840_000);
    expect(effectLines(r).join(' ')).toMatch(/14일 이내.*제36조/);
  });

  it('분기 a — 퇴직으로 비로소 생긴 몫은 평균임금에 넣지 않는다(근로복지과-1715)', () => {
    const r = calcLeavePay({ ...C3, arisenBeforeTermination: false });
    expect(r.averageWage).toBe('excluded');
    expect(effectLines(r).join(' ')).toContain('근로복지과-1715');
  });

  it('분기 b — 퇴직 전에 이미 생겨 있던 몫은 3/12 산입(임금68207-173). 금액은 그대로', () => {
    const r = calcLeavePay({ ...C3, arisenBeforeTermination: true });
    expect(r.averageWage).toBe('three-twelfths');
    expect(r.amount).toBe(840_000);
    expect(effectLines(r).join(' ')).toContain('임금68207-173');
  });

  it('재직 중에는 평균임금 산입 표시가 없고 지급시기는 정기지급일', () => {
    const r = calcLeavePay(C2);
    expect(r.averageWage).toBeNull();
    expect(effectLines(r).join(' ')).toMatch(/제43조제2항/);
  });
});

describe('C4·C5 단시간 — 미사용 시간 × 시간급(시행령 별표2 제4호나목·마목)', () => {
  const PT: LeavePayInput = {
    ...C2, weeklyHours: 20, dailyHours: 4,
    rate: { basis: 'ordinary-wage', unit: 'hour', amount: 11_000 },
    partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 20 },
  };

  it('C4 15일 × 20/40 × 8 = 60시간 − 쓴 20시간(5일 × 4시간) = 40시간 × 11,000 = 440,000', () => {
    const r = calcLeavePay(PT);
    expect(r.partTime!.grantHours).toBe(60);
    expect(r.partTime!.dailyHours).toBe(4);
    expect(r.partTime!.unusedHours).toBe(40);
    expect(r.amount).toBe(440_000);
    expect(r.unusedDays).toBeNull();
  });

  it('C5 16일 × 23/40 × 8 = 73.6 → 1시간 미만은 1시간 = 74시간 × 11,000 = 814,000', () => {
    const r = calcLeavePay({ ...PT, weeklyHours: 23, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 16, usedHours: 0 } });
    expect(r.partTime!.rawGrantHours).toBeCloseTo(73.6, 9);
    expect(r.partTime!.grantHours).toBe(74);
    expect(r.partTime!.dailyHours).toBeCloseTo(4.6, 9);
    expect(r.amount).toBe(814_000);
    expect(r.amount).not.toBe(809_600); // 올림을 빼면
  });

  it('딱 떨어지는 시간은 올리지 않는다 — 15일 × 21/40 × 8 = 63, 15일 × 20/40 × 8 = 60', () => {
    expect(calcLeavePay({ ...PT, weeklyHours: 21, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 0 } }).partTime!.grantHours).toBe(63);
    expect(calcLeavePay({ ...PT, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 0 } }).partTime!.grantHours).toBe(60);
  });

  it('월급 단시간은 unitHours 로 시간급을 낸다 — 주 20h 월 1,144,000 ÷ 104 = 11,000', () => {
    const r = calcLeavePay({ ...PT, rate: { basis: 'ordinary-wage', unit: 'month', amount: 1_144_000 } });
    expect(r.hours).toBe(104);
    expect(r.hourly).toBe(11_000);
    expect(r.amount).toBe(440_000);
  });

  it('잘못된 입력 — 통상 근로자보다 길거나, 쓴 시간이 연차 시간보다 많거나, 평균임금 기준이면 오류', () => {
    expect(() => calcLeavePay({ ...PT, partTime: { fullTimeWeeklyHours: 20, fullTimeDays: 15, usedHours: 0 } })).toThrow();
    expect(() => calcLeavePay({ ...PT, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 61 } })).toThrow();
    expect(() => calcLeavePay({ ...PT, rate: { basis: 'average-wage', dailyRate: 50_000 } })).toThrow();
  });
});

describe('C6 주 15시간 경계(근로기준법 §18③) — 양쪽', () => {
  it('6a 주 14시간 — 적용 제외. unitHours 는 61을 내므로 계산기가 따로 막는다', () => {
    expect(unitHours('month', 14)).toBe(61);
    const r = calcLeavePay({ ...C2, weeklyHours: 14, dailyHours: 2.8 });
    expect(r.status).toBe('under15h');
    expect(r.amount).toBeNull();
    expect(headline(r).join(' ')).toContain('15시간 미만');
  });

  it('6b 주 15시간 — 적용. 주휴 3시간 → 18 × 365 ÷ 84 = 78.21 → 78시간', () => {
    const r = calcLeavePay({
      ...C2, weeklyHours: 15, dailyHours: 3,
      rate: { basis: 'ordinary-wage', unit: 'month', amount: 815_000 },
      partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 15, usedHours: 0 },
    });
    expect(r.status).toBe('calculated');
    expect(r.hours).toBe(78);
    expect(r.partTime!.grantHours).toBe(45);
    expect(r.amount).toBe(470_192); // 815,000 × 45 ÷ 78 = 470,192.3
  });
});

describe('C7 상시 근로자 수 경계(시행령 §7 별표1) — 양쪽', () => {
  it('7a 상시 4명 이하 — 법정 연차 적용 대상이 아니다(약정이 있으면 약정)', () => {
    const r = calcLeavePay({ ...C2, fivePlus: false });
    expect(r.status).toBe('under5');
    expect(r.amount).toBeNull();
    expect(headline(r).join(' ')).toMatch(/4명 이하/);
    expect(effectLines(r).join(' ')).toMatch(/약정/);
  });

  it('7b 상시 5명 이상 — C2 와 같은 497,607', () => {
    expect(amount({ ...C2, fivePlus: true })).toBe(497_607);
  });

  it('4명 이하이면 임금이 비어 있어도 오류를 내지 않는다', () => {
    expect(calcLeavePay({ ...C2, fivePlus: false, rate: { basis: 'ordinary-wage', unit: 'month', amount: 0 } }).status).toBe('under5');
  });
});

describe('C8·C9 퇴직 — 입사일·마지막 재직일로 발생 누계(buildHireDateLedger)', () => {
  const LED = (hireDate: string, lastWorkDate: string, usedDays = 0): LeavePayInput => ({
    ...C2, timing: 'termination',
    rate: { basis: 'ordinary-wage', unit: 'month', amount: 3_135_000 }, // 1일 120,000
    days: { source: 'ledger', hireDate, lastWorkDate, usedDays },
  });

  it('8a 1년 근로 후 바로 종료(365일째 마지막 재직) = 11일 → 1,320,000(대법원 2021다227100)', () => {
    const r = calcLeavePay(LED('2025-11-01', '2026-10-31'));
    expect(r.ledger!.total).toBe(11);
    expect(r.unusedDays).toBe(11);
    expect(r.amount).toBe(1_320_000);
  });

  it('8b 366일째 재직 = 11 + 15 = 26일 → 3,120,000(대법원 2022다245419)', () => {
    const r = calcLeavePay(LED('2025-11-01', '2026-11-01'));
    expect(r.ledger!.total).toBe(26);
    expect(r.ledger!.entries.map((e) => e.days)).toEqual([11, 15]);
    expect(r.amount).toBe(3_120_000);
  });

  it.each([
    ['2026-01-01', '2026-03-31', 2],
    ['2026-01-01', '2026-04-01', 3],
    ['2026-01-15', '2026-07-14', 5],
    ['2026-01-15', '2026-07-15', 6],
  ])('9 1년 미만 마지막 달 — %s 입사 · %s 마지막 재직 = %i일(근로기준과-4373)', (hire, last, days) => {
    expect(calcLeavePay(LED(hire, last)).unusedDays).toBe(days);
  });

  it('이미 쓰거나 수당으로 받은 일수를 뺀다 — 26 − 6 = 20일 → 2,400,000', () => {
    const r = calcLeavePay(LED('2025-11-01', '2026-11-01', 6));
    expect(r.unusedDays).toBe(20);
    expect(r.amount).toBe(2_400_000);
  });

  it('잘못된 입력 — 없는 날짜, 순서 뒤바뀜, 쓴 일수 > 누계, 재직 중에 누계 사용은 오류', () => {
    expect(() => calcLeavePay(LED('2026-02-30', '2026-11-01'))).toThrow();
    expect(() => calcLeavePay(LED('2026-11-01', '2025-11-01'))).toThrow();
    expect(() => calcLeavePay(LED('2025-11-01', '2026-11-01', 27))).toThrow();
    expect(() => calcLeavePay({ ...LED('2025-11-01', '2026-11-01'), timing: 'employed' })).toThrow();
  });
});

describe('C10 사용 촉진(§61) — 금액을 깎지 않고 「했다면」 안내만', () => {
  it.each(['none', 'claimed', 'unknown'] as const)('촉진 %s — 금액은 늘 497,607', (promotion) => {
    expect(amount({ ...C2, promotion })).toBe(497_607);
  });

  it('10a 했다고 하면 세 단계를 조건으로 「지급 의무가 없을 수 있습니다」 — 단정하지 않는다', () => {
    const lines = promotionLines(calcLeavePay({ ...C2, promotion: 'claimed' })).join(' ');
    expect(lines).toContain('지급 의무가 없을 수 있습니다');
    expect(lines).toContain('6개월 전');
    expect(lines).toContain('2개월 전');
    expect(lines).toMatch(/분명히/);
    expect(lines).toContain('빼지 않은');
    for (const w of ['적법', '면제', '촉진 완료', '소멸']) expect(lines).not.toContain(w);
  });

  it('10b~10f 촉진했어도 지급하는 경우가 목록에 있다', () => {
    const s = PROMOTION_REMAINS.join(' ');
    expect(s).toMatch(/지정한 날.*전에 퇴직.*임금근로시간정책팀-194/); // 10b
    expect(s).toMatch(/분명히 밝히지 않았거나 업무를 지시.*2019다279283/); // 10c
    expect(s).toMatch(/나머지 날/); // 10d
    expect(s).toMatch(/휴직/);
    expect(s).toMatch(/1년 미만.*6개월·2개월.*제61조제2항/); // 10f
    expect(s).toMatch(/하지 않은 경우.*근로기준과-161/); // 10e
  });

  it('10d 21일 중 11일만 통보, 나머지 10일 미지정 — 10일 × 99,521.53 = 995,215', () => {
    expect(amount({ ...C2, days: { source: 'unused', unusedDays: 10 } })).toBe(995_215);
  });

  it('10e 촉진하지 않았으면 지급한다(근로기준과-161)', () => {
    expect(promotionLines(calcLeavePay({ ...C2, promotion: 'none' })).join(' ')).toContain('근로기준과-161');
  });

  it('1년 미만 월 연차 기준(§61②)을 함께 적는다', () => {
    expect(promotionLines(calcLeavePay({ ...C2, promotion: 'claimed' })).join(' ')).toMatch(/3개월 전.*1개월 전.*제61조제2항/);
  });
});

describe('C11 월 기준시간 반올림 경계 — 주 35시간', () => {
  it('(35 + 7) × 365 ÷ 84 = 182.5 → 183, 2,000,000 ÷ 183 × 7 × 3 = 229,508', () => {
    const r = calcLeavePay({ ...C2, weeklyHours: 35, dailyHours: 7, rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_000_000 }, days: { source: 'unused', unusedDays: 3 } });
    expect(r.hours).toBe(183);
    expect(r.amount).toBe(229_508);
    expect(r.amount).not.toBe(230_136); // 182.5 그대로면
  });
});

describe('C12 주휴 말고 유급처리시간이 있으면 지원 범위 밖', () => {
  it('토요일 유급 4시간 — 226시간이 맞는데 unitHours 는 209를 내므로 멈춘다', () => {
    const r = calcLeavePay({ ...C2, otherPaidHours: true });
    expect(r.status).toBe('out-of-scope');
    expect(r.amount).toBeNull();
    expect(amount(C2)).toBe(497_607);
  });

  it('평균임금 단가·시급·일급은 1주 기준시간을 쓰지 않으니 막지 않는다', () => {
    expect(calcLeavePay({ ...C2, otherPaidHours: true, rate: { basis: 'average-wage', dailyRate: 110_000 } }).status).toBe('calculated');
    expect(calcLeavePay({ ...C2, otherPaidHours: true, rate: { basis: 'ordinary-wage', unit: 'hour', amount: 12_000 } }).amount).toBe(480_000);
    expect(calcLeavePay({ ...C2, otherPaidHours: true, rate: { basis: 'ordinary-wage', unit: 'week', amount: 600_000 } }).status).toBe('out-of-scope');
  });
});

describe('C13 회사 지급액과 대조 — 미리 지급한 뒤 통상임금이 오르면 차액(근로개선정책과-3077)', () => {
  const C13: LeavePayInput = { ...C2, rate: { basis: 'ordinary-wage', unit: 'day', amount: 104_000 }, alreadyPaid: 500_000 };
  it('1일 104,000 × 5 = 520,000 − 미리 지급 500,000 = 20,000', () => {
    const r = calcLeavePay(C13);
    expect(r.dailyRate).toBe(104_000);
    expect(r.amount).toBe(520_000);
    expect(r.difference).toBe(20_000);
  });

  it('같으면 0, 회사 지급액이 많으면 음수 — 입력이 없으면 null', () => {
    expect(calcLeavePay({ ...C13, alreadyPaid: 520_000 }).difference).toBe(0);
    expect(calcLeavePay({ ...C13, alreadyPaid: 530_000 }).difference).toBe(-10_000);
    expect(calcLeavePay(C2).difference).toBeNull();
    expect(() => calcLeavePay({ ...C13, alreadyPaid: -1 })).toThrow();
  });
});

describe('C14 취업규칙이 평균임금으로 정한 경우 — 단가를 받아 기준만 기록', () => {
  it('110,000 × 3 = 330,000, rateBasis = average-wage', () => {
    const r = calcLeavePay({ ...C2, rate: { basis: 'average-wage', dailyRate: 110_000 }, days: { source: 'unused', unusedDays: 3 } });
    expect(r.amount).toBe(330_000);
    expect(r.rateBasis).toBe('average-wage');
    expect(r.rateSource).toContain('평균임금');
    expect(r.hourly).toBeNull();
    expect(formulaLines(r).join(' ')).toContain('평균임금');
  });
});

describe('부동소수 — 정수로 떨어지는 금액에서 1원 덜 나오지 않는다', () => {
  it('1,159,000 × 8 × 11 ÷ 209 = 488,000 (곱한 순서대로면 487,999.9999…)', () => {
    expect(Math.floor(11 * ((1_159_000 * 8) / 209))).toBe(487_999); // 고치기 전 엔진이 하던 계산
    expect(calculateAllowance({ unusedDays: 11, dailyRate: (1_159_000 * 8) / 209, rateBasis: 'ordinary-wage', rateSource: '합성' }).amount).toBe(488_000);
    expect(amount({ ...C2, rate: { basis: 'ordinary-wage', unit: 'month', amount: 1_159_000 }, days: { source: 'unused', unusedDays: 11 } })).toBe(488_000);
  });

  it('월급 100만~120만(천원 단위) × 1일 4~8시간 × 1~30일 — 정수 나눗셈과 전부 같다', () => {
    const miss: string[] = [];
    for (let pay = 1_000_000; pay <= 1_200_000; pay += 1_000) {
      for (let dh = 4; dh <= 8; dh++) {
        for (let u = 1; u <= 30; u++) {
          const exact = Number((BigInt(pay) * BigInt(dh) * BigInt(u)) / BigInt(209));
          const got = amount({ ...C2, dailyHours: dh, rate: { basis: 'ordinary-wage', unit: 'month', amount: pay }, days: { source: 'unused', unusedDays: u } });
          if (got !== exact) miss.push(`${pay}/${dh}/${u}: ${got} ≠ ${exact}`);
        }
      }
    }
    expect(miss).toEqual([]);
  });
});

describe('2027. 6. 10. 조문 번호 이동(법률 공포 2026. 6. 9.) — 양쪽', () => {
  it('통상임금·평균임금 지급 조문은 6. 9.까지 제60조제5항, 6. 10.부터 제60조제6항', () => {
    expect(payArticle('2027-06-09')).toBe('제60조제5항');
    expect(payArticle('2027-06-10')).toBe('제60조제6항');
    expect(calcLeavePay({ ...C2, asOf: '2027-06-10' }).payArticle).toBe('제60조제6항');
    expect(effectLines(calcLeavePay({ ...C2, asOf: '2027-06-10' })).join(' ')).toContain('제60조제6항');
    expect(effectLines(calcLeavePay(C2)).join(' ')).toContain('제60조제5항');
  });
});

describe('잘못된 입력은 오류', () => {
  it.each<[string, Partial<LeavePayInput>]>([
    ['남은 일수 음수', { days: { source: 'unused', unusedDays: -1 } }],
    ['임금 0', { rate: { basis: 'ordinary-wage', unit: 'month', amount: 0 } }],
    ['1일 소정 0', { dailyHours: 0 }],
    ['1주 소정 0', { weeklyHours: 0 }],
    ['평균임금 0', { rate: { basis: 'average-wage', dailyRate: 0 } }],
  ])('%s', (_, patch) => {
    expect(() => calcLeavePay({ ...C2, ...patch })).toThrow();
  });
});

describe('화면 문장 — 금지어 0 · 시효를 일수와 엮지 않음(제우스 게이트)', () => {
  const inputs: LeavePayInput[] = [
    C2,
    { ...C2, promotion: 'claimed', alreadyPaid: 400_000 },
    { ...C2, promotion: 'unknown', alreadyPaid: 600_000 },
    { ...C2, timing: 'termination', arisenBeforeTermination: true, alreadyPaid: 497_607 },
    { ...C2, timing: 'termination', days: { source: 'ledger', hireDate: '2025-11-01', lastWorkDate: '2026-11-01', usedDays: 3 } },
    { ...C2, weeklyHours: 23, dailyHours: 4.6, rate: { basis: 'ordinary-wage', unit: 'hour', amount: 11_000 }, partTime: { fullTimeWeeklyHours: 40, fullTimeDays: 16, usedHours: 9.2 } },
    { ...C2, rate: { basis: 'average-wage', dailyRate: 110_000 } },
    { ...C2, fivePlus: false },
    { ...C2, weeklyHours: 14 },
    { ...C2, otherPaidHours: true },
  ];
  const outs: LeavePayResult[] = inputs.map(calcLeavePay);

  it('모든 결과 문장에 금지어가 없다', () => {
    for (const r of outs) {
      const lines = allCopy(r);
      expect(lines.length).toBeGreaterThan(3);
      for (const line of lines) expect(bannedHits(line), line).toEqual([]);
    }
  });

  it('시효를 개별 일수와 엮는 문장이 없고, 시효 자체를 말하지 않는다', () => {
    for (const r of outs) {
      expect(() => assertNoPrescriptionMath(allCopy(r))).not.toThrow();
      expect(allCopy(r).join(' ')).not.toContain('시효');
    }
  });

  it('계산한 결과는 답 첫 줄에 금액, 회사 지급액을 넣으면 차이를 말한다', () => {
    expect(headline(outs[0])[0]).toContain('497,607원');
    expect(headline(outs[1]).join(' ')).toMatch(/회사 지급액 400,000원보다 97,607원 많습니다/);
    expect(headline(outs[2]).join(' ')).toMatch(/회사 지급액 600,000원이 102,393원 많습니다/);
    expect(headline(outs[3]).join(' ')).toContain('회사 지급액과 같습니다');
  });

  it('산식에 원 미만 처리와 209시간 반올림 관행을 밝힌다', () => {
    const f = formulaLines(outs[0]).join(' ');
    expect(f).toContain('(40 + 8) × 365 ÷ 7 ÷ 12');
    expect(f).toContain('209시간');
    expect(f).toMatch(/원 미만.*버/);
    expect(f).toMatch(/반올림/);
  });

  it('다루지 않는 것 — 통상임금 범위·출근율·회계연도 정산·2027 시간 단위', () => {
    const s = SCOPE_ITEMS.join(' ');
    for (const w of ['통상임금 점검', '80%', '회계연도', '2027']) expect(s).toContain(w);
  });
});
