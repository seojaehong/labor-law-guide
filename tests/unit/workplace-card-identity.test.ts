import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveCardFromState } from '@/app/tools/contract-write/cardState';
import { INITIAL, type WriteState } from '@/app/tools/contract-write/formState';
import { createWorkspace, getMembers, getWorkspaceDetails, memberKey, upsertMember } from '@/lib/leave/leave-workspaces';

const local = new Map<string, string>();
const session = new Map<string, string>();
const storage = (data: Map<string, string>) => ({
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
});
vi.stubGlobal('window', { localStorage: storage(local), sessionStorage: storage(session), dispatchEvent: () => true });
beforeEach(() => { local.clear(); session.clear(); });

const INPUT: WriteState = { ...INITIAL, workplaceName: '합성상사', employeeName: '합성동명', startDate: '2026-03-01', duty: '새 업무', ownerName: '합성대표' };
const first = { name: INPUT.employeeName, hireDate: '2019-03-01', terms: { startDate: '2025-03-01', duty: '첫째 업무' } };
const second = { name: INPUT.employeeName, hireDate: INPUT.startDate, terms: { startDate: '2026-06-01', duty: '둘째 업무' } };

function seed() {
  const ws = createWorkspace(INPUT.workplaceName, 'own')!;
  upsertMember(ws, first);
  upsertMember(ws, second);
  return ws;
}

describe('동명 직원의 저장 대상', () => {
  it.each(['2026-03-01', '2026-06-01'])('선택한 직원의 시작일을 다른 동명 직원의 날짜(%s)로 바꾸면 아무것도 쓰지 않는다', (startDate) => {
    const ws = seed();
    const before = { local: [...local], session: [...session] };
    expect(saveCardFromState({ ...INPUT, startDate }, ws.id, memberKey(first))).toMatchObject({ ok: false, kind: 'conflict' });
    expect({ local: [...local], session: [...session] }).toEqual(before);
    expect(getWorkspaceDetails(ws)).toEqual({});
  });

  it('다른 동명 직원과 날짜가 겹치지 않는 재계약은 선택한 직원의 입사일을 보존한다', () => {
    const ws = seed();
    const r = saveCardFromState({ ...INPUT, startDate: '2027-03-01' }, ws.id, memberKey(first));
    expect(r.ok).toBe(true);
    expect(getMembers(ws)[0]).toMatchObject({ hireDate: first.hireDate, terms: { startDate: '2027-03-01', duty: INPUT.duty } });
    expect(getMembers(ws)[1]).toEqual(second);
  });

  it('같은 계약 시작일인 직원도 명부에서 정확히 고르면 그 직원만 수정한다', () => {
    const ws = seed();
    upsertMember(ws, { ...first, terms: { ...first.terms, startDate: INPUT.startDate } });
    const r = saveCardFromState(INPUT, ws.id, memberKey(first));
    expect(r.ok).toBe(true);
    expect(getMembers(ws)[0].terms?.duty).toBe(INPUT.duty);
    expect(getMembers(ws)[1]).toEqual(second);
  });

  it('날짜가 겹쳐도 원래 입사일로 재계약을 확인하면 선택한 직원만 바꾼다', () => {
    const ws = seed();
    const r = saveCardFromState(INPUT, ws.id, memberKey(first));
    expect(!r.ok && r.confirmRenewal?.message).toContain(first.hireDate);
    expect(!r.ok && r.confirmRenewal?.message).toContain(INPUT.startDate);
    expect(saveCardFromState(INPUT, ws.id, memberKey(first), memberKey(second))).toMatchObject({ ok: false });
    expect(saveCardFromState(INPUT, ws.id, memberKey(first), memberKey(first)).ok).toBe(true);
    expect(getMembers(ws)[0]).toMatchObject({ hireDate: first.hireDate, terms: { startDate: INPUT.startDate, duty: INPUT.duty } });
    expect(getMembers(ws)[1]).toEqual(second);
  });

  it('선택 없이 날짜로 두 직원을 찾으면 조건 없는 첫째 직원도 자동으로 덮지 않는다', () => {
    const ws = createWorkspace(INPUT.workplaceName, 'own')!;
    upsertMember(ws, { name: INPUT.employeeName, hireDate: INPUT.startDate });
    upsertMember(ws, { ...first, terms: { ...first.terms, startDate: INPUT.startDate } });
    const before = getMembers(ws);
    expect(saveCardFromState(INPUT, ws.id)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(getMembers(ws)).toEqual(before);
  });
});
