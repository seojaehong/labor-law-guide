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

/**
 * 근로자에 딸린 계약 조건 — 근로계약서 작성 입력(WriteState)의 같은 이름 칸만.
 * 이 모듈은 계약서 쪽을 import 하지 않는다(연차 화면 번들에 섞이지 않게). 칸 이름·타입이 맞는지는 시험이 고정한다.
 */
export type MemberTerms = {
  payType?: "monthly" | "hourly";
  amountMode?: "gross" | "net";
  monthlyTotal?: string;
  hourlyWage?: string;
  workDays?: string[];
  start?: string;
  end?: string;
  breakMinutes?: string;
  weeklyRestDay?: TermDay;
  duty?: string;
  location?: string;
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
/** prefix 로 시작하는 키를 지운다 — 사업장 목록이 손상돼도 명부가 남지 않게 목록을 거치지 않는다 */
function removeByPrefix(store: Storage | null, ...prefixes: string[]): void {
  if (!store) return;
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const k of keys) if (k && prefixes.some((p) => k.startsWith(p))) store.removeItem(k);
  } catch { /* 무시 */ }
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
    typeof w.remember === "boolean" &&
    (w.fivePlus === undefined || w.fivePlus === "yes" || w.fivePlus === "no")
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

const TERM_TEXT = ["monthlyTotal", "hourlyWage", "start", "end", "breakMinutes", "duty", "location"] as const;

/**
 * 계약 조건 화이트리스트 — 이 11칸만, 타입이 맞는 것만 옮긴다. 나머지는 버린다.
 * ★ 주민번호·생년월일·주소·연락처·계좌는 칸 자체가 없어 구조상 저장되지 않는다(시험으로 고정).
 */
export function pickTerms(v: unknown): MemberTerms {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const s = v as Record<string, unknown>;
  const out: MemberTerms = {};
  if (s.payType === "monthly" || s.payType === "hourly") out.payType = s.payType;
  if (s.amountMode === "gross" || s.amountMode === "net") out.amountMode = s.amountMode;
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
  if (!write(meta(), INDEX_KEY, [...listWorkspaces(), ws])) return null;
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
    write(meta(), INDEX_KEY, all.map((w) => (w.id === id ? { ...w, fivePlus } : w)));
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
    write(meta(), INDEX_KEY, all.map((w) => (w.id === id ? next : w)));
  for (const prefix of [MEMBERS_PREFIX, DETAILS_PREFIX]) {
    try { (moved ? from : to)?.removeItem(prefix + id); } catch { /* 무시 */ }
  }
  notify();
  return moved;
}

/** 사업장과 그 명부를 함께 지운다. 두 저장소 모두에서 지운다. */
export function deleteWorkspace(id: string): void {
  write(meta(), INDEX_KEY, listWorkspaces().filter((w) => w.id !== id));
  for (const prefix of [MEMBERS_PREFIX, DETAILS_PREFIX]) {
    try { session()?.removeItem(prefix + id); } catch { /* 무시 */ }
    try { local()?.removeItem(prefix + id); } catch { /* 무시 */ }
  }
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

/** 사람을 명부에서 지운다 — 계약 조건도 함께 사라진다. 이용자가 직접 고를 때만 부른다. */
export function removeMembers(ws: Workspace | null, keys: string[]): WorkspaceMember[] {
  if (!ws) return [];
  const list = getMembers(ws).filter((m) => !keys.includes(memberKey(m)));
  write(membersStore(ws), MEMBERS_PREFIX + ws.id, list);
  notify();
  return list;
}

export function memberKey(m: WorkspaceMember): string {
  return `${m.name} ${m.hireDate}`;
}

// ── 카드 파일(내보내기·가져오기) ─────────────────────────────
// 다른 브라우저·PC 로 카드를 옮기는 길. 이용자가 파일을 직접 내려받고 직접 고른다 — 여기는 그 내용만 만들고 읽는다.

const CARD_FILE_KIND = "llg-workplace-cards";

export type CardExport = {
  kind: typeof CARD_FILE_KIND;
  version: 1;
  exportedAt: string;
  /** id·remember 는 넣지 않는다 — 가져오는 브라우저가 새로 정한다 */
  workspaces: Array<{ name: string; kind: WorkspaceKind; fivePlus?: "yes" | "no"; ownerName?: string; members: WorkspaceMember[] }>;
};

export type CardImportResult = { ok: boolean; added: number; merged: number; skipped: number };

/** 지금 이 브라우저에 있는 사업장 전부(기억 여부와 상관없이) */
export function exportCards(now: Date = new Date()): CardExport {
  return {
    kind: CARD_FILE_KIND,
    version: 1,
    exportedAt: now.toISOString(),
    workspaces: listWorkspaces().map((w) => {
      const { ownerName } = getWorkspaceDetails(w);
      return {
        name: w.name,
        kind: w.kind,
        ...(w.fivePlus ? { fivePlus: w.fivePlus } : {}),
        ...(ownerName ? { ownerName } : {}),
        members: getMembers(w),
      };
    }),
  };
}

/**
 * 카드 파일을 가져온다. 이름이 같은 사업장은 합치고(명부 = upsertMember 규칙, 대표자·5명 이상은 파일에 값이 있을 때만 덮음)
 * 없으면 새로 만든다. 새 사업장만 `remember` 를 따르고, 이미 있는 사업장의 기억 여부와 지금 고른 사업장은 바꾸지 않는다.
 * ★ 파일의 객체를 펼쳐 넣지 않는다 — 이름을 댄 칸만 기존 검증(isWorkspace·isMember·pickTerms)을 거쳐 옮긴다.
 * 카드 파일이 아니면(kind·version·workspaces) 아무것도 바꾸지 않는다.
 */
export function importCards(json: unknown, { remember }: { remember: boolean }): CardImportResult {
  let data = json;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  const file = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!file || file.kind !== CARD_FILE_KIND || file.version !== 1 || !Array.isArray(file.workspaces)) {
    return { ok: false, added: 0, merged: 0, skipped: 0 };
  }
  const result: CardImportResult = { ok: true, added: 0, merged: 0, skipped: 0 };
  for (const entry of file.workspaces as unknown[]) {
    const e = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const candidate = { id: "import", name, kind: e.kind, remember, fivePlus: e.fivePlus };
    if (!isWorkspace(candidate)) {
      result.skipped += 1;
      continue;
    }
    let target = listWorkspaces().find((w) => w.name === name);
    if (target) {
      result.merged += 1;
    } else {
      target = { id: newId(), name, kind: candidate.kind, remember };
      write(meta(), INDEX_KEY, [...listWorkspaces(), target]);
      result.added += 1;
    }
    const owner = typeof e.ownerName === "string" ? e.ownerName.trim() : "";
    updateWorkspace(target.id, { ...(owner ? { ownerName: owner } : {}), ...(candidate.fivePlus ? { fivePlus: candidate.fivePlus } : {}) });
    for (const m of Array.isArray(e.members) ? e.members : []) {
      if (typeof m !== "object" || m === null) continue;
      const r = m as Record<string, unknown>;
      // 파일에 계약 조건이 없는 사람은 이미 있는 조건을 지우지 않는다(손으로 고친 파일 대비)
      const exists = getMembers(target).some((x) => x.name === r.name && x.hireDate === r.hireDate);
      if (exists && Object.keys(pickTerms(r.terms)).length === 0) continue;
      upsertMember(target, { name: r.name, hireDate: r.hireDate, terms: r.terms } as WorkspaceMember);
    }
  }
  notify();
  return result;
}

/** 이 브라우저에 남아 있는 것을 전부 지운다 — 공용 PC 에서 쓰는 비상 버튼. */
export function forgetEverything(): void {
  for (const store of [session(), local()]) removeByPrefix(store, MEMBERS_PREFIX, DETAILS_PREFIX);
  try {
    meta()?.removeItem(INDEX_KEY);
    meta()?.removeItem(ACTIVE_KEY);
    meta()?.removeItem(AUDIENCE_KEY);
  } catch { /* 무시 */ }
  notify();
}
