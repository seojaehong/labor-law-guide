// 근로계약서 작성 ↔ 사업장 카드(261105 재홍님 결정). 회원가입 없이 사업장·직원·계약 조건을 이 브라우저에 두고 다시 쓴다.
// 화면 렌더 시험 기반(jsdom·testing-library)이 없어 칸 채우기·저장은 순수 함수(cardState.ts)로 빼서 본다. 컴포넌트는 그 함수를 부르기만 한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyCardToState, CARD_COPY, cardFromState, cardPatch, NO_ORIGIN, saveCardFromState, selectWorkspace } from '@/app/tools/contract-write/cardState';
import { INITIAL, toWriteForm, type WriteState } from '@/app/tools/contract-write/formState';
import { getMembers, getWorkspaceDetails, listWorkspaces, pickTerms, type Workspace, type WorkspaceMember } from '@/lib/leave/leave-workspaces';
import { bannedHits, RESULT_BANNED, SERVICE_BANNED } from '@/lib/tool-kit/banned';

// 두 저장소를 따로 흉내낸다 — 어디에 쓰였는지가 개인정보 설계의 핵심이다(leave-workspaces.test.mts 와 같은 방식)
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

const FILLED: WriteState = {
  ...INITIAL,
  workplaceName: '합성테스트 사업장',
  ownerName: '합성대표',
  fivePlus: 'no',
  employeeName: '합성근로자',
  startDate: '2026-03-01',
  writtenDate: '2026-02-26',
  location: '합성테스트 본점',
  duty: '홀 서비스',
  payType: 'hourly',
  hourlyWage: '13,000',
  workDays: ['월', '화', '수'],
  start: '11:00',
  end: '17:00',
  breakMinutes: '30',
  weeklyRestDay: '일',
  payday: '매월 25일',
};

const WS: Workspace = { id: 'w1', name: '가나상사', kind: 'own', remember: false, fivePlus: 'no' };
/** 대표자명은 사업장 목록이 아니라 명부와 같은 저장소(details)에 있다 */
const DETAILS = { ownerName: '김대표' };
const MEMBER: WorkspaceMember = {
  name: '홍길동',
  hireDate: '2026-03-01',
  terms: {
    payType: 'hourly',
    amountMode: 'gross',
    monthlyTotal: '',
    hourlyWage: '13,000',
    workDays: ['월', '화'],
    start: '11:00',
    end: '17:00',
    breakMinutes: '30',
    weeklyRestDay: '일',
    duty: '홀 서비스',
    location: '본점',
  },
};

const membersRaw = () => [...sessionData.entries(), ...localData.entries()].filter(([k]) => k.includes('members')).map(([, v]) => v).join('\n');

describe('카드에서 불러오기', () => {
  it('카드에서 직원을 고르면 사업장·근로자·계약 조건 칸이 채워진다 — 작성일과 다른 칸은 그대로', () => {
    const before: WriteState = { ...INITIAL, writtenDate: '2026-02-26', payday: '매월 25일' };
    const s = applyCardToState(before, WS, MEMBER, DETAILS);
    expect(s).toMatchObject({
      workplaceName: '가나상사',
      ownerName: '김대표',
      fivePlus: 'no',
      employeeName: '홍길동',
      startDate: '2026-03-01',
      payType: 'hourly',
      hourlyWage: '13,000',
      workDays: ['월', '화'],
      start: '11:00',
      end: '17:00',
      breakMinutes: '30',
      duty: '홀 서비스',
      location: '본점',
    });
    expect(s.writtenDate).toBe('2026-02-26');
    expect(s.payday).toBe('매월 25일');
    expect(s.endDate).toBe(INITIAL.endDate);
  });

  it('사업장을 고르면 그 카드에 없는 대표자 칸은 앞 사업장 값을 남기지 않는다', () => {
    const afterA = applyCardToState(INITIAL, WS, null, DETAILS);
    expect(afterA).toMatchObject({ ownerName: '김대표', fivePlus: 'no' });
    const afterB = applyCardToState(afterA, { id: 'w2', name: '나다물산', kind: 'own', remember: false }, null);
    expect(afterB).toMatchObject({ workplaceName: '나다물산', ownerName: '' });
  });

  it('5명 미만 카드 다음에 값 없는 카드를 고르면 계약서의 연장 가산이 앞 사업장 값으로 계산되지 않는다', () => {
    const first = selectWorkspace(FILLED, WS, DETAILS, NO_ORIGIN);
    const afterA = { ...FILLED, ...first.patch };
    const afterB = { ...afterA, ...selectWorkspace(afterA, { id: 'w2', name: '나다물산', kind: 'own', remember: false }, {}, first.origin).patch };
    expect(toWriteForm(afterB, '2026-03-01').form?.employeeCount5plus).toBe(INITIAL.fivePlus === 'yes');
  });

  const GAP: WriteState = {
    ...INITIAL,
    workplaceName: '가나상사',
    payday: '매월 25일',
    paymentMethod: '현금',
    writtenDate: '2026-02-26',
    employeeName: '갑',
    startDate: '2024-01-02',
    endDate: '2026-12-31',
    location: '본점',
    duty: '주방',
    probation: 'yes',
    probationMonths: '2',
    probationReduced: 'yes',
    simpleLabor: 'yes',
    workDays: ['월', '화', '수'],
    start: '10:00',
    end: '15:00',
    breakMinutes: '30',
    weeklyRestDay: '토',
    payType: 'monthly',
    amountMode: 'net',
    monthlyTotal: '3,000,000',
    netPay: '2,500,000',
    family: '3',
    hourlyWage: '20,000',
    absentWeekHoliday: 'keep',
    holidayDaysPerYear: '5',
    overtimeHours: '10',
    holidayHours: '8',
    leaveHours: '4',
    rounding: 'ceil100',
    absorbInto: 'overtime',
  };

  it('조건이 없는 직원을 고르면 앞 직원의 조건이 하나도 남지 않는다', () => {
    const s = applyCardToState(GAP, null, { name: '을', hireDate: '2025-05-01' });
    expect(s).toEqual({
      ...INITIAL,
      workplaceName: '가나상사',
      payday: '매월 25일',
      paymentMethod: '현금',
      writtenDate: '2026-02-26',
      employeeName: '을',
      startDate: '2025-05-01',
    });
  });

  it('실수령액으로 저장한 직원을 고르면 앞 직원의 실수령액·가족 수로 총액을 만들지 않는다', () => {
    const net: WorkspaceMember = { name: '을', hireDate: '2026-03-01', terms: { payType: 'monthly', amountMode: 'net', monthlyTotal: '', start: '09:00', end: '18:00', breakMinutes: '60', workDays: ['월', '화', '수', '목', '금'], weeklyRestDay: '일', duty: '사무', location: '본점' } };
    const s = applyCardToState(GAP, null, net);
    expect(s).toMatchObject({ amountMode: 'net', netPay: '', family: INITIAL.family, monthlyTotal: '' });
    const parsed = toWriteForm(s, '2026-03-01');
    expect(parsed.form).toBeNull();
    expect(parsed.missing).toContain('월 실수령액');
  });

  it('직원을 불러온 뒤 사업장을 바꾸면 앞 직원 칸을 비운다 — 직접 쓴 칸은 직원을 불러오지 않았으면 그대로', () => {
    const b = { id: 'w2', name: '나다물산', kind: 'own' as const, remember: false };
    const switched = { ...GAP, ...cardPatch(b, null, {}, { clearEmployee: true }) };
    expect(switched).toMatchObject({ workplaceName: '나다물산', employeeName: '', startDate: '', monthlyTotal: '', duty: '', writtenDate: '2026-02-26', payday: '매월 25일' });
    const typed = { ...GAP, ...cardPatch(b, null, {}) };
    expect(typed).toMatchObject({ workplaceName: '나다물산', employeeName: '갑', duty: '주방' });
  });

  it('카드가 없으면 첫 화면은 INITIAL 그대로', () => {
    expect(applyCardToState(INITIAL, null, null)).toEqual(INITIAL);
    const src = readFileSync(resolve(__dirname, '../../src/app/tools/contract-write/ContractWriteClient.tsx'), 'utf8');
    expect(src).toContain('useState<WriteState>(INITIAL)');
  });
});

describe('카드에 저장하기', () => {
  it('저장하면 저장소에 계약 조건이 들어간다 — 기본은 sessionStorage, 사업장 정보도 함께', () => {
    const r = saveCardFromState(FILLED, null);
    expect(r.ok).toBe(true);
    const [ws] = listWorkspaces();
    expect(ws).toMatchObject({ name: '합성테스트 사업장', kind: 'own', remember: false, fivePlus: 'no' });
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
    // 기억하기를 켜지 않았으니 대표자·직원 이름이 localStorage 원문에 없다
    const local = [...localData.values()].join('\n');
    expect(local).not.toContain('합성대표');
    expect(local).not.toContain('합성근로자');
    const [m] = getMembers(ws);
    expect(m).toEqual({ name: '합성근로자', hireDate: '2026-03-01', terms: pickTerms(FILLED) });
    expect(m.terms).toMatchObject({ payType: 'hourly', hourlyWage: '13,000', duty: '홀 서비스', location: '합성테스트 본점', workDays: ['월', '화', '수'] });
    expect([...sessionData.keys()].some((k) => k.includes('members'))).toBe(true);
    expect([...localData.keys()].some((k) => k.includes('members'))).toBe(false);
    // 계약 조건이 아닌 칸(작성일·지급일·지급방법)은 카드에 넣지 않는다
    expect(membersRaw()).not.toContain('2026-02-26');
    expect(membersRaw()).not.toContain('매월 25일');
    expect(membersRaw()).not.toContain('계좌이체');
  });

  it('저장한 카드를 다시 불러오면 같은 계약 조건이 된다', () => {
    saveCardFromState(FILLED, null);
    const [ws] = listWorkspaces();
    const [m] = getMembers(ws);
    const back = applyCardToState({ ...INITIAL, writtenDate: FILLED.writtenDate, payday: FILLED.payday }, ws, m, getWorkspaceDetails(ws));
    expect(back).toEqual(FILLED);
  });

  it('근로자 성명·계약 시작일이 비면 저장하지 않고 이유를 말한다', () => {
    const c = cardFromState(INITIAL);
    expect(c.ok).toBe(false);
    expect(c.ok ? '' : c.reason).toBe('저장하려면 넣어 주세요: 사업체명, 근로자 성명, 계약 시작일');
    expect(saveCardFromState({ ...FILLED, employeeName: ' ' }, null).ok).toBe(false);
    expect(listWorkspaces()).toEqual([]);
    expect(localData.size + sessionData.size).toBe(0);
  });

  it('같은 이름의 카드가 있으면 새로 만들지 않고 그 카드에 넣는다 — 고른 사람은 조건만 바뀐다', () => {
    saveCardFromState(FILLED, null);
    const id = listWorkspaces()[0].id;
    saveCardFromState({ ...FILLED, duty: '주방 보조' }, id, '합성근로자 2026-03-01');
    saveCardFromState({ ...FILLED, employeeName: '합성근로자2' }, id);
    expect(listWorkspaces()).toHaveLength(1);
    const members = getMembers(listWorkspaces()[0]);
    expect(members.map((m) => m.name)).toEqual(['합성근로자', '합성근로자2']);
    expect(members[0].terms?.duty).toBe('주방 보조');
  });

  it('대표자를 비우고 저장해도 카드의 대표자를 지우지 않는다', () => {
    saveCardFromState(FILLED, null);
    saveCardFromState({ ...FILLED, ownerName: '' }, null);
    expect(getWorkspaceDetails(listWorkspaces()[0]).ownerName).toBe('합성대표');
  });
});

describe('카드 칸과 계약서 입력 칸', () => {
  it('pickTerms(INITIAL) — 값이 그대로 옮겨지고 칸 이름·타입은 WriteState 와 같다', () => {
    const t: Partial<WriteState> = pickTerms(INITIAL);
    for (const [k, v] of Object.entries(t)) expect(v).toEqual(INITIAL[k as keyof WriteState]);
  });
});

describe('화면 문구·전송 가드', () => {
  const EXTRA_BANNED = ['지도', '대리', '대신', '대행'];
  const texts = [
    ...Object.values(CARD_COPY).map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('가나상사', '홍길동') : v)),
  ];

  it('새 화면 문구에 금지어가 없다', () => {
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.flatMap((t) => bannedHits(t, [...SERVICE_BANNED, ...RESULT_BANNED, ...EXTRA_BANNED]).map((h) => `${h} | ${t}`))).toEqual([]);
  });

  it('기억하기 꺼짐 문구가 저장 위치와 맞다 — 대표자도 탭을 닫으면 사라진다', () => {
    expect(CARD_COPY.rememberOff).toBe('이 탭을 닫으면 대표자·직원 정보가 사라집니다. 사업장 이름과 5명 이상 여부만 이 브라우저에 남습니다.');
  });

  it('카드 코드에 서버 전송 경로가 없다', () => {
    for (const f of ['src/app/tools/contract-write/cardState.ts', 'src/components/workplace/WorkplacePicker.tsx']) {
      const src = readFileSync(resolve(__dirname, '../..', f), 'utf8');
      for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket']) expect(src, `${f}: ${banned}`).not.toContain(banned);
    }
  });
});
