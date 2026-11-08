// 연차 화면은 입력창을 그대로 명부에 쓴다. 근로계약서 작성에서 넣은 사람과 계약 조건은 그 입력만으로 사라지면 안 된다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLines, rosterFromRows } from '@/lib/leave/leave-sheet';
import { createWorkspace, getMembers, removeMembers, setMembers, upsertMember, type Workspace, type WorkspaceMember } from '@/lib/leave/leave-workspaces';

const localData = new Map<string, string>();
const sessionData = new Map<string, string>();
const fakeStorage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
  get length() {
    return m.size;
  },
  key: (i: number) => [...m.keys()][i] ?? null,
});
vi.stubGlobal('window', { localStorage: fakeStorage(localData), sessionStorage: fakeStorage(sessionData), dispatchEvent: () => true });

beforeEach(() => {
  localData.clear();
  sessionData.clear();
});

const TERMS = { duty: '홀 서비스', monthlyTotal: '2,600,000' };
const HONG: WorkspaceMember = { name: '합성홍', hireDate: '2019-03-02', terms: TERMS };
const SHOWN = (w: Workspace) => getMembers(w).map((m) => `${m.name}\t${m.hireDate}`).join('\n');

/** 입력창 글자 → 저장: 연차 화면이 글자가 바뀔 때마다 하는 일 */
function typeText(ws: Workspace, text: string) {
  const roster = rosterFromRows(parseLines(text));
  if (roster) setMembers(ws, roster);
}

function card(...members: WorkspaceMember[]) {
  const ws = createWorkspace('합성사업장', 'own')!;
  for (const m of members) upsertMember(ws, m);
  return ws;
}

describe('연차 화면을 열기만 해도 명부가 지워지지 않는다', () => {
  it.each([
    ['쉼표가 든 이름', 'NGUYEN, VAN A'],
    ['빈칸 두 개가 든 이름', '합성  근로자'],
  ])('%s', (_label, name) => {
    const ws = card({ name, hireDate: '2020-01-02', terms: TERMS });
    typeText(ws, SHOWN(ws));
    expect(getMembers(ws)).toEqual([{ name, hireDate: '2020-01-02', terms: TERMS }]);
  });

  it('달력에 없는 입사일이 저장돼 있어도 연차 화면을 여는 것만으로 사람이 사라지지 않는다', () => {
    const ws = card({ name: '합성이', hireDate: '2024-13-99' }, HONG);
    typeText(ws, SHOWN(ws));
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성이', '합성홍']);
  });
});

describe('입력창을 고치는 도중에 조건과 사람이 사라지지 않는다', () => {
  it('이름을 고쳐 쓰는 도중의 글자는 조건을 지우지 않는다', () => {
    const ws = card(HONG);
    for (const text of ['합성\t2019-03-02', '\t2019-03-02', '합\t2019-03-02', '합성홍\t2019-03-02']) typeText(ws, text);
    expect(getMembers(ws)).toEqual([HONG]);
  });

  it('입사일을 고치는 도중의 글자는 조건을 지우지 않는다', () => {
    const ws = card(HONG);
    for (const text of ['합성홍\t2019-03-', '합성홍\t2019-03-0', '합성홍\t2019-03-02']) typeText(ws, text);
    expect(getMembers(ws)).toEqual([HONG]);
  });

  it('조건이 없는 사람도 입사일을 고치는 동안 명부에 남는다', () => {
    const ws = card({ name: '합성김', hireDate: '2021-05-06' });
    typeText(ws, '합성김\t2021-05-');
    expect(getMembers(ws)).toEqual([{ name: '합성김', hireDate: '2021-05-06' }]);
  });

  it('읽지 못한 줄이 있으면 명부에 쓸 목록을 만들지 않고, 다 읽히면 만든다', () => {
    expect(rosterFromRows(parseLines('합성김\t2021-05-\n합성이\t2022-01-02'))).toBeNull();
    expect(rosterFromRows(parseLines('합성김\t2021-05-06\n합성이\t2022-01-02'))).toEqual([
      { name: '합성김', hireDate: '2021-05-06' },
      { name: '합성이', hireDate: '2022-01-02' },
    ]);
  });

  it('입력창을 비워도 계약 조건이 있는 사람은 남고, 조건이 없는 사람은 지워진다', () => {
    const ws = card(HONG, { name: '합성김', hireDate: '2021-05-06' });
    typeText(ws, '');
    expect(getMembers(ws)).toEqual([HONG]);
  });

  it('이름을 고쳐도 새 이름이 앞사람 조건을 물려받지 않는다', () => {
    const ws = card(HONG);
    typeText(ws, '합성박\t2019-03-02');
    const members = getMembers(ws);
    expect(members.find((m) => m.name === '합성박')?.terms).toBeUndefined();
    expect(members.find((m) => m.name === '합성홍')?.terms).toEqual(TERMS);
  });

  it('「계약 조건까지 지우기」를 고른 사람만 명부에서 사라진다', () => {
    const ws = card(HONG, { name: '합성오', hireDate: '2022-02-03', terms: { duty: '주방' } });
    removeMembers(ws, ['합성홍 2019-03-02']);
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성오']);
    expect(sessionData.size + localData.size).toBeGreaterThan(0);
    expect([...sessionData.values()].join('\n')).not.toContain('합성홍');
  });
});

describe('파일과 붙여넣기 구분', () => {
  it('탭이 있는 줄은 탭으로만 나눈다', () => {
    expect(parseLines('NGUYEN, VAN A\t2019-03-02\t18')[0]).toMatchObject({ name: 'NGUYEN, VAN A', hireDate: '2019-03-02', recordedDays: 18 });
  });

  it('탭이 없는 줄은 전처럼 쉼표·여러 칸 공백으로 나눈다', () => {
    expect(parseLines('합성김,2021-05-06,15')[0]).toMatchObject({ name: '합성김', hireDate: '2021-05-06', recordedDays: 15 });
    expect(parseLines('합성김  2021-05-06')[0]).toMatchObject({ name: '합성김', hireDate: '2021-05-06' });
  });
});
