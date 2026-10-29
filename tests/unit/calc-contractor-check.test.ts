import { describe, expect, it } from 'vitest';
import {
  calcBusinessWithholding,
  checkItems,
  compareTakeHome,
  QUESTIONS,
  SOURCES,
  type Answers,
  type MoneyResult,
} from '@/lib/calc/contractor-check';
import { allCopy, CHECK_HEADLINE, itemSentence, LIGHT_SENTENCE, moneyHeadline } from '@/app/tools/contractor-check/copy';
import { bannedHits } from '@/lib/tool-kit/banned';
import { TOOLS } from '@/content/tools-registry';

// 3.3% 계약 점검 — ① 근로자성 요소 대조(대법원 2006. 12. 7. 선고 2004다29736 판결) ② 같은 보수의 3.3% / 근로소득 예상 실수령.
// 기대값은 구현과 따로 만든 리서치 스크립트(research_contractor_cases.py — 조문 식을 Decimal 내림으로 직접 계산하고
// 간이세액은 조견표 xlsx 에서 찾는다, take-home-pay.ts 를 import 하지 않는다)의 출력이다. M6·M9 는 손 계산.
// 사례는 모두 합성 입력이다. 기준일은 따로 적지 않으면 2026-10-29, 공제대상가족 1명.

const DATE = '2026-10-29';

type Biz = [incomeTax: number, localTax: number, takeHome: number];
type Wage = [nps: number, health: number, ltc: number, employment: number, insurance: number, incomeTax: number, localTax: number, takeHome: number];

const money = (pay: number, meal = 0, date = DATE): MoneyResult => compareTakeHome({ pay, meal, family: 1 }, date);

describe('금액 — 3.3%와 근로소득을 나란히(M1~M8)', () => {
  it.each<[string, number, number, Biz, Wage]>([
    ['M1 300만', 3_000_000, 0, [90_000, 9_000, 2_901_000], [142_500, 107_850, 14_170, 27_000, 291_520, 74_350, 7_430, 2_626_700]],
    ['M2 끝수 2,345,678', 2_345_678, 0, [70_370, 7_030, 2_268_278], [111_380, 84_320, 11_070, 21_110, 227_880, 30_450, 3_040, 2_084_308]],
    ['M3 식대 20만(한도와 같음)', 3_000_000, 200_000, [90_000, 9_000, 2_901_000], [133_000, 100_660, 13_220, 25_200, 272_080, 56_800, 5_680, 2_665_440]],
    ['M4 식대 30만(한도 초과)', 3_100_000, 300_000, [93_000, 9_300, 2_997_700], [137_750, 104_250, 13_690, 26_100, 281_790, 65_360, 6_530, 2_746_320]],
    ['M5 25만(하한·표 아래)', 250_000, 0, [7_500, 750, 241_750], [19_470, 10_080, 1_320, 2_250, 33_120, 0, 0, 216_880]],
    ['M6 1,000만(표 안 마지막 행)', 10_000_000, 0, [300_000, 30_000, 9_670_000], [313_020, 359_500, 47_230, 90_000, 809_750, 1_507_400, 150_740, 7_532_110]],
    ['M8 150만', 1_500_000, 0, [45_000, 4_500, 1_450_500], [71_250, 53_920, 7_080, 13_500, 145_750, 8_920, 890, 1_344_440]],
  ])('%s', (_n, pay, meal, biz, wage) => {
    const r = money(pay, meal);
    expect([r.business.incomeTax, r.business.localTax, r.business.takeHome]).toEqual(biz);
    expect(r.wage.status).toBe('ok');
    if (r.wage.status !== 'ok') return;
    const w = r.wage;
    expect([w.nps, w.health, w.ltc, w.employment, w.insurance, w.tax.incomeTax, w.tax.localTax, w.takeHome]).toEqual(wage);
  });

  it('3.3%는 식대까지 지급액 전액에 매긴다 — M3 의 3.3% 쪽은 M1 과 같다', () => {
    expect(money(3_000_000, 200_000).business).toEqual(money(3_000_000).business);
  });

  it('M7 1,200만 — 근로소득 쪽은 표 밖이라 소득세를 계산하지 않고 4대보험만', () => {
    const r = money(12_000_000);
    expect([r.business.incomeTax, r.business.localTax, r.business.takeHome]).toEqual([360_000, 36_000, 11_604_000]);
    expect(r.wage.status).toBe('aboveTable');
    if (r.wage.status !== 'aboveTable') return;
    expect([r.wage.nps, r.wage.health, r.wage.ltc, r.wage.employment, r.wage.insurance]).toEqual([313_020, 431_400, 56_680, 108_000, 909_100]);
  });

  it('경계 — 10,000,000 은 표 안, 10,000,001 은 표 밖', () => {
    expect(money(10_000_000).wage.status).toBe('ok');
    expect(money(10_000_001).wage.status).toBe('aboveTable');
  });

  it('M9 2027-01-15 — 국민연금 근로자 몫 1만분의 500(rates.ts 현재값 전제)', () => {
    const r = money(3_000_000, 0, '2027-01-15');
    expect(r.business.takeHome).toBe(2_901_000);
    expect(r.wage.status).toBe('ok');
    if (r.wage.status !== 'ok') return;
    expect(r.wage.nps).toBe(150_000);
    expect(r.wage.takeHome).toBe(2_619_200);
  });
});

describe('근로소득 쪽을 계산하지 못하면 3.3% 쪽만', () => {
  it('공제 합계가 보수보다 많은 소액(3만원) — 근로소득 쪽은 이유와 함께 계산하지 않음', () => {
    const r = money(30_000);
    expect([r.business.incomeTax, r.business.localTax, r.business.takeHome]).toEqual([900, 90, 29_010]);
    expect(r.wage.status).toBe('notComputed');
    if (r.wage.status === 'notComputed') expect(r.wage.reason).toMatch(/공제 합계/);
  });

  it('식대가 보수와 같으면 근로소득 쪽 과세 급여가 없다', () => {
    const r = money(200_000, 200_000);
    expect(r.business.takeHome).toBe(193_400);
    expect(r.wage.status).toBe('notComputed');
  });

  it('기준일에 맞는 요율이 없으면 다른 해 값으로 대신하지 않는다', () => {
    const r = money(3_000_000, 0, '2025-12-31');
    expect(r.wage.status).toBe('noRates');
    expect(r.rates).toBeNull();
    expect(r.business.takeHome).toBe(2_901_000);
  });

  it('입력이 틀리면 멈춘다', () => {
    expect(() => compareTakeHome({ pay: 0, family: 1 }, DATE)).toThrow();
    expect(() => compareTakeHome({ pay: 1_500.5, family: 1 }, DATE)).toThrow();
    expect(() => compareTakeHome({ pay: 1_000_000_001, family: 1 }, DATE)).toThrow();
    expect(() => compareTakeHome({ pay: 3_000_000, family: 0 }, DATE)).toThrow();
    expect(() => compareTakeHome({ pay: 3_000_000, meal: 3_000_001, family: 1 }, DATE)).toThrow();
  });
});

describe('3.3% 소액 — 계속·반복 인적 용역은 1천원 미만도 뗀다(소득세법 시행령 제149조의3)', () => {
  it('S1 33,000 → 990 / 90 / 31,920', () => {
    expect(calcBusinessWithholding(33_000)).toEqual({ pay: 33_000, incomeTax: 990, localTax: 90, takeHome: 31_920 });
  });
  it('S2 33,340 → 1,000 / 100 / 32,240', () => {
    expect(calcBusinessWithholding(33_340)).toEqual({ pay: 33_340, incomeTax: 1_000, localTax: 100, takeHome: 32_240 });
  });
});

describe('근로자성 요소 대조(P1~P3)', () => {
  const ALL = QUESTIONS.map((q) => q.id);
  const WORKER = '근로자로 볼 요소가 있습니다.';
  const FEW = '근로자로 볼 요소가 적습니다.';
  const sentences = (a: Answers) => Object.fromEntries(checkItems(a).map((i) => [i.id, itemSentence(i)]));

  it('질문은 Q1~Q8, 가벼운 항목은 Q6·Q7·Q8', () => {
    expect(ALL).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']);
    expect(QUESTIONS.filter((q) => q.light).map((q) => q.id)).toEqual(['Q6', 'Q7', 'Q8']);
  });

  it('P1 종속 쪽 전부 — 모든 항목 「있습니다」', () => {
    const s = sentences({ Q1: 'yes', Q2: 'yes', Q3: 'no', Q4: 'no', Q5: 'yes', Q6: 'yes', Q7: 'yes', Q8: 'yes' });
    for (const id of ALL) expect(s[id], id).toBe(WORKER);
  });

  it('P2 독립 쪽 전부 — Q1~Q5 「적습니다」, Q6~Q8 은 「적습니다」가 아니라 가벼운 항목 문장', () => {
    const s = sentences({ Q1: 'no', Q2: 'no', Q3: 'yes', Q4: 'yes', Q5: 'no', Q6: 'no', Q7: 'no', Q8: 'no' });
    for (const id of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) expect(s[id], id).toBe(FEW);
    for (const id of ['Q6', 'Q7', 'Q8']) {
      expect(s[id], id).toBe(LIGHT_SENTENCE);
      expect(s[id], id).not.toMatch(/적습니다/);
    }
  });

  it('P3 2004다29736 사실관계형 — Q1~Q5 「있습니다」, Q6~Q8 가벼운 항목 문장', () => {
    const s = sentences({ Q1: 'yes', Q2: 'yes', Q3: 'no', Q4: 'no', Q5: 'yes', Q6: 'no', Q7: 'no', Q8: 'no' });
    for (const id of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) expect(s[id], id).toBe(WORKER);
    for (const id of ['Q6', 'Q7', 'Q8']) {
      expect(s[id], id).toBe(LIGHT_SENTENCE);
      expect(s[id], id).not.toMatch(/적습니다/);
    }
  });

  it('비품(Q3)·대행(Q4)은 「예」가 독립 쪽이다', () => {
    const s = sentences({ Q3: 'yes', Q4: 'yes' });
    expect([s.Q3, s.Q4]).toEqual([FEW, FEW]);
  });

  it('모름·빈 답은 「확인이 필요합니다」', () => {
    const s = sentences({ Q1: 'unknown' });
    for (const id of ALL) expect(s[id], id).toBe('확인이 필요합니다.');
  });

  it('가벼운 항목 문장은 판결 요약이라 인용부호를 쓰지 않는다', () => {
    expect(LIGHT_SENTENCE).not.toMatch(/[“”「」"]/);
  });
});

describe('판결 인용 — 【이유】 1. 가. 원문(판결요지 판이 아니다)', () => {
  it('첫 문단은 【이유】 쪽 글자', () => {
    const q = SOURCES.standard.quote;
    expect(q).toContain('위에서 말하는 종속적인 관계');
    expect(q).toContain('위험을 스스로 안고 있는지와 보수의 성격이');
    expect(q).toContain('임의로 정할 여지가 크다는 점에서 그러한 점들이');
    expect(q).toContain('(대법원 1994. 12. 9. 선고 94다22859 판결 등 참조)');
    expect(q).not.toContain('여기에서 종속적인 관계');
    expect(q).not.toContain('여지가 크기 때문에');
  });

  it('포섭 문단은 사업소득세 원천징수를 든 문장', () => {
    expect(SOURCES.applied.quote).toContain('근로소득세가 아닌 사업소득세를 원천징수당하였으며');
    expect(SOURCES.applied.quote).toMatch(/^그리고 비록 기록상/);
    expect(SOURCES.applied.quote).toMatch(/보기에는 부족하다\.$/);
  });

  it('출처 표시는 사건번호까지', () => {
    expect(SOURCES.standard.cite).toBe('대법원 2006. 12. 7. 선고 2004다29736 판결');
  });
});

describe('화면 문장', () => {
  const answerSets: Answers[] = [
    {},
    { Q1: 'yes', Q2: 'yes', Q3: 'no', Q4: 'no', Q5: 'yes', Q6: 'yes', Q7: 'yes', Q8: 'yes' },
    { Q1: 'no', Q2: 'no', Q3: 'yes', Q4: 'yes', Q5: 'no', Q6: 'no', Q7: 'no', Q8: 'no' },
  ];
  const moneys = [money(3_000_000, 200_000), money(12_000_000), money(30_000), money(3_000_000, 0, '2025-12-31'), money(33_000)];
  const texts = answerSets.flatMap((a) => moneys.flatMap((m) => allCopy(checkItems(a), m)));

  it('금지어가 없다', () => {
    expect(texts.flatMap((t) => bannedHits(t).map((h) => `${h} | ${t}`))).toEqual([]);
  });

  it('판정·점수·개수·확률을 말하지 않는다(「1개월」은 기간이라 뺀다)', () => {
    expect(texts.filter((t) => /판정|점수|\d+\s*개(?!월)|확률|가능성/.test(t))).toEqual([]);
  });

  it('점검 머리말은 결론을 내지 않는다', () => {
    expect(CHECK_HEADLINE.join(' ')).not.toMatch(/근로자입니다|근로자가 아닙니다/);
  });

  it('금액 머리말은 「예상」이고 두 값을 나란히', () => {
    const h = moneyHeadline(money(3_000_000)).join(' ');
    expect(h).toContain('예상');
    expect(h).toContain('2,901,000원');
    expect(h).toContain('2,626,700원');
  });

  it('대행이 아니라는 안내와 홈택스 링크 문장이 있다', () => {
    const t = allCopy(checkItems({}), money(3_000_000)).join('\n');
    expect(t).toContain('세무대리·신고서 작성 대행이 아닙니다');
    expect(t).toContain('홈택스');
  });
});

describe('등록부', () => {
  it('맨 끝 한 줄 — 이름·설명에 「세무」「절세」「판정」이 없다', () => {
    const t = TOOLS.find((x) => x.href === '/tools/contractor-check');
    expect(t).toBeDefined();
    expect(`${t!.title} ${t!.desc}`).not.toMatch(/세무|절세|판정/);
  });
});
