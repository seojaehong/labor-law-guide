// 사업장 카드 파일 — 내보내기·가져오기(261106 재홍님 「고」). 다른 브라우저·PC 로 카드를 옮기는 길이다.
// 파일은 이용자가 직접 내려받고 직접 고른다. 서버를 거치지 않는다(전송 코드 없음을 시험으로 고정).
// 가져올 때도 저장소에 들어가는 칸은 기존 검증(isWorkspace·isMember·pickTerms)을 거친다 — 파일에 주민번호가 있어도 버린다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_COPY, cardFileName } from '@/app/tools/contract-write/cardState';
import {
  createWorkspace,
  exportCards,
  forgetEverything,
  getActiveWorkspace,
  getMembers,
  getWorkspaceDetails,
  importCards,
  listWorkspaces,
  setActiveWorkspace,
  updateWorkspace,
  upsertMember,
  type Workspace,
} from '@/lib/leave/leave-workspaces';

const localData = new Map<string, string>();
const sessionData = new Map<string, string>();
const fakeStorage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
});
vi.stubGlobal('window', { localStorage: fakeStorage(localData), sessionStorage: fakeStorage(sessionData), dispatchEvent: () => true });

beforeEach(() => {
  localData.clear();
  sessionData.clear();
});

/** 어디에도 저장되면 안 되는 칸 — 키 이름과 값 둘 다 본다(leave-workspaces.test.mts 와 같은 값) */
const PERSONAL = {
  rrn: '900101-1234567',
  주민번호: '900101-1234568',
  birthDate: '1990-01-01',
  address: '서울특별시 가상구 가상로 1',
  phone: '010-1234-5678',
  email: 'hong@example.com',
  account: '110-123-456789',
  recordedDays: 987654321,
};
const rawAll = () => [...localData.values(), ...sessionData.values()].join('\n');
function assertNoPersonal() {
  const raw = rawAll();
  for (const [k, v] of Object.entries(PERSONAL)) {
    expect(raw, `키 ${k} 가 저장됐다`).not.toContain(`"${k}"`);
    expect(raw, `값 ${v} 가 저장됐다`).not.toContain(String(v));
  }
}
const snapshot = () => JSON.stringify([[...localData.entries()].sort(), [...sessionData.entries()].sort()]);

/** 두 사업장 — 하나는 기억하기 켬(localStorage), 하나는 꺼짐(sessionStorage) */
function seed(): { a: Workspace; b: Workspace } {
  const a = createWorkspace('가나상사', 'client', true)!;
  updateWorkspace(a.id, { ownerName: '김대표', fivePlus: 'yes' });
  upsertMember(a, { name: '홍길동', hireDate: '2019-03-02', terms: { duty: '홀 서비스', workDays: ['월', '화'], payType: 'hourly', hourlyWage: '13,000' } });
  upsertMember(a, { name: '김영희', hireDate: '2020-01-01' });
  const b = createWorkspace('나다물산', 'own', false)!;
  updateWorkspace(b.id, { fivePlus: 'no' });
  upsertMember(b, { name: '이철수', hireDate: '2024-05-01', terms: { monthlyTotal: '2,600,000' } });
  return { a, b };
}

/** 저장소에서 다시 읽은 카드 내용 — id·저장 위치와 상관없이 비교한다 */
const content = () =>
  listWorkspaces().map((w) => ({ name: w.name, kind: w.kind, fivePlus: w.fivePlus, owner: getWorkspaceDetails(w).ownerName, members: getMembers(w) }));

describe('카드 파일로 내보내기', () => {
  it('기억 여부와 상관없이 지금 있는 사업장 전부 — 대표자는 details 에서, id·remember 는 넣지 않는다', () => {
    seed();
    const out = exportCards(new Date('2026-11-06T01:02:03.000Z'));
    expect(out.kind).toBe('llg-workplace-cards');
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-11-06T01:02:03.000Z');
    expect(out.workspaces).toEqual([
      {
        name: '가나상사',
        kind: 'client',
        fivePlus: 'yes',
        ownerName: '김대표',
        members: [
          { name: '홍길동', hireDate: '2019-03-02', terms: { payType: 'hourly', hourlyWage: '13,000', workDays: ['월', '화'], duty: '홀 서비스' } },
          { name: '김영희', hireDate: '2020-01-01' },
        ],
      },
      { name: '나다물산', kind: 'own', fivePlus: 'no', members: [{ name: '이철수', hireDate: '2024-05-01', terms: { monthlyTotal: '2,600,000' } }] },
    ]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('"id"');
    expect(json).not.toContain('"remember"');
  });

  it('사업장이 없으면 빈 목록', () => {
    expect(exportCards().workspaces).toEqual([]);
  });

  it('파일 이름 = 사업장카드_YYYYMMDD.json', () => {
    expect(cardFileName('2026-11-06')).toBe('사업장카드_20261106.json');
  });
});

describe('카드 파일 가져오기', () => {
  it('내보낸 파일을 지운 뒤 가져오면 같은 카드가 된다(문자열로 받아도 된다)', () => {
    seed();
    const before = content();
    const file = JSON.stringify(exportCards());
    forgetEverything();
    expect(listWorkspaces()).toEqual([]);
    const r = importCards(file, { remember: false });
    expect(r).toEqual({ ok: true, added: 2, merged: 0, skipped: 0 });
    expect(content()).toEqual(before);
  });

  it('기억하기 꺼짐(기본) — 대표자·직원은 sessionStorage 에만, localStorage 원문에 이름이 없다', () => {
    seed();
    const file = exportCards();
    forgetEverything();
    importCards(file, { remember: false });
    expect(listWorkspaces().every((w) => w.remember === false)).toBe(true);
    const local = [...localData.values()].join('\n');
    for (const name of ['김대표', '홍길동', '김영희', '이철수', '홀 서비스']) expect(local).not.toContain(name);
    expect([...sessionData.keys()].filter((k) => k.includes('members'))).toHaveLength(2);
  });

  it('기억하기 켬 — 새로 만든 카드의 대표자·직원이 localStorage 에 들어간다', () => {
    seed();
    const file = exportCards();
    forgetEverything();
    importCards(file, { remember: true });
    expect(listWorkspaces().every((w) => w.remember === true)).toBe(true);
    expect([...sessionData.keys()]).toEqual([]);
    expect([...localData.values()].join('\n')).toContain('홍길동');
  });

  it('이름이 같은 사업장은 합친다 — 명부는 upsertMember 규칙, 대표자는 비어 있지 않을 때만 덮는다', () => {
    const { a } = seed();
    const r = importCards(
      {
        kind: 'llg-workplace-cards',
        version: 1,
        exportedAt: '2026-11-06T00:00:00.000Z',
        workspaces: [
          {
            name: '가나상사',
            kind: 'own',
            ownerName: '',
            members: [
              { name: '홍길동', hireDate: '2019-03-02', terms: { duty: '주방 보조' } },
              { name: '박민수', hireDate: '2025-02-03', terms: { duty: '배달' } },
            ],
          },
          { name: '라마상회', kind: 'client', ownerName: '최대표', members: [] },
        ],
      },
      { remember: false },
    );
    expect(r).toEqual({ ok: true, added: 1, merged: 1, skipped: 0 });
    const merged = listWorkspaces().find((w) => w.id === a.id)!;
    expect(merged).toMatchObject({ name: '가나상사', kind: 'client', remember: true, fivePlus: 'yes' });
    expect(getWorkspaceDetails(merged)).toEqual({ ownerName: '김대표' });
    expect(getMembers(merged)).toEqual([
      { name: '홍길동', hireDate: '2019-03-02', terms: { duty: '주방 보조' } },
      { name: '김영희', hireDate: '2020-01-01' },
      { name: '박민수', hireDate: '2025-02-03', terms: { duty: '배달' } },
    ]);
    const added = listWorkspaces().find((w) => w.name === '라마상회')!;
    expect(added).toMatchObject({ kind: 'client', remember: false });
    expect(getWorkspaceDetails(added)).toEqual({ ownerName: '최대표' });
  });

  it('파일의 직원에 계약 조건이 없으면 이미 있는 조건을 지우지 않는다(손으로 고친 파일)', () => {
    const { a } = seed();
    importCards({ kind: 'llg-workplace-cards', version: 1, workspaces: [{ name: '가나상사', kind: 'client', members: [{ name: '홍길동', hireDate: '2019-03-02' }] }] }, { remember: false });
    const hong = getMembers(listWorkspaces().find((w) => w.id === a.id)!).find((m) => m.name === '홍길동')!;
    expect(hong.terms).toEqual({ duty: '홀 서비스', workDays: ['월', '화'], payType: 'hourly', hourlyWage: '13,000' });
  });

  it('합칠 때 파일의 대표자·5명 이상 값이 있으면 그 값으로 바꾼다', () => {
    const { b } = seed();
    importCards({ kind: 'llg-workplace-cards', version: 1, workspaces: [{ name: '나다물산', kind: 'own', fivePlus: 'yes', ownerName: ' 이대표 ', members: [] }] }, { remember: false });
    const ws = listWorkspaces().find((w) => w.id === b.id)!;
    expect(ws.fivePlus).toBe('yes');
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '이대표' });
  });

  it('가져와도 지금 고른 사업장(활성)은 바뀌지 않는다', () => {
    const { a } = seed();
    setActiveWorkspace(a.id);
    importCards({ kind: 'llg-workplace-cards', version: 1, workspaces: [{ name: '라마상회', kind: 'client', members: [] }] }, { remember: false });
    expect(getActiveWorkspace()?.id).toBe(a.id);
  });

  it('허용 밖 칸은 파일에 있어도 버린다 — 사업장·직원·계약 조건 세 군데 모두, 파일의 id·remember 도 받지 않는다', () => {
    const r = importCards(
      {
        kind: 'llg-workplace-cards',
        version: 1,
        workspaces: [
          {
            ...PERSONAL,
            id: 'evil-id',
            remember: true,
            name: '가나상사',
            kind: 'client',
            fivePlus: 'no',
            ownerName: '김대표',
            members: [{ ...PERSONAL, name: '홍길동', hireDate: '2019-03-02', terms: { ...PERSONAL, duty: '홀 서비스', workDays: ['월', 'x'] } }],
          },
        ],
      },
      { remember: false },
    );
    expect(r).toEqual({ ok: true, added: 1, merged: 0, skipped: 0 });
    assertNoPersonal();
    const [ws] = listWorkspaces();
    expect(Object.keys(ws).sort()).toEqual(['fivePlus', 'id', 'kind', 'name', 'remember']);
    expect(ws.id).not.toBe('evil-id');
    expect(ws.remember).toBe(false);
    expect(rawAll()).not.toContain('evil-id');
    expect(getMembers(ws)).toEqual([{ name: '홍길동', hireDate: '2019-03-02', terms: { workDays: ['월'], duty: '홀 서비스' } }]);
  });

  it('형식이 맞지 않는 사업장은 건너뛰고 나머지는 가져온다', () => {
    const r = importCards(
      {
        kind: 'llg-workplace-cards',
        version: 1,
        workspaces: [
          { name: '  ', kind: 'client', members: [] },
          { name: '가나상사', kind: 'boss', members: [] },
          { name: '나다물산', kind: 'own', fivePlus: 'maybe', members: [] },
          '깨진 값',
          null,
          { name: '라마상회', kind: 'client', members: [{ name: '홍길동', hireDate: '언젠가' }, { name: '김영희', hireDate: '2020-01-01' }] },
        ],
      },
      { remember: false },
    );
    expect(r).toEqual({ ok: true, added: 1, merged: 0, skipped: 5 });
    expect(listWorkspaces().map((w) => w.name)).toEqual(['라마상회']);
    expect(getMembers(listWorkspaces()[0])).toEqual([{ name: '김영희', hireDate: '2020-01-01' }]);
  });

  it('카드 파일이 아니면 아무것도 바꾸지 않는다', () => {
    seed();
    const before = snapshot();
    const bad: unknown[] = [
      null,
      '{{깨진 JSON',
      '[]',
      42,
      { kind: 'other-file', version: 1, workspaces: [] },
      { kind: 'llg-workplace-cards', version: 2, workspaces: [{ name: '새 사업장', kind: 'own', members: [] }] },
      { kind: 'llg-workplace-cards', version: 1, workspaces: { name: '새 사업장' } },
      { kind: 'llg-workplace-cards', version: 1 },
    ];
    for (const b of bad) {
      expect(importCards(b, { remember: true }), JSON.stringify(b)).toEqual({ ok: false, added: 0, merged: 0, skipped: 0 });
    }
    expect(snapshot()).toBe(before);
  });
});

describe('카드 파일 화면 문구·전송 가드', () => {
  it('안내 문구', () => {
    expect(CARD_COPY.fileNotice).toBe('파일에는 대표자·직원 이름과 계약 조건이 들어 있습니다. 보관·전달에 주의하세요.');
    expect(CARD_COPY.fileResult(2, 1)).toBe('사업장 2곳을 더하고 1곳을 합쳤습니다.');
  });

  it('카드 파일 코드에 서버 전송 경로가 없다', () => {
    for (const f of ['src/components/workplace/CardFileTools.tsx', 'src/lib/leave/leave-workspaces.ts', 'src/lib/tool-kit/download.ts']) {
      const src = readFileSync(resolve(__dirname, '../..', f), 'utf8');
      for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) expect(src, `${f}: ${banned}`).not.toContain(banned);
    }
  });

  it('카드 파일 도구는 사업장 카드 영역 안에 있고, 파일은 FileReader 로 이 브라우저에서 읽는다', () => {
    const picker = readFileSync(resolve(__dirname, '../../src/components/workplace/WorkplacePicker.tsx'), 'utf8');
    expect(picker).toContain('<CardFileTools');
    const tools = readFileSync(resolve(__dirname, '../../src/components/workplace/CardFileTools.tsx'), 'utf8');
    expect(tools).toContain('FileReader');
    expect(tools).toContain('importCards(');
  });
});
