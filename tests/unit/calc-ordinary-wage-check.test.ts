import { describe, expect, it } from 'vitest';
import {
  allCopy,
  baseHours,
  checkItem,
  directionSentence,
  eraOn,
  OLD_ERA_NOTICE,
  RIGHT_TO_PAY_NOTICE,
  AGREED_WAGE_NOTICE,
  splitOvertime,
  sumIncluded,
  type WageItem,
} from '@/lib/calc/ordinary-wage-check';
import { SOURCES } from '@/lib/calc/ordinary-wage-sources';
import { bannedHits } from '@/lib/tool-kit/banned';

// 통상임금 점검 — 항목마다 소정근로 대가성·정기성·일률성을 묻고 「들어가는 쪽 / 빠지는 쪽 / 보류」를 보인다.
// 새 기준 = 대법원 2024. 12. 19. 선고 2020다247190·2023다302838 전원합의체(고정성 폐기), 2024. 12. 19. 이후 제공분.
// 종전 기준 = 2012다89399 전원합의체(고정성), 2024. 12. 18.까지 제공분.
// 사례·기대값은 리서치(ow_expected.py, 구현과 따로 계산한 스크립트)와 같다. 입력은 모두 합성 값이다.

const YES = { regular: 'yes', uniform: 'yes', forWork: 'yes' } as const;
const item = (o: Partial<WageItem> & Pick<WageItem, 'kind'>): WageItem => ({ name: o.kind, amount: 0, timesPerYear: 12, ...YES, ...o });

const base = item({ kind: 'base', name: '기본급', amount: 2_500_000 });
// 기본급 600% — 격월 100%, 지급일 재직자에게만
const bonus = item({ kind: 'bonus', name: '정기상여금', amount: 2_500_000, timesPerYear: 6, employedOnPayday: true });

describe('적용 기준 — 연장근로 등을 제공한 날로 가른다(2020다247190 이유 Q12)', () => {
  it('B5 2024-12-18 은 종전, 2024-12-19·2025-01-01 은 새 기준', () => {
    expect(eraOn('2024-12-18')).toBe('old');
    expect(eraOn('2024-12-19')).toBe('new');
    expect(eraOn('2025-01-01')).toBe('new');
  });

  it('없는 날짜는 오류', () => {
    expect(() => eraOn('2024-02-30')).toThrow();
    expect(() => eraOn('')).toThrow();
  });
});

describe('A — 항목 점검(분기 양쪽)', () => {
  it('A1 재직조건부 정기상여 — 새 기준은 들어가는 쪽(Q06)', () => {
    const r = checkItem(bonus, 'new');
    expect(r.direction).toBe('in');
    expect(r.annual).toBe(15_000_000);
    expect(r.reasons).toContain('Q06');
  });

  it('A1-b 같은 항목, 2024-12-18 제공분 — 종전 기준은 빠지는 쪽(고정성, Q17)', () => {
    const r = checkItem(bonus, eraOn('2024-12-18'));
    expect(r.direction).toBe('out');
    expect(r.annual).toBe(0);
    expect(r.reasons).toContain('Q17');
  });

  it('A1-c 지급일 전 퇴직 시 근무일수 비례 지급이면 종전 기준으로도 일할 한도는 들어가는 쪽(U09)', () => {
    const r = checkItem({ ...bonus, proRataOnLeave: true }, 'old');
    expect(r.direction).toBe('in');
    expect(r.annual).toBe(15_000_000);
    expect(r.reasons).toContain('U09');
  });

  it('A1-d 병행사건 여부는 판단하지 않고 종전 구간에 안내문만 낸다', () => {
    expect(OLD_ERA_NOTICE).toContain('2024. 12. 18.까지 제공한 연장근로 등에는 종전 기준(고정성)이 적용되어 결과가 달라질 수 있습니다.');
    expect(OLD_ERA_NOTICE).toContain('다만 그 무렵 이미 법원에서 다투던 사건에는 새 기준이 적용됩니다.');
    // 입력에 「병행사건」 칸이 없다 — 같은 항목은 기준일만으로 결과가 정해진다
    expect(checkItem(bonus, 'old')).toEqual(checkItem({ ...bonus }, 'old'));
  });

  const daysItem = (required: number, scheduled: number) =>
    item({ kind: 'attendance', name: '근무일수 조건 수당', amount: 100_000, workDays: { required, scheduled } });

  it('A2 월 15일 이상 근무 조건(소정 21일) — 새 기준 들어가는 쪽(Q07), 종전 기준 빠지는 쪽(Q17)', () => {
    const r = checkItem(daysItem(15, 21), 'new');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('Q07');
    expect(checkItem(daysItem(15, 21), 'old').direction).toBe('out');
  });

  it('A2 종전 기준이라도 15일 미만이면 일할 지급하는 경우 그 한도는 들어가는 쪽(U08)', () => {
    const r = checkItem({ ...daysItem(15, 21), proRataOnLeave: true }, 'old');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('U08');
  });

  it('A3 만근 조건 21일 = 소정 21일은 「이내」 — 들어가는 쪽, 금액은 정액 그대로', () => {
    const r = checkItem(daysItem(21, 21), 'new');
    expect(r.direction).toBe('in');
    expect(r.annual).toBe(1_200_000);
  });

  it('A4 조건 22일 > 소정 21일 — 빠지는 쪽(Q07 후단)', () => {
    const r = checkItem(daysItem(22, 21), 'new');
    expect(r.direction).toBe('out');
    expect(r.annual).toBe(0);
    expect(r.reasons).toContain('Q07');
  });

  it('A5 출근율 조건(90% 이상 전액, 50~90% 차등) — 들어가는 쪽, 금액은 온전 제공 시 금액(가중평균 아님)', () => {
    const r = checkItem(item({ kind: 'attendance', name: '출근율 상여', amount: 300_000, attendanceRate: 90 }), 'new');
    expect(r.direction).toBe('in');
    expect(r.annual).toBe(3_600_000);
    expect(r.reasons).toContain('Q13');
    // 출근율이 100%를 넘으면 소정근로일수를 넘는 조건이다
    expect(checkItem(item({ kind: 'attendance', amount: 300_000, attendanceRate: 110 }), 'new').direction).toBe('out');
  });

  const perf = (minimum: number, performanceYear: WageItem['performanceYear'] = 'current') =>
    item({ kind: 'performance', name: '성과급', amount: 10_000_000, timesPerYear: 1, forWork: 'no', minimum, performanceYear });

  it('A6 순수 성과급(D 0%) — 빠지는 쪽, 산입액 0(Q10)', () => {
    const r = checkItem(perf(0), 'new');
    expect(r.direction).toBe('out');
    expect(r.annual).toBe(0);
    expect(r.reasons).toContain('Q10');
  });

  it('A7 최소 보장 성과급(D도 기본급 50%/년) — 최소분만 들어가는 쪽, 시급 기여 498.41(÷209)', () => {
    const r = checkItem(perf(1_250_000), 'new');
    expect(r.direction).toBe('in');
    expect(r.partial).toBe(true);
    expect(r.annual).toBe(1_250_000);
    expect(r.reasons).toEqual(expect.arrayContaining(['Q10', 'Q16']));
    expect(sumIncluded([perf(1_250_000)], 'new', 209).hourly).toBeCloseTo(498.41, 2);
  });

  it('A7 같은 항목이 전년도 실적분이면 최소분은 전년도 통상임금 — 올해 합계에 넣지 않는다(S01)', () => {
    const r = checkItem(perf(1_250_000, 'previous'), 'new');
    expect(r.direction).toBe('in');
    expect(r.priorYear).toBe(true);
    expect(r.reasons).toContain('S01');
    expect(sumIncluded([base, perf(1_250_000, 'previous')], 'new', 209).annual).toBe(30_000_000);
  });

  it('A7 귀속기간을 모르면 보류', () => {
    expect(checkItem(perf(1_250_000, 'unknown'), 'new').direction).toBe('unclear');
  });

  it('A7 종전 기준도 최소한도 지급분은 들어가는 쪽(U10)', () => {
    const r = checkItem(perf(1_250_000), 'old');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('U10');
  });

  it('A8 경영성과급·격려금(매년 이사회가 지급 여부·금액 결정) — 빠지는 쪽(Q04), 「모름」이 섞여도', () => {
    const r = checkItem(item({ kind: 'business', amount: 1_000_000, timesPerYear: 1, regular: 'no', uniform: 'unknown', forWork: 'no' }), 'new');
    expect(r.direction).toBe('out');
    expect(r.reasons).toContain('Q04');
  });

  it('A9 부양가족 수에 따른 가족수당 — 빠지는 쪽(U05)', () => {
    const r = checkItem(item({ kind: 'family', amount: 60_000, uniform: 'no' }), 'new');
    expect(r.direction).toBe('out');
    expect(r.reasons).toContain('U05');
  });

  it('A9-b 전원 기본 2만원 + 부양가족 1인당 3만원 — 기본 2만원만 들어가는 쪽, (2,500,000+20,000)÷209 = 12,057.42', () => {
    const fam = item({ kind: 'family', amount: 80_000, uniform: 'no', baseForAll: 20_000 });
    const r = checkItem(fam, 'new');
    expect(r.direction).toBe('in');
    expect(r.partial).toBe(true);
    expect(r.annual).toBe(240_000);
    expect(sumIncluded([base, fam], 'new', 209).hourly).toBeCloseTo(12_057.42, 2);
  });

  it('A10 근속수당 — 들어가는 쪽(U06)', () => {
    const r = checkItem(item({ kind: 'tenure', amount: 30_000 }), 'new');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('U06');
  });

  it('A11 무사고수당 — 빠지는 쪽(Q11)', () => {
    const r = checkItem(item({ kind: 'extra', amount: 200_000, forWork: 'no' }), 'new');
    expect(r.direction).toBe('out');
    expect(r.reasons).toContain('Q11');
  });

  it('A12 장애인수당 — 빠지는 쪽(2019다204876, T01)', () => {
    const r = checkItem(item({ kind: 'disability', amount: 50_000, uniform: 'no', forWork: 'no' }), 'new');
    expect(r.direction).toBe('out');
    expect(r.reasons).toContain('T01');
  });

  it('A13 주휴수당 같은 법정수당 — 답과 상관없이 통상임금이 아니고 합계에 넣지 않는다(Q05)', () => {
    const wh = item({ kind: 'statutory', amount: 400_000 });
    const r = checkItem(wh, 'new');
    expect(r.direction).toBe('out');
    expect(r.reasons).toEqual(['Q05']);
    expect(sumIncluded([base, wh], 'new', 209).annual).toBe(30_000_000);
  });

  it('A14 명절귀향비(설·추석 각 기본급 50%, 지급일 재직자) — 들어가는 쪽', () => {
    const r = checkItem(item({ kind: 'holiday', amount: 1_250_000, timesPerYear: 2, employedOnPayday: true }), 'new');
    expect(r.direction).toBe('in');
    expect(r.annual).toBe(2_500_000);
    expect(r.reasons).toEqual(expect.arrayContaining(['G_P15', 'G_Q6']));
  });

  it('A15 휴직·징계자 지급 제한 규정이 있는 직무수당 — U07 근거를 더할 뿐 일률성 답을 뒤집지 않는다', () => {
    const job = item({ kind: 'allowance', amount: 200_000, leaveOrDisciplineOnly: true });
    const r = checkItem(job, 'new');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('U07');
    expect(checkItem({ ...job, uniform: 'no' }, 'new').direction).toBe('out');
    expect(checkItem({ ...job, uniform: 'unknown' }, 'new').direction).toBe('unclear');
  });

  it('A16 2024. 12. 10. 입사, 아직 상여 미수령, 12. 20.~12. 30. 연장근로 — 상여 포함 쪽(지침 Q7)', () => {
    const r = checkItem(bonus, eraOn('2024-12-20'));
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('G_Q7');
  });

  it('세 질문 중 「모름」이 있고 「아니오」가 없으면 보류, 어느 질문인지 돌려준다', () => {
    const r = checkItem(item({ kind: 'other', amount: 100_000, regular: 'unknown', forWork: 'unknown' }), 'new');
    expect(r.direction).toBe('unclear');
    expect(r.annual).toBe(0);
    expect(r.open).toEqual(['regular', 'forWork']);
  });

  it('잘못된 입력은 오류', () => {
    expect(() => checkItem(item({ kind: 'base', amount: -1 }), 'new')).toThrow();
    expect(() => checkItem(item({ kind: 'base', amount: 1.5 }), 'new')).toThrow();
    expect(() => checkItem(item({ kind: 'base', amount: 1, timesPerYear: 5 as 12 }), 'new')).toThrow();
    expect(() => checkItem(daysItem(0, 21), 'new')).toThrow();
  });
});

describe('B — 시간급(참고)', () => {
  const b1 = [
    base,
    item({ kind: 'allowance', name: '직무수당', amount: 200_000 }),
    item({ kind: 'tenure', name: '근속수당', amount: 50_000 }),
    bonus,
    item({ kind: 'performance', name: '성과급', amount: 300_000, forWork: 'no', minimum: 100_000, performanceYear: 'current' }),
    item({ kind: 'family', name: '가족수당', amount: 60_000, uniform: 'no' }),
  ];

  it('B1 새 기준 합계 월 4,100,000 — ÷209 = 19,617.22 · ÷208.56 = 19,658.61', () => {
    const s = sumIncluded(b1, 'new', 209);
    expect(s.annual).toBe(4_100_000 * 12);
    expect(s.hourly).toBeCloseTo(19_617.22, 2);
    expect(sumIncluded(b1, 'new', 208.56).hourly).toBeCloseTo(19_658.61, 2);
  });

  it('B1 가족수당(부양가족 차등)을 넣은 값 19,904.31 이 나오면 틀린 것이다', () => {
    expect(sumIncluded(b1, 'new', 209).hourly).not.toBeCloseTo(19_904.31, 2);
  });

  it('B1 종전 기준(재직조건부 상여 제외) 합계 월 2,850,000 — ÷209 = 13,636.36 · ÷208.56 = 13,665.13', () => {
    const s = sumIncluded(b1, 'old', 209);
    expect(s.annual).toBe(2_850_000 * 12);
    expect(s.hourly).toBeCloseTo(13_636.36, 2);
    expect(sumIncluded(b1, 'old', 208.56).hourly).toBeCloseTo(13_665.13, 2);
  });

  it('B2 지침 Q8 — 연 6,000,000 ÷ 12 ÷ 208.56 = 6,000,000 ÷ 2,502.72 = 2,397.39', () => {
    const yearly = item({ kind: 'bonus', amount: 6_000_000, timesPerYear: 1 });
    expect(sumIncluded([yearly], 'new', 208.56).hourly).toBeCloseTo(2_397.39, 2);
    const yearHours = baseHours(48, '52.14') * 12;
    expect(yearHours).toBeCloseTo(2_502.72, 2);
    expect(Math.round((6_000_000 / yearHours) * 100) / 100).toBeCloseTo(2_397.39, 2);
  });

  it('B3 월 기준시간 — 48h: 208.57 / 209.14 / 208.56 · 56h: 243.33 / 244.00 / 243.32 · 24h: 104.29', () => {
    expect(baseHours(48, '365')).toBeCloseTo(208.57, 2);
    expect(baseHours(48, '366')).toBeCloseTo(209.14, 2);
    expect(baseHours(48, '52.14')).toBeCloseTo(208.56, 2);
    expect(baseHours(56, '365')).toBeCloseTo(243.33, 2);
    expect(baseHours(56, '366')).toBeCloseTo(244.0, 2);
    expect(baseHours(56, '52.14')).toBeCloseTo(243.32, 2);
    expect(baseHours(24, '365')).toBeCloseTo(104.29, 2);
  });

  it('월 기준시간이 0 이하면 오류', () => {
    expect(() => sumIncluded([base], 'new', 0)).toThrow();
  });

  it('B4 지침 Q11 — 종전 13,000 · 새 15,000 · 가산 1.5, 제공한 날로 나눈다', () => {
    const s = (hoursBefore: number, hoursAfter: number) => splitOvertime({ oldHourly: 13_000, newHourly: 15_000, hoursBefore, hoursAfter });
    expect(s(15, 10)).toEqual({ before: 292_500, after: 225_000, total: 517_500 }); // ①
    expect(s(25, 0)).toEqual({ before: 487_500, after: 0, total: 487_500 }); // ② 종전 법리만
    expect(s(0, 18)).toEqual({ before: 0, after: 405_000, total: 405_000 }); // ③
    expect(s(18, 0)).toEqual({ before: 351_000, after: 0, total: 351_000 }); // ③-1
    expect(s(28, 11)).toEqual({ before: 546_000, after: 247_500, total: 793_500 }); // ④
    expect(s(4, 24)).toEqual({ before: 78_000, after: 540_000, total: 618_000 }); // ⑤
    // ③ 지침 견해(판결 아님): 고정 25h 중 남은 7h 를 종전 단가로 — 405,000 + 136,500 = 541,500
    expect(s(0, 18).total + s(7, 0).before).toBe(541_500);
  });

  it('B6 근무일수 경계 — 21:15 · 21:21 들어가는 쪽, 21:22 빠지는 쪽, 2개월 43:15 들어가는 쪽', () => {
    const d = (required: number, scheduled: number) =>
      checkItem(item({ kind: 'attendance', amount: 100_000, workDays: { required, scheduled } }), 'new').direction;
    expect(d(15, 21)).toBe('in');
    expect(d(21, 21)).toBe('in');
    expect(d(22, 21)).toBe('out');
    expect(d(15, 43)).toBe('in');
  });
});

describe('문장 — 단정하지 않는 점검형(리서치 R9)', () => {
  it('세 문장은 리서치 글자 그대로', () => {
    expect(directionSentence('in', 'new')).toBe('새 기준(2024. 12. 19. 이후 산정분)으로는 통상임금에 들어가는 쪽으로 볼 요소가 있습니다.');
    expect(directionSentence('out', 'new')).toBe('새 기준으로도 통상임금에서 빠지는 쪽으로 볼 요소가 있습니다.');
    expect(directionSentence('unclear', 'new')).toBe('입력만으로는 어느 쪽인지 가리기 어렵습니다. 지급 규정 원문을 확인해 주세요.');
  });

  it('통상임금 산입과 지급받을 권리는 별개라는 문장, 약정 통상임금 경고가 있다', () => {
    expect(RIGHT_TO_PAY_NOTICE).toContain('통상임금 계산에 넣는 것과, 퇴직자가 그 상여를 받을 권리는 별개입니다');
    expect(AGREED_WAGE_NOTICE).toContain('회사 규정에서 통상임금에서 뺀다고 정해 두었어도 법정 기준과 따로 비교합니다');
  });

  it('화면 문장 전부에 금지어가 없다', () => {
    const lines = allCopy();
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.flatMap((l) => bannedHits(l).map((w) => `${w} | ${l}`))).toEqual([]);
  });

  it('우리 문장은 단정하지 않는다 — 「확정」「산입됩니다」「해당합니다」를 쓰지 않는다', () => {
    const quotes = new Set(Object.values(SOURCES).map((s) => s.quote));
    const ours = allCopy().filter((l) => !quotes.has(l));
    expect(ours.filter((l) => /확정|산입됩니다|산입되지 않습니다|해당합니다|해당하지 않습니다/.test(l))).toEqual([]);
  });

  it('근거 원문에는 생략 부호가 없다 — 요약은 인용부호 밖(note)에 둔다', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.quote ?? '', id).not.toMatch(/…|\.\.\./);
      expect(Boolean(s.quote) !== Boolean(s.note), `${id}: 원문과 요지 중 하나만`).toBe(true);
    }
  });

  it('근거 id 는 전부 SOURCES 에 있다', () => {
    const items: WageItem[] = [
      bonus, { ...bonus, proRataOnLeave: true },
      item({ kind: 'attendance', amount: 1, workDays: { required: 15, scheduled: 21 } }),
      item({ kind: 'attendance', amount: 1, attendanceRate: 90 }),
      item({ kind: 'performance', amount: 1, forWork: 'no', minimum: 1, performanceYear: 'previous' }),
      item({ kind: 'family', amount: 2, uniform: 'no', baseForAll: 1 }),
      item({ kind: 'business', amount: 1, regular: 'no' }),
      item({ kind: 'extra', amount: 1, forWork: 'no' }),
      item({ kind: 'disability', amount: 1, uniform: 'no' }),
      item({ kind: 'statutory', amount: 1 }),
      item({ kind: 'tenure', amount: 1, leaveOrDisciplineOnly: true }),
      item({ kind: 'holiday', amount: 1, timesPerYear: 2, employedOnPayday: true }),
      item({ kind: 'other', amount: 1, regular: 'unknown' }),
    ];
    for (const era of ['new', 'old'] as const) {
      for (const it of items) for (const id of checkItem(it, era).reasons) expect(SOURCES[id], id).toBeDefined();
    }
  });
});
