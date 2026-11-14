// 합성 저장소에 읽기·쓰기·삭제 장애를 넣는다. 실제 브라우저 자료는 쓰지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkspace, deleteWorkspace, forgetEverything, getActiveWorkspace, getMembers, getWorkspaceDetails, listWorkspaces, setAudience, setRemember, updateWorkspace, upsertMember, WORKSPACES_CHANGED } from '@/lib/leave/leave-workspaces';
import { forgetAllHistory } from '@/lib/tool-history';

const INDEX = 'work-patterns.leave.workspaces.v1';
const ACTIVE = 'work-patterns.leave.workspace.active.v1';
const AUDIENCE = 'work-patterns.leave.audience.v1';
const MEMBERS = 'work-patterns.leave.members.v1:';
const DETAILS = 'work-patterns.leave.details.v1:';
const HISTORY = 'llg.history.v1:contract-write';
const HISTORY_REMEMBER = 'llg.history.remember.v1:contract-write';
type StoreName = 'local' | 'session';
type Operation = 'get' | 'set' | 'remove' | 'keys';
let fail: ((store: StoreName, operation: Operation, key: string) => boolean) | null;
const data = { local: new Map<string, string>(), session: new Map<string, string>() };
const dispatchEvent = vi.fn();
function storage(name: StoreName) {
  const guard = (op: Operation, key = '') => {
    if (fail?.(name, op, key)) throw new DOMException('synthetic storage failure', 'SecurityError');
  };
  return {
    getItem(k: string) { guard('get', k); return data[name].get(k) ?? null; },
    setItem(k: string, v: string) { guard('set', k); data[name].set(k, v); },
    removeItem(k: string) { guard('remove', k); data[name].delete(k); },
    get length() { guard('keys'); return data[name].size; },
    key(i: number) { guard('keys'); return [...data[name].keys()][i] ?? null; },
  };
}
const WINDOW = { localStorage: storage('local'), sessionStorage: storage('session'), dispatchEvent };
const snapshot = () => ({ local: [...data.local].sort(), session: [...data.session].sort() });
function seeded(remember = true) {
  setAudience('employer');
  const ws = createWorkspace('합성사업장', 'own', remember)!;
  updateWorkspace(ws.id, { ownerName: '합성대표' });
  upsertMember(ws, { name: '합성직원', hireDate: '2026-01-02', terms: { monthlyTotal: '3000000' } });
  return ws;
}
const alive = (id: string, remember: boolean) => {
  const ws = listWorkspaces().find(w => w.id === id)!;
  expect(ws.remember).toBe(remember);
  expect(getMembers(ws)).toHaveLength(1);
  expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
};

beforeEach(() => {
  fail = null;
  data.local.clear();
  data.session.clear();
  dispatchEvent.mockClear();
  vi.stubGlobal('window', WINDOW);
});

describe('사업장 삭제 결과와 재시도', () => {
  it.each([MEMBERS, DETAILS])('%s 삭제가 막히면 false, 카드·자료를 되돌리고 재시도할 수 있다', prefix => {
    const ws = seeded();
    const before = snapshot();
    fail = (s, op, k) => s === 'local' && op === 'remove' && k === prefix + ws.id;
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(snapshot()).toEqual(before);
    alive(ws.id, true);
    fail = null;
    expect(deleteWorkspace(ws.id)).toBe(true);
    expect(listWorkspaces()).toEqual([]);
    expect(data.local.has(MEMBERS + ws.id)).toBe(false);
    expect(data.local.has(DETAILS + ws.id)).toBe(false);
  });

  it('반대 저장소의 잔여 사본도 못 지우면 성공이 아니다', () => {
    const ws = seeded();
    data.session.set(DETAILS + ws.id, '{"ownerName":"합성옛대표"}');
    const before = snapshot();
    fail = (s, op) => s === 'session' && op === 'remove';
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it.each([INDEX, ACTIVE])('%s 쓰기 실패 시 명부·대표자를 되돌린다', key => {
    const ws = seeded();
    const before = snapshot();
    fail = (s, op, k) => s === 'local' && op === 'set' && k === key;
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('저장소의 모든 쓰기가 막혀도 삭제 전에 멈춰 원본이 남는다', () => {
    const ws = seeded();
    const before = snapshot();
    fail = (_s, op) => op === 'set';
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('관련 키를 읽을 수 없으면 바꾸지 않는다', () => {
    const ws = seeded();
    const before = snapshot();
    fail = (s, op, k) => s === 'local' && op === 'get' && k === DETAILS + ws.id;
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('정상 삭제는 다른 카드·다른 앱 자료를 지키고 활성 카드를 바꾼다', () => {
    const other = seeded(false);
    const target = seeded();
    data.local.set('other-app', 'keep');
    expect(deleteWorkspace(target.id)).toBe(true);
    alive(other.id, false);
    expect(getActiveWorkspace()?.id).toBe(other.id);
    expect(data.local.get('other-app')).toBe('keep');
  });
});

describe.each([true, false])('기억하기 전환: 기존 remember=%s', remember => {
  it.each([MEMBERS, DETAILS])('%s 원본을 못 지우면 설정과 자료를 되돌린다', prefix => {
    const ws = seeded(remember);
    const before = snapshot();
    const source = remember ? 'local' : 'session';
    fail = (s, op, k) => s === source && op === 'remove' && k === prefix + ws.id;
    expect(setRemember(ws.id, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
    alive(ws.id, remember);
    fail = null;
    expect(setRemember(ws.id, !remember)).toBe(true);
    alive(ws.id, !remember);
    expect(data[source].has(MEMBERS + ws.id)).toBe(false);
    expect(data[source].has(DETAILS + ws.id)).toBe(false);
  });

  it('목록이 있는 저장소의 모든 쓰기가 막히면 원본을 지우지 않는다', () => {
    const ws = seeded(remember);
    const before = snapshot();
    fail = (s, op) => s === 'local' && op === 'set';
    expect(setRemember(ws.id, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('원본 복구마저 막히면 새 사본은 지우지 않고 false 를 돌려준다', () => {
    const ws = seeded(remember);
    const source = remember ? 'local' : 'session';
    const target = remember ? 'session' : 'local';
    fail = (s, op, k) => s === source && ((op === 'remove' && k === DETAILS + ws.id) || (op === 'set' && k === MEMBERS + ws.id));
    expect(setRemember(ws.id, !remember)).toBe(false);
    expect(data[target].has(MEMBERS + ws.id)).toBe(true);
    expect(data[target].has(DETAILS + ws.id)).toBe(true);
  });

  it('원본을 읽을 수 없으면 빈 자료로 옮기지 않는다', () => {
    const ws = seeded(remember);
    const before = snapshot();
    fail = (s, op, k) => s === (remember ? 'local' : 'session') && op === 'get' && k === MEMBERS + ws.id;
    expect(setRemember(ws.id, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('실패 시 대상 저장소에 이미 있던 값도 복구한다', () => {
    const ws = seeded(remember);
    const target = remember ? 'session' : 'local';
    data[target].set(MEMBERS + ws.id, '합성 옛 사본');
    data[target].set(DETAILS + ws.id, '합성 옛 대표');
    const before = snapshot();
    fail = (s, op, k) => s === 'local' && op === 'set' && k === INDEX;
    expect(setRemember(ws.id, !remember)).toBe(false);
    expect(snapshot()).toEqual(before);
  });

  it('원본에 없는 대표자를 대상 저장소의 옛 사본에서 되살리지 않는다', () => {
    const ws = seeded(remember);
    const source = remember ? 'local' : 'session';
    const target = remember ? 'session' : 'local';
    data[source].delete(DETAILS + ws.id);
    data[target].set(DETAILS + ws.id, '{"ownerName":"합성옛대표"}');
    expect(setRemember(ws.id, !remember)).toBe(true);
    expect(getWorkspaceDetails(listWorkspaces()[0])).toEqual({});
    expect(data[target].has(DETAILS + ws.id)).toBe(false);
  });
});

describe('전부 지우기: 일부 실패를 숨기지 않는다', () => {
  it('명부 하나가 막혀도 나머지 삭제는 시도하고 카드·역할은 남겨 재시도할 수 있다', () => {
    const ws = seeded();
    data.local.set(HISTORY, '[{"label":"합성이력"}]');
    data.local.set(HISTORY_REMEMBER, 'true');
    data.session.set(MEMBERS + 'orphan', '합성 고아 명부');
    data.local.set('other-app', 'keep');
    fail = (_s, op, k) => op === 'remove' && k === MEMBERS + ws.id;
    expect(forgetEverything()).toBe(false);
    expect(data.local.has(MEMBERS + ws.id)).toBe(true);
    expect(data.local.has(DETAILS + ws.id)).toBe(false);
    expect(data.local.has(HISTORY)).toBe(false);
    expect(data.session.has(MEMBERS + 'orphan')).toBe(false);
    expect(listWorkspaces()).toHaveLength(1);
    expect(data.local.has(AUDIENCE)).toBe(true);
    expect(dispatchEvent.mock.calls.some(([e]) => e.type === WORKSPACES_CHANGED)).toBe(true);
    fail = null;
    expect(forgetEverything()).toBe(true);
    expect(snapshot()).toEqual({ local: [['other-app', 'keep']], session: [] });
  });

  it('최근 입력 삭제 실패도 전부 지우기 실패로 전파한다', () => {
    seeded();
    data.local.set(HISTORY, '합성이력');
    fail = (_s, op, k) => op === 'remove' && k === HISTORY;
    expect(forgetEverything()).toBe(false);
    expect(data.local.get(HISTORY)).toBe('합성이력');
    expect(data.local.has(INDEX)).toBe(true);
  });

  it.each([INDEX, ACTIVE, AUDIENCE])('메타데이터 %s 삭제 실패를 돌려주고 재시도용 목록을 보존한다', key => {
    seeded();
    fail = (_s, op, k) => op === 'remove' && k === key;
    expect(forgetEverything()).toBe(false);
    expect(data.local.has(INDEX)).toBe(true);
    expect(data.local.has(AUDIENCE)).toBe(true);
    fail = null;
    expect(forgetEverything()).toBe(true);
    expect(snapshot()).toEqual({ local: [], session: [] });
  });

  it.each(['local', 'session'] as const)('%s 키 열거 실패를 성공으로 보지 않는다', source => {
    seeded(source === 'local');
    fail = (s, op) => s === source && op === 'keys';
    expect(forgetEverything()).toBe(false);
  });

  it('최근 입력은 한 키에서 실패해도 다음 키와 다른 저장소를 지운다', () => {
    data.local.set(HISTORY, '합성 막힌 이력');
    data.local.set('llg.history.v1:other', '합성 다른 이력');
    data.session.set(HISTORY, '합성 세션 이력');
    fail = (s, op, k) => s === 'local' && op === 'remove' && k === HISTORY;
    expect(forgetAllHistory()).toBe(false);
    expect(snapshot()).toEqual({ local: [[HISTORY, '합성 막힌 이력']], session: [] });
  });
});

describe.each(['localStorage', 'sessionStorage'] as const)('%s 접근 자체가 막힌 경우', property => {
  it('삭제·기억하기·전부 지우기 모두 성공을 돌려주지 않는다', () => {
    const ws = seeded();
    vi.stubGlobal('window', {
      ...WINDOW,
      get [property](): Storage { throw new DOMException('denied', 'SecurityError'); },
    });
    expect(deleteWorkspace(ws.id)).toBe(false);
    expect(setRemember(ws.id, false)).toBe(false);
    expect(forgetEverything()).toBe(false);
  });
});
