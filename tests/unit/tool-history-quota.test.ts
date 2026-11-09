// 최근 입력 — 저장 공간이 찼을 때 기억하기를 바꿔도 잃지 않는가, 설정을 다시 바꿀 길이 남는가.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recentInputsVisible } from '@/app/tools/contract-write/historyState';
import { addHistory, hasAnyHistory, isHistoryRemembered, listHistory, setHistoryRemember } from '@/lib/tool-history';

const localData = new Map<string, string>();
const sessionData = new Map<string, string>();
let refuse: ((store: 'local' | 'session', key: string) => boolean) | null = null;
const fakeStorage = (m: Map<string, string>, store: 'local' | 'session') => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (refuse?.(store, k)) throw new DOMException('quota', 'QuotaExceededError');
    m.set(k, v);
  },
  removeItem: (k: string) => void m.delete(k),
  get length() {
    return m.size;
  },
  key: (i: number) => [...m.keys()][i] ?? null,
});
vi.stubGlobal('window', { localStorage: fakeStorage(localData, 'local'), sessionStorage: fakeStorage(sessionData, 'session'), dispatchEvent: () => true });

const T = 'contract-write';
const isEntries = (k: string) => k.startsWith('llg.history.v1:');
const isFlag = (k: string) => k.startsWith('llg.history.remember.v1:');

beforeEach(() => {
  refuse = null;
  localData.clear();
  sessionData.clear();
});

function twoEntries() {
  addHistory(T, 'A', { a: 1 });
  addHistory(T, 'B', { a: 2 });
}

describe('기억하기 켜기 — 저장 공간이 찼을 때', () => {
  it('목록을 못 쓰면 false 이고 설정·이력이 그대로다', () => {
    twoEntries();
    refuse = (s, k) => s === 'local' && isEntries(k);
    expect(setHistoryRemember(T, true)).toBe(false);
    refuse = null;
    expect(isHistoryRemembered(T)).toBe(false);
    expect(listHistory(T).map((e) => e.label)).toEqual(['B', 'A']);
  });

  it('설정을 못 쓰면 새로 쓴 사본을 지우고 그대로 둔다', () => {
    twoEntries();
    refuse = (s, k) => s === 'local' && isFlag(k);
    expect(setHistoryRemember(T, true)).toBe(false);
    refuse = null;
    expect(isHistoryRemembered(T)).toBe(false);
    expect(listHistory(T)).toHaveLength(2);
    expect([...localData.keys()].filter(isEntries)).toEqual([]);
  });

  it('성공하면 true 이고 옛 저장소에 남기지 않는다', () => {
    twoEntries();
    expect(setHistoryRemember(T, true)).toBe(true);
    expect([...sessionData.keys()].filter(isEntries)).toEqual([]);
    expect(listHistory(T)).toHaveLength(2);
  });
});

describe('기억하기 끄기 — 저장 공간이 찼을 때', () => {
  it('세션에 못 쓰면 false 이고 켜진 채 그대로다', () => {
    twoEntries();
    setHistoryRemember(T, true);
    refuse = (s, k) => s === 'session' && isEntries(k);
    expect(setHistoryRemember(T, false)).toBe(false);
    refuse = null;
    expect(isHistoryRemembered(T)).toBe(true);
    expect(listHistory(T)).toHaveLength(2);
  });
});

describe('이력이 저장소를 따른다', () => {
  it('기억하기 꺼짐이면 localStorage 에 이력을 쓰지 않는다', () => {
    twoEntries();
    expect([...localData.keys()].filter(isEntries)).toEqual([]);
    expect([...sessionData.keys()].filter(isEntries)).toHaveLength(1);
  });

  it('기억하기 켜짐이면 새 이력은 localStorage 에만 쓴다', () => {
    setHistoryRemember(T, true);
    addHistory(T, 'A', { a: 1 });
    expect([...localData.keys()].filter(isEntries)).toHaveLength(1);
    expect([...sessionData.keys()].filter(isEntries)).toEqual([]);
  });
});

describe('영역이 사라지지 않는 조건', () => {
  it('마운트 전에는 그리지 않는다', () => {
    expect(recentInputsVisible(false, 3, true)).toBe(false);
  });

  it('이력이 없고 기억하기도 꺼졌으면 첫 화면 그대로 그리지 않는다', () => {
    expect(recentInputsVisible(true, 0, false)).toBe(false);
  });

  it('기억하기가 켜져 있으면 이력이 없어도 그린다 — 끌 곳이 있어야 한다', () => {
    expect(recentInputsVisible(true, 0, true)).toBe(true);
  });

  it('이력이 있으면 그린다', () => {
    expect(recentInputsVisible(true, 1, false)).toBe(true);
  });
});

describe('최근 입력이 있는가', () => {
  it('없으면 false', () => {
    expect(hasAnyHistory()).toBe(false);
  });

  it('세션 이력·기억하기 설정 어느 쪽이든 있으면 true', () => {
    addHistory(T, 'A', { a: 1 });
    expect(hasAnyHistory()).toBe(true);
    sessionData.clear();
    expect(hasAnyHistory()).toBe(false);
    localData.set('llg.history.remember.v1:other', 'true');
    expect(hasAnyHistory()).toBe(true);
  });
});
