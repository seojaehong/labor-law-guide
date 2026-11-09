// 사업장 카드 ↔ 근로계약서 작성 입력 — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 카드 = 연차 도구의 사업장·명부(leave-workspaces)를 그대로 쓴다. 저장 정책도 같다(기본 sessionStorage, 「기억하기」를 켜면 localStorage).
// 🔒 서버로 보내는 코드가 없다(시험으로 고정). 주민번호·집 주소·연락처·계좌는 카드 칸이 없어 저장되지 않는다.

import {
  createWorkspace,
  getMembers,
  getWorkspaceDetails,
  listWorkspaces,
  memberKey,
  pickTerms,
  cleanCardName,
  CARD_FILE_MAX_BYTES,
  type CardImportResult,
  updateWorkspace,
  upsertMember,
  type Workspace,
  type WorkspaceDetails,
  type WorkspaceMember,
} from '@/lib/leave/leave-workspaces';
import { cleanInput } from '@/lib/contract-write/text';

import { INITIAL, isRealDate, type WriteState } from './formState';

/** 카드 영역 화면 문구 — 금지어 시험이 여기를 본다 */
export const CARD_COPY = {
  summary: '사업장 카드에서 불러오기 (선택)',
  intro: '사업장과 직원의 계약 조건을 이 브라우저에 카드로 두고 다음에 다시 불러옵니다. 가입이 없고 서버로 보내지 않습니다. 근무장소는 계약 조건으로 저장합니다. 주민등록번호·집 주소·연락처·계좌는 칸이 없어 담기지 않습니다. 실수령액·공제대상가족 수·작성일은 저장하지 않으니 불러온 뒤 확인해 주세요.',
  empty: '저장한 카드가 없습니다. 아래 칸을 채운 뒤 「이 근로자를 카드에 저장」을 누르면 카드가 생깁니다.',
  pickWorkspace: '불러올 사업장',
  pickWorkspaceNone: '사업장 고르기',
  pickMember: '불러올 직원',
  pickMemberNone: '직원 고르기',
  noMembers: '이 카드에 저장한 직원이 없습니다.',
  save: '이 근로자를 카드에 저장',
  saved: (workspace: string, employee: string) => `「${workspace}」 카드에 ${employee} 님의 계약 조건을 저장했습니다.`,
  saveFailed: '저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 저장이 막혀 있습니다. 브라우저 설정을 확인해 주세요.',
  conflict: (employee: string, start: string) =>
    `${employee} 님(${start})은 이미 다른 계약 조건으로 저장돼 있어 덮어쓰지 않았습니다. 같은 사람을 고치려면 위 「불러올 직원」에서 고른 뒤 저장해 주세요. 다른 사람이면 이름을 구분해 저장해 주세요.`,
  sameNameAdded: '이름이 같은 직원이 이미 있어 새 줄로 저장했습니다. 같은 사람의 재계약이면 위 「불러올 직원」에서 고른 뒤 저장해 주세요.',
  netNotStored: '실수령액과 공제대상가족 수는 저장하지 않았습니다. 불러온 뒤 다시 넣어 주세요.',
  startFromHire: (hireDate: string) => `이 직원은 저장된 계약 시작일이 없어 입사일(${hireDate})로 채웠습니다. 재계약이면 계약 시작일을 고쳐 주세요.`,
  hireFromStart: (start: string) => `입사일은 계약 시작일(${start})로 기록했습니다. 실제 입사일이 다르면 연차 도구의 직원 명부에서 고칠 수 있습니다.`,
  employeeCleared: '사업장을 바꾸면서 앞 직원의 칸을 비웠습니다. 불러온 뒤 직접 고친 값도 함께 비워졌으니 직원을 다시 고르거나 새로 넣어 주세요.',
  fivePlusUnknown:'이 카드에는 5명 이상 여부가 없어 앞 카드의 값을 「5명 이상」으로 돌렸습니다. 사업장에 맞게 골라 주세요.',
  fivePlusAsIs: '이 카드에는 5명 이상 여부가 없어 화면의 값을 그대로 두었습니다. 사업장에 맞는지 확인해 주세요.',
  fivePlusKept: '5명 이상 여부는 카드에 있던 값을 그대로 두었습니다. 바꾸려면 위에서 이 사업장을 고른 뒤 저장해 주세요.',
  rememberFailed: '옮기지 못해 기억하기 설정을 바꾸지 않았습니다. 저장된 내용은 그대로입니다. 브라우저 저장 공간을 확인해 주세요.',
  remember: (workspace: string) => `이 브라우저에 「${workspace}」 카드를 기억하기`,
  rememberOff: '이 탭을 닫으면 대표자·직원 정보가 사라집니다. 사업장 이름과 5명 이상 여부만 이 브라우저에 남습니다.',
  rememberOn: '이 브라우저에만 남습니다. 서버로 보내지 않습니다.',
  pageNotice: '입력한 내용은 이 브라우저 안에서만 계산하고 파일로 만듭니다. 서버로 보내지 않습니다. 사업장 카드의 대표자·직원 정보와 최근 입력은 탭을 닫으면 사라지고, 기억하기를 켜면 이 브라우저에 남습니다. 사업장 이름과 5명 이상 여부는 이 브라우저에 남습니다.',
  // 카드 파일(내보내기·가져오기)
  fileExport: '카드 파일로 내보내기',
  fileImport: '카드 파일 가져오기',
  fileRemember: '가져온 카드를 이 브라우저에 기억하기',
  fileNotice: '파일에는 대표자·직원 이름과 계약 조건이 들어 있습니다. 보관·전달에 주의하세요.',
  fileResult: (added: number, merged: number) => `사업장 ${added}곳을 더하고 ${merged}곳을 합쳤습니다.`,
  fileValuesWin: '이미 있던 직원은 파일에 값이 있는 칸을 파일 값으로 바꿨습니다.',
  fileTabOnly: '기억하기를 켜지 않아, 새로 더한 사업장의 대표자·직원 정보는 이 탭을 닫으면 사라집니다.',
  fileSkipped: (skipped: number) => `형식이 맞지 않는 사업장·직원 ${skipped}건은 건너뛰었습니다.`,
  fileInvalid: '사업장 카드 파일이 아닙니다. 「카드 파일로 내보내기」로 만든 파일을 골라 주세요.',
  fileNewerVersion: '이 화면보다 새 버전에서 만든 카드 파일입니다. 페이지를 새로고침한 뒤 다시 가져와 주세요.',
  fileExportTooLarge: '카드가 너무 많아 파일 하나로 내보낼 수 없습니다. 사업장 200곳·직원 5,000명·4MB 이하로 줄인 뒤 다시 내보내 주세요.',
  fileMergeNotice: '이미 있는 사업장에 합칠 때는 그 사업장의 기억하기 설정을 따릅니다. 기억하기를 켠 사업장에 합치면 이 브라우저에 남습니다.',
  fileTooLarge: '파일이 너무 큽니다. 사업장 200곳·직원 5,000명·4MB 이하로 나누어 가져와 주세요.',
  fileStorageFailed: '브라우저 저장 공간이 가득 찼거나 저장이 막혀 있어 가져오지 못했습니다. 아무것도 바뀌지 않았습니다.',
  fileReadError: '파일을 읽지 못했습니다. 다시 골라 주세요.',
} as const;

/** 고른 파일을 읽기 전에 멈출 크기 */
export const cardFileTooLarge = (bytes: number): boolean => bytes > CARD_FILE_MAX_BYTES;

/** 가져오기 결과를 화면 문구로 */
export function cardImportMessage(r: CardImportResult, remember: boolean): string {
  if (!r.ok) {
    if (r.problem === 'too-large') return CARD_COPY.fileTooLarge;
    if (r.problem === 'storage') return CARD_COPY.fileStorageFailed;
    if (r.problem === 'newer-version') return CARD_COPY.fileNewerVersion;
    return CARD_COPY.fileInvalid;
  }
  return [
    CARD_COPY.fileResult(r.added, r.merged),
    r.merged ? CARD_COPY.fileValuesWin : '',
    r.added && !remember ? CARD_COPY.fileTabOnly : '',
    r.skipped ? CARD_COPY.fileSkipped(r.skipped) : '',
  ].filter(Boolean).join(' ');
}

/** 내보낼 카드 파일 이름 — today 는 KST YYYY-MM-DD(todayKst) */
export function cardFileName(today: string): string {
  return `사업장카드_${today.replace(/-/g, '')}.json`;
}

/** 직원을 바꿔도 남는 칸 — 사업장 칸과 작성일. 나머지는 전부 직원 칸이라 WriteState 에 칸이 늘면 저절로 비워진다 */
const NOT_EMPLOYEE_KEYS = ['workplaceName', 'ownerName', 'fivePlus', 'writtenDate'] as const satisfies readonly (keyof WriteState)[];

function blankEmployee(): Partial<WriteState> {
  const blank: Partial<WriteState> = { ...INITIAL, workDays: [...INITIAL.workDays] };
  for (const k of NOT_EMPLOYEE_KEYS) delete blank[k];
  return blank;
}

/**
 * 카드에서 채울 칸 — 카드에 없는 칸은 처음 값으로 돌린다. 앞 사업장·앞 직원 값이 다른 사람 계약서로 넘어가면 안 된다.
 * 작성일(writtenDate)은 채우지도 비우지도 않는다. 옛 형식 카드의 지급일·지급방법은 없는 칸이라 처음 값으로 돌아간다.
 * 대표자는 사업장 목록이 아니라 details(getWorkspaceDetails)에 있어 따로 받는다.
 * 계약 시작일은 저장한 조건에서 읽고, 조건에 없을 때만(옛 형식·연차 명부만 있는 사람) 입사일로 채운다.
 * clearEmployee = 카드에서 불러온 직원이 화면에 남아 있어 사업장을 옮길 때 그 직원 칸을 함께 비운다.
 * resetFivePlus = 5명 이상 여부가 없는 카드라도 화면 값이 앞 카드에서 온 것이면 처음 값으로 돌린다. 이용자가 고른 값은 두지 않으면 뒤집힌다.
 */
export function cardPatch(
  ws: Workspace | null,
  member: WorkspaceMember | null,
  details: WorkspaceDetails = {},
  { clearEmployee = false, resetFivePlus = false }: { clearEmployee?: boolean; resetFivePlus?: boolean } = {},
): Partial<WriteState> {
  const p: Partial<WriteState> = clearEmployee || member ? blankEmployee() : {};
  if (ws) {
    p.workplaceName = ws.name;
    p.ownerName = details.ownerName ?? INITIAL.ownerName;
    if (ws.fivePlus || resetFivePlus) p.fivePlus = ws.fivePlus ?? INITIAL.fivePlus;
  }
  if (member) {
    p.employeeName = member.name;
    // 카드 조건 칸의 이름·타입이 WriteState 와 어긋나면 이 대입에서 tsc 가 멈춘다
    const terms: Partial<WriteState> = pickTerms(member.terms);
    Object.assign(p, terms);
    p.startDate = terms.startDate || member.hireDate;
  }
  return p;
}

export function applyCardToState(state: WriteState, ws: Workspace | null, member: WorkspaceMember | null, details: WorkspaceDetails = {}): WriteState {
  return { ...state, ...cardPatch(ws, member, details) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 입력 칸 중 카드에서 온 값. 사업장을 옮길 때 이 값이 하나라도 화면에 남아 있으면 직접 고친 칸까지 직원 칸 전체를 비우고 알린다 */
export type CardOrigin = { fivePlus: WriteState['fivePlus'] | null; employee: Partial<WriteState> | null };
export const NO_ORIGIN: CardOrigin = { fivePlus: null, employee: null };

export type CardChange = { patch: Partial<WriteState>; origin: CardOrigin; notice: string | null };

/** 카드에서 온 직원 값이 화면에 하나라도 남아 있는가 — 처음 값과 같은 칸은 카드에서 왔다는 근거가 못 된다 */
function holdsCardEmployee(state: WriteState, employee: Partial<WriteState> | null): boolean {
  if (!employee) return false;
  return (Object.keys(employee) as (keyof WriteState)[]).some((k) => !same(employee[k], INITIAL[k]) && same(employee[k], state[k]));
}

export function selectWorkspace(state: WriteState, ws: Workspace, details: WorkspaceDetails, origin: CardOrigin): CardChange {
  const resetFivePlus = origin.fivePlus !== null && origin.fivePlus === state.fivePlus;
  const clearEmployee = holdsCardEmployee(state, origin.employee);
  const patch = cardPatch(ws, null, details, { clearEmployee, resetFivePlus });
  const notes = [
    clearEmployee ? CARD_COPY.employeeCleared : '',
    ws.fivePlus ? '' : resetFivePlus ? CARD_COPY.fivePlusUnknown : CARD_COPY.fivePlusAsIs,
  ];
  return {
    patch,
    origin: { fivePlus: ws.fivePlus ?? null, employee: null },
    notice: notes.filter(Boolean).join(' ') || null,
  };
}

export function selectMember(member: WorkspaceMember, origin: CardOrigin = NO_ORIGIN): CardChange {
  const patch = cardPatch(null, member);
  return { patch, origin: { ...origin, employee: patch }, notice: member.terms?.startDate ? null : CARD_COPY.startFromHire(member.hireDate) };
}

/** 저장한 뒤의 화면 값은 그 카드의 값이다 — 다음 사업장으로 넘어가면 안 된다 */
export function originAfterSave(state: WriteState): CardOrigin {
  const employee: Partial<WriteState> = { ...state };
  for (const k of NOT_EMPLOYEE_KEYS) delete employee[k];
  return { fivePlus: state.fivePlus, employee };
}

export type CardFromState =
  | { ok: true; workplaceName: string; ownerName: string; fivePlus: WriteState['fivePlus']; member: WorkspaceMember }
  | { ok: false; reason: string };

/** 지금 입력에서 카드에 넣을 값 — 사업체명·근로자 성명·계약 시작일이 있어야 한다 */
export function cardFromState(state: WriteState): CardFromState {
  const workplaceName = cleanCardName(state.workplaceName);
  const employeeName = cleanCardName(state.employeeName);
  const missing: string[] = [];
  if (!workplaceName) missing.push('사업체명');
  if (!employeeName) missing.push('근로자 성명');
  if (!isRealDate(state.startDate)) missing.push('계약 시작일');
  if (missing.length) return { ok: false, reason: `저장하려면 넣어 주세요: ${missing.join(', ')}` };
  return {
    ok: true,
    workplaceName,
    ownerName: cleanCardName(state.ownerName),
    fivePlus: state.fivePlus,
    member: { name: employeeName, hireDate: state.startDate, terms: pickTerms(state) },
  };
}

export type SaveResult =
  | { ok: true; workspace: Workspace; memberKey: string; message: string }
  | { ok: false; kind: 'invalid' | 'storage' | 'conflict'; reason: string };

/**
 * 「이 근로자를 카드에 저장」. 넣을 카드 = 고른 카드(이름이 사업체명과 같을 때) → 같은 이름의 카드 → 새 카드(기억하기 꺼짐).
 * 이름은 입력 칸과 같은 정리(㈜ → (주))를 거쳐 맞춘다.
 * 대표자는 넣었을 때만 바꾼다(비워 두고 저장해도 카드의 대표자를 지우지 않는다).
 * 5명 이상 여부는 고른 카드이거나 값이 없는 카드에만 쓴다 — 고르지 않았으면 화면 값은 고른 값이 아니라 기본값일 수 있다.
 * 명부에서 고른 사람(pickedKey, 이름이 같을 때)은 입사일을 지키고 조건만 바꾼다. 새 사람은 입사일 = 계약 시작일이고 그렇게 적었다고 알린다.
 * 고르지 않았는데 같은 사람으로 보이는 줄의 조건이 다르면 아무것도 쓰지 않고 conflict 를 돌려준다.
 * 저장소에서 다시 읽어 맞는지 본 뒤에만 저장했다고 말한다.
 */
export function saveCardFromState(state: WriteState, selectedId: string | null, pickedKey: string | null = null): SaveResult {
  const card = cardFromState(state);
  if (!card.ok) return { ok: false, kind: 'invalid', reason: card.reason };
  const all = listWorkspaces();
  const sameName = (w: Workspace) => cleanInput(w.name) === card.workplaceName;
  const selected = all.find((w) => w.id === selectedId && sameName(w));
  const existing = selected ?? all.find(sameName) ?? null;
  const roster = getMembers(existing);
  const sameEmployee = (m: WorkspaceMember) => cleanInput(m.name) === card.member.name;
  const picked = selected && pickedKey ? roster.find((m) => memberKey(m) === pickedKey && sameEmployee(m)) : undefined;
  const person = picked ?? roster.find((m) => sameEmployee(m) && (m.hireDate === state.startDate || m.terms?.startDate === state.startDate));
  const member = person ? { ...card.member, name: person.name, hireDate: person.hireDate } : card.member;
  if (!picked && person?.terms && !same(cardPatch(null, person), cardPatch(null, member))) {
    return { ok: false, kind: 'conflict', reason: CARD_COPY.conflict(card.member.name, state.startDate) };
  }
  const target = existing ?? createWorkspace(card.workplaceName, 'own', false);
  if (!target) return { ok: false, kind: 'storage', reason: CARD_COPY.saveFailed };
  const fivePlus = selected || !target.fivePlus ? card.fivePlus : undefined;
  updateWorkspace(target.id, { ...(card.ownerName ? { ownerName: card.ownerName } : {}), ...(fivePlus ? { fivePlus } : {}) });
  const expected = upsertMember(target, member);
  const stored = listWorkspaces().find((w) => w.id === target.id);
  const saved =
    stored !== undefined &&
    same(getMembers(stored), expected) &&
    (!card.ownerName || getWorkspaceDetails(stored).ownerName === card.ownerName) &&
    (!fivePlus || stored.fivePlus === fivePlus);
  if (!saved) return { ok: false, kind: 'storage', reason: CARD_COPY.saveFailed };
  const notes = [
    !fivePlus && target.fivePlus !== card.fivePlus ? CARD_COPY.fivePlusKept : '',
    !person && roster.some(sameEmployee) ? CARD_COPY.sameNameAdded : '',
    !person ? CARD_COPY.hireFromStart(state.startDate) : '',
    state.amountMode === 'net' ? CARD_COPY.netNotStored : '',
  ];
  return { ok: true, workspace: target, memberKey: memberKey(member), message: [CARD_COPY.saved(target.name, card.member.name), ...notes].filter(Boolean).join(' ') };
}
