import { describe, expect, it } from 'vitest';
import {
  allCopy,
  baseHours,
  checkItem,
  directionSentence,
  eraLabel,
  eraOn,
  itemNotes,
  OLD_ERA_NOTICE,
  PERF_YEAR_LABEL,
  RIGHT_TO_PAY_NOTICE,
  AGREED_WAGE_NOTICE,
  UNIT_HOURS_NOTE,
  splitOvertime,
  sumIncluded,
  summaryLines,
  type WageItem,
} from '@/lib/calc/ordinary-wage-check';
import { SOURCES } from '@/lib/calc/ordinary-wage-sources';
import { unitHours } from '@/lib/calc/min-wage';
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

  it('A1-d 병행사건 여부는 판단하지 않고 종전 구간에 안내문만 낸다 — 판결의 요건(선고 시점에 법원에 계속 중)을 담고, 판결이 정한 것으로 적는다', () => {
    // 판결 원문(Q12)의 병행사건 정의
    expect(SOURCES.Q12.quote).toContain('이 판결 선고 시점에 이 판결이 변경하는 법리가 재판의 전제가 되어 통상임금 해당 여부가 다투어져 법원에 계속 중인 사건들');
    expect(OLD_ERA_NOTICE).toContain('2024. 12. 18.까지 제공한 연장근로 등');
    expect(OLD_ERA_NOTICE).toMatch(/선고.*통상임금 해당 여부.*계속 중.*병행사건/);
    expect(OLD_ERA_NOTICE).toContain('판결');
    // 「그 무렵」은 선고 직후 낸 소송까지 품는다. 「적용됩니다」는 판결이 정한 것을 우리 목소리로 단정한다
    expect(OLD_ERA_NOTICE).not.toContain('그 무렵');
    expect(OLD_ERA_NOTICE).not.toContain('새 기준이 적용됩니다');
  });

  it('A1-e 새 기준·종전 기준 이름표는 둘 다 「제공」한 날로 가른다(Q12 「이후 제공한 연장근로 등」)', () => {
    expect(eraLabel('new')).toBe('새 기준(2024. 12. 19. 이후 제공분)');
    expect(eraLabel('old')).toBe('종전 기준(2024. 12. 18.까지 제공분)');
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
    const r = checkItem({ ...daysItem(15, 21), proRataOnShortDays: true }, 'old');
    expect(r.direction).toBe('in');
    expect(r.reasons).toContain('U08');
  });

  it('A2-b 종전 기준 — 퇴직 시 비례(U09)와 일수 미달 시 일할(U08)은 따로 본다. 하나만 비례면 다른 조건 때문에 빠지는 쪽(Q17)', () => {
    // 「15일 미만은 일할, 지급일 전 퇴직자는 미지급」
    const daysOnly = { ...bonus, workDays: { required: 15, scheduled: 21 }, proRataOnShortDays: true };
    expect(checkItem(daysOnly, 'old')).toMatchObject({ direction: 'out', reasons: ['Q17'] });
    // 「지급일 전 퇴직자는 일할, 15일 미만은 미지급」
    const leaveOnly = { ...bonus, workDays: { required: 15, scheduled: 21 }, proRataOnLeave: true };
    expect(checkItem(leaveOnly, 'old')).toMatchObject({ direction: 'out', reasons: ['Q17'] });
    // 둘 다 비례면 그 한도에서 들어가는 쪽
    const both = { ...daysOnly, proRataOnLeave: true };
    expect(checkItem(both, 'old').direction).toBe('in');
    expect(checkItem(both, 'old').reasons).toEqual(expect.arrayContaining(['U09', 'U08']));
    // 새 기준은 비례 여부와 상관없다
    expect(checkItem(daysOnly, 'new').direction).toBe('in');
  });

  it('A2-c 붙어 있는 조건을 적고 「근무시간의 대가」에 「아니오」 — 조건 때문인지 가릴 수 없어 보류하고 조건 칸을 안내한다(Q06·Q07)', () => {
    const x = item({ kind: 'attendance', amount: 100_000, forWork: 'no', workDays: { required: 15, scheduled: 21 } });
    const r = checkItem(x, 'new');
    expect(r.direction).toBe('unclear');
    expect(r.annual).toBe(0);
    expect(itemNotes(x, r).join(' ')).toContain('붙어 있는 조건');
    expect(checkItem({ ...bonus, forWork: 'no' }, 'new').direction).toBe('unclear');
    expect(checkItem(item({ kind: 'attendance', amount: 100_000, forWork: 'no', attendanceRate: 90 }), 'old').direction).toBe('unclear');
    // 조건이 없거나, 조건 자체가 소정근로일수를 넘으면 그대로 빠지는 쪽
    expect(checkItem(item({ kind: 'attendance', amount: 100_000, forWork: 'no' }), 'new').direction).toBe('out');
    expect(checkItem(daysItem(22, 21), 'new').direction).toBe('out');
    expect(checkItem({ ...daysItem(22, 21), forWork: 'no' }, 'new').direction).toBe('out');
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

  it('A5-b 출근율 경계 — 100% 는 소정근로일수 「이내」로 들어가는 쪽, 100.01% 는 빠지는 쪽. 2021다258296 은 원문 인용으로 붙는다', () => {
    const rate = (attendanceRate: number) => checkItem(item({ kind: 'attendance', amount: 300_000, attendanceRate }), 'new');
    expect(rate(100).direction).toBe('in');
    expect(rate(100).reasons).toContain('V01');
    expect(rate(100.01).direction).toBe('out');
    expect(SOURCES.V01.quote).toContain('소정근로일수에 미치지 못하는 근무일수의 출근을 요구하는 출근율 조건');
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

  it('A7-b 실적 기간 선택지 — 기준일이 속한 해의 실적분은 지급이 다음 해여도 그해 합계에 넣는다(S01 「지급 대상기간」 기준)', () => {
    expect(PERF_YEAR_LABEL.current).toContain('지급이 다음 해여도');
    expect(PERF_YEAR_LABEL.previous).toContain('전년도');
    expect(sumIncluded([base, perf(1_250_000, 'current')], 'new', 209).annual).toBe(31_250_000);
    const prev = perf(1_250_000, 'previous');
    expect(itemNotes(prev, checkItem(prev, 'new')).join(' ')).toContain('기준일이 속한 해의 실적분');
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

  it('A9-c 기본금액을 넣은 가족수당은 지급 대상·근무시간의 대가 답과 상관없이 기본금액만(U05 「기본금액은 소정근로에 대한 대가」)', () => {
    const noForWork = item({ kind: 'family', amount: 80_000, uniform: 'no', forWork: 'no', baseForAll: 20_000 });
    expect(checkItem(noForWork, 'new')).toMatchObject({ direction: 'in', partial: true, annual: 240_000 });
    const uniformYes = item({ kind: 'family', amount: 80_000, baseForAll: 20_000 });
    expect(checkItem(uniformYes, 'new')).toMatchObject({ direction: 'in', partial: true, annual: 240_000 });
    // 기본금액에 남는 질문은 정해진 주기뿐이다
    const blank = item({ kind: 'family', amount: 80_000, regular: 'unknown', uniform: 'unknown', forWork: 'unknown', baseForAll: 20_000 });
    expect(checkItem(blank, 'new')).toMatchObject({ direction: 'unclear', open: ['regular'] });
    expect(checkItem({ ...blank, regular: 'no' }, 'new').direction).toBe('out');
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

  it('A12-b 무사고·장애인·경영성과급 종류를 세 질문 모두 「예」로 답하면 종류 이름이 가리키는 반대 근거와 주의 문장을 붙인다', () => {
    for (const [kind, id] of [['extra', 'Q11'], ['disability', 'T01'], ['business', 'G_P15']] as const) {
      const x = item({ kind, amount: 200_000 });
      const r = checkItem(x, 'new');
      expect(r.reasons, kind).toContain(id);
      expect(itemNotes(x, r).length, kind).toBeGreaterThan(0);
    }
    // 그 밖의 종류에는 붙이지 않는다
    expect(itemNotes(base, checkItem(base, 'new'))).toEqual([]);
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

  it('A16 재직조건부 정기상여, 2024. 12. 20. 제공분 — 들어가는 쪽이고 지침 Q7(입사 직후 미수령자 사례)을 근거로 붙인다', () => {
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

  it('경계 — 1회 지급액이 비면(0) 보류로 두고 개수·합계에서 뺀다(「시간당 0.00원」을 내지 않는다)', () => {
    const zero = item({ kind: 'base', amount: 0 });
    const r = checkItem(zero, 'new');
    expect(r.direction).toBe('unclear');
    expect(sumIncluded([zero], 'new', 209)).toEqual({ annual: 0, hourly: 0, count: 0 });
    expect(summaryLines('new', [r], 0).join(' ')).not.toContain('0.00원');
    expect(itemNotes(zero, r).join(' ')).toContain('1회 지급액');
    // 「아니오」가 있으면 금액과 상관없이 빠지는 쪽
    expect(checkItem({ ...zero, regular: 'no' }, 'new').direction).toBe('out');
  });

  it('경계 — 최소 보장액·기본금액이 1회 지급액보다 크면 오류', () => {
    expect(() => checkItem({ ...perf(2_000_000), amount: 1_000_000 }, 'new')).toThrow();
    expect(() => checkItem(item({ kind: 'family', amount: 10_000, uniform: 'no', baseForAll: 50_000 }), 'new')).toThrow();
    // 같으면 된다
    expect(checkItem({ ...perf(1_000_000), amount: 1_000_000 }, 'new').annual).toBe(1_000_000);
  });

  it('경계 — 종전 기준에서 조건 일수가 소정근로일수를 넘으면 비례 지급이어도 빠지는 쪽, 근거는 종전 판결', () => {
    const over = { ...daysItem(22, 21), proRataOnShortDays: true };
    const r = checkItem(over, 'old');
    expect(r.direction).toBe('out');
    expect(r.reasons).toEqual(['U01']);
    expect(checkItem(daysItem(22, 21), 'old').reasons).toEqual(['Q17']);
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
    expect(baseHours(48, '52.14') * 12).toBeCloseTo(2_502.72, 2);
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

  it('B3-b 365일 식을 정수로 반올림하면 최저임금 확인·해고예고수당 도구의 월 209시간과 같다 — 안내문도 그 관계로 적는다', () => {
    expect(Math.round(baseHours(48, '365'))).toBe(unitHours('month', 40));
    expect(UNIT_HOURS_NOTE).toContain('반올림한 209시간');
    expect(UNIT_HOURS_NOTE).not.toContain('관행');
  });

  it('B7 끝수 — 소수 셋째 자리에서 반올림한다. 1.005 가 이진 부동소수 때문에 1.00 으로 내려가지 않는다', () => {
    // 201원 × 12 = 2,412 ÷ 12 ÷ 200 = 1.005
    expect(sumIncluded([item({ kind: 'base', amount: 201 })], 'new', 200).hourly).toBe(1.01);
    // 기준시간에 소수가 있어도 같다: 2,412 ÷ 12 ÷ 100.5 = 2 (딱 떨어짐), 2,613 ÷ 12 ÷ 100.5 = 2.1667 → 2.17
    expect(sumIncluded([item({ kind: 'base', amount: 201 })], 'new', 100.5).hourly).toBe(2);
    expect(sumIncluded([item({ kind: 'base', amount: 2_613, timesPerYear: 1 })], 'new', 100.5).hourly).toBe(2.17);
    expect(() => sumIncluded([base], 'new', 208.567)).toThrow();
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
  it('세 문장은 리서치 글자 그대로(이름표만 「제공분」)', () => {
    expect(directionSentence('in', 'new')).toBe('새 기준(2024. 12. 19. 이후 제공분)으로는 통상임금에 들어가는 쪽으로 볼 요소가 있습니다.');
    expect(directionSentence('out', 'new')).toBe('새 기준으로도 통상임금에서 빠지는 쪽으로 볼 요소가 있습니다.');
    expect(directionSentence('unclear', 'new')).toBe('입력만으로는 어느 쪽인지 가리기 어렵습니다. 지급 규정 원문을 확인해 주세요.');
  });

  it('통상임금 산입과 지급받을 권리는 별개라는 문장 — 판결의 한정(특별한 사정이 없는 한)과 출처를 함께 적는다(T02)', () => {
    expect(SOURCES.T02.quote).toContain('특별한 사정이 없는 한 무효라고 볼 수 없다');
    expect(RIGHT_TO_PAY_NOTICE).toContain('통상임금 계산에 넣는 것과, 퇴직자가 그 임금을 받을 권리는 별개입니다');
    expect(RIGHT_TO_PAY_NOTICE).toContain('특별한 사정이 없는 한');
    expect(RIGHT_TO_PAY_NOTICE).toContain('2019다204876');
  });

  it('약정 통상임금 경고 — 판결대로 「전체적으로 비교」(T03), 항목별 취사선택 불가(T04)', () => {
    expect(SOURCES.T03.quote).toContain('전체적으로 비교하여');
    expect(AGREED_WAGE_NOTICE).toContain('전체적으로 비교해');
    expect(AGREED_WAGE_NOTICE).not.toContain('따로 비교');
    expect(AGREED_WAGE_NOTICE).toContain('유리한 것만 골라');
  });

  it('입력을 확인할 항목이 있어도 다른 항목의 답은 그대로 내고, 그 개수를 덧붙인다', () => {
    const lines = summaryLines('new', [checkItem(base, 'new')], 11_961.72, 1);
    expect(lines.join(' ')).toMatch(/항목은 1개입니다.*11,961\.72원.*1개 항목은 입력을 확인해 주세요/);
  });

  it('화면 문장 전부에 금지어가 없다', () => {
    const lines = allCopy();
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.flatMap((l) => bannedHits(l).map((w) => `${w} | ${l}`))).toEqual([]);
  });

  it('우리 문장은 단정하지 않는다 — 「확정」「산입됩니다」「해당합니다」「~쪽입니다」「의무는 생기지 않는다고 봅니다」를 쓰지 않는다', () => {
    // 근거 원문(quote)과 출처를 밝힌 요지(note)는 빼고, 도구가 제 목소리로 내는 문장만 본다
    const sourced = new Set(Object.values(SOURCES).flatMap((s) => [s.quote, s.note]));
    const ours = allCopy().filter((l) => !sourced.has(l));
    expect(ours.filter((l) => /확정|산입됩니다|산입되지 않습니다|해당합니다|해당하지 않습니다|쪽입니다|생기지 않는다고 봅니다/.test(l))).toEqual([]);
  });

  it('근거 원문에는 생략 부호가 없다 — 요약은 인용부호 밖(note)에 둔다', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.quote ?? '', id).not.toMatch(/…|\.\.\./);
      expect(Boolean(s.quote) !== Boolean(s.note), `${id}: 원문과 요지 중 하나만`).toBe(true);
    }
  });

  it('근거는 기준에 맞춘다 — 종전 기준으로 들어가는 쪽·조건 때문에 빠지는 쪽에는 2024 전원합의체·2025 판결·지침을 붙이지 않는다', () => {
    // Q17 은 2024 판결이 종전 기준을 정리한 부분이라 종전 기준 근거다
    const NEW_ERA = /^(Q(0\d|1[0-6])|R\d|S\d|T\d|V\d|G_)/;
    const items: WageItem[] = [
      { ...bonus, proRataOnLeave: true },
      item({ kind: 'attendance', amount: 1, workDays: { required: 15, scheduled: 21 }, proRataOnShortDays: true }),
      item({ kind: 'attendance', amount: 1, workDays: { required: 22, scheduled: 21 } }),
      item({ kind: 'attendance', amount: 1, workDays: { required: 22, scheduled: 21 }, proRataOnShortDays: true }),
      item({ kind: 'performance', amount: 1, minimum: 1, performanceYear: 'current' }),
      item({ kind: 'family', amount: 2, uniform: 'no', baseForAll: 1 }),
      item({ kind: 'tenure', amount: 1, leaveOrDisciplineOnly: true }),
      item({ kind: 'holiday', amount: 1, timesPerYear: 2 }),
      item({ kind: 'allowance', amount: 1 }),
    ];
    for (const it of items) {
      const ids = checkItem(it, 'old').reasons;
      expect(ids.filter((id) => NEW_ERA.test(id)), `${it.kind} ${ids.join(',')}`).toEqual([]);
    }
  });
});
