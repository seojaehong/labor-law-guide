// 퇴고 체험 브라우저 진입점이 파일·암호·경로 기능과 네트워크에 닿지 않는지.
// 시험은 노드에서 돌아 진입점이 fs 를 써도 통과해 버린다 — 그래서 이 파일에서는 node:fs·node:path·node:url·node:crypto 를
// 브라우저 번들과 같은 스텁(불리면 던진다, src/lib/toego/node-stub.mjs)으로 바꾸고, 네트워크 통로를 전부 기록하는 가짜로 바꾼다.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CORPUS } from '../fixtures/toego/corpus';

vi.mock('node:fs', () => import('../../src/lib/toego/node-stub.mjs'));
vi.mock('node:path', () => import('../../src/lib/toego/node-stub.mjs'));
vi.mock('node:url', () => import('../../src/lib/toego/node-stub.mjs'));
vi.mock('node:crypto', () => import('../../src/lib/toego/node-stub.mjs'));

const GENRES = ['legal', 'consulting', 'lecture', 'general', 'official'] as const;
const calls: string[] = [];
const saved: Record<string, unknown> = {};
const NET = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'] as const;

beforeAll(() => {
  for (const k of NET) saved[k] = (globalThis as Record<string, unknown>)[k];
  const g = globalThis as Record<string, unknown>;
  g.fetch = (...a: unknown[]) => { calls.push(`fetch ${String(a[0])}`); throw new Error('네트워크 금지'); };
  g.XMLHttpRequest = class { constructor() { calls.push('XMLHttpRequest'); } };
  g.WebSocket = class { constructor(u: string) { calls.push(`WebSocket ${u}`); } };
  g.EventSource = class { constructor(u: string) { calls.push(`EventSource ${u}`); } };
  if (globalThis.navigator) {
    saved.sendBeacon = (globalThis.navigator as unknown as Record<string, unknown>).sendBeacon;
    Object.defineProperty(globalThis.navigator, 'sendBeacon', { configurable: true, value: (u: string) => { calls.push(`sendBeacon ${u}`); return true; } });
  }
});
afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of NET) g[k] = saved[k];
  if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'sendBeacon', { configurable: true, value: saved.sendBeacon });
});

describe('브라우저 진입점 — node API·네트워크에 닿지 않는다', () => {
  it('스텁이 실제로 걸려 있다(이 시험이 헛돌지 않게) — 엔진의 팩 폴더 읽기는 던진다', async () => {
    const { loadPackSet } = await import('../../tools/k-labor/lib/prose/check.mjs');
    expect(() => loadPackSet({ dir: 'C:/가상/폴더' })).toThrow(/브라우저에서는/);
  });

  it('합성 글 × 장르 다섯을 스텁 아래에서 끝까지 점검하고, 네트워크 호출은 0건', async () => {
    const { runToegoBrowser } = await import('../../src/lib/toego/entry.mjs');
    let hits = 0;
    for (const text of CORPUS) {
      for (const genre of GENRES) {
        const r = runToegoBrowser({ text, genre });
        if (text.trim()) {
          expect(r.ok, `${genre} ${JSON.stringify(text).slice(0, 30)}`).toBe(true);
          hits += r.prose.hits.length + r.norms.spacing.hits.length + r.norms.punct.hits.length + r.norms.comma.hits.length;
        }
      }
    }
    expect(hits).toBeGreaterThan(50);
    expect(calls).toEqual([]);
  });
});
