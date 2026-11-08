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
function write(store: Storage | null, key: string, value: unknown): void {
  if (!store) return;
  try { store.setItem(key, JSON.stringify(value)); } catch { /* 용량 초과 등 */ }
}
function remove(store: Storage | null, key: string): void {
  try { store?.removeItem(key); } catch { /* 무시 */ }
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

/** 기억하기를 바꾼다 — 이력을 새 저장소로 옮기고 이전 저장소에서 지운다 */
export function setHistoryRemember(tool: string, remember: boolean): void {
  if (isHistoryRemembered(tool) === remember) return;
  const entries = listHistory(tool);
  remove(historyStore(tool), HISTORY_PREFIX + tool);
  if (remember) write(local(), REMEMBER_PREFIX + tool, true);
  else remove(local(), REMEMBER_PREFIX + tool);
  if (entries.length) write(historyStore(tool), HISTORY_PREFIX + tool, entries);
  notify();
}

/** 이 도구의 최근 입력을 두 저장소 모두에서 지우고 기억하기도 끈다 — 화면이 사라진 뒤 다음 입력이 조용히 브라우저에 남지 않게 */
export function clearHistory(tool: string): void {
  remove(session(), HISTORY_PREFIX + tool);
  remove(local(), HISTORY_PREFIX + tool);
  remove(local(), REMEMBER_PREFIX + tool);
  notify();
}

/** 모든 도구의 최근 입력과 기억하기 설정을 지운다 — 사업장 카드의 「전부 지우기」 */
export function forgetAllHistory(): void {
  for (const store of [session(), local()]) {
    if (!store) continue;
    try {
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
      for (const k of keys) if (k?.startsWith(ALL_PREFIX)) store.removeItem(k);
    } catch { /* 무시 */ }
  }
  notify();
}
