import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { calcTakeHomePay, takeHomeRatesOn, withholdingTableTax, type TakeHomeInput, type TakeHomeRates } from '@/lib/calc/take-home-pay';
import { WITHHOLDING_ROWS } from '@/lib/calc/wage-withholding-2026-02-27';
import { allCopy, headline, NOTICE } from '@/app/tools/take-home-pay/copy';
import { bannedHits } from '@/lib/tool-kit/banned';
import { TOOLS } from '@/content/tools-registry';

// 실수령액 — 월 급여에서 4대보험 근로자 몫 + 간이세액표 소득세 + 지방소득세를 뺀다.
// 기대값은 구현과 따로 만든 리서치 스크립트(조문 식을 정수로 직접 계산, 2026-10-28)의 출력이다.
// 사례는 모두 합성 입력이다.

const RATES: TakeHomeRates = {
  npsPerMillion: 47_500,
  npsFloor: 410_000,
  npsCap: 6_590_000,
  healthPerMillion: 35_950,
  ltcPerMillion: 4_724,
  healthPremiumFloor: 20_160,
  healthPremiumCap: 9_183_480,
  employmentPerMillion: 9_000,
  mealNonTaxCap: 200_000,
};

const calc = (input: Partial<TakeHomeInput> & { pay: number }) => calcTakeHomePay({ family: 1, ...input }, RATES);

type Row = [nps: number, health: number, ltc: number, employment: number, incomeTax: number, localTax: number, takeHome: number];

// [이름, 입력, 연금 / 건보 / 요양 / 고용 / 소득세 / 지방 → 실수령]
const CASES: [string, Partial<TakeHomeInput> & { pay: number }, Row][] = [
  ['C01 300만·식대 20만', { pay: 3_000_000, meal: 200_000 }, [133_000, 100_660, 13_220, 25_200, 56_800, 5_680, 2_665_440]],
  ['C02 300만·식대 25만(한도 밖 5만은 과세)', { pay: 3_000_000, meal: 250_000 }, [133_000, 100_660, 13_220, 25_200, 56_800, 5_680, 2_665_440]],
  ['C03 300만·식대 없음', { pay: 3_000_000 }, [142_500, 107_850, 14_170, 27_000, 74_350, 7_430, 2_626_700]],
  ['C04 265만(정본 고정점 43,970)', { pay: 2_650_000 }, [125_870, 95_260, 12_510, 23_850, 43_970, 4_390, 2_344_150]],
  ['C05 265만·80%', { pay: 2_650_000, ratio: 80 }, [125_870, 95_260, 12_510, 23_850, 35_170, 3_510, 2_353_830]],
  ['C06 265만·120%', { pay: 2_650_000, ratio: 120 }, [125_870, 95_260, 12_510, 23_850, 52_760, 5_270, 2_334_480]],
  ['C07 400만·식대 20만·4인·자녀 2', { pay: 4_000_000, meal: 200_000, family: 4, children: 2 }, [180_500, 136_610, 17_950, 34_200, 28_730, 2_870, 3_599_140]],
  ['C08 400만·식대 20만·5인·자녀 3(공제가 세액보다 큼)', { pay: 4_000_000, meal: 200_000, family: 5, children: 3 }, [180_500, 136_610, 17_950, 34_200, 0, 0, 3_630_740]],
  ['C09 250만·3인·자녀 2(공제가 세액보다 큼)', { pay: 2_500_000, family: 3, children: 2 }, [118_750, 89_870, 11_810, 22_500, 0, 0, 2_257_070]],
  ['C10 35만(연금 하한, 건보 하한 아님)', { pay: 350_000 }, [19_470, 12_580, 1_650, 3_150, 0, 0, 313_150]],
  ['C11 25만(건보 하한)', { pay: 250_000 }, [19_470, 10_080, 1_320, 2_250, 0, 0, 216_880]],
  ['C12 800만(연금 상한)', { pay: 8_000_000 }, [313_020, 287_600, 37_790, 72_000, 959_500, 95_950, 6_234_140]],
  ['C13 300만·국민연금 공제 대상 아님', { pay: 3_000_000, npsExempt: true }, [0, 107_850, 14_170, 27_000, 74_350, 7_430, 2_769_200]],
  ['C14 300만·65세 이후 새로 고용', { pay: 3_000_000, employmentExempt: true }, [142_500, 107_850, 14_170, 0, 74_350, 7_430, 2_653_700]],
  ['C15 2,659,999(표 경계 바로 아래)', { pay: 2_659_999 }, [126_300, 95_620, 12_560, 23_930, 43_970, 4_390, 2_353_229]],
  ['C16 2,660,000(표 경계)', { pay: 2_660_000 }, [126_350, 95_620, 12_560, 23_940, 44_820, 4_480, 2_352_230]],
  ['C17 76만(770천원 미만)', { pay: 760_000 }, [36_100, 27_320, 3_580, 6_840, 0, 0, 686_160]],
  ['C18 1,000만 정확히', { pay: 10_000_000 }, [313_020, 359_500, 47_240, 90_000, 1_507_400, 150_740, 7_532_100]],
  ['C20 900만·가족 12명(11명 초과)', { pay: 9_000_000, family: 12 }, [313_020, 323_550, 42_510, 81_000, 714_620, 71_460, 7_453_840]],
  ['C21 2,345,678(천원 미만 버림)', { pay: 2_345_678 }, [111_380, 84_320, 11_080, 21_110, 30_450, 3_040, 2_084_298]],
  ['C22 350만·식대 20만·그 밖의 비과세 20만·3인', { pay: 3_500_000, meal: 200_000, otherNonTax: 200_000, family: 3 }, [147_250, 111_440, 14_640, 27_900, 35_240, 3_520, 3_160_010]],
  ['C23 300만·3인·자녀 1', { pay: 3_000_000, family: 3, children: 1 }, [142_500, 107_850, 14_170, 27_000, 11_110, 1_110, 2_696_260]],
  ['C24 700만·5인·자녀 3(일부만 공제)', { pay: 7_000_000, family: 5, children: 3 }, [313_020, 251_650, 33_060, 63_000, 418_190, 41_810, 5_879_270]],
  ['C25 700만·6인·자녀 4', { pay: 7_000_000, family: 6, children: 4 }, [313_020, 251_650, 33_060, 63_000, 358_980, 35_890, 5_944_400]],
  ['C26 C07 에 120%(자녀 공제 → 비율)', { pay: 4_000_000, meal: 200_000, family: 4, children: 2, ratio: 120 }, [180_500, 136_610, 17_950, 34_200, 34_470, 3_440, 3_592_830]],
  ['C27 C07 에 80%(자녀 공제 → 비율)', { pay: 4_000_000, meal: 200_000, family: 4, children: 2, ratio: 80 }, [180_500, 136_610, 17_950, 34_200, 22_980, 2_290, 3_605_470]],
  ['C28 410,999(연금 하한 경계)', { pay: 410_999 }, [19_470, 14_770, 1_940, 3_690, 0, 0, 371_129]],
  ['C29 6,590,999(연금 상한 경계)', { pay: 6_590_999 }, [313_020, 236_940, 31_130, 59_310, 637_450, 63_740, 5_249_409]],
  ['C30 250만·연금 제외 + 65세 이후 새로 고용', { pay: 2_500_000, npsExempt: true, employmentExempt: true }, [0, 89_870, 11_810, 0, 35_600, 3_560, 2_359_160]],
];

describe('실수령액 — 리서치 사례', () => {
  it.each(CASES)('%s', (_name, input, [nps, health, ltc, employment, incomeTax, localTax, takeHome]) => {
    const r = calc(input);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect([r.nps, r.health, r.ltc, r.employment, r.tax.incomeTax, r.tax.localTax, r.takeHome]).toEqual([nps, health, ltc, employment, incomeTax, localTax, takeHome]);
    expect(r.insurance).toBe(nps + health + ltc + employment);
    expect(r.deduction).toBe(r.insurance + incomeTax + localTax);
    expect(r.takeHome).toBe(input.pay - r.deduction);
  });

  it('식대는 20만원까지만 비과세 — 25만원이면 5만원은 과세 급여에 남는다', () => {
    expect(calc({ pay: 3_000_000, meal: 200_000 }).taxable).toBe(2_800_000);
    const over = calc({ pay: 3_000_000, meal: 250_000 });
    expect(over.mealNonTax).toBe(200_000);
    expect(over.taxable).toBe(2_800_000);
  });

  it('그 밖의 비과세는 넣은 그대로 뺀다', () => {
    const r = calc({ pay: 3_500_000, meal: 200_000, otherNonTax: 200_000, family: 3 });
    expect(r.nonTax).toBe(400_000);
    expect(r.taxable).toBe(3_100_000);
  });

  it('국민연금 기준소득월액 — 천원 미만 버림, 하한·상한', () => {
    expect(calc({ pay: 2_345_678 }).npsBase).toBe(2_345_000);
    expect(calc({ pay: 350_000 }).npsBase).toBe(410_000);
    expect(calc({ pay: 410_999 }).npsBase).toBe(410_000);
    expect(calc({ pay: 6_590_999 }).npsBase).toBe(6_590_000);
    expect(calc({ pay: 8_000_000 }).npsBase).toBe(6_590_000);
    expect(calc({ pay: 3_000_000, npsExempt: true }).npsBase).toBeNull();
  });

  it('건강보험 월 보험료 하한 — 과세 급여 280,389원까지는 총액 20,160원', () => {
    expect(calc({ pay: 280_389 }).healthTotal).toBe(20_160); // 식대로는 20,150 → 하한
    expect(calc({ pay: 250_000 }).healthTotal).toBe(20_160); // 17,970 → 하한
    expect(calc({ pay: 281_000 }).healthTotal).toBe(20_200);
    expect(calc({ pay: 350_000 }).healthTotal).toBe(25_160);
  });

  it('자녀 공제 → 비율 순서(비율을 먼저 곱하면 C26 은 43,640)', () => {
    const r = calc({ pay: 4_000_000, meal: 200_000, family: 4, children: 2, ratio: 120 });
    if (r.status !== 'ok') throw new Error('표 안이어야 한다');
    expect(r.tax.tableTax).toBe(74_560);
    expect(r.tax.childDeduction).toBe(45_830);
    expect(r.tax.incomeTax).toBe(34_470);
  });
});

describe('장기요양 — 건강보험료 × 장기요양보험료율 ÷ 건강보험료율(노인장기요양보험법 §9①)', () => {
  // 보수월액에 바로 0.4724% 를 곱하거나 근로자 건보료에 13.14% 를 곱하면 여기서 갈린다.
  it.each([
    [2_000_424, 9_440],
    [2_002_643, 9_460],
    [2_500_000, 11_810],
    [250_000, 1_320],
    [760_000, 3_580],
  ])('과세 급여 %i → %i', (pay, ltc) => {
    expect(calc({ pay }).ltc).toBe(ltc);
  });
});

describe('1,000만원 초과는 표 밖 — 소득세를 내지 않는다', () => {
  it('C19 10,000,001 — 보험료만 내고 소득세·지방세·실수령은 없다', () => {
    const r = calc({ pay: 10_000_001 });
    expect(r.status).toBe('aboveTable');
    expect([r.nps, r.health, r.ltc, r.employment]).toEqual([313_020, 359_500, 47_240, 90_000]);
    expect(r).not.toHaveProperty('takeHome');
    expect(r).not.toHaveProperty('tax');
  });

  it('과세 급여로 가른다 — 월 급여가 1,000만원을 넘어도 비과세를 빼면 표 안', () => {
    expect(calc({ pay: 10_100_000, meal: 200_000 }).status).toBe('ok');
  });
});

describe('공제대상가족 11명 초과(별표2 제4호)', () => {
  it('C20 — 11명 세액 − (10명 − 11명) × 초과 인원', () => {
    expect(withholdingTableTax(9_000_000, 12)?.tax).toBe(714_620);
    expect(withholdingTableTax(9_000_000, 11)?.tax).toBe(744_620);
    expect(withholdingTableTax(9_000_000, 13)?.tax).toBe(684_620);
  });

  it('식이 음수가 되면 0 — 290만원 행은 10명 1,170원 · 11명 0원', () => {
    expect(withholdingTableTax(2_890_000, 10)?.tax).toBe(1_170);
    expect(withholdingTableTax(2_890_000, 11)?.tax).toBe(0);
    expect(withholdingTableTax(2_890_000, 12)?.tax).toBe(0);
  });
});

describe('입력 확인', () => {
  it.each<[string, Partial<TakeHomeInput> & { pay: number }]>([
    ['월 급여 0', { pay: 0 }],
    ['월 급여 음수', { pay: -1 }],
    ['월 급여 소수', { pay: 3_000_000.5 }],
    ['월 급여 NaN', { pay: Number.NaN }],
    ['월 급여 10억 초과', { pay: 1_000_000_001 }],
    ['식대 음수', { pay: 3_000_000, meal: -1 }],
    ['그 밖의 비과세 소수', { pay: 3_000_000, otherNonTax: 0.5 }],
    ['비과세가 월 급여와 같다', { pay: 200_000, meal: 200_000 }],
    ['비과세가 월 급여보다 많다', { pay: 300_000, meal: 200_000, otherNonTax: 200_000 }],
    ['가족 0명', { pay: 3_000_000, family: 0 }],
    ['가족 소수', { pay: 3_000_000, family: 1.5 }],
    ['자녀가 가족 − 1 보다 많다', { pay: 3_000_000, family: 2, children: 2 }],
    ['자녀 음수', { pay: 3_000_000, family: 3, children: -1 }],
    ['비율 90%', { pay: 3_000_000, ratio: 90 as 100 }],
  ])('%s', (_n, input) => {
    expect(() => calc(input)).toThrow();
  });

  it('자녀 = 가족 − 1 은 된다', () => {
    expect(calc({ pay: 3_000_000, family: 3, children: 2 }).status).toBe('ok');
  });
});

describe('요율은 날짜 축 — 없으면 계산하지 않는다', () => {
  it('2026-10-28 은 rates.ts 의 값', () => {
    expect(takeHomeRatesOn('2026-10-28')).toEqual(RATES);
  });

  it('2027년은 국민연금 근로자 몫이 1만분의 500', () => {
    expect(takeHomeRatesOn('2027-01-01')?.npsPerMillion).toBe(50_000);
  });

  it('국민연금 상·하한 고시가 없는 날은 null — 다른 해 값으로 대신하지 않는다', () => {
    expect(takeHomeRatesOn('2026-06-30')).toBeNull();
    expect(takeHomeRatesOn('2027-07-01')).toBeNull();
  });
});

describe('간이세액표 원천 — 소득세법 시행령 [별표2] <개정 2026. 2. 27.>', () => {
  const CSV = 'data/tax/kr-wage-withholding-2026-02-27.csv';
  // 체크아웃 줄바꿈이 바뀌어도 같은 해시가 나오게 LF 로 맞춰서 센다(.gitattributes 도 LF 고정)
  const text = fs.readFileSync(CSV, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.trimEnd().split('\n');
  const rows = lines.slice(1).map((l) => l.split(',').map(Number));

  it('CSV 해시가 커밋한 값과 같다', () => {
    const sha = createHash('sha256').update(text).digest('hex');
    expect(sha).toBe('fd942a1a05a98f7250004e31dec66f6beb9835a5c63fcb77d10447ed2ec32c44');
    expect(fs.readFileSync(`${CSV}.sha256`, 'utf8').split(/\s+/)[0]).toBe(sha);
  });

  it('머리 1행 + 647행(646구간 + 10,000천원 행)', () => {
    expect(lines[0]).toBe('lower_won,upper_won,fam1,fam2,fam3,fam4,fam5,fam6,fam7,fam8,fam9,fam10,fam11');
    expect(rows).toHaveLength(647);
    expect(rows.every((r) => r.length === 13 && r.every(Number.isInteger))).toBe(true);
  });

  it('화면이 읽는 표가 CSV 와 전 행·전 칸 같다', () => {
    expect(WITHHOLDING_ROWS).toHaveLength(647);
    expect(WITHHOLDING_ROWS.map((r) => [...r])).toEqual(rows);
  });

  it('구간이 770천원에서 10,000천원까지 끊기지 않고, 폭은 5·10·20천원', () => {
    const brackets = rows.slice(0, 646);
    expect(brackets[0][0]).toBe(770_000);
    expect(brackets[645][1]).toBe(10_000_000);
    for (let i = 1; i < brackets.length; i++) expect(brackets[i][0], `행 ${i}`).toBe(brackets[i - 1][1]);
    const width = (lo: number) => (lo < 1_500_000 ? 5_000 : lo < 3_000_000 ? 10_000 : 20_000);
    expect(brackets.filter(([lo, hi]) => hi - lo !== width(lo))).toEqual([]);
    expect(rows[646].slice(0, 2)).toEqual([10_000_000, 10_000_000]);
  });

  it('세액은 10원 단위이고 가족 수가 늘면 줄거나 같고, 급여가 늘면 늘거나 같다', () => {
    const v = rows.map((r) => r.slice(2));
    expect(v.flat().filter((x) => x % 10 !== 0 || x < 0)).toEqual([]);
    expect(v.filter((r) => r.some((x, j) => j > 0 && x > r[j - 1]))).toEqual([]);
    const down: number[] = [];
    for (let i = 1; i < v.length; i++) if (v[i].some((x, j) => x < v[i - 1][j])) down.push(i);
    expect(down).toEqual([]);
  });

  it('찾기 — 이상·미만 경계, 770천원 미만은 0, 정확히 1,000만원 행, 초과는 표 밖', () => {
    expect(withholdingTableTax(2_650_000, 1)).toEqual({ row: [2_650_000, 2_660_000], tax: 43_970 });
    expect(withholdingTableTax(2_659_999, 1)?.tax).toBe(43_970);
    expect(withholdingTableTax(2_660_000, 1)?.tax).toBe(44_820);
    expect(withholdingTableTax(1_100_000, 1)?.tax).toBe(1_600);
    expect(withholdingTableTax(1_800_000, 1)?.tax).toBe(15_110);
    expect(withholdingTableTax(769_999, 1)).toEqual({ row: null, tax: 0 });
    expect(withholdingTableTax(10_000_000, 1)).toEqual({ row: [10_000_000, 10_000_000], tax: 1_507_400 });
    expect(withholdingTableTax(9_999_999, 1)?.tax).toBe(1_503_990);
    expect(withholdingTableTax(10_000_001, 1)).toBeNull();
  });
});

describe('화면 문장', () => {
  const results = [...CASES.map(([, input]) => calc(input)), calc({ pay: 10_000_001 })];

  it('모든 문장에 금지어가 없고 연락을 권하지 않는다', () => {
    const text = results.flatMap((r) => allCopy(r, RATES)).join('\n');
    expect(bannedHits(text)).toEqual([]);
    expect(text).not.toMatch(/연락|문의/);
  });

  it('답 첫 줄은 「예상」이다', () => {
    for (const r of results) expect(headline(r).join(' ')).toContain('예상');
    expect(headline(calc({ pay: 3_000_000, meal: 200_000 }))[0]).toBe('예상 실수령액은 2,665,440원입니다.');
    expect(headline(calc({ pay: 10_000_001 })).join(' ')).toContain('소득세를 계산하지 않습니다');
  });

  it('세무대리·신고서 작성 대행이 아니라는 안내와 홈택스', () => {
    expect(NOTICE).toContain('세무대리·신고서 작성 대행이 아닙니다');
    expect(allCopy(results[0], RATES).join('\n')).toContain('홈택스');
  });

  it('도구 이름·설명에 「세무」「절세」가 없다', () => {
    const entry = TOOLS.find((t) => t.href === '/tools/take-home-pay');
    expect(entry).toBeDefined();
    expect(`${entry!.title} ${entry!.desc}`).not.toMatch(/세무|절세/);
    const meta = fs.readFileSync('src/app/tools/take-home-pay/page.tsx', 'utf8').split('export default')[0];
    expect(meta).not.toMatch(/세무|절세/);
  });
});
