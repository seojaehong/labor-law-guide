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
  expect(r.amount).toBeGreaterThan(0);  // 참고 계산액은 돌려준다
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
