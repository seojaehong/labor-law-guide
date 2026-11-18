/**
 * 도구별 최근 입력 — 범용. 도구 이름을 받아 그 도구의 최근 입력을 최대 5건(새것이 앞) 둔다.
 *
 * ★ 저장 위치는 사업장 카드(leave-workspaces)와 같은 정책이다.
 *   기본 → sessionStorage. 탭을 닫으면 사라진다
 *   도구별 「이 브라우저에 최근 입력 기억하기」를 켜면 → localStorage. 그 브라우저에 남는다
 *   기억하기 설정 값 자체는 사람 정보가 없어 항상 localStorage 에 둔다.
 * 무엇을 남길지(화이트리스트)는 부르는 도구가 정한다. 여기는 항목 모양(savedAt·label·state)만 검사한다.
 *
 * ★ 서버로는 어떤 경우에도 나가지 않는다. 전송 코드가 없다(시험으로 고정).
 */

export const HISTORY_CHANGED = "llg:tool-history-changed";
export const HISTORY_MAX = 5;

const HISTORY_PREFIX = "llg.history.v1:";
const REMEMBER_PREFIX = "llg.history.remember.v1:";
/** 위 두 키의 공통 머리 */
const ALL_PREFIX = "llg.history.";

export type HistoryEntry = {
  /** ISO 시각 */
  savedAt: string;
  label: string;
  state: Record<string, unknown>;
};

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
function local(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
function read(store: Storage | null, key: string): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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
function remove(store: Storage | null, key: string): boolean {
  try {
    store?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
function notify(): void {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new Event(HISTORY_CHANGED)); } catch { /* 무시 */ }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isEntry(v: unknown): v is HistoryEntry {
  return isPlainObject(v) && typeof v.savedAt === "string" && typeof v.label === "string" && isPlainObject(v.state);
}

/** 같은 내용인지 — 칸 순서가 달라도 같은 내용으로 본다 */
function sameContent(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (isPlainObject(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
}

export function isHistoryRemembered(tool: string): boolean {
  return read(local(), REMEMBER_PREFIX + tool) === true;
}

function historyStore(tool: string): Storage | null {
  return isHistoryRemembered(tool) ? local() : session();
}

export function listHistory(tool: string): HistoryEntry[] {
  const raw = read(historyStore(tool), HISTORY_PREFIX + tool);
  return Array.isArray(raw) ? raw.filter(isEntry).slice(0, HISTORY_MAX) : [];
}

/** 1건 더한다 — 새것이 앞, 같은 내용이 있으면 그것을 빼고 맨 앞에 둔다, 최대 5건 */
export function addHistory(tool: string, label: string, state: Record<string, unknown>, now: Date = new Date()): HistoryEntry[] {
  const key = sameContent(state);
  const entry: HistoryEntry = { savedAt: now.toISOString(), label, state };
  const next = [entry, ...listHistory(tool).filter((e) => sameContent(e.state) !== key)].slice(0, HISTORY_MAX);
  write(historyStore(tool), HISTORY_PREFIX + tool, next);
  notify();
  return next;
}

/**
 * 기억하기를 바꾼다 — 새 저장소에 먼저 쓰고, 설정을 바꾼 뒤에야 이전 저장소에서 지운다.
 * 어느 단계든 실패하면 쓴 사본을 치우고 아무것도 바꾸지 않은 채 false 를 돌려준다.
 */
export function setHistoryRemember(tool: string, remember: boolean): boolean {
  if (isHistoryRemembered(tool) === remember) return true;
  const key = HISTORY_PREFIX + tool;
  const entries = listHistory(tool);
  const from = historyStore(tool);
  const to = remember ? local() : session();
  if (entries.length && !write(to, key, entries)) return false;
  if (!(remember ? write(local(), REMEMBER_PREFIX + tool, true) : remove(local(), REMEMBER_PREFIX + tool))) {
    if (entries.length) remove(to, key);
    return false;
  }
  remove(from, key);
  notify();
  return true;
}

/** 이 브라우저에 최근 입력이나 기억하기 설정이 남아 있는가 — 「전부 지우기」를 보일지 정한다 */
export function hasAnyHistory(): boolean {
  for (const store of [session(), local()]) {
    if (!store) continue;
    try {
      for (let i = 0; i < store.length; i++) if (store.key(i)?.startsWith(ALL_PREFIX)) return true;
    } catch { /* 무시 */ }
  }
  return false;
}

/** 이 도구의 최근 입력을 두 저장소 모두에서 지우고 기억하기도 끈다 — 화면이 사라진 뒤 다음 입력이 조용히 브라우저에 남지 않게 */
export function clearHistory(tool: string): void {
  remove(session(), HISTORY_PREFIX + tool);
  remove(local(), HISTORY_PREFIX + tool);
  remove(local(), REMEMBER_PREFIX + tool);
  notify();
}

/** 모든 도구의 최근 입력과 기억하기 설정을 지운다 — 사업장 카드의 「전부 지우기」 */
export function forgetAllHistory(): boolean {
  let removed = true;
  for (const store of [session(), local()]) {
    if (!store) { removed = false; continue; }
    try {
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
      for (const key of keys) {
        if (!key?.startsWith(ALL_PREFIX)) continue;
        try {
          store.removeItem(key);
          if (store.getItem(key) !== null) removed = false;
        } catch { removed = false; }
      }
    } catch { removed = false; }
  }
  notify();
  return removed;
}
