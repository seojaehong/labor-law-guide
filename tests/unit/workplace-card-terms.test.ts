// 사업장 카드의 계약 조건 — 저장했다 불러와도 계약서가 그대로인가, 재계약이 명부를 더럽히지 않는가.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_COPY, cardFromState, cardPatch, NO_ORIGIN, originAfterSave, saveCardFromState, selectMember, selectWorkspace } from '@/app/tools/contract-write/cardState';
import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import { designFromForm } from '@/lib/contract-write/contract';
import { ITEM_LABEL } from '@/lib/contract-write/design';
import { buildContractDocument } from '@/lib/contract-write/document';
import { createWorkspace, getMembers, getWorkspaceDetails, listWorkspaces, memberKey, pickTerms, setMembers, upsertMember, type Workspace } from '@/lib/leave/leave-workspaces';

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

const TODAY = '2026-02-26';
const SHARED: Partial<WriteState> = {
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  employeeName: '합성근로자',
  startDate: '2026-03-01',
  endDate: '2026-12-31',
  writtenDate: TODAY,
  payday: '매월 25일',
  paymentMethod: '현금',
  location: '합성테스트 본점',
  duty: '홀 서비스',
  workDays: ['화', '수', '목', '금', '토'],
  start: '10:00',
  end: '19:00',
  breakMinutes: '30',
  weeklyRestDay: '월',
  probation: 'yes',
  probationMonths: '2',
  holidayDaysPerYear: '5',
};

const MONTHLY: WriteState = { ...INITIAL, ...SHARED, endDate: '2027-02-28', probationReduced: 'yes', monthlyTotal: '3,000,000', overtimeHours: '10', holidayHours: '8', leaveHours: '4', absorbInto: 'overtime' };
const HOURLY: WriteState = { ...INITIAL, ...SHARED, simpleLabor: 'yes', payType: 'hourly', hourlyWage: '13,000', absentWeekHoliday: 'keep', rounding: 'ceil100' };
const NET: WriteState = { ...INITIAL, ...SHARED, startDate: '2026-11-01', endDate: '2027-08-31', amountMode: 'net', netPay: '2,500,000', family: '3', rounding: 'ceil10' };

const docOf = (s: WriteState) => {
  const { form } = toWriteForm(s, TODAY);
  if (!form) throw new Error(`계약서를 만들 수 없는 입력: ${JSON.stringify(toWriteForm(s, TODAY))}`);
  return buildContractDocument(form, designFromForm(form));
};

/** 화면이 하는 순서 그대로 — 새 화면에서 사업장을 고르고 직원을 고른다. 카드에 없는 작성일만 그 화면 값이 그대로다 */
function loadFresh(saved: WriteState): WriteState {
  const [ws] = listWorkspaces();
  const [member] = getMembers(ws);
  const fresh: WriteState = { ...INITIAL, writtenDate: saved.writtenDate };
  return { ...fresh, ...cardPatch(ws, null, getWorkspaceDetails(ws)), ...cardPatch(null, member) };
}

describe('저장했다 불러와도 계약서가 그대로다', () => {
  it.each([
    ['월급제 — 수습·기간제·연장·휴일·연차 시간·단수·잔액 항목까지', MONTHLY],
    ['시급제 — 주휴 처리까지', HOURLY],
  ])('%s', (_label, state) => {
    expect(saveCardFromState(state, null).ok).toBe(true);
    const back = loadFresh(state);
    expect(back).toEqual(state);
    expect(docOf(back)).toEqual(docOf(state));
  });

  it('실수령액으로 넣은 카드 — 저장하지 않는 칸은 실수령액·공제대상가족 수 둘뿐이다', () => {
    expect(saveCardFromState(NET, null).ok).toBe(true);
    const back = loadFresh(NET);
    expect(back).toEqual({ ...NET, netPay: INITIAL.netPay, family: INITIAL.family });
    expect(docOf({ ...back, netPay: NET.netPay, family: NET.family })).toEqual(docOf(NET));
  });

  it('저장하는 칸마다 위 시험 중 하나는 처음 값이 아닌 값을 쓴다', () => {
    const stored = Object.keys(pickTerms(INITIAL)) as (keyof WriteState)[];
    expect(stored.filter((k) => ![MONTHLY, HOURLY, NET].some((s) => JSON.stringify(s[k]) !== JSON.stringify(INITIAL[k])))).toEqual([]);
  });

  it('입력 칸은 전부 저장하거나 저장하지 않는다고 정해져 있다 — 칸이 늘면 여기서 멈춘다', () => {
    const notTerms: (keyof WriteState)[] = ['workplaceName', 'ownerName', 'fivePlus', 'employeeName', 'writtenDate', 'netPay', 'family'];
    expect([...Object.keys(pickTerms(INITIAL)), ...notTerms].sort()).toEqual(Object.keys(INITIAL).sort());
  });

  it('선택지 칸의 값은 전부 저장된다 — 계약서 쪽 값이 빠지면 조용히 처음 값으로 돌아간다', () => {
    for (const absorbInto of Object.keys(ITEM_LABEL)) expect(pickTerms({ absorbInto }).absorbInto).toBe(absorbInto);
    for (const rounding of ['won', 'ceil10', 'ceil100']) expect(pickTerms({ rounding }).rounding).toBe(rounding);
  });

  it('옛 형식 명부(조건 없음·11칸 조건)도 그대로 읽히고, 없는 칸은 처음 값이다', () => {
    const ws = createWorkspace('합성옛카드', 'own')!;
    const old = { payType: 'hourly', amountMode: 'gross', monthlyTotal: '', hourlyWage: '13,000', workDays: ['월', '화'], start: '11:00', end: '17:00', breakMinutes: '30', weeklyRestDay: '일', duty: '홀', location: '본점' } as const;
    sessionData.set(`work-patterns.leave.members.v1:${ws.id}`, JSON.stringify([{ name: '옛직원', hireDate: '2024-01-02', terms: old }, { name: '옛연차', hireDate: '2020-05-06' }]));
    const [withTerms, plain] = getMembers(ws);
    expect(withTerms).toEqual({ name: '옛직원', hireDate: '2024-01-02', terms: old });
    expect(plain).toEqual({ name: '옛연차', hireDate: '2020-05-06' });
    expect(cardPatch(null, withTerms)).toMatchObject({ hourlyWage: '13,000', startDate: '2024-01-02', endDate: INITIAL.endDate, probation: INITIAL.probation, rounding: INITIAL.rounding, payday: INITIAL.payday, paymentMethod: INITIAL.paymentMethod });
  });
});

describe('재계약 — 계약 시작일은 입사일이 아니다', () => {
  const RENEWAL: WriteState = { ...MONTHLY, employeeName: '합성재계약', startDate: '2026-03-01' };
  const KEY = '합성재계약 2019-03-02';

  function hired2019(): Workspace {
    const ws = createWorkspace(RENEWAL.workplaceName, 'own')!;
    setMembers(ws, [{ name: '합성재계약', hireDate: '2019-03-02' }]);
    return ws;
  }

  it('명부에서 고른 사람을 저장하면 입사일을 지키고 줄을 늘리지 않는다', () => {
    const ws = hired2019();
    expect(saveCardFromState(RENEWAL, ws.id, KEY).ok).toBe(true);
    const members = getMembers(ws);
    expect(members).toHaveLength(1);
    expect(members[0].hireDate).toBe('2019-03-02');
    expect(members[0].terms?.startDate).toBe('2026-03-01');
  });

  it('다시 고르면 계약 시작일은 저장한 값이고 입사일이 아니다', () => {
    const ws = hired2019();
    saveCardFromState(RENEWAL, ws.id, KEY);
    const [m] = getMembers(ws);
    expect(cardPatch(null, m).startDate).toBe('2026-03-01');
    expect(selectMember(m).notice).toBeNull();
  });

  it('고른 사람의 다음 재계약은 조건만 바뀐다', () => {
    const ws = hired2019();
    saveCardFromState(RENEWAL, ws.id, KEY);
    saveCardFromState({ ...RENEWAL, startDate: '2027-03-01', duty: '주방' }, ws.id, KEY);
    const members = getMembers(ws);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ hireDate: '2019-03-02', terms: { startDate: '2027-03-01', duty: '주방' } });
  });

  it('새 사람은 입사일 = 계약 시작일이다', () => {
    saveCardFromState(MONTHLY, null);
    expect(getMembers(listWorkspaces()[0])[0]).toMatchObject({ hireDate: '2026-03-01', terms: { startDate: '2026-03-01' } });
  });

  it('고른 뒤 이름을 다른 사람으로 고치면 고른 사람을 덮지 않고 새 사람으로 넣는다', () => {
    const ws = hired2019();
    saveCardFromState({ ...RENEWAL, employeeName: '합성다른사람' }, ws.id, KEY);
    const members = getMembers(ws);
    expect(members.map((m) => [m.name, m.hireDate])).toEqual([['합성재계약', '2019-03-02'], ['합성다른사람', '2026-03-01']]);
    expect(members[0].terms).toBeUndefined();
  });

  it('고른 뒤 사업체명을 고치면 고른 사람은 그 사업장에 없는 사람이다', () => {
    const ws = hired2019();
    saveCardFromState({ ...RENEWAL, workplaceName: '합성다른곳' }, ws.id, KEY);
    expect(getMembers(ws)[0].terms).toBeUndefined();
    const other = listWorkspaces().find((w) => w.name === '합성다른곳')!;
    expect(getMembers(other)[0].hireDate).toBe('2026-03-01');
  });

  it('입사일만 있는 사람을 고르면 입사일로 채우고 고치라고 알린다', () => {
    const r = selectMember({ name: '합성재계약', hireDate: '2019-03-02' });
    expect(r.patch.startDate).toBe('2019-03-02');
    expect(r.notice).toBe(CARD_COPY.startFromHire('2019-03-02'));
  });

  it('memberKey 는 입사일로 만든다 — 저장한 뒤에도 연차 화면이 같은 사람으로 찾는다', () => {
    const ws = hired2019();
    saveCardFromState(RENEWAL, ws.id, KEY);
    expect(memberKey(getMembers(ws)[0])).toBe(KEY);
  });
});

describe('이름·시작일이 같은 다른 조건을 몰래 덮지 않는다', () => {
  const FIRST: WriteState = { ...MONTHLY, employeeName: '합성동명' };
  const stored = () => getMembers(listWorkspaces()[0]);

  it('고르지 않고 저장했는데 조건이 다르면 덮지 않고 충돌을 돌려준다', () => {
    saveCardFromState(FIRST, null);
    const before = stored();
    const r = saveCardFromState({ ...FIRST, monthlyTotal: '4,000,000' }, null);
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(r.ok ? '' : r.reason).toBe(CARD_COPY.conflict('합성동명', '2026-03-01'));
    expect(stored()).toEqual(before);
  });

  it('충돌이면 대표자·5명 이상 여부도 쓰지 않는다', () => {
    saveCardFromState(FIRST, null);
    saveCardFromState({ ...FIRST, monthlyTotal: '4,000,000', ownerName: '합성새대표' }, listWorkspaces()[0].id);
    expect(getWorkspaceDetails(listWorkspaces()[0]).ownerName).toBe('합성대표');
  });

  it('조건이 같으면 그대로 성공하고 줄이 늘지 않는다', () => {
    saveCardFromState(FIRST, null);
    expect(saveCardFromState(FIRST, null).ok).toBe(true);
    expect(stored()).toHaveLength(1);
  });

  it('조건 없는 명부의 같은 사람에게는 조건을 넣는다 — 잃는 값이 없다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: '합성동명', hireDate: '2026-03-01' }]);
    expect(saveCardFromState(FIRST, null).ok).toBe(true);
    expect(getMembers(ws)).toEqual([{ name: '합성동명', hireDate: '2026-03-01', terms: pickTerms(FIRST) }]);
  });

  it('고른 사람이면 같은 칸이어도 충돌이 아니다', () => {
    saveCardFromState(FIRST, null);
    const ws = listWorkspaces()[0];
    const r = saveCardFromState({ ...FIRST, monthlyTotal: '4,000,000' }, ws.id, memberKey(getMembers(ws)[0]));
    expect(r.ok).toBe(true);
    expect(getMembers(ws)[0].terms?.monthlyTotal).toBe('4,000,000');
  });

  it('재계약으로 저장한 사람을 고르지 않고 같은 시작일로 저장해도 둘째 줄이 생기지 않는다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: '합성동명', hireDate: '2019-03-02' }]);
    saveCardFromState(FIRST, ws.id, '합성동명 2019-03-02');
    expect(saveCardFromState({ ...FIRST, duty: '주방' }, null)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(saveCardFromState(FIRST, null).ok).toBe(true);
    expect(getMembers(ws)).toHaveLength(1);
  });

  it('이름만 같고 시작일이 다르면 새 줄로 넣되 알린다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: '합성동명', hireDate: '2019-03-02' }]);
    const r = saveCardFromState(FIRST, null);
    expect(r.ok && r.message).toContain(CARD_COPY.sameNameAdded);
    expect(getMembers(ws)).toHaveLength(2);
  });

  it('upsertMember 는 그대로 — 호출부가 고른 사람을 넘길 때 쓴다', () => {
    const ws = createWorkspace('합성직접', 'own')!;
    upsertMember(ws, { name: '갑', hireDate: '2020-01-02', terms: { duty: 'a' } });
    upsertMember(ws, { name: '갑', hireDate: '2020-01-02', terms: { duty: 'b' } });
    expect(getMembers(ws)).toEqual([{ name: '갑', hireDate: '2020-01-02', terms: { duty: 'b' } }]);
  });

  it('cardFromState 는 계약 시작일을 조건에 담는다', () => {
    const c = cardFromState(FIRST);
    expect(c.ok && c.member.terms?.startDate).toBe('2026-03-01');
  });

  it('지급일만 다른 줄도 다른 조건이다 — 몰래 덮지 않는다', () => {
    expect(saveCardFromState(FIRST, null).ok).toBe(true);
    const r = saveCardFromState({ ...FIRST, payday: '매월 5일' }, null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe('conflict');
  });
});

describe('명부에 없는 사람의 입사일은 계약 시작일로 적었다고 말한다', () => {
  const FIRST: WriteState = { ...MONTHLY, employeeName: '합성동명' };
  const hinted = (r: ReturnType<typeof saveCardFromState>) => r.ok && r.message.includes(CARD_COPY.hireFromStart(FIRST.startDate));

  it('안내가 그 날짜와 고칠 곳을 말한다', () => {
    expect(CARD_COPY.hireFromStart('2026-03-01')).toContain('2026-03-01');
    expect(CARD_COPY.hireFromStart('2026-03-01')).toContain('연차');
  });

  it('새 사람을 저장하면 시작일이 입사일로 기록됐다고 알린다', () => {
    const r = saveCardFromState(FIRST, null);
    expect(hinted(r)).toBe(true);
    expect(getMembers(listWorkspaces()[0])[0].hireDate).toBe(FIRST.startDate);
  });

  it('이름만 같은 사람과 다른 줄로 저장해도 알린다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: FIRST.employeeName, hireDate: '2019-03-02' }]);
    expect(hinted(saveCardFromState(FIRST, null))).toBe(true);
  });

  it('명부의 같은 사람에게 넣으면 입사일을 건드리지 않았으니 알리지 않는다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: FIRST.employeeName, hireDate: FIRST.startDate }]);
    expect(hinted(saveCardFromState(FIRST, null))).toBe(false);
  });

  it('명부에서 고른 사람을 저장하면 입사일을 지키니 알리지 않는다', () => {
    const ws = createWorkspace(FIRST.workplaceName, 'own')!;
    setMembers(ws, [{ name: FIRST.employeeName, hireDate: '2019-03-02' }]);
    const r = saveCardFromState(FIRST, ws.id, `${FIRST.employeeName} 2019-03-02`);
    expect(r.ok && r.message).not.toContain('입사일');
  });
});

describe('사업장을 옮길 때 앞 사람 값이 남지 않는다', () => {
  const NEXT: Workspace = { id: 'w2', name: '합성다음곳', kind: 'own', remember: false, fivePlus: 'yes' };
  const HONG = { name: '합성홍', hireDate: '2026-03-01', terms: { monthlyTotal: '2,600,000', location: '합성본점', duty: '홀' } };
  const apply = (s: WriteState, p: Partial<WriteState>): WriteState => ({ ...s, ...p });

  it('불러온 직원 칸을 비우면 비웠다고 말한다 — 직접 고친 값도 함께 비워진다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, { ...picked.patch, overtimeHours: '12' });
    const r = selectWorkspace(form, NEXT, {}, picked.origin);
    expect(apply(form, r.patch)).toMatchObject({ employeeName: '', monthlyTotal: '', overtimeHours: INITIAL.overtimeHours });
    expect(r.notice).toContain(CARD_COPY.employeeCleared);
    expect(CARD_COPY.employeeCleared).toMatch(/직접 고친 값/);
  });

  it('비운 안내와 5명 이상 여부 안내를 함께 낸다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, picked.patch);
    const r = selectWorkspace(form, { ...NEXT, fivePlus: undefined }, {}, picked.origin);
    expect(r.notice).toContain(CARD_COPY.employeeCleared);
    expect(r.notice).toContain(CARD_COPY.fivePlusAsIs);
  });

  it('비울 것이 없으면 비웠다고 말하지 않는다', () => {
    const r = selectWorkspace(MONTHLY, NEXT, {}, NO_ORIGIN);
    expect(r.notice).toBeNull();
  });

  it('지급일·지급방법도 직원 칸이다 — 다음 사업장으로 넘어가지 않는다', () => {
    const switched = apply(MONTHLY, selectWorkspace(MONTHLY, NEXT, {}, originAfterSave(MONTHLY)).patch);
    expect(switched).toMatchObject({ payday: INITIAL.payday, paymentMethod: INITIAL.paymentMethod, writtenDate: MONTHLY.writtenDate });
  });

  it('직원을 고른 뒤 「직원 고르기」로 되돌리고 사업장을 옮겨도 앞 직원 값을 비운다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, picked.patch);
    const switched = apply(form, selectWorkspace(form, NEXT, {}, picked.origin).patch);
    expect(switched).toMatchObject({ workplaceName: '합성다음곳', employeeName: '', monthlyTotal: '', location: '', duty: '' });
  });

  it('저장한 뒤 사업장을 옮겨도 저장한 직원 값을 비운다', () => {
    const switched = apply(MONTHLY, selectWorkspace(MONTHLY, NEXT, {}, originAfterSave(MONTHLY)).patch);
    expect(switched).toMatchObject({ workplaceName: '합성다음곳', employeeName: '', monthlyTotal: '', location: '', endDate: '' });
  });

  it('카드에서 불러온 적이 없으면 직접 쓴 칸은 그대로다', () => {
    const switched = apply(MONTHLY, selectWorkspace(MONTHLY, NEXT, {}, NO_ORIGIN).patch);
    expect(switched).toMatchObject({ workplaceName: '합성다음곳', employeeName: MONTHLY.employeeName, monthlyTotal: MONTHLY.monthlyTotal });
  });

  it('불러온 칸이 하나라도 남아 있으면 비운다 — 이름만 고쳐도 앞 사람의 임금이 넘어가면 안 된다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, { ...picked.patch, employeeName: '합성새사람' });
    expect(apply(form, selectWorkspace(form, NEXT, {}, picked.origin).patch)).toMatchObject({ employeeName: '', monthlyTotal: '' });
  });

  it('불러온 값을 전부 다른 값으로 고쳐 썼으면 카드 값이 남아 있지 않아 비우지 않는다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, { ...picked.patch, employeeName: '합성새사람', startDate: '2026-05-01', monthlyTotal: '3,000,000', location: '합성지점', duty: '주방' });
    expect(apply(form, selectWorkspace(form, NEXT, {}, picked.origin).patch)).toMatchObject({ employeeName: '합성새사람', monthlyTotal: '3,000,000' });
  });

  it('한 번 비운 뒤 직접 쓴 값은 다음 전환에서 지우지 않는다', () => {
    const picked = selectMember(HONG, NO_ORIGIN);
    const form = apply(INITIAL, picked.patch);
    const first = selectWorkspace(form, NEXT, {}, picked.origin);
    const typed = apply(apply(form, first.patch), { employeeName: '합성직접', monthlyTotal: '2,600,000' });
    expect(apply(typed, selectWorkspace(typed, { ...NEXT, id: 'w3' }, {}, first.origin).patch)).toMatchObject({ employeeName: '합성직접', monthlyTotal: '2,600,000' });
  });
});

describe('5명 이상 여부가 없는 카드', () => {
  const NONE: Workspace = { id: 'w3', name: '합성빈칸', kind: 'own', remember: false };
  const FIVE_NO: Workspace = { id: 'w4', name: '합성오인미만', kind: 'own', remember: false, fivePlus: 'no' };
  const form = (fivePlus: WriteState['fivePlus']): WriteState => ({ ...INITIAL, fivePlus });

  it('이용자가 고른 값을 뒤집지 않고 그대로 두었다고 말한다', () => {
    const r = selectWorkspace(form('no'), NONE, {}, NO_ORIGIN);
    expect(r.patch.fivePlus).toBeUndefined();
    expect(r.notice).toBe(CARD_COPY.fivePlusAsIs);
  });

  it('앞 카드에서 온 값은 남기지 않고 돌렸다고 말한다 — 5명 미만이 다음 사업장 계약서로 넘어가면 안 된다', () => {
    const first = selectWorkspace(form('yes'), FIVE_NO, {}, NO_ORIGIN);
    expect(first.patch.fivePlus).toBe('no');
    const r = selectWorkspace(form('no'), NONE, {}, first.origin);
    expect(r.patch.fivePlus).toBe(INITIAL.fivePlus);
    expect(r.notice).toBe(CARD_COPY.fivePlusUnknown);
  });

  it('앞 카드 값을 이용자가 바꿨으면 그 값은 이용자가 고른 값이다', () => {
    const first = selectWorkspace(form('yes'), FIVE_NO, {}, NO_ORIGIN);
    const r = selectWorkspace(form('yes'), NONE, {}, first.origin);
    expect(r.patch.fivePlus).toBeUndefined();
    expect(r.notice).toBe(CARD_COPY.fivePlusAsIs);
  });

  it('값이 있는 카드는 그 값을 채우고 알리지 않는다', () => {
    const r = selectWorkspace(form('yes'), FIVE_NO, {}, NO_ORIGIN);
    expect(r.patch.fivePlus).toBe('no');
    expect(r.notice).toBeNull();
  });
});
