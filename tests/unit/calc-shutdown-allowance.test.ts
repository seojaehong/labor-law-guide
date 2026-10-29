import { describe, expect, it } from 'vitest';
import {
  calcShutdownAllowance,
  calendarBreakdown,
  type ShutdownAllowanceInput,
  type ShutdownAllowanceResult,
} from '@/lib/calc/shutdown-allowance';
import { calcSeverance, periodSegments } from '@/lib/calc/severance';
import { allCopy, effectLines, formulaLines, headline, DAYS_HINT, EXCLUDE_HINT, PAID_HINT, SCOPE_ITEMS } from '@/app/tools/shutdown-allowance/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

// 휴업수당 — 근로기준법 §46①: 사용자 귀책 휴업이면 평균임금의 100분의 70 이상.
//   단서: 평균임금 70%가 통상임금을 「초과」하면 통상임금을 휴업수당으로 「지급할 수 있다」(사용자 선택 — 서울고법 2015나26148, 대법 2016다37167 상고기각).
//   §2②: 평균임금이 통상임금보다 적으면 통상임금을 평균임금으로(휴업수당에도 적용 — 같은 판결).
//   시행령 §26: 휴업기간 중 임금 일부를 받았으면 (평균임금 − 받은 임금) × 70%, 단서면 통상임금 − 받은 임금.
// 기대값은 리서치의 독립 계산(분수, src 코드를 쓰지 않음 — scratchpad/shutdown_cases_independent.py)과 같다. 입력은 모두 합성.

const DAY_ORD = (daily: number) => ({ unit: 'day' as const, amount: daily, dailyHours: 8 });
const period = (wageTotal: number, extra: Partial<{ hireDate: string; startDate: string; excludedDays: number; excludedWages: number }> = {}) => ({
  source: 'period' as const,
  hireDate: '2024-03-01',
  startDate: '2026-11-02',
  wageTotal,
  ...extra,
});
const base = (over: Partial<ShutdownAllowanceInput>): ShutdownAllowanceInput => ({
  fivePlus: true,
  cause: 'employer',
  average: period(13_800_000),
  ordinary: DAY_ORD(100_000),
  days: 10,
  ...over,
});

describe('휴업수당 — 본문과 단서(§46①)', () => {
  it('C1 단서 미해당 — 평균 120,000 · 통상 100,000 · 10일 = 840,000 한 값', () => {
    const r = calcShutdownAllowance(base({ average: period(11_040_000) }));
    expect(r.status).toBe('calculated');
    expect(r.periodDays).toBe(92);
    expect(r.dailyAverage).toBe(120_000);
    expect(r.ordinaryAsAverage).toBe(false);
    expect(r.dailyApplied).toBe(120_000);
    expect(r.main).toBe(840_000);
    expect(r.proviso).toBeNull();
  });

  it('C2 단서 해당 — 0.7 × 150,000 = 105,000 > 100,000 → 본문 1,050,000 · 단서 1,000,000 나란히', () => {
    const r = calcShutdownAllowance(base({}));
    expect(r.dailyAverage).toBe(150_000);
    expect(r.main).toBe(1_050_000);
    expect(r.proviso).toBe(1_000_000);
  });

  it('C3 경계 — 0.7 × 140,000 = 98,000 = 통상임금이면 「초과」가 아니라 단서 미해당', () => {
    const r = calcShutdownAllowance(base({ average: period(12_880_000), ordinary: DAY_ORD(98_000) }));
    expect(r.dailyAverage).toBe(140_000);
    expect(r.main).toBe(980_000);
    expect(r.proviso).toBeNull();
  });

  it('C4 §2② 발동 — 순수 월급제 3,000,000은 평균(97,826.09) < 통상(114,832.54) → 통상임금을 평균임금으로', () => {
    const r = calcShutdownAllowance(base({
      average: period(9_000_000, { startDate: '2026-11-01' }),
      ordinary: { unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8 },
      days: 26,
    }));
    expect(r.periodDays).toBe(92); // 2026-08-01 ~ 2026-10-31
    expect(r.hours).toBe(209);
    expect(r.dailyAverage).toBe(97_826.09); // 9,000,000 ÷ 92 = 97,826.0869… → 소수 둘째 자리 올림
    expect(r.dailyOrdinary).toBe(114_832.54); // 3,000,000 ÷ 209 × 8 = 114,832.5358… → 소수 둘째 자리 반올림
    expect(r.ordinaryAsAverage).toBe(true);
    expect(r.dailyApplied).toBe(114_832.54);
    expect(r.proviso).toBeNull(); // §2②가 발동하면 0.7A < O — 단서는 나올 수 없다
    expect(r.mainExact).toBeCloseTo(2_089_952.228, 6);
    expect(r.main).toBe(2_089_953); // 원 미만 올림(「이상」) — 버리면 2,089,952
    expect(r.main).not.toBe(1_780_435); // §2②를 빼먹은 값(0.7 × 97,826.09 × 26 = 1,780,434.838)
  });
});

describe('일부 시간만 쉰 날 — 시행령 §26', () => {
  const direct = (daily: number) => ({ source: 'direct' as const, daily });

  it('C5 본문 (150,000 × 5 − 250,000) × 0.7 = 350,000 · 단서 100,000 × 5 − 250,000 = 250,000', () => {
    const r = calcShutdownAllowance(base({ average: direct(150_000), days: 5, paidDuring: 250_000 }));
    expect(r.main).toBe(350_000);
    expect(r.proviso).toBe(250_000);
    expect(r.main).not.toBe(275_000); // 「0.7A − 그날 받은 임금」식이면 275,000 — 조문과 다르다
  });

  it('C6 단서 미해당 — (240,000 − 175,000) × 0.7 = 45,500(「0.7A − 받은 임금」식이면 0)', () => {
    const r = calcShutdownAllowance(base({ average: direct(120_000), days: 2, paidDuring: 175_000 }));
    expect(r.main).toBe(45_500);
    expect(r.proviso).toBeNull();
  });

  it('C7 전일 8일 + 일부 2일 — 기간 합계 980,000 = 날별 합계(8 × 105,000 + 2 × 100,000 × 0.7) · 단서 900,000', () => {
    const r = calcShutdownAllowance(base({ average: direct(150_000), days: 10, paidDuring: 100_000 }));
    expect(r.main).toBe(980_000);
    expect(r.main).toBe(8 * 105_000 + 2 * (150_000 - 50_000) * 0.7);
    expect(r.proviso).toBe(900_000);
  });

  it('받은 임금이 평균임금 × 휴업일수 이상이면 0으로 묶고 그렇다고 표시한다', () => {
    const r = calcShutdownAllowance(base({ average: direct(150_000), days: 1, paidDuring: 160_000 }));
    expect(r.main).toBe(0);
    expect(r.mainClamped).toBe(true);
    expect(r.proviso).toBe(0);
    expect(r.provisoClamped).toBe(true);
    const half = calcShutdownAllowance(base({ average: direct(150_000), days: 1, paidDuring: 120_000 }));
    expect(half.main).toBe(21_000);
    expect(half.mainClamped).toBe(false);
    expect(half.proviso).toBe(0);
    expect(half.provisoClamped).toBe(true);
  });
});

describe('평균임금 산정기간 — §2①6, 시행령 §2①', () => {
  it('C8 휴업 시작 2026-11-02 → 2026-08-02 ~ 2026-11-01, 92일', () => {
    const r = calcShutdownAllowance(base({}));
    expect(r.segments!.map((s) => [s.from, s.to, s.days])).toEqual([
      ['2026-08-02', '2026-08-31', 30],
      ['2026-09-01', '2026-09-30', 30],
      ['2026-10-01', '2026-10-31', 31],
      ['2026-11-01', '2026-11-01', 1],
    ]);
    expect(r.periodDays).toBe(92);
  });

  it('C9 입사 3개월 미만 — 입사일부터 48일, 4,800,000 ÷ 48 = 100,000', () => {
    const r = calcShutdownAllowance(base({ average: period(4_800_000, { hireDate: '2026-09-15' }) }));
    expect(r.periodDays).toBe(48);
    expect(r.dailyAverage).toBe(100_000);
  });

  it('C10 앞선 휴업기간 10일과 그 임금 700,000을 빼면 137,804.88(빼지 않으면 130,434.79)', () => {
    const r = calcShutdownAllowance(base({ average: period(12_000_000, { excludedDays: 10, excludedWages: 700_000 }) }));
    expect(r.baseDays).toBe(82);
    expect(r.baseTotal).toBe(11_300_000);
    expect(r.dailyAverage).toBe(137_804.88);
    expect(calcShutdownAllowance(base({ average: period(12_000_000) })).dailyAverage).toBe(130_434.79);
  });

  it('뺄 기간이 없으면 퇴직금 엔진과 같은 기간·같은 1일 평균임금(사유 발생일 = 휴업 시작일)', () => {
    for (const [hire, start, total] of [['2024-03-01', '2026-11-02', 13_800_000], ['2026-09-15', '2026-11-02', 4_800_000], ['2020-01-01', '2026-05-31', 9_100_000]] as const) {
      const r = calcShutdownAllowance(base({ average: period(total, { hireDate: hire, startDate: start }) }));
      const last = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const sev = calcSeverance({ hireDate: hire, lastWorkDate: last, wageTotal: total });
      expect(r.segments).toEqual(periodSegments(hire, start));
      expect(r.periodDays).toBe(sev.periodDays);
      expect(r.dailyAverage).toBe(sev.dailyAverage);
    }
  });
});

describe('휴업일수 — 달력 나누기(C11)', () => {
  it('2026-11-02(월) ~ 11-15(일) = 14일: 월~금 10 · 토 2 · 일 2', () => {
    expect(calendarBreakdown('2026-11-02', '2026-11-15')).toEqual({ total: 14, weekdays: 10, saturdays: 2, sundays: 2 });
    expect(calendarBreakdown('2026-11-04', '2026-11-06')).toEqual({ total: 3, weekdays: 3, saturdays: 0, sundays: 0 });
    expect(() => calendarBreakdown('2026-11-06', '2026-11-04')).toThrow();
  });

  it('토요일이 무급 휴무일이면 12일(1,260,000 / 1,200,000), 유급휴일이면 14일(1,470,000 / 1,400,000)', () => {
    const d = { source: 'direct' as const, daily: 150_000 };
    const twelve = calcShutdownAllowance(base({ average: d, days: 12 }));
    expect([twelve.main, twelve.proviso]).toEqual([1_260_000, 1_200_000]);
    const fourteen = calcShutdownAllowance(base({ average: d, days: 14 }));
    expect([fourteen.main, fourteen.proviso]).toEqual([1_470_000, 1_400_000]);
  });
});

describe('계산하지 않는 갈래 — C12·C13', () => {
  const empty = { source: 'period' as const, hireDate: '', startDate: '', wageTotal: 0 };

  it('상시 4명 이하면 계산하지 않는다(시행령 §7 별표1에 §46 없음) — 입력이 비어도', () => {
    const r = calcShutdownAllowance(base({ fivePlus: false, average: empty, days: 0 }));
    expect(r.status).toBe('under5');
    expect(r.main).toBeNull();
    expect(r.proviso).toBeNull();
  });

  it('불가항력은 귀책사유가 아니다 · 노동위 승인은 승인 지급률 — 금액을 내지 않는다', () => {
    const fm = calcShutdownAllowance(base({ cause: 'force-majeure', average: empty, days: 0 }));
    expect(fm.status).toBe('force-majeure');
    expect(fm.main).toBeNull();
    const c = calcShutdownAllowance(base({ cause: 'commission', average: empty, days: 0 }));
    expect(c.status).toBe('commission');
    expect(c.main).toBeNull();
  });
});

describe('잘못된 입력은 오류', () => {
  it.each([
    ['입사일이 휴업 시작일보다 뒤', { average: period(9_000_000, { hireDate: '2026-11-03' }) }],
    ['입사일 = 휴업 시작일(산정기간 없음)', { average: period(9_000_000, { hireDate: '2026-11-02' }) }],
    ['없는 날짜', { average: period(9_000_000, { startDate: '2026-02-30' }) }],
    ['뺄 기간 ≥ 산정기간', { average: period(9_000_000, { excludedDays: 92 }) }],
    ['뺄 임금 > 임금총액', { average: period(9_000_000, { excludedDays: 10, excludedWages: 9_000_001 }) }],
    ['휴업일수 0', { days: 0 }],
    ['휴업일수 소수', { days: 2.5 }],
    ['받은 임금 음수', { paidDuring: -1 }],
    ['평균임금 0', { average: { source: 'direct' as const, daily: 0 } }],
    ['통상임금 0', { ordinary: DAY_ORD(0) }],
  ] as const)('%s', (_, over) => {
    expect(() => calcShutdownAllowance(base(over as Partial<ShutdownAllowanceInput>))).toThrow();
  });
});

describe('화면 문장 — 두 값을 나란히, 금지어 0', () => {
  const inputs: ShutdownAllowanceInput[] = [
    base({}), // C2 단서
    base({ average: period(11_040_000) }), // C1
    base({ average: period(9_000_000, { startDate: '2026-11-01' }), ordinary: { unit: 'month', amount: 3_000_000, weeklyHours: 40, dailyHours: 8 }, days: 26 }), // C4
    base({ average: { source: 'direct', daily: 150_000 }, days: 5, paidDuring: 250_000 }), // C5
    base({ average: { source: 'direct', daily: 150_000 }, days: 1, paidDuring: 160_000 }), // 0으로 묶임
    base({ average: period(12_000_000, { excludedDays: 10, excludedWages: 700_000 }) }), // C10
    base({ ordinary: { unit: 'week', amount: 600_000, weeklyHours: 40, dailyHours: 8 } }),
    base({ ordinary: { unit: 'hour', amount: 12_500, dailyHours: 8 } }),
    base({ fivePlus: false }),
    base({ cause: 'force-majeure' }),
    base({ cause: 'commission' }),
  ];
  const outs: ShutdownAllowanceResult[] = inputs.map(calcShutdownAllowance);

  it('모든 결과 문장과 입력 안내에 금지어가 없다', () => {
    for (const r of outs) {
      const lines = allCopy(r);
      expect(lines.length).toBeGreaterThan(3);
      for (const line of lines) expect(bannedHits(line), line).toEqual([]);
    }
    for (const line of [DAYS_HINT, EXCLUDE_HINT, PAID_HINT, ...SCOPE_ITEMS]) expect(bannedHits(line), line).toEqual([]);
  });

  it('입력 칸 안내문도 allCopy 에 들어 게이트를 거친다', () => {
    expect(allCopy(outs[0])).toEqual(expect.arrayContaining([DAYS_HINT, EXCLUDE_HINT, PAID_HINT]));
  });

  it('단서가 나오면 두 금액을 한 줄에 나란히 두고 무엇으로 갈리는지 적는다 — 어느 쪽도 권하지 않는다', () => {
    const h = headline(outs[0]).join(' ');
    expect(h).toContain('1,050,000원');
    expect(h).toContain('1,000,000원');
    expect(h).toMatch(/제46조제1항 단서/);
    expect(h).toMatch(/회사가 고릅니다/);
    expect(h).not.toMatch(/유리|권합니다|권장/);
  });

  it('단서가 없으면 한 값만, §2②가 발동하면 그렇다고 말한다', () => {
    expect(headline(outs[1])[0]).toBe('휴업수당은 840,000원 이상입니다.');
    expect(headline(outs[1]).join(' ')).not.toContain('통상임금 기준');
    const c4 = headline(outs[2]).join(' ');
    expect(c4).toContain('2,089,953원');
    expect(c4).toMatch(/제2조제2항/);
  });

  it('산식 — 시행령 §26 식(70%를 곱하기 전에 받은 임금을 뺀다)과 원 미만 올림을 밝힌다', () => {
    const f5 = formulaLines(outs[3]).join(' ');
    expect(f5).toContain('(150,000원 × 5일 − 받은 임금 250,000원) × 0.7 = 350,000원');
    expect(f5).toMatch(/시행령 제26조/);
    expect(f5).not.toContain('275,000');
    const f4 = formulaLines(outs[2]).join(' ');
    expect(f4).toContain('(40 + 8) × 365 ÷ 7 ÷ 12');
    expect(f4).toMatch(/원 미만.*올/);
    expect(f4).toMatch(/법령에 정함이 없/);
  });

  it('0으로 묶인 경우를 숨기지 않는다', () => {
    expect(headline(outs[4]).join(' ')).toMatch(/받은 임금/);
    expect(outs[4].main).toBe(0);
  });

  it('계산하지 않는 갈래는 이유와 근거를 말한다', () => {
    expect(headline(outs[8]).join(' ')).toMatch(/4명 이하.*별표1/);
    expect(headline(outs[9]).join(' ')).toMatch(/귀책사유/);
    expect(effectLines(outs[10]).join(' ')).toMatch(/별지 제4호서식/);
    expect(effectLines(outs[10]).join(' ')).toMatch(/노동위원회규칙 제85조/);
  });

  it('다루지 않는 것 — 귀책사유 여부·평균임금 예외·상여금 가산·쟁의행위', () => {
    const s = SCOPE_ITEMS.join(' ');
    for (const w of ['귀책사유', '2012다12870', '상여금', '쟁의행위']) expect(s).toContain(w);
  });
});
