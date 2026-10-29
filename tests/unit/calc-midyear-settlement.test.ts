import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { calcMidyear, defaultYear, rulesFor, trunc10, type MidyearInput, type MidyearOutcome } from '@/lib/calc/midyear-settlement';
import {
  allCopy, effectLines, firstMissing, headline, HOMETAX_LINK, HOMETAX_URL, INPUT_FIELDS, INPUT_GUIDE, LIMITS, SCOPE_ITEMS, SCOPE_STOP, whyLines,
  type MoneyField,
} from '@/app/tools/midyear-settlement/copy';
import { bannedHits } from '@/lib/tool-kit/banned';
import { TOOLS } from '@/content/tools-registry';

// 중도퇴사 연말정산(고정형) — 퇴직하는 달 급여를 줄 때 하는 연말정산(소득세법 §137①).
// 공제는 본인 기본공제 150만(§50①1) + 국민연금(§51의3) + 근로소득공제(§47) + 근로소득세액공제(§59)에 더해
//   A = 건강·장기요양·고용보험료 소득공제(§52①) / B = 표준세액공제 13만원(§59의4⑨1호) 두 경로를 다 계산해 나란히 보여 준다.
//   둘은 함께 받을 수 없다 — ⑨1호가 §52⑧ 신청을 하지 않은 경우에만 13만원을 준다. 어느 쪽인지는 근로자가 보험료 소득공제를
//   신청했는지로 정해지고 법은 「작은 쪽」을 정하지 않으므로, 도구도 하나를 고르지 않는다(261029 결정).
// 차감징수 = 결정세액 − 퇴직월 전 달까지 낸 소득세, 10원 미만은 0 쪽으로 버린다(국고금 관리법 §47①).
// 지방소득세 = 결정세액 × 10%(지방세법 §103의13①, 원 미만 버림) − 이미 낸 지방소득세, 10원 미만 버림(지방세기본법 §59).
// 기대값은 리서치(261028) 손 계산과, 저장소 밖 도구 둘 — 법 원문으로 따로 짠 Fraction 오라클(파이썬)과
//   사무소 게이트(verify_leaver_tax.py, 사무소 로컬) — 이 맞춘 값이다. 두 도구는 이 저장소에 없다.
//   저장소 안에서 다시 따라갈 수 있는 근거는 아래 중간값 시험(S1·S2·S7·S9)의 손 계산이다. 입력은 모두 합성값.

const base = { year: 2026, lastMonthSimpleTax: 0 };
const input = (o: Omit<MidyearInput, 'year' | 'lastMonthSimpleTax'> & { lastMonthSimpleTax?: number }): MidyearInput => ({ ...base, ...o });

const S1 = input({ totalPay: 12_000_000, nonTaxable: 0, pension: 570_000, health: 431_400, longTermCare: 56_600, employment: 108_000, paidIncomeTax: 23_450, lastMonthSimpleTax: 3_120, paidLocalTax: 2_340 });
const S2 = input({ totalPay: 26_000_000, nonTaxable: 1_200_000, pension: 1_178_000, health: 891_560, longTermCare: 117_240, employment: 223_200, paidIncomeTax: 300_000, lastMonthSimpleTax: 31_000, paidLocalTax: 29_980 });
const S8 = input({ totalPay: 21_200_000, nonTaxable: 1_200_000, pension: 950_000, health: 719_000, longTermCare: 94_000, employment: 180_000, paidIncomeTax: 100_000, lastMonthSimpleTax: 12_000, paidLocalTax: 9_980 });
const S7 = input({ totalPay: 33_000_000, nonTaxable: 0, pension: 1_567_500, health: 1_186_350, longTermCare: 155_890, employment: 297_000, paidIncomeTax: 800_000, lastMonthSimpleTax: 95_000, paidLocalTax: 80_000 });
const S3 = input({ totalPay: 41_000_000, nonTaxable: 1_000_000, pension: 1_900_000, health: 1_438_000, longTermCare: 188_960, employment: 360_000, paidIncomeTax: 1_500_000, lastMonthSimpleTax: 160_000, paidLocalTax: 150_000 });
const S4 = input({ totalPay: 61_000_000, nonTaxable: 1_000_000, pension: 2_850_000, health: 2_157_000, longTermCare: 283_440, employment: 540_000, paidIncomeTax: 4_200_000, lastMonthSimpleTax: 420_000, paidLocalTax: 420_000 });
const S5 = input({ totalPay: 71_300_000, nonTaxable: 1_200_000, pension: 3_329_750, health: 2_520_190, longTermCare: 331_160, employment: 630_900, paidIncomeTax: 5_000_000, lastMonthSimpleTax: 800_000, paidLocalTax: 500_000 });
const S6 = input({ totalPay: 95_000_000, nonTaxable: 0, pension: 3_200_000, health: 3_415_250, longTermCare: 448_725, employment: 855_000, paidIncomeTax: 11_000_000, lastMonthSimpleTax: 1_400_000, paidLocalTax: 1_100_000 });
const S9 = input({ totalPay: 18_000_000, nonTaxable: 0, pension: 800_010, health: 650_000, longTermCare: 85_000, employment: 165_000, paidIncomeTax: 70_000, lastMonthSimpleTax: 8_000, paidLocalTax: 6_900 });
const X1b = input({ totalPay: 121_199_000, nonTaxable: 1_200_000, pension: 3_200_000, health: 4_314_000, longTermCare: 566_000, employment: 1_080_000, paidIncomeTax: 17_000_000, lastMonthSimpleTax: 2_000_000, paidLocalTax: 1_700_000 });

function ok(o: MidyearOutcome) {
  if (o.kind !== 'ok') throw new Error(`계산 결과가 아니다: ${o.kind}/${'reason' in o ? o.reason : ''}`);
  return o.detail;
}

describe('중도퇴사 연말정산 — A(보험료 소득공제)·B(표준세액공제) 두 경로', () => {
  // [이름, 입력, 경로, 결정세액, 차감 소득세, 결정 지방소득세, 차감 지방소득세] — 경로는 그 기대값을 담은 쪽(예전 「작은 쪽」)
  it.each([
    ['S1 B · 결정 0 · 전액 환급', S1, 'B', 0, -23_450, 0, -2_340],
    ['S2 B · 환급 · 0 쪽 버림(−74,896 → −74,890)', S2, 'B', 225_104, -74_890, 22_510, -7_470],
    ['S8 B · 추징', S8, 'B', 121_100, 21_100, 12_110, 2_130],
    ['S7 A · 환급 · 총급여 3,300만 한도 74만', S7, 'A', 713_989, -86_010, 71_398, -8_600],
    ['S3 A · 추징 · 한도 공식 68.4만', S3, 'A', 1_560_456, 60_450, 156_045, 6_040],
    ['S4 A · 환급 · 한도 하한 66만', S4, 'A', 4_067_934, -132_060, 406_793, -13_200],
    ['S5 A · 추징 · 7천만 초과 한도 공식 61만', S5, 'A', 5_409_950, 409_950, 540_995, 40_990],
    ['S6 A · 환급 · 한도 하한 50만 · 0 쪽 버림(−200,554 → −200,550)', S6, 'A', 10_799_446, -200_550, 1_079_944, -20_050],
    ['S9 B · 추징 · 칸마다 원 미만 버림', S9, 'B', 79_250, 9_250, 7_925, 1_020],
    ['X1b A · 추징 · 1.2억 바로 아래 · 35% 구간', X1b, 'A', 17_026_157, 26_150, 1_702_615, 2_610],
  ] as const)('%s', (_name, inp, which, decided, settle, decidedLocal, settleLocal) => {
    const d = ok(calcMidyear(inp));
    const p = which === 'A' ? d.a : d.b;
    expect(d.same).toBe(false);
    expect(p.decided).toBe(decided);
    expect(p.settleIncomeTax).toBe(settle);
    expect(p.decidedLocal).toBe(decidedLocal);
    expect(p.settleLocalTax).toBe(settleLocal);
  });

  // 결과에 「고른 답」 칸이 없다 — 경로별 값은 a·b 에만 있다
  it('결과에 고른 답 칸(method·decided·settleIncomeTax …)이 없다', () => {
    const d = ok(calcMidyear(S2)) as unknown as Record<string, unknown>;
    for (const k of ['method', 'decided', 'settleIncomeTax', 'settleWithSimple', 'decidedLocal', 'settleLocalTax']) expect(d, k).not.toHaveProperty(k);
  });

  it('S2 중간값 — 총급여·근로소득공제·두 경로', () => {
    const d = ok(calcMidyear(S2));
    expect(d.gross).toBe(24_800_000);
    expect(d.earnedDeduction).toBe(8_970_000); // 750만 + 980만 × 15%
    expect(d.earnedIncome).toBe(15_830_000);
    expect(d.insurance).toBe(1_232_000);
    expect(d.a).toMatchObject({ taxBase: 11_920_000, computed: 715_200, credit: 393_360, standard: 0, decided: 321_840 });
    expect(d.b).toMatchObject({ taxBase: 13_152_000, computed: 789_120, credit: 434_016, standard: 130_000, decided: 225_104 });
  });

  it('S1 — B 는 세액공제가 산출세액을 넘어 결정세액 0(§61)', () => {
    const d = ok(calcMidyear(S1));
    expect(d.earnedDeduction).toBe(6_300_000); // 350만 + 700만 × 40%
    expect(d.a.decided).toBe(81_918);
    expect(d.b).toMatchObject({ taxBase: 3_630_000, computed: 217_800, credit: 119_790, decided: 0 });
  });

  it('근로소득세액공제 한도 — 74만 · 68.4만 · 66만 · 61만 · 50만', () => {
    expect(ok(calcMidyear(S7)).a).toMatchObject({ creditLimit: 740_000, credit: 740_000 });
    expect(ok(calcMidyear(S3)).a).toMatchObject({ creditLimit: 684_000, credit: 684_000 });
    expect(ok(calcMidyear(S4)).a).toMatchObject({ creditLimit: 660_000, credit: 660_000 });
    expect(ok(calcMidyear(S5)).a).toMatchObject({ creditLimit: 610_000, credit: 610_000 });
    expect(ok(calcMidyear(S6)).a).toMatchObject({ creditLimit: 500_000, credit: 500_000 });
  });

  it('S7 — 한도를 넘는 공제액(761,196.7)은 한도 74만에서 멈춘다', () => {
    const d = ok(calcMidyear(S7));
    expect(d.a).toMatchObject({ taxBase: 18_093_260, computed: 1_453_989, creditRaw: 761_196, creditLimit: 740_000, credit: 740_000, decided: 713_989 });
    expect(d.b.decided).toBe(829_875);
  });

  it('S9 — 끝수는 칸마다 원 미만을 버린다(끝에서 한 번만 버리면 79,249 · +9,240)', () => {
    const d = ok(calcMidyear(S9));
    expect(d.a).toMatchObject({ taxBase: 6_849_990, computed: 410_999, credit: 226_049, decided: 184_950 });
    expect(d.b).toMatchObject({ taxBase: 7_749_990, computed: 464_999, credit: 255_749, decided: 79_250 });
  });

  it('S6 — 결정 지방소득세는 원 단위에서 버린다(10원 단위로 버리면 1,079,940)', () => {
    expect(ok(calcMidyear(S6)).a.decidedLocal).toBe(1_079_944);
  });

  // 법은 「작은 쪽」을 정하지 않는다 — 보험료 소득공제를 신청했으면 A, 아니면 표준세액공제(§52⑧·§59의4⑨1호).
  // 그래서 A·B 두 정산액을 다 계산해 나란히 보여 준다(PR #112 검토 7, 261029 결정). 값은 Fraction 오라클과 같다.
  it('A·B 두 경로의 정산액을 다 계산한다 — S2 A +21,840 / B −74,890, S3 A +60,450 / B +228,500', () => {
    const s2 = ok(calcMidyear(S2));
    expect(s2.a).toMatchObject({ settleIncomeTax: 21_840, decidedLocal: 32_184, settleLocalTax: 2_200 });
    expect(s2.b).toMatchObject({ settleIncomeTax: -74_890, decidedLocal: 22_510, settleLocalTax: -7_470 });
    const s3 = ok(calcMidyear(S3));
    expect(s3.a).toMatchObject({ settleIncomeTax: 60_450, settleLocalTax: 6_040 });
    expect(s3.b).toMatchObject({ decided: 1_728_500, settleIncomeTax: 228_500, settleLocalTax: 22_850 });
  });

  it('§59② 4호(1.2억 초과: 50만 − 초과분 × 1/2, 하한 20만)도 한도표에 있다 — grossStop 을 올려도 3호로 새지 않는다', () => {
    expect(rulesFor(2026)!.creditLimit.at(-1)).toEqual({ over: 120_000_000, base: 500_000, num: 1, den: 2, floor: 200_000 });
  });

  // §55① 기본세율표는 labor-calc.ts·퇴직금 계산기(severance.html)·퇴직소득세 엔진(retirement-tax.ts)에도 있다(PR #112 검토 2·14).
  // 한 곳만 바뀌면 도구끼리 갈리므로, 네 벌이 같은지 여기서 본다.
  it.each(['src/lib/labor-calc.ts', 'public/tools/severance.html'])('§55① 기본세율표가 %s 와 같다', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const rows = [...src.matchAll(/\{\s*limit:\s*([\d_]+|Infinity|Number\.POSITIVE_INFINITY),\s*rate:\s*([\d.]+),\s*cumulative:\s*([\d_]+)\s*\}/g)].map((m) => ({
      limit: /Infinity|INFINITY/.test(m[1]) ? Infinity : Number(m[1].replace(/_/g, '')),
      rate: Number(m[2]),
      cumulative: Number(m[3].replace(/_/g, '')),
    }));
    const mine = rulesFor(2026)!.taxRates;
    expect(rows.length).toBe(mine.length);
    rows.forEach((r, i) => {
      expect(r.cumulative, `${file} ${i}`).toBe(mine[i].base);
      expect(Math.round(r.rate * mine[i].den), `${file} ${i}`).toBe(mine[i].num);
      expect(i === 0 ? 0 : rows[i - 1].limit, `${file} ${i}`).toBe(mine[i].over);
    });
    expect(rows.at(-1)!.limit).toBe(Infinity);
  });

  // 퇴직소득세 엔진(#115, 이 도구보다 먼저 병합)에도 §55① 표가 있다. 모양이 [상한, 누계, %, 하한] 이라 위 정규식에 걸리지 않아
  // 따로 본다 — 네 벌 가운데 한 곳만 고치면 도구끼리 갈린다(PR #112 사후 검토 4·9).
  it('§55① 기본세율표가 src/lib/calc/retirement-tax.ts 와 같다', () => {
    const src = fs.readFileSync('src/lib/calc/retirement-tax.ts', 'utf8');
    const block = /rates:\s*\[([\s\S]*?)\n\s*\],/.exec(src);
    expect(block, 'retirement-tax.ts 의 rates 표를 찾지 못했다').not.toBeNull();
    const rows = [...block![1].matchAll(/\[\s*([\d_]+|Infinity),\s*([\d_]+),\s*(\d+),\s*([\d_]+)\s*\]/g)].map((m) => ({
      upTo: m[1] === 'Infinity' ? Infinity : Number(m[1].replace(/_/g, '')),
      cumulative: Number(m[2].replace(/_/g, '')),
      pct: Number(m[3]),
      from: Number(m[4].replace(/_/g, '')),
    }));
    const mine = rulesFor(2026)!.taxRates;
    expect(rows.length).toBe(mine.length);
    rows.forEach((r, i) => {
      expect(r.from, `retirement-tax ${i}`).toBe(mine[i].over);
      expect(r.cumulative, `retirement-tax ${i}`).toBe(mine[i].base);
      expect(r.pct * (mine[i].den / 100), `retirement-tax ${i}`).toBe(mine[i].num);
      expect(r.upTo, `retirement-tax ${i}`).toBe(i + 1 < mine.length ? mine[i + 1].over : Infinity);
    });
  });
});

// 기납부세액은 「해당 과세기간에 제134조제1항에 따라 원천징수한 세액」(§137①3호)이다.
// 회사가 퇴직월 간이세액을 먼저 떼고 그것까지 기납부로 넣어 정산했다면 영수증 차감징수세액은 그만큼 다르다.
// 그래서 간이세액 칸은 답에는 쓰지 않고, 그 경우의 영수증 값을 경로마다 따로 보여 준다(PR #112 검토 10·15).
describe('퇴직월 간이세액 — 답에는 쓰지 않고, 회사가 먼저 뗀 경우의 영수증 값을 경로마다 따로 보여 준다', () => {
  it('S3 — A 답은 +60,450, 간이세액 160,000 을 먼저 뗀 경우 영수증은 A −99,540 · B +68,500', () => {
    const d = ok(calcMidyear(S3));
    expect(d.a.settleIncomeTax).toBe(60_450);
    expect(d.a.settleWithSimple).toBe(-99_540); // 1,560,456 − (1,500,000 + 160,000) = −99,544 → −99,540
    expect(d.b.settleWithSimple).toBe(68_500); // 1,728,500 − 1,660,000
    const zero = ok(calcMidyear({ ...S3, lastMonthSimpleTax: 0 }));
    expect(zero.a.settleWithSimple).toBeNull();
    expect(zero.b.settleWithSimple).toBeNull();
  });

  it('S3 — 회사 처리 방식을 단정하지 않고, 간이세액 칸을 「넣지 않았다」고 말하지 않는다', () => {
    const lines = effectLines(ok(calcMidyear(S3))).join(' ');
    expect(lines).toContain('퇴직월 간이세액 160,000원은 계산에 쓰지 않았습니다');
    expect(lines).toContain('−99,540원');
    expect(lines).toContain('두 번');
    expect(lines).not.toContain('따로 떼지 않고 이 정산액만 반영합니다');
    expect(lines).not.toContain('이미 낸 소득세에 넣지 않았습니다');
  });

  // §86 1호 — 1천원 미만 추징은 징수하지 않는다. 답에만 걸고 영수증 대조값에는 걸지 않으면, 회사가 걷지 않을
  // 금액을 「차감징수세액」으로 안내하게 된다(PR #112 사후 검토 12).
  it('S3 + 간이세액 60,000 — 영수증 대조값 +450 은 1천원 미만이라 징수하지 않는 금액이라고 밝힌다', () => {
    const d = ok(calcMidyear({ ...S3, lastMonthSimpleTax: 60_000 }));
    expect(d.a.settleWithSimple).toBe(450); // 1,560,456 − 1,500,000 − 60,000 = 456 → 450
    const lines = effectLines(d).join(' ');
    expect(lines).toContain('+450원');
    expect(lines).toContain('1천원 미만이라 징수하지 않');
    expect(lines).toContain('소득세법 제86조 제1호');
    expect(lines).not.toContain('차감징수세액은 +450원으로 예상합니다');
  });
});

describe('범위 밖은 멈춘다', () => {
  // 고를 경로가 없으니 1천원 미만 추징에서 멈추지 않는다 — 그 경로에 §86 1호(징수하지 않음)를 붙인다(261029 결정)
  it('X2 — B 차감 소득세가 1천원 미만 추징이어도 멈추지 않고, B 줄에 「징수하지 않음」(§86 1호)을 붙인다', () => {
    const o = calcMidyear({ ...S2, paidIncomeTax: 225_000, paidLocalTax: 22_000 }); // B 225,104 − 225,000 = 104 → 100
    const d = ok(o);
    expect(d.b.settleIncomeTax).toBe(100);
    expect(d.a.settleIncomeTax).toBe(96_840);
    const [aLine, bLine] = headline(o);
    expect(aLine).toContain('(A) 퇴직월에 소득세 96,840원을 더 내는 것으로 예상합니다');
    expect(bLine).toContain('(B)');
    expect(bLine).toContain('100원');
    expect(bLine).toContain('1천원 미만이라 징수하지 않');
    expect(bLine).toContain('소득세법 제86조 제1호');
    expect(bLine).not.toContain('100원을 더 내는 것으로 예상합니다');
    expect(whyLines(d).join(' ')).toContain('소득세 +100원(1천원 미만이라 징수하지 않음, 소득세법 제86조 제1호)');
  });

  // 지방소득세는 「원천징수하는 소득세의 100분의 10 … 을 소득세 원천징수와 동시에」 특별징수한다(지방세법 §103의13①).
  // 지방소득세 자체의 1천원 기준은 조문·해석례에서 찾지 못했다(§103의13④ 준용은 추론, §103의60 은 고지서 기준).
  // 사무소 게이트도 지방에서 멈추지 않는다. 그래서 소득세가 1천원 이상이면 지방은 계산한 금액을 보여 주고,
  // 확인하지 못했다고 밝힌다(PR #112 사후 검토 2·11·15).
  it('X3 — 소득세는 1천원 이상이고 지방소득세 추징이 1천원 미만이면, 멈추지 않고 계산한 금액을 보여 준다', () => {
    const o = calcMidyear({ ...S2, paidIncomeTax: 220_000, paidLocalTax: 22_000 }); // B 소득세 +5,100, 지방 22,510 − 22,000 = +510
    const d = ok(o);
    expect(d.b.settleIncomeTax).toBe(5_100);
    expect(d.b.settleLocalTax).toBe(510);
    expect(headline(o)[1]).toBe('신청하지 않았다면(B) 퇴직월에 소득세 5,100원을 더 내는 것으로 예상합니다. 지방소득세는 510원을 더 내는 것으로 예상합니다.');
    const lines = effectLines(d).join(' ');
    expect(lines).toContain('지방소득세 510원은 1천원 미만');
    expect(lines).not.toContain('10,180원은 1천원 미만'); // A 지방 +10,180 은 붙이지 않는다
    expect(lines).toContain('확인하지 못해');
    expect(lines).not.toContain('준용되어');
  });

  it('지방소득세 추징이 1천원 이상이면 그 안내 문장을 붙이지 않는다', () => {
    expect(effectLines(ok(calcMidyear(S3))).join(' ')).not.toContain('1천원 미만');
  });

  it('환급은 소액이어도 멈추지 않는다', () => {
    const d = ok(calcMidyear({ ...S2, paidIncomeTax: 225_200, paidLocalTax: 22_510 })); // B 225,104 − 225,200 = −96 → −90
    expect(d.b.settleIncomeTax).toBe(-90);
  });

  it('X1 — 총급여 1.2억 이상이면 멈춘다(비과세를 뺀 뒤로 본다)', () => {
    expect(calcMidyear(input({ totalPay: 120_000_000, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 0, paidLocalTax: 0 })))
      .toMatchObject({ kind: 'out', reason: 'high-pay' });
    expect(calcMidyear({ ...X1b, totalPay: 121_200_000 })).toMatchObject({ kind: 'out', reason: 'high-pay' });
    expect(calcMidyear({ ...X1b, totalPay: 121_199_999 }).kind).toBe('ok'); // 총급여 119,999,999
  });

  // 정확히 1.2억은 §59② 3호(7천만 초과 1.2억 이하) 안이라 한도 구간이 바뀌지 않는다 — 멈춤 이유로 들지 않는다(PR #112 검토 12)
  it('X1 — 1.2억에서 멈추는 이유로 「한도 구간이 달라진다」고 말하지 않는다', () => {
    const lines = headline(calcMidyear({ ...X1b, totalPay: 121_200_000 }));
    expect(lines[1]).toBe('고정형은 총급여 1억 2천만원 미만까지만 계산합니다.');
    expect(lines.join(' ')).not.toContain('한도 구간');
  });

  it('기준을 넣지 않은 해는 멈춘다 — 다른 해 값으로 대신하지 않는다', () => {
    expect(rulesFor(2026)).not.toBeNull();
    expect(rulesFor(2025)).toBeNull();
    expect(rulesFor(2027)).toBeNull();
    expect(calcMidyear({ ...S3, year: 2025 })).toMatchObject({ kind: 'out', reason: 'year' });
    expect(calcMidyear({ ...S3, year: 2027 })).toMatchObject({ kind: 'out', reason: 'year' });
  });

  // 올해 기준이 아직 없으면 화면이 그해를 미리 골라 두지 않는다 — 기본값 그대로 쓰는 방문자가 모두 멈추지 않게(PR #112 검토 11).
  // 다른 해로 대신 고르지도 않는다(이용자가 직접 고른다).
  it('기본 선택 연도 — 기준이 있는 해만 미리 고른다', () => {
    expect(defaultYear(2026)).toBe(2026);
    expect(defaultYear(2027)).toBeNull();
    expect(defaultYear(2025)).toBeNull();
  });
});

describe('입력 확인', () => {
  it('비과세가 급여보다 크거나, 음수·소수·숫자가 아니면 오류', () => {
    expect(() => calcMidyear({ ...S2, nonTaxable: 26_000_001 })).toThrow();
    expect(() => calcMidyear({ ...S2, health: -1 })).toThrow();
    expect(() => calcMidyear({ ...S2, totalPay: 26_000_000.5 })).toThrow();
    expect(() => calcMidyear({ ...S2, paidLocalTax: Number.NaN })).toThrow();
  });

  it('급여가 0 이면 결정세액 0, 이미 낸 세금은 전부 환급', () => {
    const d = ok(calcMidyear(input({ totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 1_230, paidLocalTax: 120 })));
    expect(d.same).toBe(true);
    for (const p of [d.a, d.b]) {
      expect(p.decided).toBe(0);
      expect(p.settleIncomeTax).toBe(-1_230);
      expect(p.settleLocalTax).toBe(-120);
    }
  });
});

// 화면 입력 칸 — 이름과 빈 칸 확인은 copy.ts 에 두고 화면이 그대로 쓴다.
describe('입력 칸', () => {
  // 보험료는 퇴직월 급여에서도 뗀다(§52① 「해당 과세기간에 … 근로자가 부담하는 보험료를 지급한 경우」, 사무소 게이트도 퇴직월분 포함).
  // 세금 칸만 「퇴직월 전 달까지」라 보험료 칸에 끝 달이 없으면 같은 기준으로 읽고 한 달치를 빼기 쉽다(PR #112 사후 검토 3).
  it('4대보험료 칸 이름에 「퇴직월까지」가 있고, 안내 문단이 보험료와 세금의 끝 달을 나눠 말한다', () => {
    const label = (k: MoneyField) => INPUT_FIELDS.find((f) => f.key === k)!.label;
    for (const k of ['pension', 'health', 'longTermCare', 'employment'] as const) expect(label(k)).toContain('퇴직월까지');
    expect(label('paidIncomeTax')).toContain('퇴직월 전 달까지');
    expect(label('paidLocalTax')).toContain('퇴직월 전 달까지');
    const guide = INPUT_GUIDE.join(' ');
    expect(guide).toContain('4대보험료는 퇴직월분까지');
    expect(guide).toContain('이미 낸 세금은 퇴직월 전 달까지');
  });

  // 운영 절차(verify.mts)가 칸을 이 글자로 집는다 — 부분 일치라 이름이 길어져도 이 글자는 남아야 한다
  it('칸 이름이 운영 절차가 집는 글자를 그대로 품는다', () => {
    const labels = INPUT_FIELDS.map((f) => f.label);
    for (const w of ['받은 급여 합계', '비과세 급여 합계', '국민연금', '건강보험료', '장기요양보험료', '고용보험료', '이미 낸 소득세', '이미 낸 지방소득세', '퇴직월 간이세액']) {
      expect(labels.filter((l) => l.includes(w)), w).toHaveLength(1);
    }
  });

  // 빈 칸을 0 으로 읽으면 이미 낸 세금 0 · 보험료 0 으로 계산한 답이 「예상」으로 나간다(PR #112 사후 검토 8).
  // S2 에서 지방소득세 칸만 비우면 소득세는 −74,890 환급인데 지방은 +22,510 추징이라는 모순된 답이 나왔다.
  const S2_TEXT = Object.fromEntries(
    INPUT_FIELDS.map((f) => [f.key, String((S2 as unknown as Record<string, number>)[f.key])]),
  ) as Record<MoneyField, string>;

  it('S2 를 다 채우면 빈 칸 안내가 없다 · 0 도 채운 것으로 본다', () => {
    expect(firstMissing(S2_TEXT)).toBeNull();
    expect(firstMissing({ ...S2_TEXT, nonTaxable: '0', paidLocalTax: '0' })).toBeNull();
  });

  it('퇴직월 간이세액(대조용)은 비워도 된다', () => {
    expect(firstMissing({ ...S2_TEXT, lastMonthSimpleTax: '' })).toBeNull();
  });

  it.each([
    ['paidLocalTax', '이미 낸 지방소득세'],
    ['paidIncomeTax', '이미 낸 소득세'],
    ['health', '건강보험료'],
    ['pension', '국민연금'],
    ['nonTaxable', '비과세 급여 합계'],
  ] as const)('%s 칸을 비우면 계산하지 않고 그 칸을 채워 달라고 한다', (key, word) => {
    const msg = firstMissing({ ...S2_TEXT, [key]: '  ' });
    expect(msg).toContain(word);
    expect(msg).toContain('0을 넣어 주세요');
  });

  it('다 비어 있으면 받은 급여 합계부터 묻는다(운영 절차가 이 글자를 본다)', () => {
    const blank = Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, ''])) as Record<MoneyField, string>;
    expect(firstMissing(blank)).toBe('받은 급여 합계를 넣어 주세요.');
  });
});

describe('10원 미만 버림은 0 쪽으로', () => {
  it.each([
    [-74_896, -74_890],
    [-200_554, -200_550],
    [60_456, 60_450],
    [-5, 0],
    [5, 0],
    [0, 0],
  ])('%d → %d', (x, want) => {
    expect(Object.is(trunc10(x), want)).toBe(true);
  });
});

describe('화면 문장', () => {
  const all = [S1, S2, S8, S7, S3, S4, S5, S6, S9, X1b].map((s) => calcMidyear(s));
  const outs = [
    calcMidyear({ ...S2, paidIncomeTax: 225_000 }),
    calcMidyear({ ...S2, paidIncomeTax: 220_000, paidLocalTax: 22_000 }),
    calcMidyear({ ...X1b, totalPay: 121_200_000 }),
    calcMidyear({ ...S3, year: 2025 }),
  ];

  // 결정세액이 다르면 고르지 않고 A·B 를 나란히 — 어느 쪽인지는 보험료 소득공제 신청 여부로 정해진다(§52⑧·§59의4⑨1호, 261029 결정)
  const WHICH = '어느 쪽인지는 근로자가 건강·장기요양·고용보험료 소득공제를 신청했는지로 정해집니다(소득세법 제52조 제8항, 제59조의4 제9항 제1호).';

  it('S2 — 결정세액이 다르면 답에 A·B 두 경로를 나란히 적고, 어느 쪽인지 정하는 기준을 밝힌다', () => {
    expect(headline(calcMidyear(S2))).toEqual([
      '보험료 소득공제를 신청했다면(A) 퇴직월에 소득세 21,840원을 더 내는 것으로 예상합니다. 지방소득세는 2,200원을 더 내는 것으로 예상합니다.',
      '신청하지 않았다면(B) 퇴직월에 소득세 74,890원을 돌려받는 것으로 예상합니다. 지방소득세는 7,470원을 돌려받는 것으로 예상합니다.',
      WHICH,
    ]);
  });

  it('S3 — 두 경로 모두 더 내는 경우', () => {
    expect(headline(calcMidyear(S3))).toEqual([
      '보험료 소득공제를 신청했다면(A) 퇴직월에 소득세 60,450원을 더 내는 것으로 예상합니다. 지방소득세는 6,040원을 더 내는 것으로 예상합니다.',
      '신청하지 않았다면(B) 퇴직월에 소득세 228,500원을 더 내는 것으로 예상합니다. 지방소득세는 22,850원을 더 내는 것으로 예상합니다.',
      WHICH,
    ]);
  });

  it('두 결정세액이 같으면 한 경로 문장 하나로 말한다', () => {
    const o = calcMidyear(input({ totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 1_230, paidLocalTax: 120 }));
    expect(headline(o)).toEqual([
      '퇴직월에 소득세 1,230원을 돌려받는 것으로 예상합니다(보험료 소득공제와 표준세액공제 어느 쪽으로 계산해도 같음).',
      '지방소득세는 120원을 돌려받는 것으로 예상합니다.',
    ]);
  });

  it('S2 — 근거에 A·B 두 정산액을 다 적는다(회사가 어느 쪽으로 정산했든 대조할 수 있게)', () => {
    const lines = whyLines(ok(calcMidyear(S2))).join(' ');
    expect(lines).toContain('보험료 소득공제(A)로 계산하면 소득세 +21,840원·지방소득세 +2,200원');
    expect(lines).toContain('표준세액공제 13만원(B)으로 계산하면 소득세 −74,890원·지방소득세 −7,470원');
    expect(lines).toContain('A 예상 결정세액 321,840원');
    expect(lines).toContain('B 예상 결정세액 225,104원');
  });

  it('S3 — 간이세액을 먼저 뗀 경우의 영수증 값도 A·B 둘 다 적는다', () => {
    const lines = effectLines(ok(calcMidyear(S3))).join(' ');
    expect(lines).toContain('A −99,540원');
    expect(lines).toContain('B +68,500원');
  });

  // 「작은 쪽」「유리한 쪽으로 가정」은 법이 정하지 않은 선택이다 — 사이트 어디에도 남기지 않는다(변형 표현까지)
  const PICK_WORDS = /유리한|유리하|불리한|작은 쪽|작은 A|작은 B|가정한|가정\)|으로 가정/;
  it('어떤 결과 문장·페이지 소스에도 「유리한 쪽」「작은 쪽」「가정」이 없다', () => {
    const outs2 = [
      ...all, ...outs,
      calcMidyear({ ...S2, paidIncomeTax: 321_000, paidLocalTax: 32_000 }),
      calcMidyear({ ...S3, lastMonthSimpleTax: 60_000 }),
      calcMidyear(input({ totalPay: 0, nonTaxable: 0, pension: 0, health: 0, longTermCare: 0, employment: 0, paidIncomeTax: 1_230, paidLocalTax: 120 })),
    ];
    for (const o of outs2) for (const line of allCopy(o)) expect(line, line).not.toMatch(PICK_WORDS);
    for (const f of ['src/app/tools/midyear-settlement/page.tsx', 'src/app/tools/midyear-settlement/copy.ts', 'src/app/tools/midyear-settlement/MidyearSettlementClient.tsx']) {
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(PICK_WORDS);
    }
    const t = TOOLS.find((x) => x.href === '/tools/midyear-settlement')!;
    expect(t.desc).not.toMatch(PICK_WORDS);
  });

  it('LIMITS 가 「더 낼 소득세 1천원 미만」을 계산하지 않는다고 하지 않는다', () => {
    expect(LIMITS.join(' ')).not.toContain('1천원 미만');
  });

  it('§137③ — 공제신고서를 내지 않은 경우(본인 기본공제·표준세액공제만)는 다루지 않는다고 적는다', () => {
    expect(LIMITS.join(' ')).toContain('소득세법 제137조 제3항');
  });

  // 범위 질문은 고정형과 회사 정산이 달라지는 공제를 묻는다(PR #112 검토 4·8). 그중 §59의4⑨1호가 13만원 배제 사유로 드는 것은
  //   §59의4⑥(특별세액공제)·§52⑧(보험료·주택자금 §52①④⑤)·조특법 §95의2③(월세) 신청뿐이다.
  //   주택청약(조특법 §87)·신용카드(조특법 §126의2) 소득공제와 §51① 추가공제는 배제 사유가 아니지만 과세표준이 달라져 묻는다
  //   (PR #112 사후 검토 14 — 앞 주석이 ⑨1호가 조특법 소득공제를 든다고 잘못 적었다).
  it('범위 질문이 소득공제 쪽(추가공제·주택자금·주택청약·신용카드)도 묻는다', () => {
    const s = SCOPE_ITEMS.join(' ');
    for (const w of ['추가공제', '주택임차차입금', '장기주택저당차입금', '주택청약', '신용카드']) expect(s).toContain(w);
  });

  // 조특법 §92① — 2026. 12. 31. 이전 혼인신고, 1회, 그 과세기간 산출세액에서 50만원. 신청했으면 회사 정산과 50만원이 갈린다
  // (PR #112 사후 검토 10)
  it('범위 질문이 혼인세액공제를 묻는다', () => {
    expect(SCOPE_ITEMS.join(' ')).toContain('혼인세액공제');
    expect(LIMITS.join(' ')).toContain('혼인세액공제');
  });

  // 「본인 기본공제와 4대보험료만」은 B 경로(건강·장기요양·고용보험료 빼고 표준세액공제 13만원)와 맞지 않는다(PR #112 사후 검토 16)
  it('소개 문구가 「4대보험료만 넣는」 고정형이라고 하지 않는다', () => {
    const t = TOOLS.find((x) => x.href === '/tools/midyear-settlement')!;
    const page = fs.readFileSync('src/app/tools/midyear-settlement/page.tsx', 'utf8');
    for (const s of [t.desc, page, SCOPE_STOP.join(' ')]) {
      expect(s).not.toContain('4대보험료만');
      expect(s).toContain('표준세액공제');
    }
  });

  // 끝수 처리를 홈택스와 대조하지 못했다고 LIMITS 에 적었으니, 근거 줄도 영수증과 「맞는다」고 단정하지 않는다(PR #112 사후 검토 5)
  it('근거 줄이 다른 경로의 영수증 금액과 「맞습니다」라고 단정하지 않는다', () => {
    for (const s of [S2, S3]) {
      const lines = whyLines(ok(calcMidyear(s))).join(' ');
      expect(lines).not.toContain('맞습니다');
      expect(lines).toContain('대조합니다');
    }
  });

  // 경로마다 §86 1호를 밝힌다 — S2 에서 이미 낸 소득세 321,000 이면 A 는 +840(징수하지 않음), B 는 −95,890
  it('A·B 근거 줄과 답 줄의 1천원 미만 추징에 「징수하지 않음」을 붙인다', () => {
    const o = calcMidyear({ ...S2, paidIncomeTax: 321_000, paidLocalTax: 32_000 });
    const d = ok(o);
    expect(d.a.settleIncomeTax).toBe(840);
    expect(d.b.settleIncomeTax).toBe(-95_890);
    const lines = whyLines(d).join(' ');
    expect(lines).toContain('소득세 +840원(1천원 미만이라 징수하지 않음, 소득세법 제86조 제1호)');
    expect(lines).toContain('소득세 −95,890원·');
    const [aLine, bLine] = headline(o);
    expect(aLine).toContain('1천원 미만이라 징수하지 않');
    expect(aLine).toContain('소득세법 제86조 제1호');
    expect(bLine).toContain('95,890원을 돌려받는 것으로 예상합니다');
    expect(bLine).not.toContain('제86조');
  });

  // 홈택스 깊은 주소는 확인하지 못했다 — 첫 화면으로 간다는 것을 글자로 드러낸다(PR #112 검토 3·13)
  it('홈택스 링크는 첫 화면으로 간다고 밝힌다', () => {
    expect(HOMETAX_URL).toBe('https://www.hometax.go.kr');
    expect(HOMETAX_LINK.text).toContain('첫 화면');
    expect(HOMETAX_LINK.after).toContain('연말정산 모의계산 메뉴를 찾아');
  });

  it('끝수 방식을 영수증 서식이 정한 것처럼 단정하지 않는다(PR #112 검토 16)', () => {
    const s = LIMITS.join(' ');
    expect(s).not.toContain('서식을 따른 것입니다');
    expect(s).toContain('대조하지 못했습니다');
  });

  it('결과 문장에 대행 아님 고지와 「예상」이 늘 있다', () => {
    for (const o of all) {
      const lines = allCopy(o);
      expect(lines.some((l) => l.includes('세무대리·신고서 작성 대행이 아닙니다'))).toBe(true);
      expect(headline(o)[0]).toContain('예상');
    }
  });

  it('모든 문장에 금지어가 없고 「확정」이라고 말하지 않는다', () => {
    for (const o of [...all, ...outs]) {
      const lines = allCopy(o);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(bannedHits(line), line).toEqual([]);
        expect(line).not.toContain('확정');
      }
    }
  });

  // 세무사법 제20조③(표시·광고) — 이름·소개에 「세무」「절세」를 쓰지 않는다(261028 세액 계산 도구 공통 장치)
  it('도구 이름·설명에 「세무」「절세」가 없다', () => {
    const t = TOOLS.find((x) => x.href === '/tools/midyear-settlement')!;
    expect(t).toBeTruthy();
    expect(`${t.title} ${t.desc}`).not.toMatch(/세무|절세/);
    const page = fs.readFileSync('src/app/tools/midyear-settlement/page.tsx', 'utf8');
    const meta = page.slice(0, page.indexOf('export default'));
    expect(meta).not.toMatch(/세무|절세/);
  });
});
