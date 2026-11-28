import { describe, expect, it } from 'vitest';
import { calcWageDelayInterest, type WageDelayInput } from '@/lib/calc/wage-delay-interest';
import * as delayMcp from '../../tools/k-labor/groups/more/calc_wage_delay_interest.mjs';

// P3 #5(261124 검수) — 적용 제외 사유(시행령 제18조)가 일부 항목에만 있으면 맞는 합계를 낼 수 없었다. 입력은 합성 값이다.
// 정기지급일 11. 10. · 지급 11. 12. → 지연 2일. 365만원 × 20% × 1일 ÷ 365 = 2,000원/일.
// 제외 기간 11. 11.~11. 12.(시행령 제18조 — 사유가 존속하는 기간)

type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function mcp(): Handler {
  let h: Handler | null = null;
  delayMcp.register({ registerTool: (_n: string, _c: unknown, handler: Handler) => { h = handler; } });
  return h!;
}
const call = async (a: Record<string, unknown>) => JSON.parse((await mcp()(a)).content[0]!.text);

describe('#5 지연이자 — 적용 제외 기간을 항목별로', () => {
  const item = { kind: 'periodic' as const, amount: 3_650_000, periodicPayDate: '2026-11-10', paidDate: '2026-11-12' };
  const ex = [{ from: '2026-11-11', to: '2026-11-12' }];

  it('제외 사유가 없으면 두 건 합계 8,000원', () => {
    expect(calcWageDelayInterest({ items: [item, item] }).total).toBe(8_000);
  });
  it('공통 제외(모든 항목) — 0원(종전 입력 그대로)', () => {
    expect(calcWageDelayInterest({ items: [item, item], exclusions: ex }).total).toBe(0);
  });
  it('한 항목에만 제외 사유 — 4,000원(그 항목 0 + 다른 항목 4,000)', () => {
    const r = calcWageDelayInterest({ items: [{ ...item, exclusions: ex }, item] } as WageDelayInput);
    expect(r.items.map((i) => i.interest)).toEqual([0, 4_000]);
    expect(r.items.map((i) => i.excludedDays)).toEqual([2, 0]);
    expect(r.total).toBe(4_000);
  });
  it('두 항목 모두에 항목별 제외 — 0원', () => {
    const r = calcWageDelayInterest({ items: [{ ...item, exclusions: ex }, { ...item, exclusions: ex }] } as WageDelayInput);
    expect(r.total).toBe(0);
  });
  it('공통 제외와 항목별 제외가 겹치면 한 번만 뺀다', () => {
    const r = calcWageDelayInterest({ items: [{ ...item, exclusions: [{ from: '2026-11-12', to: '2026-11-12' }] }], exclusions: [{ from: '2026-11-11', to: '2026-11-12' }] } as WageDelayInput);
    expect(r.items[0]!.excludedDays).toBe(2);
  });
  it('항목별 제외 기간이 거꾸로면 항목 번호를 붙여 막는다', () => {
    expect(() => calcWageDelayInterest({ items: [item, { ...item, exclusions: [{ from: '2026-11-12', to: '2026-11-11' }] }] } as WageDelayInput))
      .toThrow(/항목 2/);
  });

  it('MCP — 항목별 제외 4,000원, 빼지 않으면 8,000원', async () => {
    // 261128 — 재직 중이라고 넣는다(비우면 needs 로 묻는다)
    const o = await call({ employed: true, items: [{ ...item, exclusions: ex }, item] });
    expect(o.ok).toBe(true);
    expect(o.result.total).toBe(4_000);
    expect(o.totalWithoutExclusions).toBe(8_000);
  });
  it('MCP — 제외 없음 8,000원, 「빼지 않으면」 값은 내지 않는다', async () => {
    const o = await call({ employed: true, items: [item, item] });
    expect(o.result.total).toBe(8_000);
    expect(o.totalWithoutExclusions).toBeUndefined();
  });
});
