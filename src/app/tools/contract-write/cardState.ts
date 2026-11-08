// 사업장 카드 ↔ 근로계약서 작성 입력 — 순수 TS(시험이 tsx 를 import 하지 않게 컴포넌트와 나눈다).
// 카드 = 연차 도구의 사업장·명부(leave-workspaces)를 그대로 쓴다. 저장 정책도 같다(기본 sessionStorage, 「기억하기」를 켜면 localStorage).
// 🔒 서버로 보내는 코드가 없다(시험으로 고정). 주민번호·주소·연락처·계좌는 카드 칸이 없어 저장되지 않는다.

import {
  createWorkspace,
  getMembers,
  getWorkspaceDetails,
  listWorkspaces,
  pickTerms,
  updateWorkspace,
  upsertMember,
  type Workspace,
  type WorkspaceDetails,
  type WorkspaceMember,
} from '@/lib/leave/leave-workspaces';
import { cleanInput } from '@/lib/contract-write/text';

import { INITIAL, type WriteState } from './formState';

/** 카드 영역 화면 문구 — 금지어 시험이 여기를 본다 */
export const CARD_COPY = {
  summary: '사업장 카드에서 불러오기 (선택)',
  intro: '사업장과 직원의 계약 조건을 이 브라우저에 카드로 두고 다음에 다시 불러옵니다. 가입이 없고 서버로 보내지 않습니다. 주민등록번호·주소·연락처·계좌는 카드에 담지 않습니다.',
  empty: '저장한 카드가 없습니다. 아래 칸을 채운 뒤 「이 근로자를 카드에 저장」을 누르면 카드가 생깁니다.',
  pickWorkspace: '불러올 사업장',
  pickWorkspaceNone: '사업장 고르기',
  pickMember: '불러올 직원',
  pickMemberNone: '직원 고르기',
  noMembers: '이 카드에 저장한 직원이 없습니다.',
  save: '이 근로자를 카드에 저장',
  saved: (workspace: string, employee: string) => `「${workspace}」 카드에 ${employee} 님의 계약 조건을 저장했습니다.`,
  saveFailed: '저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 저장이 막혀 있습니다. 브라우저 설정을 확인해 주세요.',
  fivePlusUnknown: '이 카드에는 5명 이상 여부가 없어 「5명 이상」으로 돌렸습니다. 사업장에 맞게 골라 주세요.',
  fivePlusKept: '5명 이상 여부는 카드에 있던 값을 그대로 두었습니다. 바꾸려면 위에서 이 사업장을 고른 뒤 저장해 주세요.',
  rememberFailed: '옮기지 못해 기억하기 설정을 바꾸지 않았습니다. 저장된 내용은 그대로입니다. 브라우저 저장 공간을 확인해 주세요.',
  remember: (workspace: string) => `이 브라우저에 「${workspace}」 카드를 기억하기`,
  rememberOff: '이 탭을 닫으면 대표자·직원 정보가 사라집니다. 사업장 이름과 5명 이상 여부만 이 브라우저에 남습니다.',
  rememberOn: '이 브라우저에만 남습니다. 서버로 보내지 않습니다.',
  pageNotice: '입력한 내용은 이 브라우저 안에서만 계산하고 파일로 만듭니다. 서버로 보내지 않습니다. 사업장 카드에 저장한 내용만 이 브라우저에 남습니다.',
} as const;

/** 직원을 바꿔도 남는 칸 — 사업장 칸과 문서·지급 관행 칸. 나머지는 전부 직원 칸이라 WriteState 에 칸이 늘면 저절로 비워진다 */
const NOT_EMPLOYEE_KEYS = ['workplaceName', 'ownerName', 'fivePlus', 'writtenDate', 'payday', 'paymentMethod'] as const satisfies readonly (keyof WriteState)[];

function blankEmployee(): Partial<WriteState> {
  const blank: Partial<WriteState> = { ...INITIAL, workDays: [...INITIAL.workDays] };
  for (const k of NOT_EMPLOYEE_KEYS) delete blank[k];
  return blank;
}

/**
 * 카드에서 채울 칸 — 카드에 없는 칸은 처음 값으로 돌린다. 앞 사업장·앞 직원 값이 다른 사람 계약서로 넘어가면 안 된다.
 * 작성일(writtenDate)·지급일·지급방법은 채우지도 비우지도 않는다.
 * 대표자는 사업장 목록이 아니라 details(getWorkspaceDetails)에 있어 따로 받는다.
 * clearEmployee = 카드에서 불러온 직원이 화면에 남아 있어 사업장을 옮길 때 그 직원 칸을 함께 비운다.
 */
export function cardPatch(
  ws: Workspace | null,
  member: WorkspaceMember | null,
  details: WorkspaceDetails = {},
  { clearEmployee = false }: { clearEmployee?: boolean } = {},
): Partial<WriteState> {
  const p: Partial<WriteState> = clearEmployee || member ? blankEmployee() : {};
  if (ws) {
    p.workplaceName = ws.name;
    p.ownerName = details.ownerName ?? INITIAL.ownerName;
    p.fivePlus = ws.fivePlus ?? INITIAL.fivePlus;
  }
  if (member) {
    p.employeeName = member.name;
    p.startDate = member.hireDate;
    // 카드 조건 칸의 이름·타입이 WriteState 와 어긋나면 이 대입에서 tsc 가 멈춘다
    const terms: Partial<WriteState> = pickTerms(member.terms);
    Object.assign(p, terms);
  }
  return p;
}

export function applyCardToState(state: WriteState, ws: Workspace | null, member: WorkspaceMember | null, details: WorkspaceDetails = {}): WriteState {
  return { ...state, ...cardPatch(ws, member, details) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CardFromState =
  | { ok: true; workplaceName: string; ownerName: string; fivePlus: WriteState['fivePlus']; member: WorkspaceMember }
  | { ok: false; reason: string };

/** 지금 입력에서 카드에 넣을 값 — 사업체명·근로자 성명·계약 시작일이 있어야 한다 */
export function cardFromState(state: WriteState): CardFromState {
  const workplaceName = cleanInput(state.workplaceName);
  const employeeName = cleanInput(state.employeeName);
  const missing: string[] = [];
  if (!workplaceName) missing.push('사업체명');
  if (!employeeName) missing.push('근로자 성명');
  if (!DATE.test(state.startDate)) missing.push('계약 시작일');
  if (missing.length) return { ok: false, reason: `저장하려면 넣어 주세요: ${missing.join(', ')}` };
  return {
    ok: true,
    workplaceName,
    ownerName: cleanInput(state.ownerName),
    fivePlus: state.fivePlus,
    member: { name: employeeName, hireDate: state.startDate, terms: pickTerms(state) },
  };
}

export type SaveResult = { ok: true; workspace: Workspace; message: string } | { ok: false; reason: string };

/**
 * 「이 근로자를 카드에 저장」. 넣을 카드 = 고른 카드(이름이 사업체명과 같을 때) → 같은 이름의 카드 → 새 카드(기억하기 꺼짐).
 * 이름은 입력 칸과 같은 정리(㈜ → (주))를 거쳐 맞춘다.
 * 대표자는 넣었을 때만 바꾼다(비워 두고 저장해도 카드의 대표자를 지우지 않는다).
 * 5명 이상 여부는 고른 카드이거나 값이 없는 카드에만 쓴다 — 고르지 않았으면 화면 값은 고른 값이 아니라 기본값일 수 있다.
 * 저장소에서 다시 읽어 맞는지 본 뒤에만 저장했다고 말한다.
 */
export function saveCardFromState(state: WriteState, selectedId: string | null): SaveResult {
  const card = cardFromState(state);
  if (!card.ok) return card;
  const all = listWorkspaces();
  const sameName = (w: Workspace) => cleanInput(w.name) === card.workplaceName;
  const selected = all.find((w) => w.id === selectedId && sameName(w));
  const target = selected ?? all.find(sameName) ?? createWorkspace(card.workplaceName, 'own', false);
  if (!target) return { ok: false, reason: CARD_COPY.saveFailed };
  const fivePlus = selected || !target.fivePlus ? card.fivePlus : undefined;
  updateWorkspace(target.id, { ...(card.ownerName ? { ownerName: card.ownerName } : {}), ...(fivePlus ? { fivePlus } : {}) });
  const expected = upsertMember(target, card.member);
  const stored = listWorkspaces().find((w) => w.id === target.id);
  const saved =
    stored !== undefined &&
    JSON.stringify(getMembers(stored)) === JSON.stringify(expected) &&
    (!card.ownerName || getWorkspaceDetails(stored).ownerName === card.ownerName) &&
    (!fivePlus || stored.fivePlus === fivePlus);
  if (!saved) return { ok: false, reason: CARD_COPY.saveFailed };
  const keptFivePlus = !fivePlus && target.fivePlus !== card.fivePlus ? ` ${CARD_COPY.fivePlusKept}` : '';
  return { ok: true, workspace: target, message: `${CARD_COPY.saved(target.name, card.member.name)}${keptFivePlus}` };
}
