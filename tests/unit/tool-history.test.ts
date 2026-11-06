// 도구별 최근 입력(261106 재홍님 「고」) — 범용. 도구 이름마다 따로, 최대 5건, 새것이 앞.
// 저장 위치는 사업장 카드와 같은 정책: 기본 sessionStorage(탭을 닫으면 사라짐), 「기억하기」를 켜면 localStorage.
// 기억하기 설정 자체는 사람 정보가 없어 항상 localStorage 에 둔다. 🔒 서버로 보내는 코드가 없다(소스 가드).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addHistory, clearHistory, HISTORY_CHANGED, HISTORY_MAX, isHistoryRemembered, listHistory, setHistoryRemember } from '@/lib/tool-history';

const localData = new Map<string, string>();
const sessionData = new Map<string, string>();
const events: string[] = [];
const fakeStorage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
});
vi.stubGlobal('window', {
  localStorage: fakeStorage(localData),
  sessionStorage: fakeStorage(sessionData),
  dispatchEvent: (e: { type: string }) => void events.push(e.type),
});

beforeEach(() => {
  localData.clear();
  sessionData.clear();
  events.length = 0;
});

const T = 'contract-write';
const at = (n: number) => new Date(Date.UTC(2026, 10, 6, 0, n));

describe('최근 입력 쌓기', () => {
  it('처음에는 비어 있다', () => {
    expect(listHistory(T)).toEqual([]);
    expect(isHistoryRemembered(T)).toBe(false);
  });

  it('기본은 sessionStorage 에만 — 키 llg.history.v1:<도구>, localStorage 에는 아무것도 없다', () => {
    addHistory(T, '홍길동 · 2026-03-01 · 가나상사', { employeeName: '홍길동' }, at(1));
    expect([...sessionData.keys()]).toEqual(['llg.history.v1:contract-write']);
    expect(localData.size).toBe(0);
    expect(listHistory(T)).toEqual([{ savedAt: '2026-11-06T00:01:00.000Z', label: '홍길동 · 2026-03-01 · 가나상사', state: { employeeName: '홍길동' } }]);
    expect(events).toContain(HISTORY_CHANGED);
  });

  it(`최대 ${5}건, 새것이 앞`, () => {
    expect(HISTORY_MAX).toBe(5);
    for (let i = 1; i <= 7; i++) addHistory(T, `입력${i}`, { n: i }, at(i));
    expect(listHistory(T).map((e) => e.label)).toEqual(['입력7', '입력6', '입력5', '입력4', '입력3']);
  });

  it('같은 내용이면 맨 앞으로 옮긴다 — 중복이 없다(칸 순서가 달라도 같은 내용)', () => {
    addHistory(T, 'A', { a: 1, b: ['월'] }, at(1));
    addHistory(T, 'B', { a: 2 }, at(2));
    addHistory(T, 'A', { b: ['월'], a: 1 }, at(3));
    const list = listHistory(T);
    expect(list.map((e) => e.label)).toEqual(['A', 'B']);
    expect(list[0].savedAt).toBe('2026-11-06T00:03:00.000Z');
  });

  it('도구마다 따로다', () => {
    addHistory(T, 'A', { a: 1 }, at(1));
    addHistory('severance', 'S', { s: 1 }, at(2));
    expect(listHistory(T).map((e) => e.label)).toEqual(['A']);
    expect(listHistory('severance').map((e) => e.label)).toEqual(['S']);
  });

  it('저장된 값이 손상돼 있어도 터지지 않고, 모양이 틀린 항목만 버린다', () => {
    sessionData.set('llg.history.v1:contract-write', '{{깨진 JSON');
    expect(listHistory(T)).toEqual([]);
    sessionData.set(
      'llg.history.v1:contract-write',
      JSON.stringify([
        { savedAt: '2026-11-06T00:00:00.000Z', label: '좋음', state: { a: 1 } },
        { savedAt: 3, label: '시각 틀림', state: {} },
        { savedAt: '2026-11-06T00:00:00.000Z', label: '상태가 배열', state: [] },
        { savedAt: '2026-11-06T00:00:00.000Z', label: '상태 없음' },
        '문자열',
      ]),
    );
    expect(listHistory(T).map((e) => e.label)).toEqual(['좋음']);
    sessionData.set('llg.history.v1:contract-write', JSON.stringify({ not: 'array' }));
    expect(listHistory(T)).toEqual([]);
  });
});

describe('기억하기 전환·지우기', () => {
  it('켜면 localStorage 로 옮기고 sessionStorage 에서 지운다 — 설정은 llg.history.remember.v1:<도구>', () => {
    addHistory(T, 'A', { a: 1 }, at(1));
    setHistoryRemember(T, true);
    expect(isHistoryRemembered(T)).toBe(true);
    expect(sessionData.size).toBe(0);
    expect([...localData.keys()].sort()).toEqual(['llg.history.remember.v1:contract-write', 'llg.history.v1:contract-write']);
    expect(listHistory(T).map((e) => e.label)).toEqual(['A']);
    addHistory(T, 'B', { a: 2 }, at(2));
    expect(sessionData.size).toBe(0);
    expect(listHistory(T).map((e) => e.label)).toEqual(['B', 'A']);
  });

  it('끄면 sessionStorage 로 돌아오고 localStorage 에는 이력이 남지 않는다', () => {
    setHistoryRemember(T, true);
    addHistory(T, 'A', { a: 1 }, at(1));
    setHistoryRemember(T, false);
    expect(isHistoryRemembered(T)).toBe(false);
    expect(localData.size).toBe(0);
    expect(listHistory(T).map((e) => e.label)).toEqual(['A']);
    expect([...sessionData.keys()]).toEqual(['llg.history.v1:contract-write']);
  });

  it('지우기 — 두 저장소 모두에서 이력이 사라진다', () => {
    addHistory(T, 'A', { a: 1 }, at(1));
    localData.set('llg.history.v1:contract-write', JSON.stringify([{ savedAt: 'x', label: 'L', state: {} }]));
    addHistory('severance', 'S', { s: 1 }, at(2));
    clearHistory(T);
    expect(listHistory(T)).toEqual([]);
    expect([...localData.keys(), ...sessionData.keys()].filter((k) => k.endsWith(':contract-write'))).toEqual([]);
    expect(listHistory('severance').map((e) => e.label)).toEqual(['S']);
  });

  it('기억하기 설정 값이 손상돼 있으면 꺼진 것으로 본다', () => {
    localData.set('llg.history.remember.v1:contract-write', '"네"');
    expect(isHistoryRemembered(T)).toBe(false);
  });
});

describe('전송 가드', () => {
  const src = readFileSync(resolve(__dirname, '../../src/lib/tool-history.ts'), 'utf8');

  it('서버 전송 코드가 없다', () => {
    for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) expect(src, banned).not.toContain(banned);
  });

  it('이력을 localStorage 에 쓰는 것은 기억하기를 거쳐야만 가능하다', () => {
    expect(src).toContain('return isHistoryRemembered(tool) ? local() : session();');
  });
});
