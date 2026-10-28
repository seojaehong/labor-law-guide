import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import { allCopy, BASIS, CONSEQUENCES, EXCLUSION_HINT, FORMULA, headline, itemLine, NOT_COVERED, REASON } from '@/app/tools/wage-delay-interest/copy';
import { bannedHits } from '@/lib/tool-kit/banned';

// 임금 지연이자 계산기의 문장. 합성 입력만 쓴다.
// 적용 제외(§37③·시행령 §18)는 회사가 주장하고 법원이 정하는 것이라 단정하지 않는다 — 「이 기간은 적용하지 않을 수 있습니다」.

const TODAY = '2026-10-29';
const A: WageDelayInput = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-06-30' }] };
const F: WageDelayInput = { lastWorkDay: '2026-01-31', items: [{ kind: 'retirement', amount: 20_000_000, paidDate: '2026-12-31' }] };
const FX: WageDelayInput = { ...F, exclusions: [{ from: '2026-02-15', to: '2026-09-30' }] };
const FOUT: WageDelayInput = { ...F, exclusions: [{ from: '2026-01-01', to: '2026-02-14' }] };
const E1: WageDelayInput = { items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2025-11-25' }] };
const J1: WageDelayInput = { items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-10-22', paidDate: '2025-11-24' }] };
const B1: WageDelayInput = { lastWorkDay: '2026-03-31', items: [{ kind: 'retirement', amount: 10_000_000, paidDate: '2026-04-14' }] };
const TINY: WageDelayInput = { lastWorkDay: '2026-03-30', items: [{ kind: 'retirement', amount: 1_000, paidDate: '2026-04-14' }] };
const D: WageDelayInput = { lastWorkDay: '2026-06-10', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-07-31' }] };
const PAID_IN_SERVICE: WageDelayInput = { lastWorkDay: '2026-06-09', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2026-05-25', paidDate: '2026-06-05' }] };
const E2: WageDelayInput = { lastWorkDay: '2025-12-31', items: [{ kind: 'periodic', amount: 3_000_000, periodicPayDate: '2025-09-25', paidDate: '2026-02-27' }] };
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

  it('넣은 적용 제외 기간이 지연 기간과 겹치지 않아도 그 사실과 「이 기간은 적용하지 않을 수 있습니다」를 말한다', () => {
    const lines = headline(calc(FOUT), calc(F));
    expect(lines[0]).toBe('지연이자는 모두 3,506,849원입니다.');
    expect(lines.join(' ')).toMatch(/겹치지 않아/);
    expect(lines.join(' ')).toContain('이 기간은 적용하지 않을 수 있습니다');
  });

  it('적용 제외를 체크하면 날짜를 넣기 전에도 체크 칸 아래 문장에 「이 기간은 적용하지 않을 수 있습니다」가 있다', () => {
    expect(EXCLUSION_HINT).toContain('이 기간은 적용하지 않을 수 있습니다');
  });

  it('0원이면 이유를 말한다 — 시행 전 정기지급일(부칙 제2조) / 기준일까지 지급', () => {
    const e1 = headline(calc(E1));
    expect(e1[0]).toBe('지연이자가 붙지 않습니다.');
    expect(e1.join(' ')).toMatch(/부칙 제2조/);
    const b1 = headline(calc(B1));
    expect(b1[0]).toBe('지연이자가 붙지 않습니다.');
    expect(b1.join(' ')).toMatch(/기준일까지 지급/);
  });

  it('지연은 있었는데 원 미만이라 0원이면 「기준일까지 지급했습니다」라고 하지 않는다', () => {
    const t = headline(calc(TINY));
    expect(t.join(' ')).not.toMatch(/기준일까지 지급/);
    expect(t.join(' ')).toMatch(/원 미만/);
    expect(itemLine(calc(TINY).items[0], 0, TODAY)).toMatch(/지연 1일 → 지연이자 0원/);
  });

  it('정기지급일 2025. 10. 22.(시행 전날)은 0원으로 계산했다고 하고 다른 해석의 값 54,246원을 같이 보인다', () => {
    const j = headline(calc(J1)).join(' ');
    expect(j).toMatch(/54,246원/);
    expect(j).not.toMatch(/붙지 않습니다\(법률 제20520호 부칙 제2조\)\./);
    expect(itemLine(calc(J1).items[0], 0, TODAY)).toMatch(/54,246원/);
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

  it('퇴직 전에 지급을 마친 2호 임금은 제37조 제2항이 아니라 제1항 제2호', () => {
    const l = itemLine(calc(PAID_IN_SERVICE).items[0], 0, TODAY);
    expect(l).toMatch(/제37조 제1항 제2호/);
    expect(l).not.toMatch(/제37조 제2항/);
    expect(l).toMatch(/18,082원/);
  });

  it('시행 전 정기지급일 임금을 퇴직 때까지 못 받았으면 제1호와 부칙 제2조', () => {
    const l = itemLine(calc(E2).items[0], 0, TODAY);
    expect(l).toMatch(/제37조 제1항 제1호/);
    expect(l).toMatch(/부칙 제2조/);
  });

  it('1호 대상은 임금과 퇴직금 일시금 — 「금품」으로 넓히지 않는다', () => {
    expect(REASON.retirement).toMatch(/임금/);
    expect(REASON.retirement).not.toMatch(/금품/);
    expect(NOT_COVERED.some((l) => l.includes('보상금'))).toBe(true);
  });
});

describe('지연이자 — 근거·계산 방법', () => {
  it('광주지법 2010가합8213은 판결이 실제로 한 말로 인용한다 — 결론은 시행령 제18조 제4호 적용 제외, 일요일은 판결이 다루지 않았다', () => {
    const g = BASIS.find((l) => l.includes('2010가합8213'))!;
    expect(g).toBeDefined();
    expect(g).toMatch(/제18조 제4호/);
    expect(g).toMatch(/연 5%/);
    expect(g).not.toMatch(/일요일/);
    expect([...BASIS, ...FORMULA].join(' ')).not.toMatch(/판결의 계산과 같음/);
  });

  it('1호 기한 셈은 퇴사 정리와 같은 말 — 마지막 근무일에서 14일째 되는 날', () => {
    expect(FORMULA[0]).toMatch(/마지막 근무일/);
    expect(FORMULA[0]).toMatch(/14일째/);
  });

  it('재직 중에는 시행령 제23조 금품을 계산하지 않는다고 말한다(재직 중 화면에 없는 선택지를 안내하지 않는다)', () => {
    const l = NOT_COVERED.find((x) => x.includes('시행령 제23조'))!;
    expect(l).toMatch(/재직 중/);
    expect(l).toMatch(/계산하지 않습니다/);
  });
});

describe('지연이자 — 그래서 생기는 일', () => {
  it('합의로 지급기일을 늦춰도 기산일은 그대로(근로기준과-3981)', () => {
    expect(CONSEQUENCES.some((l) => l.includes('근로기준과-3981'))).toBe(true);
  });

  it('모든 문장에 금지어가 없다', () => {
    const all = [A, F, FX, FOUT, E1, J1, B1, TINY, D, PAID_IN_SERVICE, E2].flatMap((x) => allCopy(calc(x), calc({ ...x, exclusions: [] }), TODAY));
    expect(all.length).toBeGreaterThan(10);
    expect(all).toContain(EXCLUSION_HINT);
    expect(all.flatMap((l) => bannedHits(l))).toEqual([]);
  });
});
