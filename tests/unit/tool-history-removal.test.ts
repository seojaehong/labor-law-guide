// 합성 저장소만 사용한다. 실제 고객 입력이나 브라우저 자료는 읽지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearHistory, HISTORY_CHANGED, isHistoryRemembered, listHistory, setHistoryRemember } from '@/lib/tool-history';

const TOOL = 'contract-write';
const KEY = `llg.history.v1:${TOOL}`;
const FLAG = `llg.history.remember.v1:${TOOL}`;
const RAW = ' [ { "savedAt": "2026-11-10T00:00:00Z", "label": "합성 입력", "state": { "a": 1 } } ] ';
type Store = 'local' | 'session';
type Operation = 'get' | 'set' | 'remove';
type Fault = (store: Store, operation: Operation, key: string) => boolean;
let fail: Fault | null;
let ignore: Fault | null;
let afterChange: ((store: Store, operation: Operation, key: string) => void) | null;
const data = { local: new Map<string, string>(), session: new Map<string, string>() };
const dispatchEvent = vi.fn();
function storage(name: Store) {
  const guard = (op: Operation, key: string) => {
    if (fail?.(name, op, key)) throw new DOMException('synthetic storage failure', 'SecurityError');
  };
  return {
    getItem(k: string) { guard('get', k); return data[name].get(k) ?? null; },
    setItem(k: string, v: string) { guard('set', k); if (!ignore?.(name, 'set', k)) data[name].set(k, v); afterChange?.(name, 'set', k); },
    removeItem(k: string) { guard('remove', k); if (!ignore?.(name, 'remove', k)) data[name].delete(k); afterChange?.(name, 'remove', k); },
    get length() { return data[name].size; },
    key(i: number) { return [...data[name].keys()][i] ?? null; },
  };
}
const WINDOW = { localStorage: storage('local'), sessionStorage: storage('session'), dispatchEvent };
const snapshot = () => ({ local: [...data.local].sort(), session: [...data.session].sort() });
const source = (remember: boolean): Store => remember ? 'local' : 'session';
const target = (remember: boolean): Store => remember ? 'session' : 'local';
function seed(remember: boolean) {
  data[source(remember)].set(KEY, RAW);
  if (remember) data.local.set(FLAG, 'true');
}

beforeEach(() => {
  fail = ignore = afterChange = null;
  data.local.clear();
  data.session.clear();
  dispatchEvent.mockClear();
  vi.stubGlobal('window', WINDOW);
});
afterEach(() => vi.unstubAllGlobals());

describe.each([true, false])('최근 입력 기억하기 전환: 기존 remember=%s', remember => {
  it('원본 삭제 실패를 성공으로 알리지 않고 원문과 설정을 복구한 뒤 재시도한다', () => {
    seed(remember);
    const before = snapshot();
    fail = (s, op, k) => s === source(remember) && op === 'remove' && k === KEY;
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(isHistoryRemembered(TOOL)).toBe(remember);
    expect(listHistory(TOOL)).toHaveLength(1);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: HISTORY_CHANGED }));
    fail = null;
    expect(setHistoryRemember(TOOL, !remember)).toBe(true);
    expect(data[source(remember)].has(KEY)).toBe(false);
    expect(data[target(remember)].get(KEY)).toBe(RAW);
  });

  it.each(['get', remember ? 'remove' : 'set'] as const)('설정 %s 실패 시 변경 전 원문을 보존한다', op => {
    seed(remember);
    data[target(remember)].set(KEY, '옛 대상 원문');
    const before = snapshot();
    fail = (s, operation, k) => s === 'local' && operation === op && k === FLAG;
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it.each([true, false])('원본·대상 읽기가 막히면 빈 이력으로 덮지 않는다 (source=%s)', from => {
    seed(remember);
    data[target(remember)].set(KEY, '옛 대상 원문');
    const before = snapshot();
    fail = (s, op, k) => s === (from ? source(remember) : target(remember)) && op === 'get' && k === KEY;
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('대상 쓰기가 적용되지 않았으면 원본을 지우지 않는다', () => {
    seed(remember);
    const before = snapshot();
    ignore = (s, op, k) => s === target(remember) && op === 'set' && k === KEY;
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('삭제 호출이 조용히 무시돼도 실패다', () => {
    seed(remember);
    const before = snapshot();
    ignore = (s, op, k) => s === source(remember) && op === 'remove' && k === KEY;
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('원본이 없으면 대상의 옛 이력을 되살리지 않는다', () => {
    if (remember) data.local.set(FLAG, 'true');
    data[target(remember)].set(KEY, RAW);
    expect(setHistoryRemember(TOOL, !remember)).toBe(true);
    expect(data.local.has(KEY)).toBe(false);
    expect(data.session.has(KEY)).toBe(false);
  });

  it('설정 복구까지 막히면 새 사본을 보존하고 같은 요청으로 삭제를 재시도한다', () => {
    seed(remember);
    let changed = false;
    afterChange = (s, _op, k) => { if (s === 'local' && k === FLAG) changed = true; };
    fail = (s, op, k) => (s === source(remember) && op === 'remove' && k === KEY)
      || (changed && s === 'local' && k === FLAG && op === (remember ? 'set' : 'remove'));
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(data.local.get(KEY)).toBe(RAW);
    expect(data.session.get(KEY)).toBe(RAW);
    expect(isHistoryRemembered(TOOL)).toBe(!remember);
    fail = afterChange = null;
    expect(setHistoryRemember(TOOL, !remember)).toBe(true);
    expect(data[source(remember)].has(KEY)).toBe(false);
    expect(data[target(remember)].get(KEY)).toBe(RAW);
  });

  it('원본이 지워진 뒤 복구가 막히면 새 사본과 그것을 읽는 설정을 유지한다', () => {
    seed(remember);
    afterChange = (s, op, k) => {
      if (s === source(remember) && op === 'remove' && k === KEY) {
        fail = (store, operation, key) => store === source(remember) && key === KEY && operation === 'set';
        throw new Error('synthetic failure after removal');
      }
    };
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(data[source(remember)].has(KEY)).toBe(false);
    expect(data[target(remember)].get(KEY)).toBe(RAW);
    expect(isHistoryRemembered(TOOL)).toBe(!remember);
    expect(listHistory(TOOL)).toHaveLength(1);
    fail = afterChange = null;
    expect(setHistoryRemember(TOOL, !remember)).toBe(true);
    expect(listHistory(TOOL)).toHaveLength(1);
  });

  it('복구 사본 삭제가 막혀도 실패를 알리고 다음 시도에서 원본을 정리한다', () => {
    seed(remember);
    let changed = false;
    afterChange = (s, op, k) => { if (s === target(remember) && op === 'set' && k === KEY) changed = true; };
    fail = (s, op, k) => (s === 'local' && k === FLAG && op === (remember ? 'remove' : 'set'))
      || (changed && s === target(remember) && k === KEY && op === 'remove');
    expect(setHistoryRemember(TOOL, !remember)).toBe(false);
    expect(data.local.get(KEY)).toBe(RAW);
    expect(data.session.get(KEY)).toBe(RAW);
    expect(isHistoryRemembered(TOOL)).toBe(remember);
    fail = afterChange = null;
    expect(setHistoryRemember(TOOL, !remember)).toBe(true);
    expect(data[source(remember)].has(KEY)).toBe(false);
  });
});

describe('저장소 접근과 최근 입력 지우기', () => {
  it.each(['localStorage', 'sessionStorage'] as const)('%s 접근이 막히면 성공으로 보지 않는다', property => {
    seed(true);
    vi.stubGlobal('window', { ...WINDOW, get [property]() { throw new Error('blocked'); } });
    expect(setHistoryRemember(TOOL, false)).toBe(false);
    expect(clearHistory(TOOL)).toBe(false);
  });

  it('브라우저 밖에서는 성공으로 보지 않는다', () => {
    vi.stubGlobal('window', undefined);
    expect(setHistoryRemember(TOOL, false)).toBe(false);
    expect(clearHistory(TOOL)).toBe(false);
  });

  it.each(['local', 'session'] as const)('%s 이력 삭제 실패 후 설정을 유지하고 지우기를 재시도한다', store => {
    seed(true);
    data.session.set(KEY, RAW);
    fail = (s, op, k) => s === store && op === 'remove' && k === KEY;
    expect(clearHistory(TOOL)).toBe(false);
    expect(data[store].get(KEY)).toBe(RAW);
    expect(isHistoryRemembered(TOOL)).toBe(true);
    fail = null;
    expect(clearHistory(TOOL)).toBe(true);
    expect(snapshot()).toEqual({ local: [], session: [] });
  });

  it('지우기가 다른 도구 입력은 건드리지 않는다', () => {
    seed(true);
    data.local.set('llg.history.v1:other', RAW);
    expect(clearHistory(TOOL)).toBe(true);
    expect(data.local.get('llg.history.v1:other')).toBe(RAW);
  });

  it.each(['throw', 'ignore'] as const)('입력 삭제 뒤 설정 삭제 실패(%s)도 실패로 알리고 재시도한다', mode => {
    seed(true);
    const refuses: Fault = (s, op, k) => s === 'local' && op === 'remove' && k === FLAG;
    if (mode === 'throw') fail = refuses;
    else ignore = refuses;
    expect(clearHistory(TOOL)).toBe(false);
    expect(data.local.has(KEY)).toBe(false);
    expect(data.session.has(KEY)).toBe(false);
    expect(isHistoryRemembered(TOOL)).toBe(true);
    fail = ignore = null;
    expect(clearHistory(TOOL)).toBe(true);
    expect(snapshot()).toEqual({ local: [], session: [] });
  });
});
