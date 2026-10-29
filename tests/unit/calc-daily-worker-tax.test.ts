import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { calcDailyWorkerTax, expandLines, DAILY_WORKER_RULE } from '@/lib/calc/daily-worker-tax';
import {
  allCopy, CONSEQUENCES, ELIGIBILITY_NOTE, ELIGIBILITY_STOP, formulaLines, headline, HOMETAX, INPUT_GUIDE, NOT_COVERED, NOTICE, NTS, paymentLine, ROUNDING_NOTE,
} from '@/app/tools/daily-worker-tax/copy';
import { bannedHits } from '@/lib/tool-kit/banned';
import { TOOLS } from '@/content/tools-registry';

// 일용근로소득 원천징수 — 합성 입력만 쓴다.
// 1일 세액 = (일급 − 15만원, §47②·③) × 6%(§129①4 단서) − 그 55%(§59③) = (일급 − 15만원) × 2.7%(§134③).
// 일급이 날마다 다르면 날마다 계산해 더한다 — 총액 ÷ 일수 평균을 내지 않는다(R6).
// 1,000원 미만 소액부징수(§86 1호)는 지급 건마다 본다(별지 제24호서식(3)(4) 작성방법, 국세청 「일용근로소득」 안내).
// 소득세는 지급 건 합계에서 10원 미만 버림(국고금 관리법 §47①), 지방소득세는 그 소득세의 10%에서 10원 미만 버림(서식 예시 945 → 940).
// 기대값 = 리서치 독립 스크립트(Decimal, 조문 식만 옮김) expected_daily_worker_tax.py 의 출력. 구현과 무관하다.

const one = (wage: number, days: number) => ({ days: Array<number>(days).fill(wage) });
const calc = (...payments: { days: number[] }[]) => calcDailyWorkerTax({ payments });

describe('일용근로소득 원천징수 — 기본식', () => {
  it('A 일급 200,000 × 1일 — 과세표준 50,000 → 산출 3,000 → 공제 1,650 → 1,350 / 지방 130', () => {
    const r = calc(one(200_000, 1));
    expect(r.payments[0].days[0].taxBase).toBe(50_000);
    expect(r.payments[0].milli).toBe(1_350_000);
    expect([r.incomeTax, r.localTax]).toEqual([1_350, 130]);
  });

  it('B 서식 예시 — 200,000 × 7일 = 9,450 / 지방 945 → 940', () => {
    const r = calc(one(200_000, 7));
    expect([r.incomeTax, r.localTax, r.total]).toEqual([9_450, 940, 10_390]);
  });

  it('C 국세청 예시 — 200,000 × 5일 = 6,750 / 지방 675 → 670', () => {
    expect([calc(one(200_000, 5)).incomeTax, calc(one(200_000, 5)).localTax]).toEqual([6_750, 670]);
  });

  it('M 300,000 × 22일 = 4,050 × 22 = 89,100 / 8,910', () => {
    const r = calc(one(300_000, 22));
    expect([r.incomeTax, r.localTax]).toEqual([89_100, 8_910]);
    expect(r.gross).toBe(6_600_000);
  });

  it('G 일급이 15만원 이하면 과세표준 0(§47③) — 소득세·지방소득세 0, 소액부징수가 아니다', () => {
    const r = calc(one(150_000, 3));
    expect(r.payments[0].days.every((d) => d.taxBase === 0)).toBe(true);
    expect([r.incomeTax, r.localTax]).toEqual([0, 0]);
    expect(r.payments[0].small).toBe(false);
  });

  it('규칙 숫자는 1일 15만원 · 6% · 55%, 2019. 1. 1. 이후 발생 소득분', () => {
    expect(DAILY_WORKER_RULE.deduction).toBe(150_000);
    expect(DAILY_WORKER_RULE.rate).toEqual([6, 100]);
    expect(DAILY_WORKER_RULE.credit).toEqual([55, 100]);
    expect(DAILY_WORKER_RULE.from).toBe('2019-01-01');
  });
});

describe('소액부징수 — 지급 건 단위(분기 양쪽)', () => {
  it('D 180,000 × 1일 = 810원 < 1,000 → 0 / 0', () => {
    const r = calc(one(180_000, 1));
    expect(r.payments[0].milli).toBe(810_000);
    expect(r.payments[0].small).toBe(true);
    expect([r.incomeTax, r.localTax]).toEqual([0, 0]);
  });

  it('E 180,000 × 5일을 한 번에 지급 = 4,050 ≥ 1,000 → 징수 4,050 / 400', () => {
    const r = calc(one(180_000, 5));
    expect(r.payments[0].small).toBe(false);
    expect([r.incomeTax, r.localTax]).toEqual([4_050, 400]);
  });

  it('F 같은 5일을 매일 지급(5건) = 건마다 810 → 모두 0', () => {
    const r = calc(...Array.from({ length: 5 }, () => one(180_000, 1)));
    expect(r.payments).toHaveLength(5);
    expect(r.payments.every((p) => p.small && p.incomeTax === 0)).toBe(true);
    expect([r.incomeTax, r.localTax]).toEqual([0, 0]);
  });

  it('L 한 달에 지급 2건 — 2일분 1,620 / 160 + 1일분 810 → 0. 월 합계(2,430)로 보지 않는다', () => {
    const r = calc(one(180_000, 2), one(180_000, 1));
    expect([r.payments[0].incomeTax, r.payments[0].localTax]).toEqual([1_620, 160]);
    expect([r.payments[1].incomeTax, r.payments[1].small]).toEqual([0, true]);
    expect([r.incomeTax, r.localTax]).toEqual([1_620, 160]);
  });

  it('경계 — H 187,000 = 999 · I1 187,037 = 999.999 → 0, I2 187,038 = 1,000.026 → 1,000 / 100', () => {
    expect(calc(one(187_000, 1)).payments[0].milli).toBe(999_000);
    expect(calc(one(187_000, 1)).incomeTax).toBe(0);
    const i1 = calc(one(187_037, 1));
    expect([i1.payments[0].milli, i1.payments[0].small, i1.incomeTax]).toEqual([999_999, true, 0]);
    const i2 = calc(one(187_038, 1));
    expect([i2.payments[0].milli, i2.payments[0].small, i2.incomeTax, i2.localTax]).toEqual([1_000_026, false, 1_000, 100]);
  });
});

describe('날별 계산 — 평균을 내지 않는다(R6)', () => {
  it('J 1일차 100,000(과세표준 0) + 2일차 250,000(2,700) = 2,700 / 270', () => {
    const r = calc({ days: [100_000, 250_000] });
    expect(r.payments[0].days.map((d) => d.taxBase)).toEqual([0, 100_000]);
    expect([r.incomeTax, r.localTax]).toEqual([2_700, 270]);
  });

  it('J 대조 — 평균 175,000 × 2 로 넣으면 1,350 / 130 이 나온다(그래서 평균을 넣지 않는다)', () => {
    const r = calc(one(175_000, 2));
    expect([r.incomeTax, r.localTax]).toEqual([1_350, 130]);
  });

  it('일급 × 일수 줄을 날별 목록으로 편다', () => {
    expect(expandLines([{ dailyWage: 100_000, days: 1 }, { dailyWage: 250_000, days: 2 }])).toEqual([100_000, 250_000, 250_000]);
  });
});

describe('끝수 순서 — 미확정이라 두 값을 함께 낸다(K)', () => {
  it('K 187,170 × 3일 — 합계에서 한 번 버리면 3,010 / 300, 날마다 1원 미만을 먼저 버리면 3,000 / 300', () => {
    const r = calc(one(187_170, 3));
    expect(r.payments[0].milli).toBe(3_010_770);
    expect([r.incomeTax, r.localTax]).toEqual([3_010, 300]);
    expect([r.dailyFloor.incomeTax, r.dailyFloor.localTax]).toEqual([3_000, 300]);
    expect(r.differs).toBe(true);
  });

  it('과세표준이 1,000원 단위면 두 방식이 같다', () => {
    for (const r of [calc(one(200_000, 7)), calc(one(180_000, 2), one(180_000, 1)), calc({ days: [100_000, 250_000] })]) {
      expect(r.differs).toBe(false);
      expect(r.dailyFloor.incomeTax).toBe(r.incomeTax);
    }
  });

  it('소득세 10원 미만 버림 전후로 1,000원 비교 결과가 같다(floor10(x) ≥ 1,000 ⇔ x ≥ 1,000)', () => {
    for (const w of [187_037, 187_038, 187_100, 187_400]) {
      const p = calc(one(w, 1)).payments[0];
      expect(p.small).toBe(p.milli > 0 && p.milli < 1_000_000);
    }
  });
});

describe('입력 확인', () => {
  it('지급이 없거나, 날이 없거나, 일급이 원 단위 정수가 아니면 오류', () => {
    expect(() => calc()).toThrow();
    expect(() => calc({ days: [] })).toThrow();
    expect(() => calc({ days: [-1] })).toThrow();
    expect(() => calc({ days: [200_000.5] })).toThrow();
    expect(() => calc({ days: [Number.NaN] })).toThrow();
    expect(() => expandLines([{ dailyWage: 200_000, days: 0 }])).toThrow();
    expect(() => expandLines([{ dailyWage: 200_000, days: 1.5 }])).toThrow();
    expect(() => expandLines([{ dailyWage: 200_000, days: 400 }])).toThrow();
  });
});

// ── 화면 문장 ──────────────────────────────────────────────

const CASES = {
  A: calc(one(200_000, 1)),
  B: calc(one(200_000, 7)),
  D: calc(one(180_000, 1)),
  F: calc(...Array.from({ length: 5 }, () => one(180_000, 1))),
  G: calc(one(150_000, 3)),
  J: calc({ days: [100_000, 250_000] }),
  K: calc(one(187_170, 3)),
  L: calc(one(180_000, 2), one(180_000, 1)),
};

describe('답 문장', () => {
  it('지급 1건 — 「예상」 소득세·지방소득세 한 줄', () => {
    expect(headline(CASES.A)).toEqual(['예상 원천징수 소득세는 1,350원, 지방소득세는 130원입니다.']);
  });

  it('소액부징수 — 0원과 그 이유(제86조 제1호), 계산한 세액을 같이 말한다', () => {
    const [lead, why] = headline(CASES.D);
    expect(lead).toBe('예상 원천징수 소득세는 0원입니다.');
    expect(why).toMatch(/810원/);
    expect(why).toMatch(/1,000원 미만/);
    expect(why).toMatch(/소득세법 제86조 제1호/);
  });

  it('과세표준 0 — 소액부징수와 다른 이유(제47조 제2항·제3항)', () => {
    const lines = headline(CASES.G);
    expect(lines[0]).toBe('예상 원천징수 소득세는 0원입니다.');
    expect(lines[1]).toMatch(/15만원/);
    expect(lines[1]).toMatch(/소득세법 제47조 제2항·제3항/);
    expect(lines.join(' ')).not.toMatch(/제86조/);
  });

  it('지급 여러 건 — 합계와 「지급 건마다」를 말하고, 건마다 줄을 낸다', () => {
    const lines = headline(CASES.L);
    expect(lines[0]).toBe('지급 2건의 예상 원천징수 소득세는 모두 1,620원, 지방소득세는 160원입니다.');
    expect(lines.join(' ')).toMatch(/지급 건마다/);
    expect(paymentLine(CASES.L.payments[0], 0)).toMatch(/지급 1.*2일분.*1,620원/);
    expect(paymentLine(CASES.L.payments[1], 1)).toMatch(/지급 2.*1일분.*810원.*1,000원 미만/);
  });

  it('끝수 순서로 값이 갈리면 두 값을 함께 내고 원문을 확인하지 못했다고 밝힌다', () => {
    const lines = headline(CASES.K);
    expect(lines[0]).toBe('예상 원천징수 소득세는 3,010원, 지방소득세는 300원입니다.');
    expect(lines[1]).toMatch(/1원 미만을 먼저 버리.*3,000원/);
    expect(lines[1]).toMatch(/확인하지 못/);
    expect(headline(CASES.B).join(' ')).not.toMatch(/먼저 버리/);
  });

  it('첫 줄은 늘 「예상」이다', () => {
    for (const r of Object.values(CASES)) expect(headline(r)[0]).toContain('예상');
  });
});

describe('계산 과정', () => {
  it('날별 식과 지급 건 합계, 10원 미만 버림, 지방소득세 945 → 940', () => {
    const s = formulaLines(CASES.B).join('\n');
    expect(s).toMatch(/200,000원 − 150,000원 = 50,000원/);
    expect(s).toMatch(/× 6% = 3,000원/);
    expect(s).toMatch(/× 55% = 1,650원/);
    expect(s).toMatch(/1,350원 × 7일/);
    expect(s).toMatch(/9,450원/);
    expect(s).toMatch(/945원 → 10원 미만 버림 940원/);
  });

  it('원 미만이 생기면 소수 그대로 보여 준다(K 1일 1,003.59원)', () => {
    expect(formulaLines(CASES.K).join('\n')).toMatch(/1,003\.59원/);
  });

  it('날마다 일급이 다르면 날마다 줄을 낸다(J)', () => {
    const s = formulaLines(CASES.J).join('\n');
    expect(s).toMatch(/100,000원.*0원/);
    expect(s).toMatch(/250,000원 − 150,000원 = 100,000원/);
  });
});

describe('공통 장치(261028) · 금지어', () => {
  const every = Object.values(CASES).flatMap((r) => allCopy(r));

  it('모든 문장에 금지어가 없다', () => {
    expect(every.length).toBeGreaterThan(20);
    expect(every.flatMap((l) => bannedHits(l).map((h) => `${h} | ${l}`))).toEqual([]);
  });

  it('대행이 아니라는 안내와 「예상」', () => {
    expect(NOTICE.join(' ')).toContain('세무대리·신고서 작성 대행이 아닙니다');
    expect(NOTICE.join(' ')).toContain('예상');
  });

  it('국세청 안내 링크는 확인한 주소, 홈택스는 첫 화면 — 메뉴 경로를 단정하지 않는다', () => {
    expect(NTS.href).toBe('https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7863');
    expect(new URL(HOMETAX.href).hostname).toMatch(/hometax\.go\.kr$/);
    expect(`${HOMETAX.text}${HOMETAX.after}${NTS.text}${NTS.after}`).not.toMatch(/→/);
  });

  it('사무소 7일 캡·평균 일급 같은 근거 없는 식을 쓰지 않는다', () => {
    const s = every.join('\n');
    expect(s).not.toMatch(/신고근무일|7일 캡|7일까지/);
    expect(INPUT_GUIDE.join(' ')).toMatch(/평균/);
  });

  it('일용근로자 여부는 서식 문구로 묻고, 아니면 간이세액표로 보낸다', () => {
    expect(ELIGIBILITY_NOTE).toContain('동일 고용주에게 3개월(건설공사 종사자는 1년) 이상 계속하여 고용되어 있는 근로자는 제외');
    expect(ELIGIBILITY_NOTE).toContain('소득세법 시행령 제20조 제1항');
    expect(ELIGIBILITY_STOP.join(' ')).toMatch(/간이세액표/);
  });

  it('4대보험은 계산하지 않고 안내만 — 고용보험의 일용근로자는 다른 개념(보험적용부-290)', () => {
    const line = NOT_COVERED.find((l) => l.includes('고용보험'))!;
    expect(line).toMatch(/계산하지 않습니다/);
    expect(line).toMatch(/보험적용부-290/);
    expect(every.join(' ')).not.toMatch(/0\.9%/);
  });

  it('소액부징수 단위와 끝수 순서를 밝힌다', () => {
    expect(CONSEQUENCES.join(' ')).toMatch(/여러 날분을 한 번에 지급하면 그 합계/);
    expect(ROUNDING_NOTE).toMatch(/국고금 관리법 제47조 제1항/);
    expect(ROUNDING_NOTE).toMatch(/확인하지 못/);
  });

  it('페이지·입력 화면은 연락을 권하지 않는다', () => {
    for (const f of ['src/app/tools/daily-worker-tax/page.tsx', 'src/app/tools/daily-worker-tax/DailyWorkerTaxClient.tsx', 'src/app/tools/daily-worker-tax/copy.ts']) {
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/연락|문의/);
    }
  });

  // 세무사법 제20조③(표시·광고) — 이름·소개에 「세무」「절세」를 쓰지 않는다
  it('도구 이름·설명에 「세무」「절세」가 없다', () => {
    const t = TOOLS.find((x) => x.href === '/tools/daily-worker-tax');
    expect(t).toBeDefined();
    expect(`${t!.title} ${t!.desc}`).not.toMatch(/세무|절세/);
    const page = fs.readFileSync('src/app/tools/daily-worker-tax/page.tsx', 'utf8');
    expect(page.slice(0, page.indexOf('export default'))).not.toMatch(/세무|절세/);
  });
});
