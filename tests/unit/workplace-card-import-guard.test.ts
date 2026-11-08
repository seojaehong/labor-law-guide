// 카드 파일 가져오기의 경계 — 부분·깨진 입력, 달력에 없는 날짜, 큰 파일, 저장 실패, 개인정보 꼴 문자열.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_COPY, cardFromState, saveCardFromState } from '@/app/tools/contract-write/cardState';
import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import { CARD_FILE_MAX_BYTES, CARD_FILE_MAX_MEMBERS, CARD_FILE_MAX_WORKSPACES, createWorkspace, forgetEverything, getMembers, getWorkspaceDetails, importCards, listWorkspaces, updateWorkspace, upsertMember } from '@/lib/leave/leave-workspaces';
import { addHistory, isHistoryRemembered, setHistoryRemember } from '@/lib/tool-history';

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

beforeEach(() => {
  refuse = null;
  localData.clear();
  sessionData.clear();
});

const FILE = { kind: 'llg-workplace-cards', version: 1 };
const INDEX = 'work-patterns.leave.workspaces.v1';
const snapshot = () => JSON.stringify([[...localData.entries()].sort(), [...sessionData.entries()].sort()]);
const allText = () => [...localData.values(), ...sessionData.values()].join('\n');
const memberKeysExist = () => [...localData.keys(), ...sessionData.keys()].filter((k) => k.includes('members') || k.includes('details'));

const FULL = { payType: 'monthly', amountMode: 'gross', monthlyTotal: '2,600,000', workDays: ['월', '화', '수', '목', '금'], start: '09:00', end: '18:00', breakMinutes: '60', weeklyRestDay: '일', duty: '홀 서비스', location: '본점' } as const;
const HONG = { name: '합성홍', hireDate: '2019-03-02' };

function seeded() {
  const ws = createWorkspace('합성상사', 'client')!;
  upsertMember(ws, { ...HONG, terms: { ...FULL, workDays: [...FULL.workDays] } });
  return ws;
}
const importOne = (terms: unknown, extra: Record<string, unknown> = {}) =>
  importCards({ ...FILE, workspaces: [{ name: '합성상사', kind: 'client', members: [{ ...HONG, terms, ...extra }] }] }, { remember: false });
const hongTerms = (id: string) => getMembers(listWorkspaces().find((w) => w.id === id)!).find((m) => m.name === HONG.name)?.terms;

describe('부분·깨진 계약 조건이 기존 조건을 지우지 않는다', () => {
  it('검증에서 다 빠지는 조건(workDays:["X"])은 없는 것으로 본다', () => {
    const ws = seeded();
    expect(importOne({ workDays: ['X'] }).ok).toBe(true);
    expect(hongTerms(ws.id)).toEqual(FULL);
  });

  it('일부 칸만 있는 조건은 그 칸만 바꾼다', () => {
    const ws = seeded();
    expect(importOne({ duty: '배송' }).ok).toBe(true);
    expect(hongTerms(ws.id)).toEqual({ ...FULL, duty: '배송' });
  });

  it('빈 문자열 칸은 있던 값을 지우지 않는다', () => {
    const ws = seeded();
    importOne({ monthlyTotal: '', duty: '  ' });
    expect(hongTerms(ws.id)).toEqual(FULL);
  });
});

describe('달력에 없는 날짜·시각은 가져오지 않는다', () => {
  it('입사일이 달력에 없는 사람은 건너뛰고 센다', () => {
    const ws = createWorkspace('합성상사', 'client')!;
    const r = importCards({ ...FILE, workspaces: [{ name: '합성상사', kind: 'client', members: [{ name: '합성오', hireDate: '2024-13-99' }, { name: '합성육', hireDate: '2023-02-30' }, HONG] }] }, { remember: false });
    expect(r).toEqual({ ok: true, added: 0, merged: 1, skipped: 2 });
    expect(getMembers(ws).map((m) => m.name)).toEqual([HONG.name]);
  });

  it('시각이 잘못된 칸만 버린다 — 기존 값이 남는다', () => {
    const ws = seeded();
    importOne({ start: '99:00', end: '24:61', duty: '배송' });
    expect(hongTerms(ws.id)).toEqual({ ...FULL, duty: '배송' });
  });

  it('계약서 입력에서도 달력에 없는 날짜·시각을 받지 않는다', () => {
    const base: WriteState = { ...INITIAL, workplaceName: 'A', employeeName: 'B', location: 'C', duty: 'D', startDate: '2026-03-01', monthlyTotal: '2,600,000' };
    expect(toWriteForm({ ...base, startDate: '2024-13-99' }, '2026-03-01').missing).toContain('계약 시작일');
    expect(toWriteForm({ ...base, start: '99:00' }, '2026-03-01').missing).toContain('출근·퇴근 시각');
    expect(toWriteForm({ ...base, endDate: '2026-02-31' }, '2026-03-01').error).toBeTruthy();
    expect(toWriteForm(base, '2026-03-01').form).not.toBeNull();
    expect(cardFromState({ ...base, startDate: '2024-13-99' }).ok).toBe(false);
  });
});

describe('큰 파일', () => {
  const big = (workspaces: number, members: number) => ({
    ...FILE,
    workspaces: Array.from({ length: workspaces }, (_, i) => ({ name: `합성${i}`, kind: 'own', members: Array.from({ length: members }, (__, j) => ({ name: `사람${j}`, hireDate: '2020-01-01' })) })),
  });

  it('사업장 수 상한을 넘으면 아무것도 바꾸지 않고 이유를 돌려준다', () => {
    seeded();
    const before = snapshot();
    expect(importCards(big(CARD_FILE_MAX_WORKSPACES + 1, 0), { remember: false })).toEqual({ ok: false, added: 0, merged: 0, skipped: 0, problem: 'too-large' });
    expect(snapshot()).toBe(before);
  });

  it('직원 수 상한을 넘으면 아무것도 바꾸지 않는다', () => {
    seeded();
    const before = snapshot();
    expect(importCards(big(1, CARD_FILE_MAX_MEMBERS + 1), { remember: false }).problem).toBe('too-large');
    expect(snapshot()).toBe(before);
  });

  it('문자열이 크기 상한을 넘으면 읽지 않는다', () => {
    expect(importCards('x'.repeat(CARD_FILE_MAX_BYTES + 1), { remember: false }).problem).toBe('too-large');
  });

  it('상한 안에서 큰 명부도 금세 끝난다', () => {
    const start = performance.now();
    const r = importCards(big(1, CARD_FILE_MAX_MEMBERS), { remember: false });
    expect(r.ok).toBe(true);
    expect(getMembers(listWorkspaces()[0])).toHaveLength(CARD_FILE_MAX_MEMBERS);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('큰 파일 안내 문구가 있다', () => {
    expect(CARD_COPY.fileTooLarge).toContain('5,000');
  });
});

describe('저장이 실패하면 가져왔다고 말하지 않고 아무것도 남기지 않는다', () => {
  const twoWorkspaces = { ...FILE, workspaces: [{ name: '합성A', kind: 'own', members: [HONG] }, { name: '합성B', kind: 'own', members: [HONG] }] };

  it('목록을 못 쓰면 실패를 돌려주고 명부 키를 남기지 않는다', () => {
    refuse = (s, k) => s === 'local' && k === INDEX;
    expect(importCards(twoWorkspaces, { remember: false })).toEqual({ ok: false, added: 0, merged: 0, skipped: 0, problem: 'storage' });
    expect(listWorkspaces()).toEqual([]);
    expect(memberKeysExist()).toEqual([]);
  });

  it('명부를 못 쓰면 앞서 쓴 사업장까지 되돌린다', () => {
    let calls = 0;
    refuse = (_s, k) => k.includes('members') && ++calls === 2;
    const before = snapshot();
    expect(importCards(twoWorkspaces, { remember: false }).problem).toBe('storage');
    expect(snapshot()).toBe(before);
  });

  it('이미 있는 사업장에 합치다 실패해도 이전 명부가 그대로다', () => {
    const ws = seeded();
    const before = snapshot();
    refuse = (s, k) => s === 'session' && k.includes('members');
    expect(importOne({ duty: '배송' }).problem).toBe('storage');
    expect(snapshot()).toBe(before);
    expect(hongTerms(ws.id)).toEqual(FULL);
  });

  it('저장 실패 안내 문구가 있다', () => {
    expect(CARD_COPY.fileStorageFailed).not.toContain('가져왔습니다');
  });
});

describe('전부 지우기', () => {
  it('최근 입력과 기억하기 설정까지 두 저장소에서 지운다', () => {
    addHistory('contract-write', '합성근로자', { employeeName: '합성근로자', monthlyTotal: '2,600,000' });
    setHistoryRemember('contract-write', true);
    addHistory('contract-write', '합성근로자2', { employeeName: '합성근로자2' });
    sessionData.set('llg.history.v1:other', '[]');
    forgetEverything();
    expect([...localData.keys(), ...sessionData.keys()].filter((k) => k.startsWith('llg.history'))).toEqual([]);
    expect(isHistoryRemembered('contract-write')).toBe(false);
    expect(allText()).not.toContain('합성근로자');
  });
});

describe('건너뛴 직원을 센다', () => {
  it('형식이 맞지 않는 직원 6명이면 skipped 6', () => {
    const bad = [{ name: '  ', hireDate: '2020-01-01' }, { name: 1, hireDate: '2020-01-01' }, { name: '합성', hireDate: '몰라요' }, null, '깨진 값', { hireDate: '2020-01-01' }];
    const r = importCards({ ...FILE, workspaces: [{ name: '합성상사', kind: 'client', members: [...bad, HONG] }] }, { remember: false });
    expect(r).toEqual({ ok: true, added: 1, merged: 0, skipped: 6 });
    expect(getMembers(listWorkspaces()[0])).toEqual([HONG]);
    expect(CARD_COPY.fileSkipped(6)).toContain('6');
  });
});

describe('기억하기 안내', () => {
  it('기억하기를 켠 사업장에 합치면 이 브라우저에 남는다고 화면에서 말한다', () => {
    expect(CARD_COPY.fileMergeNotice).toContain('이미 있는 사업장');
    expect(CARD_COPY.fileMergeNotice).toContain('이 브라우저에 남습니다');
  });
});

describe('주민번호·계좌 꼴 문자열은 칸 안에 있어도 저장하지 않는다', () => {
  const RRN = '900101-1234567';
  const ACCOUNT = '110-123-456789';
  const PLAIN_RRN = '9001011234567';

  it('가져오기 — 대표자·직원 이름·업무·근무장소', () => {
    importCards(
      {
        ...FILE,
        workspaces: [{ name: `합성상사 ${PLAIN_RRN}`, kind: 'client', ownerName: `합성대표 ${RRN}`, members: [{ name: `합성홍 ${RRN}`, hireDate: '2019-03-02', terms: { duty: `주방 ${ACCOUNT}`, location: `본점 ${RRN}` } }] }],
      },
      { remember: false },
    );
    for (const v of [RRN, ACCOUNT, PLAIN_RRN]) expect(allText()).not.toContain(v);
    const [ws] = listWorkspaces();
    expect(ws.name).toBe('합성상사');
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
    expect(getMembers(ws)[0]).toEqual({ name: '합성홍', hireDate: '2019-03-02', terms: { duty: '주방', location: '본점' } });
  });

  it('값 전체가 번호면 그 칸은 비운다 — 사람은 건너뛴다', () => {
    const r = importCards({ ...FILE, workspaces: [{ name: '합성상사', kind: 'client', ownerName: RRN, members: [{ name: RRN, hireDate: '2019-03-02' }, { name: '합성홍', hireDate: '2019-03-02', terms: { duty: ACCOUNT } }] }] }, { remember: false });
    expect(r.skipped).toBe(1);
    expect(allText()).not.toContain(RRN);
    const [ws] = listWorkspaces();
    expect(getWorkspaceDetails(ws)).toEqual({});
    expect(getMembers(ws)).toEqual([{ name: '합성홍', hireDate: '2019-03-02' }]);
  });

  it('근로계약서 작성의 저장에서도 걸러진다', () => {
    const state: WriteState = { ...INITIAL, workplaceName: '합성상사', ownerName: `합성대표 ${RRN}`, employeeName: '합성홍', startDate: '2026-03-01', duty: `홀 ${ACCOUNT}`, location: '본점', monthlyTotal: '2,600,000' };
    expect(saveCardFromState(state, null).ok).toBe(true);
    for (const v of [RRN, ACCOUNT]) expect(allText()).not.toContain(v);
    const [ws] = listWorkspaces();
    expect(getWorkspaceDetails(ws).ownerName).toBe('합성대표');
    expect(getMembers(ws)[0].terms?.duty).toBe('홀');
  });

  it('날짜·금액·시각은 건드리지 않는다', () => {
    const ws = createWorkspace('합성상사', 'client')!;
    updateWorkspace(ws.id, { ownerName: '합성대표' });
    upsertMember(ws, { name: '합성홍', hireDate: '2019-03-02', terms: { duty: '2026-03-01 근무', monthlyTotal: '12,600,000', start: '09:00' } });
    expect(getMembers(ws)[0].terms).toEqual({ duty: '2026-03-01 근무', monthlyTotal: '12,600,000', start: '09:00' });
  });
});
