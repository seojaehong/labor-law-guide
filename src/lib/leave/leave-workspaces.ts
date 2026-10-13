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
const MEMBERS_PREFIX = "work-patterns.leave.members.v1:";
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
};

export type WorkspaceMember = {
  name: string;
  /** YYYY-MM-DD */
  hireDate: string;
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
/** 사업장 목록·활성 선택·역할은 항상 localStorage — 사람 정보가 없다 */
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
function write(store: Storage | null, key: string, value: unknown): void {
  if (!store) return;
  try { store.setItem(key, JSON.stringify(value)); } catch { /* 용량 초과 등 */ }
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
function isMember(v: unknown): v is WorkspaceMember {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.name === "string" && m.name.trim() !== "" &&
    typeof m.hireDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.hireDate)
  );
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
  return Array.isArray(raw) ? raw.filter(isWorkspace) : [];
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
  write(meta(), INDEX_KEY, [...listWorkspaces(), ws]);
  write(meta(), ACTIVE_KEY, ws.id);
  notify();
  return ws;
}

export function renameWorkspace(id: string, name: string): void {
  const trimmed = name.trim();
  if (trimmed === "") return;
  write(meta(), INDEX_KEY, listWorkspaces().map((w) => (w.id === id ? { ...w, name: trimmed } : w)));
  notify();
}

/** 기억 여부를 바꾼다 — 명부를 새 저장소로 옮기고 이전 저장소에서 지운다. */
export function setRemember(id: string, remember: boolean): void {
  const all = listWorkspaces();
  const ws = all.find((w) => w.id === id);
  if (!ws || ws.remember === remember) return;
  const members = getMembers(ws);
  // 이전 저장소에서 제거
  try { membersStore(ws)?.removeItem(MEMBERS_PREFIX + id); } catch { /* 무시 */ }
  const next = { ...ws, remember };
  write(meta(), INDEX_KEY, all.map((w) => (w.id === id ? next : w)));
  write(membersStore(next), MEMBERS_PREFIX + id, members);
  notify();
}

/** 사업장과 그 명부를 함께 지운다. 두 저장소 모두에서 지운다. */
export function deleteWorkspace(id: string): void {
  write(meta(), INDEX_KEY, listWorkspaces().filter((w) => w.id !== id));
  try { session()?.removeItem(MEMBERS_PREFIX + id); } catch { /* 무시 */ }
  try { local()?.removeItem(MEMBERS_PREFIX + id); } catch { /* 무시 */ }
  const active = read<string | null>(meta(), ACTIVE_KEY, null);
  if (active === id) write(meta(), ACTIVE_KEY, listWorkspaces()[0]?.id ?? null);
  notify();
}

// ── 명부 ─────────────────────────────────────────────────────
export function getMembers(ws: Workspace | null): WorkspaceMember[] {
  if (!ws) return [];
  const raw = read<unknown[]>(membersStore(ws), MEMBERS_PREFIX + ws.id, []);
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, WorkspaceMember>();
  for (const m of raw.filter(isMember)) map.set(`${m.name} ${m.hireDate}`, m);
  return [...map.values()];
}

/**
 * 명부를 **통째로 바꾼다.** 입력창의 내용이 곧 명부이므로 합치면 타이핑 중간
 * 상태가 쌓인다(2026-09-24에 실제로 겪었다).
 */
export function setMembers(ws: Workspace | null, members: WorkspaceMember[]): WorkspaceMember[] {
  if (!ws) return [];
  const map = new Map<string, WorkspaceMember>();
  for (const m of members.filter(isMember)) {
    map.set(`${m.name} ${m.hireDate}`, { name: m.name, hireDate: m.hireDate });
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

export function memberKey(m: WorkspaceMember): string {
  return `${m.name} ${m.hireDate}`;
}

/** 이 브라우저에 남아 있는 것을 전부 지운다 — 공용 PC 에서 쓰는 비상 버튼. */
export function forgetEverything(): void {
  const all = listWorkspaces();
  for (const w of all) {
    try { session()?.removeItem(MEMBERS_PREFIX + w.id); } catch { /* 무시 */ }
    try { local()?.removeItem(MEMBERS_PREFIX + w.id); } catch { /* 무시 */ }
  }
  try {
    meta()?.removeItem(INDEX_KEY);
    meta()?.removeItem(ACTIVE_KEY);
    meta()?.removeItem(AUDIENCE_KEY);
  } catch { /* 무시 */ }
  notify();
}
