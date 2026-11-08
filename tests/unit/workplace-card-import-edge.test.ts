// 카드 파일의 남은 경계 — 번호 꼴 가리기, 가져오기 값 검증·정리, 내보낸 파일의 재가져오기, 화면 문구 연결.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARD_COPY, cardFileTooLarge, cardFromState, cardImportMessage } from '@/app/tools/contract-write/cardState';
import { INITIAL } from '@/app/tools/contract-write/formState';
import { CARD_FILE_MAX_BYTES, CARD_FILE_MAX_MEMBERS, createWorkspace, exportCards, exportCardsJson, FORGET_ALL_CONFIRM, getMembers, getWorkspaceDetails, importCards, listWorkspaces, renameWorkspace, stripIdNumbers, upsertMember } from '@/lib/leave/leave-workspaces';

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

const FILE = { kind: 'llg-workplace-cards', version: 1 };
const HONG = { name: '합성홍', hireDate: '2019-03-02' };
const importOne = (terms: unknown) => importCards({ ...FILE, workspaces: [{ name: '합성상사', kind: 'client', members: [{ ...HONG, terms }] }] }, { remember: false });
const seeded = (terms: Record<string, unknown>) => {
  const ws = createWorkspace('합성상사', 'client')!;
  upsertMember(ws, { ...HONG, terms });
  return ws;
};
const termsOf = () => getMembers(listWorkspaces()[0])[0].terms;

describe('번호 꼴 가리기', () => {
  it.each([
    ['빈칸으로 나뉜 주민번호', '900101 1234567'],
    ['점으로 나뉜 주민번호', '900101.1234567'],
    ['엔 대시', '900101–1234567'],
    ['이중 하이픈', '900101--1234567'],
    ['빈칸 낀 하이픈', '900101 - 1234567'],
    ['전각 숫자', '９００１０１-１２３４５６７'],
    ['빈칸 계좌', '110 123 456789'],
    ['빈칸 전화번호', '010 1234 5678'],
    ['하이픈 주민번호', '900101-1234567'],
    ['붙여 쓴 번호', '9001011234567'],
  ])('지운다: %s', (_label, value) => {
    expect(stripIdNumbers(value)).toBe('');
    expect(stripIdNumbers(`메모 ${value} 끝`)).toBe('메모  끝');
  });

  it.each([
    ['날짜', '2026-03-01'],
    ['점 날짜', '2026.03.01'],
    ['날짜 둘', '2026-03-01 2027-02-28'],
    ['붙여 쓴 날짜 둘', '20260301 20261231'],
    ['사업자등록번호', '123-45-67890'],
    ['금액', '2,600,000'],
    ['금액 둘', '2,600,000 3,000,000'],
    ['시각', '09:00 18:00'],
    ['숫자 나열', '10 20 30 40 50'],
    ['소수 나열', '1.5 2.5 3.5'],
    ['주소', '서울시 강남구 테헤란로 123 3층 101호'],
    ['직무', '홀 서비스'],
  ])('남긴다: %s', (_label, value) => {
    expect(stripIdNumbers(value)).toBe(value);
  });

  it('날짜 옆의 주민번호는 주민번호만 지운다', () => {
    expect(stripIdNumbers('2026-03-01 900101-1234567')).toBe('2026-03-01');
  });

  it('달력에 없는 앞 8자리는 날짜로 보지 않는다', () => {
    expect(stripIdNumbers('20261399 123456')).toBe('');
  });
});

describe('가져온 조건 칸 검증 — 틀린 칸은 있던 값을 덮지 않는다', () => {
  const GOOD = { monthlyTotal: '2,600,000', hourlyWage: '13,000', breakMinutes: '60', startDate: '2026-03-01', endDate: '2027-02-28', probationMonths: '3', overtimeHours: '10', holidayHours: '8', leaveHours: '4', holidayDaysPerYear: '5' };

  it.each([
    ['monthlyTotal', '몰라요'],
    ['monthlyTotal', '-1'],
    ['monthlyTotal', '10,500.5'],
    ['hourlyWage', 'abc'],
    ['hourlyWage', '-13,000'],
    ['breakMinutes', 'abc'],
    ['breakMinutes', '-60'],
    ['startDate', '2026-13-01'],
    ['startDate', '언젠가'],
    ['endDate', '2027-02-30'],
    ['probationMonths', '-1'],
    ['overtimeHours', '많이'],
    ['holidayHours', '1e3'],
    ['leaveHours', '0x10'],
    ['holidayDaysPerYear', 'x'],
  ])('%s = %s', (field, bad) => {
    seeded(GOOD);
    expect(importOne({ [field]: bad }).ok).toBe(true);
    expect(termsOf()).toEqual(GOOD);
  });

  it.each([
    ['rounding', 'floor'],
    ['absorbInto', 'bonus'],
    ['probation', 'maybe'],
    ['probationReduced', 'maybe'],
    ['simpleLabor', 'maybe'],
    ['absentWeekHoliday', 'maybe'],
  ])('선택지 밖 %s', (field, bad) => {
    const ws = seeded({ ...GOOD, rounding: 'ceil10', absorbInto: 'base', probation: 'yes', probationReduced: 'no', simpleLabor: 'no', absentWeekHoliday: 'keep' });
    const before = getMembers(ws)[0].terms;
    importOne({ [field]: bad });
    expect(termsOf()).toEqual(before);
  });

  it('맞는 칸은 받는다 — 새 칸 포함', () => {
    importOne({ ...GOOD, endDate: '2027-02-28', rounding: 'ceil100', probation: 'yes', absorbInto: 'overtime' });
    expect(termsOf()).toEqual({ ...GOOD, rounding: 'ceil100', probation: 'yes', absorbInto: 'overtime' });
  });

  it('제어문자를 지우고 너무 긴 글 칸은 받지 않는다', () => {
    seeded({ duty: '홀' });
    importOne({ duty: `주방${String.fromCharCode(0)}보조`, location: 'x'.repeat(5000) });
    expect(termsOf()).toEqual({ duty: '주방보조' });
  });
});

describe('가져올 때 이름을 손으로 넣을 때와 같이 정리한다', () => {
  it('㈜와 (주)를 같은 사업장으로 합친다', () => {
    createWorkspace('(주)합성가나', 'own');
    const r = importCards({ ...FILE, workspaces: [{ name: '㈜합성가나', kind: 'own', members: [] }] }, { remember: false });
    expect(r).toMatchObject({ ok: true, added: 0, merged: 1 });
    expect(listWorkspaces().map((w) => w.name)).toEqual(['(주)합성가나']);
  });

  it('손으로 만든 사업장 이름도 같은 정리를 거친다', () => {
    const ws = createWorkspace('㈜합성가나', 'own')!;
    expect(ws.name).toBe('(주)합성가나');
    renameWorkspace(ws.id, '㈜합성다라');
    expect(listWorkspaces()[0].name).toBe('(주)합성다라');
  });

  it('제어문자는 지우고, 너무 긴 이름은 건너뛴다', () => {
    const r = importCards({ ...FILE, workspaces: [{ name: `합성${String.fromCharCode(0)}나`, kind: 'own', ownerName: `합성${String.fromCharCode(7)}대표`, members: [{ name: `합성${String.fromCharCode(1)}직원`, hireDate: '2020-01-02' }] }, { name: 'x'.repeat(1_000_000), kind: 'own', members: [{ name: '합성숨은직원', hireDate: '2020-01-02' }] }] }, { remember: false });
    const [ws] = listWorkspaces();
    expect(ws.name).toBe('합성나');
    expect(getWorkspaceDetails(ws)).toEqual({ ownerName: '합성대표' });
    expect(getMembers(ws).map((m) => m.name)).toEqual(['합성직원']);
    expect(r).toMatchObject({ added: 1, skipped: 2 });
    expect(listWorkspaces()).toHaveLength(1);
  });

  it('너무 긴 이름은 손으로 넣어도 저장할 값으로 치지 않는다', () => {
    const c = cardFromState({ ...INITIAL, workplaceName: 'x'.repeat(101), employeeName: '합성', startDate: '2026-03-01' });
    expect(c.ok).toBe(false);
  });
});

describe('건너뛴 수와 파일 버전', () => {
  it('건너뛴 사업장의 직원도 건너뛴 수에 넣는다', () => {
    const r = importCards({ ...FILE, workspaces: [{ name: ' ', kind: 'own', members: [HONG, { name: '합성이', hireDate: '2020-01-01' }] }] }, { remember: false });
    expect(r).toMatchObject({ ok: true, skipped: 3 });
  });

  it('더 새 버전 파일은 카드 파일이 아니라고 하지 않는다', () => {
    const r = importCards({ ...FILE, version: 2, workspaces: [] }, { remember: false });
    expect(r).toEqual({ ok: false, added: 0, merged: 0, skipped: 0, problem: 'newer-version' });
    expect(cardImportMessage(r, false)).toBe(CARD_COPY.fileNewerVersion);
  });
});

describe('내보낸 파일은 다시 가져올 수 있다', () => {
  const FULL_TERMS = { startDate: '2026-03-01', endDate: '2027-02-28', probation: 'yes', probationMonths: '3', probationReduced: 'yes', simpleLabor: 'no', payType: 'monthly', amountMode: 'gross', monthlyTotal: '2,600,000', hourlyWage: '13,000', workDays: ['월', '화', '수', '목', '금'], start: '09:00', end: '18:00', breakMinutes: '60', weeklyRestDay: '일', holidayDaysPerYear: '5', overtimeHours: '10', holidayHours: '8', leaveHours: '4', rounding: 'ceil100', absorbInto: 'base', absentWeekHoliday: 'keep', duty: '홀 서비스 및 매장 관리', location: '합성테스트 본점 1층' };

  it('명부 상한까지 모든 조건을 채워도 내보낸 파일이 상한 안이고 다시 들어간다', () => {
    const ws = createWorkspace('합성대량', 'own', true)!;
    const members = Array.from({ length: CARD_FILE_MAX_MEMBERS }, (_, i) => ({ name: `합성근로자${i}`, hireDate: '2020-01-01', terms: FULL_TERMS }));
    localData.set(`work-patterns.leave.members.v1:${ws.id}`, JSON.stringify(members));
    const json = exportCardsJson();
    expect(json).not.toBeNull();
    const bytes = new TextEncoder().encode(json!).length;
    expect(bytes).toBeLessThanOrEqual(CARD_FILE_MAX_BYTES);
    expect(cardFileTooLarge(bytes)).toBe(false);
    localData.clear();
    sessionData.clear();
    expect(importCards(json!, { remember: true })).toMatchObject({ ok: true, added: 1, skipped: 0 });
    expect(getMembers(listWorkspaces()[0])).toHaveLength(CARD_FILE_MAX_MEMBERS);
  });

  it('내보내기는 들여쓰지 않는다', () => {
    createWorkspace('합성작은곳', 'own');
    const json = exportCardsJson(new Date('2026-01-01T00:00:00Z'));
    expect(json).toBe(JSON.stringify(exportCards(new Date('2026-01-01T00:00:00Z'))));
    expect(json).not.toContain('\n');
  });

  it('가져올 수 없는 크기면 파일을 만들지 않는다', () => {
    const ws = createWorkspace('합성초과', 'own', true)!;
    const huge = Array.from({ length: CARD_FILE_MAX_MEMBERS + 1 }, (_, i) => ({ name: `합성${i}`, hireDate: '2020-01-01' }));
    localData.set(`work-patterns.leave.members.v1:${ws.id}`, JSON.stringify(huge));
    expect(exportCardsJson()).toBeNull();
  });

  it('바이트로 잰다 — 한글이 많으면 글자 수가 상한 안이어도 넘는다', () => {
    const name = '가'.repeat(100);
    const members = Array.from({ length: Math.ceil(CARD_FILE_MAX_BYTES / 150) }, (_, i) => ({ name: `${name}${i}`.slice(0, 100), hireDate: '2020-01-01' }));
    const text = JSON.stringify({ ...FILE, workspaces: [{ name: '합성', kind: 'own', members }] });
    expect(text.length).toBeLessThan(CARD_FILE_MAX_BYTES);
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(CARD_FILE_MAX_BYTES);
    expect(importCards(text, { remember: false })).toMatchObject({ ok: false, problem: 'too-large' });
  });
});

describe('화면 문구 연결', () => {
  it('파일 크기 — 상한까지 받고 넘으면 멈춘다', () => {
    expect(cardFileTooLarge(CARD_FILE_MAX_BYTES)).toBe(false);
    expect(cardFileTooLarge(CARD_FILE_MAX_BYTES + 1)).toBe(true);
  });

  it('실패 이유마다 다른 문구', () => {
    const failed = (problem?: 'too-large' | 'storage' | 'newer-version') => cardImportMessage({ ok: false, added: 0, merged: 0, skipped: 0, ...(problem ? { problem } : {}) }, false);
    expect(failed('too-large')).toBe(CARD_COPY.fileTooLarge);
    expect(failed('storage')).toBe(CARD_COPY.fileStorageFailed);
    expect(failed('newer-version')).toBe(CARD_COPY.fileNewerVersion);
    expect(failed()).toBe(CARD_COPY.fileInvalid);
  });

  it('성공 — 파일 값이 앞선다고 말하고, 기억하기를 껐으면 이 탭에서만 남는다고 말한다', () => {
    const msg = cardImportMessage({ ok: true, added: 1, merged: 2, skipped: 0 }, false);
    expect(msg).toContain(CARD_COPY.fileResult(1, 2));
    expect(msg).toContain(CARD_COPY.fileValuesWin);
    expect(msg).toContain(CARD_COPY.fileTabOnly);
  });

  it('성공 — 기억하기를 켰으면 탭 문구가 없고, 건너뛴 수가 있으면 말한다', () => {
    const msg = cardImportMessage({ ok: true, added: 1, merged: 0, skipped: 3 }, true);
    expect(msg).not.toContain(CARD_COPY.fileTabOnly);
    expect(msg).toContain(CARD_COPY.fileSkipped(3));
  });

  it('전부 지우기 확인 문구가 최근 입력까지 지운다고 말한다', () => {
    expect(FORGET_ALL_CONFIRM).toContain('최근 입력');
    expect(FORGET_ALL_CONFIRM).toContain('사업장');
  });
});

describe('목록이 깨진 뒤 가져와도 숨은 명부 키가 남지 않는다', () => {
  it('옛 명부 키를 지우고 가져온 사업장의 키만 남긴다', () => {
    const old = createWorkspace('합성옛곳', 'own', true)!;
    upsertMember(old, { name: '합성옛직원', hireDate: '2020-01-02' });
    localData.set('work-patterns.leave.workspaces.v1', '[[[깨짐');
    expect(importCards({ ...FILE, workspaces: [{ name: '합성새곳', kind: 'own', members: [HONG] }] }, { remember: true }).ok).toBe(true);
    expect([...localData.values()].join('\n')).not.toContain('합성옛직원');
    expect(getMembers(listWorkspaces()[0]).map((m) => m.name)).toEqual([HONG.name]);
  });
});
