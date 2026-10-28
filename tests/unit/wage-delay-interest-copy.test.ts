import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import { allCopy, CONSEQUENCES, headline, itemLine } from '@/app/tools/wage-delay-interest/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

// 임금 지연이자 계산기의 문장. 합성 입력만 쓴다.
// 적용 제외(§37③·시행령 §18)는 회사가 주장하고 법원이 정하는 것이라 단정하지 않는다 — 「이 기간은 적용하지 않을 수 있습니다」.

const TODAY = '2026-10-29';
const A: WageDelayInput = { retireDate: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] };
const F: WageDelayInput = { retireDate: '2026-01-31', items: [{ kind: 'retirement', amount: 20_000_000, paidDate: '2026-12-31' }] };
const FX: WageDelayInput = { ...F, exclusions: [{ from: '2026-02-15', to: '2026-09-30' }] };
const E1: WageDelayInput = { items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2025-11-25' }] };
const B1: WageDelayInput = { retireDate: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-14' }] };
const D: WageDelayInput = { retireDate: '2026-06-10', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-07-31' }] };
const E2: WageDelayInput = { retireDate: '2025-12-31', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2026-02-27' }] };
const calc = calcWageDelayInterest;

describe('지연이자 — 답 문장', () => {
  it('굵은 줄은 합계 한 문장', () => {
    expect(headline(calc(A))[0]).toBe('지연이자는 모두 421,917원입니다.');
    expect(headline(calc(A)).join(' ')).toMatch(/연 20%/);
  });

  it('적용 제외 기간을 넣으면 뺀 값과 빼지 않은 값을 같이 말하고 단정하지 않는다', () => {
    const lines = headline(calc(FX), calc(F));
    expect(lines[0]).toBe('지연이자는 적용 제외 기간을 빼면 1,008,219원, 빼지 않으면 3,506,849원입니다.');
    expect(lines.join(' ')).toContain('이 기간은 적용하지 않을 수 있습니다');
    expect(lines.join(' ')).toMatch(/제37조 제3항/);
  });

  it('0원이면 이유를 말한다 — 시행 전 정기지급일(부칙 제2조) / 기준일까지 지급', () => {
    const e1 = headline(calc(E1));
    expect(e1[0]).toBe('지연이자가 붙지 않습니다.');
    expect(e1.join(' ')).toMatch(/부칙 제2조/);
    const b1 = headline(calc(B1));
    expect(b1[0]).toBe('지연이자가 붙지 않습니다.');
    expect(b1.join(' ')).toMatch(/기준일까지 지급/);
  });
});

describe('지연이자 — 항목 줄', () => {
  it('항목마다 적용한 호와 기준일을 말한다', () => {
    const a = itemLine(calc(A).items[0], 0, TODAY);
    expect(a).toMatch(/제37조 제1항 제1호/);
    expect(a).toMatch(/4월 14일/);
    expect(a).toMatch(/77일/);
    expect(a).toMatch(/421,917원/);
  });

  it('2호 이자가 붙은 뒤 퇴직하면 제37조 제2항', () => {
    expect(itemLine(calc(D).items[0], 0, TODAY)).toMatch(/제37조 제2항/);
  });

  it('시행 전 정기지급일 임금을 퇴직 때까지 못 받았으면 제1호와 부칙 제2조', () => {
    const l = itemLine(calc(E2).items[0], 0, TODAY);
    expect(l).toMatch(/제37조 제1항 제1호/);
    expect(l).toMatch(/부칙 제2조/);
  });
});

describe('지연이자 — 그래서 생기는 일', () => {
  it('합의로 지급기일을 늦춰도 기산일은 그대로(근로기준과-3981)', () => {
    expect(CONSEQUENCES.some((l) => l.includes('근로기준과-3981'))).toBe(true);
  });

  it('모든 문장에 금지어가 없다', () => {
    const all = [A, F, FX, E1, B1, D, E2].flatMap((x) => allCopy(calc(x), calc({ ...x, exclusions: [] }), TODAY));
    expect(all.length).toBeGreaterThan(10);
    expect(all.flatMap((l) => bannedHits(l))).toEqual([]);
  });
});
