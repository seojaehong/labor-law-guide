/**
 * 사업장 — 노무사는 **자문사를 여러 개** 관리하고, 회사 담당자는 **우리 회사** 하나다.
 *
 * 왜 필요한가: 이 도구는 두 갈래 미끼다.
 *   노무사 → 자문사를 사업장으로 만들어 관리 (사무소 업무자동화·급여프로그램으로 이어짐)
 *   인사담당자 → 우리 회사 하나 (자문으로 이어짐)
 * 그런데 그전에는 명부가 탭을 닫으면 사라져서, 매번 엑셀을 다시 올려야 했다.
 * 그건 「사업장에서 진행」이 아니다.
 *
 * ★ 개인정보를 어디에 둘지는 **사업장마다 사용자가 직접 고른다.**
 *   `remember: false` (기본) → sessionStorage. 탭을 닫으면 사라진다
 *   `remember: true`        → localStorage. 그 브라우저에 남는다
 *   자문사를 계속 관리하는 노무사는 켤 것이고, 한 번 계산해보는 사람은 켜지 않는다.
 *   내가 「브라우저에 남겨도 되나」를 대신 결정하지 않는다. 공용 PC 사정은 쓰는 사람이 안다.
 *
 * ★ 서버로는 어떤 경우에도 나가지 않는다. 전송 코드가 없다(테스트로 고정).
 */

export const WORKSPACES_CHANGED = "work-patterns:leave-workspaces-changed";

const INDEX_KEY = "work-patterns.leave.workspaces.v1";
const ACTIVE_KEY = "work-patterns.leave.workspace.active.v1";
/** 목록이 손상된 적이 있다는 표시 — 사람 정보가 없다 */
const INDEX_DAMAGED_KEY = "work-patterns.leave.workspaces.damaged.v1";
const MEMBERS_PREFIX = "work-patterns.leave.members.v1:";
/** 사업장 대표자 등 — 명부와 같은 저장소 */
const DETAILS_PREFIX = "work-patterns.leave.details.v1:";
/** 사용자가 노무사인지 회사 담당자인지 — 다음 안내가 갈린다 */
const AUDIENCE_KEY = "work-patterns.leave.audience.v1";

export type Audience = "advisor" | "employer";
export type WorkspaceKind = "client" | "own";

export type Workspace = {
  id: string;
  name: string;
  /** client = 자문사, own = 우리 회사 */
  kind: WorkspaceKind;
  /** 이 브라우저에 남길지 — 사용자가 켠다 */
  remember: boolean;
  /** 상시 근로자 5명 이상 — 사람 정보가 아니라 목록에 둔다 */
  fivePlus?: "yes" | "no";
};

/** 사업장의 사람 정보(대표자) — 목록이 아니라 명부와 같은 저장소(remember 를 따름)에 둔다 */
export type WorkspaceDetails = {
  ownerName?: string;
};

const TERM_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
type TermDay = (typeof TERM_DAYS)[number];
const isTermDay = (v: unknown): v is TermDay => typeof v === "string" && (TERM_DAYS as readonly string[]).includes(v);

/** 계약서에 쓰는 글자 칸. startDate = 이 계약의 시작일(입사일 hireDate 와 다를 수 있다) */
const TERM_TEXT = [
  "startDate", "endDate", "probationMonths", "monthlyTotal", "hourlyWage", "start", "end", "breakMinutes",
  "holidayDaysPerYear", "overtimeHours", "holidayHours", "leaveHours", "duty", "location", "payday", "paymentMethod",
] as const;

/** 정해진 값만 받는 칸 */
const TERM_CHOICES = {
  payType: ["monthly", "hourly"],
  amountMode: ["gross", "net"],
  probation: ["none", "yes"],
  probationReduced: ["no", "yes"],
  simpleLabor: ["no", "yes"],
  absentWeekHoliday: ["deduct", "keep"],
  rounding: ["won", "ceil10", "ceil100"],
  absorbInto: ["base", "weeklyHoliday", "overtime", "night", "holiday", "leave"],
} as const;

/**
 * 근로자에 딸린 계약 조건 — 근로계약서 작성 입력(WriteState)의 같은 이름 칸만.
 * 이 모듈은 계약서 쪽을 import 하지 않는다(연차 화면 번들에 섞이지 않게). 칸 이름·타입·선택지가 맞는지는 시험이 고정한다.
 * 실수령액·공제대상가족 수는 담지 않는다. 불러온 뒤 다시 넣는다.
 */
export type MemberTerms = { [K in (typeof TERM_TEXT)[number]]?: string } & { [K in keyof typeof TERM_CHOICES]?: (typeof TERM_CHOICES)[K][number] } & {
  workDays?: string[];
  weeklyRestDay?: TermDay;
};

export type WorkspaceMember = {
  name: string;
  /** YYYY-MM-DD */
  hireDate: string;
  /** 계약 조건 — 사업장 카드에 저장했을 때만 있다 */
  terms?: MemberTerms;
};

// ── 저장소 고르기 ─────────────────────────────────────────────
function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
function local(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
/**
 * 사업장 목록·활성 선택·역할은 항상 localStorage — 사람 정보가 없다.
 * 사업장 이름·5명 이상 여부만 있다. 대표자(details)와 직원 이름·입사일·계약 조건(명부)은 remember 를 따르는 저장소에만 있다.
 */
function meta(): Storage | null {
  return local();
}
function membersStore(ws: Workspace): Storage | null {
  return ws.remember ? local() : session();
}

function read<T>(store: Storage | null, key: string, fallback: T): T {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
/** 썼으면 true. 저장소가 막혔거나 용량 초과면 false */
function write(store: Storage | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function storedKeys(store: Storage | null): string[] {
  if (!store) return [];
  return Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k) => k !== null);
}
function removeKeys(store: Storage | null, matches: (key: string) => boolean): void {
  if (!store) return;
  try {
    for (const k of storedKeys(store)) if (matches(k)) store.removeItem(k);
  } catch { /* 무시 */ }
}
/** 사업장별 저장 키 — 목록에 없는 id 의 키는 화면에서 볼 수도 지울 수도 없다 */
const PER_WORKSPACE = [MEMBERS_PREFIX, DETAILS_PREFIX];
const isPerWorkspaceKey = (key: string) => PER_WORKSPACE.some((p) => key.startsWith(p));

/**
 * 저장된 목록이 명부 키의 주인을 다 말해 주는가 — 읽히는 배열이고 버려진 항목이 없어야 한다.
 * 목록 키가 없으면 명부 키도 없어야 온전하다(처음 쓰는 브라우저). 정상 경로의 삭제는 빈 배열을 남기고 키를 없애지 않는다.
 */
function indexIntact(): boolean {
  try {
    const text = meta()?.getItem(INDEX_KEY);
    if (text === null || text === undefined) return ![session(), local()].some((s) => storedKeys(s).some(isPerWorkspaceKey));
    const raw: unknown = JSON.parse(text);
    return Array.isArray(raw) && raw.every(isWorkspace);
  } catch {
    return false;
  }
}
/**
 * 목록을 덮어쓰기 직전에 부른다. 덮어쓰면 손상 흔적이 사라지므로 표시를 남겨, 남겨 둔 명부를 다음 저장에서 지우지 않게 한다.
 * 표시를 못 남겼으면 false — 호출부는 목록을 덮어쓰지 않는다.
 */
function recordIndexDamage(): boolean {
  return indexIntact() || write(meta(), INDEX_DAMAGED_KEY, true);
}
/**
 * 목록에 없는 사업장의 명부·대표자 키를 두 저장소에서 지운다. 지우면 되찾을 수 없으므로 목록을 믿을 수 있을 때만 지운다.
 * 목록이 손상된 적이 있으면 주인을 알 수 없는 키를 그대로 둔다. 전부 지우기(forgetEverything)는 이 키까지 지운다.
 */
function removeOrphans(list: Workspace[]): void {
  if (read(meta(), INDEX_DAMAGED_KEY, false)) return;
  const ids = new Set(list.map((w) => w.id));
  const orphan = (key: string) => {
    const prefix = PER_WORKSPACE.find((p) => key.startsWith(p));
    return prefix !== undefined && !ids.has(key.slice(prefix.length));
  };
  for (const store of [session(), local()]) removeKeys(store, orphan);
}
/** 사업장 목록을 쓰고 고아 키를 치운다. 목록을 못 썼으면 아무것도 지우지 않는다. */
function writeIndex(list: Workspace[]): boolean {
  if (!recordIndexDamage() || !write(meta(), INDEX_KEY, list)) return false;
  removeOrphans(list);
  return true;
}
function notify(): void {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(WORKSPACES_CHANGED)); } catch { /* 무시 */ }
}

// ── 검증 ─────────────────────────────────────────────────────
function isWorkspace(v: unknown): v is Workspace {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.id === "string" && w.id !== "" &&
    typeof w.name === "string" && w.name.trim() !== "" &&
    (w.kind === "client" || w.kind === "own") &&
    typeof w.remember === "boolean"
  );
}
/** 5명 이상 여부가 모르는 값이면 그 칸만 버린다 — 값 하나 때문에 사업장과 명부를 잃으면 안 된다 */
function knownFivePlus(w: Workspace): Workspace {
  if (w.fivePlus === "yes" || w.fivePlus === "no") return w;
  const known = { ...w };
  delete known.fivePlus;
  return known;
}
function isMember(v: unknown): v is WorkspaceMember {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.name === "string" && m.name.trim() !== "" &&
    typeof m.hireDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.hireDate)
  );
}

/**
 * 계약 조건 화이트리스트 — 위 표의 칸만, 타입과 선택지가 맞는 것만 옮긴다. 나머지는 버린다.
 * ★ 주민번호·생년월일·집 주소·연락처·계좌는 칸 자체가 없어 구조상 저장되지 않는다(시험으로 고정).
 */
export function pickTerms(v: unknown): MemberTerms {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const s = v as Record<string, unknown>;
  const out: MemberTerms = {};
  for (const [k, allowed] of Object.entries(TERM_CHOICES)) {
    if ((allowed as readonly unknown[]).includes(s[k])) Object.assign(out, { [k]: s[k] });
  }
  for (const k of TERM_TEXT) {
    const value = s[k];
    if (typeof value === "string") out[k] = value;
  }
  if (Array.isArray(s.workDays)) out.workDays = s.workDays.filter(isTermDay);
  if (isTermDay(s.weeklyRestDay)) out.weeklyRestDay = s.weeklyRestDay;
  return out;
}

/** 저장·반환 모양을 하나로 — 조건이 없으면 terms 칸 자체를 두지 않는다(옛 형식 그대로) */
function cleanMember(name: string, hireDate: string, terms: MemberTerms | undefined): WorkspaceMember {
  return terms && Object.keys(terms).length > 0 ? { name, hireDate, terms } : { name, hireDate };
}

function newId(): string {
  // crypto.randomUUID 가 없는 환경(구형 사파리)도 있다
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* 아래로 */ }
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── 역할 ─────────────────────────────────────────────────────
export function getAudience(): Audience | null {
  const v = read<string | null>(meta(), AUDIENCE_KEY, null);
  return v === "advisor" || v === "employer" ? v : null;
}
export function setAudience(a: Audience): void {
  write(meta(), AUDIENCE_KEY, a);
  notify();
}

// ── 사업장 ───────────────────────────────────────────────────
export function listWorkspaces(): Workspace[] {
  const raw = read<unknown[]>(meta(), INDEX_KEY, []);
  return Array.isArray(raw) ? raw.filter(isWorkspace).map(knownFivePlus) : [];
}

export function getActiveWorkspace(): Workspace | null {
  const id = read<string | null>(meta(), ACTIVE_KEY, null);
  const all = listWorkspaces();
  return all.find((w) => w.id === id) ?? all[0] ?? null;
}

export function setActiveWorkspace(id: string): void {
  if (!listWorkspaces().some((w) => w.id === id)) return;
  write(meta(), ACTIVE_KEY, id);
  notify();
}

export function createWorkspace(
  name: string,
  kind: WorkspaceKind,
  remember = false
): Workspace | null {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  const ws: Workspace = { id: newId(), name: trimmed, kind, remember };
  if (!writeIndex([...listWorkspaces(), ws])) return null;
  write(meta(), ACTIVE_KEY, ws.id);
  notify();
  return ws;
}

export function renameWorkspace(id: string, name: string): void {
  const trimmed = name.trim();
  if (trimmed === "") return;
  writeIndex(listWorkspaces().map((w) => (w.id === id ? { ...w, name: trimmed } : w)));
  notify();
}

/**
 * 대표자·5명 이상 여부를 바꾼다. 5명 이상 여부는 목록에, 대표자는 명부와 같은 저장소(details)에 쓴다.
 * 대표자를 비우면 details 를 지우고, 모르는 값은 받지 않는다.
 */
export function updateWorkspace(id: string, patch: { ownerName?: string; fivePlus?: "yes" | "no" }): void {
  const all = listWorkspaces();
  const ws = all.find((w) => w.id === id);
  if (!ws) return;
  if (patch.fivePlus === "yes" || patch.fivePlus === "no") {
    const fivePlus = patch.fivePlus;
    writeIndex(all.map((w) => (w.id === id ? { ...w, fivePlus } : w)));
  }
  if (patch.ownerName !== undefined) {
    const owner = typeof patch.ownerName === "string" ? patch.ownerName.trim() : "";
    const store = membersStore(ws);
    if (owner) write(store, DETAILS_PREFIX + id, { ownerName: owner });
    else try { store?.removeItem(DETAILS_PREFIX + id); } catch { /* 무시 */ }
  }
  notify();
}

/** 사업장 대표자 — 명부와 같은 저장소에서 읽는다. 목록에 남은 옛 ownerName 칸은 읽지 않는다. */
export function getWorkspaceDetails(ws: Workspace | null): WorkspaceDetails {
  if (!ws) return {};
  const raw = read<unknown>(membersStore(ws), DETAILS_PREFIX + ws.id, null);
  if (typeof raw !== "object" || raw === null) return {};
  const owner = (raw as Record<string, unknown>).ownerName;
  return typeof owner === "string" && owner.trim() !== "" ? { ownerName: owner.trim() } : {};
}

/**
 * 기억 여부를 바꾼다 — 명부와 대표자(details)를 새 저장소에 먼저 쓰고, 다 써졌을 때만 이전 저장소에서 지운다.
 * 새 저장소가 가득 찼거나 막혀 있으면 아무것도 바꾸지 않고 false 를 돌려준다.
 */
export function setRemember(id: string, remember: boolean): boolean {
  const all = listWorkspaces();
  const ws = all.find((w) => w.id === id);
  if (!ws || ws.remember === remember) return true;
  const members = getMembers(ws);
  const details = getWorkspaceDetails(ws);
  const next = { ...ws, remember };
  const from = membersStore(ws);
  const to = membersStore(next);
  const moved =
    write(to, MEMBERS_PREFIX + id, members) &&
    (!details.ownerName || write(to, DETAILS_PREFIX + id, details)) &&
    writeIndex(all.map((w) => (w.id === id ? next : w)));
  for (const prefix of [MEMBERS_PREFIX, DETAILS_PREFIX]) {
    try { (moved ? from : to)?.removeItem(prefix + id); } catch { /* 무시 */ }
  }
  notify();
  return moved;
}

/** 사업장과 그 명부를 함께 지운다. 목록을 못 쓰면 명부도 그대로 두고 false 를 돌려준다. */
export function deleteWorkspace(id: string): boolean {
  const remaining = listWorkspaces().filter((w) => w.id !== id);
  if (!writeIndex(remaining)) return false;
  for (const store of [session(), local()]) removeKeys(store, (k) => PER_WORKSPACE.some((p) => k === p + id));
  const active = read<string | null>(meta(), ACTIVE_KEY, null);
  if (active === id) write(meta(), ACTIVE_KEY, remaining[0]?.id ?? null);
  notify();
  return true;
}

// ── 명부 ─────────────────────────────────────────────────────
export function getMembers(ws: Workspace | null): WorkspaceMember[] {
  if (!ws) return [];
  const raw = read<unknown[]>(membersStore(ws), MEMBERS_PREFIX + ws.id, []);
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, WorkspaceMember>();
  for (const m of raw.filter(isMember)) {
    map.set(`${m.name} ${m.hireDate}`, cleanMember(m.name, m.hireDate, pickTerms(m.terms)));
  }
  return [...map.values()];
}

/**
 * 명부를 **통째로 바꾼다.** 입력창의 내용이 곧 명부이므로 합치면 타이핑 중간
 * 상태가 쌓인다(2026-09-24에 실제로 겪었다).
 *
 * 같은 `이름 입사일` 의 사람은 이미 저장된 계약 조건(terms)을 지킨다 — 연차 화면은 이름·입사일만
 * 넘기므로, 그대로 덮으면 근로계약서 작성에서 넣은 조건이 사라진다. 이름·입사일이 바뀐 사람은 새 사람이다.
 *
 * 계약 조건이 있는 사람은 입력창에서 사라져도 지우지 않는다 — 연차 화면은 글자마다 저장하므로
 * 이름을 고치는 도중의 글자만으로 조건이 영구히 사라진다. 지우는 길은 removeMembers 하나다.
 */
export function setMembers(ws: Workspace | null, members: WorkspaceMember[]): WorkspaceMember[] {
  if (!ws) return [];
  const before = getMembers(ws);
  const kept = new Map(before.map((m) => [memberKey(m), m.terms]));
  const map = new Map<string, WorkspaceMember>();
  for (const m of members.filter(isMember)) {
    const key = `${m.name} ${m.hireDate}`;
    const terms = m.terms !== undefined ? pickTerms(m.terms) : kept.get(key);
    map.set(key, cleanMember(m.name, m.hireDate, terms));
  }
  for (const m of before) {
    if (m.terms && !map.has(memberKey(m))) map.set(memberKey(m), m);
  }
  const clean = [...map.values()];
  const store = membersStore(ws);
  if (clean.length === 0) {
    try { store?.removeItem(MEMBERS_PREFIX + ws.id); } catch { /* 무시 */ }
  } else {
    write(store, MEMBERS_PREFIX + ws.id, clean);
  }
  notify();
  return clean;
}

/**
 * 한 사람만 넣거나 바꾼다(사업장 카드의 「이 근로자를 카드에 저장」). 같은 `이름 입사일` 이면
 * 계약 조건을 새 값으로 바꾸고, 없으면 끝에 더한다. 형식이 깨진 사람은 넣지 않는다.
 */
export function upsertMember(ws: Workspace | null, member: WorkspaceMember): WorkspaceMember[] {
  if (!ws) return [];
  const current = getMembers(ws);
  if (!isMember(member)) return current;
  const next = cleanMember(member.name, member.hireDate, pickTerms(member.terms));
  const key = memberKey(next);
  const list = current.some((m) => memberKey(m) === key)
    ? current.map((m) => (memberKey(m) === key ? next : m))
    : [...current, next];
  write(membersStore(ws), MEMBERS_PREFIX + ws.id, list);
  notify();
  return list;
}

/** 사람을 명부에서 지운다 — 계약 조건도 함께 사라진다. 이용자가 직접 고를 때만 부른다. 못 쓰면 false */
export function removeMembers(ws: Workspace | null, keys: string[]): boolean {
  if (!ws) return false;
  const saved = write(membersStore(ws), MEMBERS_PREFIX + ws.id, getMembers(ws).filter((m) => !keys.includes(memberKey(m))));
  notify();
  return saved;
}

export function memberKey(m: WorkspaceMember): string {
  return `${m.name} ${m.hireDate}`;
}

/** 이 브라우저에 남아 있는 것을 전부 지운다 — 공용 PC 에서 쓰는 비상 버튼. */
export function forgetEverything(): void {
  for (const store of [session(), local()]) removeKeys(store, isPerWorkspaceKey);
  try {
    meta()?.removeItem(INDEX_KEY);
    meta()?.removeItem(INDEX_DAMAGED_KEY);
    meta()?.removeItem(ACTIVE_KEY);
    meta()?.removeItem(AUDIENCE_KEY);
  } catch { /* 무시 */ }
  notify();
}
