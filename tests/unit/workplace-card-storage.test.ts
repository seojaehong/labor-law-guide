// 사업장 카드 저장 — 어느 카드에 들어가는가, 저장이 실패했을 때 무엇을 말하고 무엇이 남는가.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_COPY, saveCardFromState } from '@/app/tools/contract-write/cardState';
import { INITIAL, type WriteState } from '@/app/tools/contract-write/formState';
import { createWorkspace, deleteWorkspace, forgetEverything, getMembers, getWorkspaceDetails, listWorkspaces, removeMembers, renameWorkspace, setRemember, updateWorkspace, upsertMember } from '@/lib/leave/leave-workspaces';

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
const WINDOW = { localStorage: fakeStorage(localData, 'local'), sessionStorage: fakeStorage(sessionData, 'session'), dispatchEvent: () => true };
vi.stubGlobal('window', WINDOW);

const INDEX = 'work-patterns.leave.workspaces.v1';
const isMembers = (k: string) => k.includes('members');
const isDetails = (k: string) => k.includes('details');
const allKeys = () => [...localData.keys(), ...sessionData.keys()];

beforeEach(() => {
  refuse = null;
  localData.clear();
  sessionData.clear();
  vi.stubGlobal('window', WINDOW);
});

const STATE: WriteState = { ...INITIAL, workplaceName: '합성한빛', ownerName: '합성대표', employeeName: '합성근로자', startDate: '2026-03-01', duty: '홀 서비스', monthlyTotal: '2,600,000' };

describe('어느 카드에 저장하는가', () => {
  it('㈜로 만든 기억 카드를 고르고 저장하면 그 카드에 들어간다 — 새 카드를 만들지 않는다', () => {
    const ws = createWorkspace('㈜합성한빛', 'client', true)!;
    const r = saveCardFromState({ ...STATE, workplaceName: '㈜합성한빛' }, ws.id);
    expect(r.ok).toBe(true);
    expect(listWorkspaces().map((w) => w.id)).toEqual([ws.id]);
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성근로자']);
    expect([...localData.keys()].some(isMembers)).toBe(true);
    expect([...sessionData.keys()].some(isMembers)).toBe(false);
  });

  it('고르지 않아도 ㈜와 (주)는 같은 이름으로 찾는다', () => {
    const ws = createWorkspace('㈜합성한빛', 'client', true)!;
    saveCardFromState({ ...STATE, workplaceName: '(주)합성한빛' }, null);
    expect(listWorkspaces().map((w) => w.id)).toEqual([ws.id]);
  });

  it('카드를 고른 뒤 사업체명을 다른 곳으로 고치면 고른 카드에 넣지 않는다', () => {
    const a = createWorkspace('합성A', 'client', true)!;
    saveCardFromState({ ...STATE, workplaceName: '합성B' }, a.id);
    expect(getMembers(a)).toEqual([]);
    expect(listWorkspaces().map((w) => w.name)).toEqual(['합성A', '합성B']);
  });
});

describe('5명 이상 여부를 덮는가', () => {
  it('고르지 않은 같은 이름 카드의 「5명 미만」을 기본값으로 덮지 않고 그렇게 말한다', () => {
    const ws = createWorkspace('합성한빛', 'own')!;
    updateWorkspace(ws.id, { fivePlus: 'no' });
    const r = saveCardFromState(STATE, null);
    expect(listWorkspaces()[0].fivePlus).toBe('no');
    expect(r.ok && r.message).toContain('5명 이상 여부는 카드에 있던 값');
  });

  it('고른 카드는 화면 값으로 바뀐다', () => {
    const ws = createWorkspace('합성한빛', 'own')!;
    updateWorkspace(ws.id, { fivePlus: 'no' });
    const r = saveCardFromState(STATE, ws.id);
    expect(listWorkspaces()[0].fivePlus).toBe('yes');
    expect(r.ok && r.message).not.toContain('5명 이상 여부는');
  });

  it('값이 없는 카드에는 화면 값을 넣는다', () => {
    createWorkspace('합성한빛', 'own');
    saveCardFromState({ ...STATE, fivePlus: 'no' }, null);
    expect(listWorkspaces()[0].fivePlus).toBe('no');
  });
});

describe('저장이 실패하면 저장했다고 말하지 않는다', () => {
  const failed = (r: ReturnType<typeof saveCardFromState>) => {
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).not.toContain('저장했습니다');
  };

  it('새 카드를 목록에 못 쓰면 실패를 말하고 명부 키를 남기지 않는다', () => {
    refuse = (s, k) => s === 'local' && k === INDEX;
    failed(saveCardFromState(STATE, null));
    expect(listWorkspaces()).toEqual([]);
    expect(allKeys().filter((k) => isMembers(k) || isDetails(k))).toEqual([]);
  });

  it('localStorage 자체가 막혀 있으면 실패를 말하고 아무 키도 남기지 않는다', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
      sessionStorage: fakeStorage(sessionData, 'session'),
      dispatchEvent: () => true,
    });
    failed(saveCardFromState(STATE, null));
    expect(allKeys()).toEqual([]);
  });

  it('명부를 못 쓰면 실패를 말한다', () => {
    refuse = (s, k) => s === 'session' && isMembers(k);
    failed(saveCardFromState(STATE, null));
  });

  it('대표자를 못 쓰면 실패를 말한다', () => {
    refuse = (s, k) => s === 'session' && isDetails(k);
    failed(saveCardFromState(STATE, null));
  });

  it('5명 이상 여부를 못 쓰면 실패를 말한다', () => {
    const ws = createWorkspace('합성한빛', 'own')!;
    updateWorkspace(ws.id, { fivePlus: 'yes' });
    refuse = (s, k) => s === 'local' && k === INDEX;
    failed(saveCardFromState({ ...STATE, fivePlus: 'no' }, ws.id));
  });
});

describe('기억하기를 바꿀 때 잃지 않는다', () => {
  function filled() {
    const ws = createWorkspace('합성한빛', 'own')!;
    updateWorkspace(ws.id, { ownerName: '합성대표' });
    upsertMember(ws, { name: '합성근로자', hireDate: '2026-03-01', terms: { duty: '홀 서비스' } });
    return ws;
  }
  const unchanged = (id: string) => {
    const ws = listWorkspaces().find((w) => w.id === id)!;
    expect(ws.remember).toBe(false);
    expect(getMembers(ws).map((m) => m.terms?.duty)).toEqual(['홀 서비스']);
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
    expect([...localData.keys()].filter((k) => isMembers(k) || isDetails(k))).toEqual([]);
  };

  it('명부를 새 저장소에 못 쓰면 그대로 두고 false 를 돌려준다', () => {
    const ws = filled();
    refuse = (s, k) => s === 'local' && isMembers(k);
    expect(setRemember(ws.id, true)).toBe(false);
    unchanged(ws.id);
  });

  it('대표자를 새 저장소에 못 쓰면 그대로 둔다', () => {
    const ws = filled();
    refuse = (s, k) => s === 'local' && isDetails(k);
    expect(setRemember(ws.id, true)).toBe(false);
    unchanged(ws.id);
  });

  it('목록을 못 쓰면 옮긴 사본을 지우고 그대로 둔다', () => {
    const ws = filled();
    refuse = (s, k) => s === 'local' && k === INDEX;
    expect(setRemember(ws.id, true)).toBe(false);
    unchanged(ws.id);
  });

  it('성공하면 옛 저장소에 남기지 않는다', () => {
    const ws = filled();
    expect(setRemember(ws.id, true)).toBe(true);
    expect([...sessionData.keys()].filter((k) => isMembers(k) || isDetails(k))).toEqual([]);
    expect(getMembers(listWorkspaces()[0]).map((m) => m.name)).toEqual(['합성근로자']);
  });
});

describe('전부 지우기·안내', () => {
  it('목록이 손상돼 있어도 명부·대표자 키를 남기지 않는다', () => {
    const ws = createWorkspace('합성한빛', 'own', true)!;
    updateWorkspace(ws.id, { ownerName: '합성대표' });
    upsertMember(ws, { name: '합성근로자', hireDate: '2026-03-01' });
    sessionData.set(`work-patterns.leave.members.v1:${ws.id}`, '[]');
    localData.set(INDEX, '[[[깨짐');
    forgetEverything();
    expect(allKeys().filter((k) => isMembers(k) || isDetails(k))).toEqual([]);
  });

  it('처리방침이 브라우저에 남는 5명 이상 여부를 적는다', () => {
    const src = readFileSync(resolve(__dirname, '../../src/app/privacy/page.tsx'), 'utf8');
    expect(src).toContain('사업장명·5명 이상 여부·대표자');
  });
});

describe('목록을 믿을 수 있을 때만 목록에 없는 사업장의 키를 치운다', () => {
  const keysOf = (id: string) => allKeys().filter((k) => k.endsWith(`:${id}`));
  const rosterOf = (id: string) =>
    [...localData.entries(), ...sessionData.entries()].filter(([k]) => k.endsWith(`:${id}`)).sort();

  function seeded(remember: boolean) {
    const ws = createWorkspace('합성옛곳', 'own', remember)!;
    updateWorkspace(ws.id, { ownerName: '합성옛대표' });
    upsertMember(ws, { name: '합성옛직원', hireDate: '2020-01-02', terms: { duty: '홀' } });
    return ws;
  }

  it('온전한 목록에 없는 id 의 명부·대표자 키는 치우고 목록에 있는 사업장은 지킨다', () => {
    const alive = seeded(true);
    localData.set('work-patterns.leave.members.v1:ghost', '[{"name":"합성숨은직원","hireDate":"2020-01-02"}]');
    sessionData.set('work-patterns.leave.details.v1:ghost', '{"ownerName":"합성숨은대표"}');
    expect(createWorkspace('합성새곳', 'own')).not.toBeNull();
    expect(keysOf('ghost')).toEqual([]);
    expect(getMembers(alive).map((m) => m.name)).toEqual(['합성옛직원']);
  });

  it('처음 쓰는 브라우저는 온전한 목록으로 시작한다 — 숨은 키가 뒤에 생겨도 치운다', () => {
    const first = createWorkspace('합성첫곳', 'own')!;
    sessionData.set('work-patterns.leave.members.v1:ghost', '[]');
    renameWorkspace(first.id, '합성첫곳2');
    expect(keysOf('ghost')).toEqual([]);
  });

  describe.each([
    ['JSON 이 아닌 글자', 'not json'],
    ['깨진 JSON', '[[[깨짐'],
    ['배열이 아닌 객체', '{"a":1}'],
    ['null', 'null'],
    ['빈 글자', ''],
  ])('목록이 %s 이면', (_label, damaged) => {
    it.each([[true], [false]])('새 사업장을 만들고 또 써도 옛 명부·대표자가 글자 그대로 남는다(기억하기 %s)', (remember) => {
      const old = seeded(remember);
      const before = rosterOf(old.id);
      localData.set(INDEX, damaged);
      const made = createWorkspace('합성새곳', 'own')!;
      expect(rosterOf(old.id)).toEqual(before);
      renameWorkspace(made.id, '합성새곳2');
      updateWorkspace(made.id, { fivePlus: 'no' });
      expect(createWorkspace('합성또곳', 'own')).not.toBeNull();
      expect(rosterOf(old.id)).toEqual(before);
    });
  });

  it.each([[true], [false]])('목록이 깨진 뒤 카드를 저장해도 옛 명부·대표자가 남는다(기억하기 %s)', (remember) => {
    const old = seeded(remember);
    const before = rosterOf(old.id);
    localData.set(INDEX, '[[[깨짐');
    expect(saveCardFromState(STATE, null).ok).toBe(true);
    expect(rosterOf(old.id)).toEqual(before);
  });

  it('모르는 kind 항목의 명부는 다른 사업장 이름을 몇 번 바꿔도 남는다', () => {
    const franchise = seeded(true);
    const alive = createWorkspace('합성산곳', 'own', true)!;
    upsertMember(alive, { name: '합성산직원', hireDate: '2021-01-02' });
    const before = rosterOf(franchise.id);
    const list = JSON.parse(localData.get(INDEX)!) as Array<Record<string, unknown>>;
    localData.set(INDEX, JSON.stringify(list.map((w) => (w.id === franchise.id ? { ...w, kind: 'franchise' } : w))));
    renameWorkspace(alive.id, '합성산곳2');
    expect(rosterOf(franchise.id)).toEqual(before);
    renameWorkspace(alive.id, '합성산곳3');
    expect(rosterOf(franchise.id)).toEqual(before);
    expect(getMembers(listWorkspaces()[0]).map((m) => m.name)).toEqual(['합성산직원']);
  });

  it('목록의 한 항목만 깨졌어도 그 사업장의 키를 지우지 않는다', () => {
    const broken = seeded(true);
    const before = rosterOf(broken.id);
    const list = JSON.parse(localData.get(INDEX)!) as Array<Record<string, unknown>>;
    localData.set(INDEX, JSON.stringify(list.map((w) => (w.id === broken.id ? { ...w, name: '' } : w))));
    const made = createWorkspace('합성새곳', 'own')!;
    renameWorkspace(made.id, '합성새곳2');
    expect(rosterOf(broken.id)).toEqual(before);
  });

  it('5명 이상 여부가 모르는 값인 항목은 깨진 것이 아니다 — 숨은 키는 그대로 치운다', () => {
    const ws = createWorkspace('합성옛곳', 'own')!;
    const list = JSON.parse(localData.get(INDEX)!) as Array<Record<string, unknown>>;
    localData.set(INDEX, JSON.stringify(list.map((w) => ({ ...w, fivePlus: 'maybe' }))));
    sessionData.set('work-patterns.leave.members.v1:ghost', '[]');
    renameWorkspace(ws.id, '합성옛곳2');
    expect(keysOf('ghost')).toEqual([]);
  });

  it('목록 키 자체가 없는데 명부가 있으면 지우지 않는다', () => {
    const old = seeded(true);
    const before = rosterOf(old.id);
    localData.delete(INDEX);
    const made = createWorkspace('합성새곳', 'own')!;
    renameWorkspace(made.id, '합성새곳2');
    expect(rosterOf(old.id)).toEqual(before);
  });

  it('손상을 기록하지 못하면 목록도 덮어쓰지 않는다 — 다음 저장에서 명부를 지우지 않게', () => {
    const old = seeded(true);
    const before = rosterOf(old.id);
    localData.set(INDEX, '[[[깨짐');
    refuse = (s, k) => s === 'local' && k !== INDEX;
    expect(createWorkspace('합성새곳', 'own')).toBeNull();
    expect(localData.get(INDEX)).toBe('[[[깨짐');
    refuse = null;
    expect(rosterOf(old.id)).toEqual(before);
  });

  it('목록이 손상된 뒤에도 지운 사업장의 명부·대표자는 사라지고, 다른 키는 남는다', () => {
    const hidden = seeded(true);
    const hiddenBefore = rosterOf(hidden.id);
    const target = createWorkspace('합성지울곳', 'own', true)!;
    updateWorkspace(target.id, { ownerName: '합성지울대표' });
    upsertMember(target, { name: '합성지울직원', hireDate: '2021-01-02' });
    const list = JSON.parse(localData.get(INDEX)!) as Array<Record<string, unknown>>;
    localData.set(INDEX, JSON.stringify(list.map((w) => (w.id === hidden.id ? { ...w, kind: 'franchise' } : w))));
    expect(deleteWorkspace(target.id)).toBe(true);
    expect(keysOf(target.id)).toEqual([]);
    expect(rosterOf(hidden.id)).toEqual(hiddenBefore);
  });

  it('전부 지우기는 남겨 둔 키까지 지우고, 그 뒤로는 숨은 키를 다시 치운다', () => {
    const old = seeded(true);
    localData.set(INDEX, '[[[깨짐');
    createWorkspace('합성새곳', 'own');
    forgetEverything();
    expect(keysOf(old.id)).toEqual([]);
    expect(allKeys()).toEqual([]);
    const next = createWorkspace('합성다음곳', 'own')!;
    sessionData.set('work-patterns.leave.members.v1:ghost', '[]');
    renameWorkspace(next.id, '합성다음곳2');
    expect(keysOf('ghost')).toEqual([]);
  });

  it('목록을 못 쓰면 아무 키도 지우지 않는다', () => {
    const old = seeded(true);
    localData.set(INDEX, '[[[깨짐');
    refuse = (s, k) => s === 'local' && k === INDEX;
    expect(saveCardFromState(STATE, null).ok).toBe(false);
    expect(keysOf(old.id).length).toBeGreaterThan(0);
  });
});

describe('지우기가 실패하면 지웠다고 하지 않고 남은 것을 잃지 않는다', () => {
  function seeded() {
    const ws = createWorkspace('합성한빛', 'own', true)!;
    updateWorkspace(ws.id, { ownerName: '합성대표' });
    upsertMember(ws, { name: '합성근로자', hireDate: '2026-03-01', terms: { duty: '홀 서비스' } });
    return ws;
  }

  it('removeMembers — 쓰지 못하면 false 이고 명부가 그대로다', () => {
    const ws = seeded();
    refuse = (s, k) => s === 'local' && isMembers(k);
    expect(removeMembers(ws, ['합성근로자 2026-03-01'])).toBe(false);
    refuse = null;
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성근로자']);
  });

  it('removeMembers — 쓰면 true 이고 그 사람만 사라진다', () => {
    const ws = seeded();
    expect(removeMembers(ws, ['합성근로자 2026-03-01'])).toBe(true);
    expect(getMembers(ws)).toEqual([]);
  });

  it('deleteWorkspace — 목록을 못 쓰면 false 이고 명부·대표자를 지우지 않는다', () => {
    const ws = seeded();
    refuse = (s, k) => s === 'local' && k === INDEX;
    expect(deleteWorkspace(ws.id)).toBe(false);
    refuse = null;
    expect(listWorkspaces().map((w) => w.id)).toEqual([ws.id]);
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성근로자']);
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
  });

  it('deleteWorkspace — 쓰면 true 이고 두 저장소에서 사라진다', () => {
    const ws = seeded();
    sessionData.set(`work-patterns.leave.members.v1:${ws.id}`, '[]');
    expect(deleteWorkspace(ws.id)).toBe(true);
    expect(allKeys().filter((k) => isMembers(k) || isDetails(k))).toEqual([]);
  });
});

describe('화면과 처리방침이 저장 범위를 사실대로 말한다', () => {
  const privacy = readFileSync(resolve(__dirname, '../../src/app/privacy/page.tsx'), 'utf8');

  it('근무장소는 저장한다고 말하고, 담지 않는 것은 집 주소라고 적는다', () => {
    expect(CARD_COPY.intro).toContain('근무장소');
    expect(CARD_COPY.intro).toContain('집 주소');
    expect(CARD_COPY.intro).not.toMatch(/등록번호·주소/);
  });

  it('저장하지 않는 칸을 이름으로 말한다', () => {
    for (const label of ['실수령액', '공제대상가족 수', '작성일']) expect(CARD_COPY.intro).toContain(label);
    expect(CARD_COPY.intro).not.toMatch(/지급일|지급방법/);
  });

  it('실수령액으로 넣고 저장하면 저장 안내에 그 사실을 덧붙인다', () => {
    const r = saveCardFromState({ ...STATE, amountMode: 'net', netPay: '2,000,000' }, null);
    expect(r.ok && r.message).toContain(CARD_COPY.netNotStored);
  });

  it('처리방침이 연차 직원 명단에 계약 조건이 담길 수 있다고 적는다', () => {
    expect(privacy.replace(/\s+/g, ' ')).toContain('직원 명단에 계약 조건');
  });
});
