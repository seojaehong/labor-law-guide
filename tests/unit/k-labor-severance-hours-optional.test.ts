// 261127 · #307 — k-labor MCP 퇴직금 계산의 `weeklyHours` 는 **선택 입력**이다.
// #298 에서 필수가 되며 기존 3필드 호출(hireDate·lastWorkDate·wageTotal)이 핸들러에 닿기도 전에 거절됐다.
// 엔진은 시간을 모르면 `hours-unknown` 으로 돌려주도록 설계돼 있다 — 필수로 두면 그 분기가 영원히 안 쓰인다.
// 🔴 미입력을 「지급 대상」이나 「대상 아님」으로 단정하지 않는다. 15시간 판정 규칙은 그대로 둔다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { calcSeverance } from '@/lib/calc/severance';

const registry = readFileSync('tools/k-labor/groups/calc.mjs', 'utf8');
const BASE = { hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000 };

it('공용 등록부(tools/list)의 weeklyHours 가 선택 입력이다', () => {
  const line = registry.split('\n').find((l) => l.includes('weeklyHours: z.number().min(0).max(168)'));
  expect(line, 'calc_severance 의 weeklyHours 줄을 못 찾았다').toBeTruthy();
  expect(line).toContain('.optional()');
});

it('🔴 3필드만으로 계산된다 — 미입력은 hours-unknown 이고 대상 여부를 단정하지 않는다', () => {
  const r = calcSeverance(BASE);
  expect(r.status).toBe('hours-unknown');
  expect(r.hours15).toBeNull();     // 「모른다」는 false 가 아니다
  expect(r.eligible).toBe(false);   // 대상이라고 단정하지도 않는다
  // 261127 #313 needs — 참고 계산액도 내지 않고 1주 소정근로시간을 되묻는다(261126 D2 「판정 보류 + 금액」을 뒤집음)
  expect(r.amount).toBeNull();
  expect(r.needs.map((n) => n.key)).toEqual(['weeklyHours']);
});

it('미입력과 명시적 0시간을 가른다', () => {
  expect(calcSeverance(BASE).status).toBe('hours-unknown');
  expect(calcSeverance({ ...BASE, weeklyHours: 0 }).status).toBe('under-15h');
  expect(calcSeverance({ ...BASE, weeklyHours: 0 }).hours15).toBe(false);
});

it('15시간 판정 규칙은 그대로다 — 14시간과 15시간이 갈린다', () => {
  expect(calcSeverance({ ...BASE, weeklyHours: 14 }).status).toBe('under-15h');
  expect(calcSeverance({ ...BASE, weeklyHours: 15 }).status).toBe('eligible');
  expect(calcSeverance({ ...BASE, weeklyHours: 15 }).eligible).toBe(true);
});

it('1년 미만은 시간과 무관하게 under-1y 다 (판정 순서가 바뀌지 않았다)', () => {
  const short = { hireDate: '2025-06-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000 };
  expect(calcSeverance(short).status).toBe('under-1y');
  expect(calcSeverance({ ...short, weeklyHours: 40 }).status).toBe('under-1y');
});

it('hoursChanged 는 계산하지 않고 거절한다', () => {
  expect(() => calcSeverance({ ...BASE, weeklyHours: 20, hoursChanged: true })).toThrow();
});

it('등록부에 hours-unknown 분기가 살아 있다 — 스키마가 막으면 벽지가 된다', () => {
  expect(registry).toContain("'hours-unknown'");
});

// 261127 #313+#308 — 스키마를 통과한 뒤 핸들러까지: 비우면 금액 없이 needs, 40이면 금액(서버1 검토의 런타임 확인을 시험으로)
it('MCP: 스키마 → 핸들러 — 주 시간 비우면 amount null·needs 1, 40이면 금액·needs 0', async () => {
  // k-labor 는 자기 zod(3.x)를 쓴다 — 시험 쪽 zod(4.x)로 감싸지 않고 필드 스키마를 그대로 돌린다(빠진 필수 필드도 여기서 걸린다)
  type Field = { safeParse: (v: unknown) => { success: boolean } };
  const { registerCalc } = await import('../../tools/k-labor/groups/calc.mjs');
  const hs: Record<string, { c: { inputSchema: Record<string, Field> }; h: (a: unknown) => Promise<{ content: { text: string }[] }> }> = {};
  registerCalc({ registerTool: (n: string, c: never, h: never) => { hs[n] = { c, h }; } });
  const call = async (a: Record<string, unknown>) => {
    for (const [k, s] of Object.entries(hs.calc_severance.c.inputSchema)) expect(s.safeParse(a[k]).success, k).toBe(true);
    return JSON.parse((await hs.calc_severance.h(a)).content[0].text);
  };
  const none = await call(BASE);
  expect(none.result.amount).toBeNull();
  expect(none.needs).toHaveLength(1);
  const forty = await call({ ...BASE, weeklyHours: 40 });
  expect(forty.result.amount).toBeGreaterThan(0);
  expect(forty.needs).toHaveLength(0);
});
