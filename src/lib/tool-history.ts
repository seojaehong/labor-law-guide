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
  if (!store) return false;
  try {
    store.removeItem(key);
    return store.getItem(key) === null;
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

type HistoryChange = { store: Storage; key: string; value: string | null; recoveryCopy?: boolean };
/** 실패하면 원문으로 복구를 시도한다. 복구도 막히면 새 사본까지 지워 유일한 입력을 잃지 않는다. */
function applyHistoryChanges(changes: HistoryChange[]): boolean {
  const attempted: Array<HistoryChange & { before: string | null }> = [];
  try {
    const snapshots = changes.map(change => ({ ...change, before: change.store.getItem(change.key) }));
    for (const change of snapshots) {
      const { store, key, value, before } = change;
      if (before === value) continue;
      attempted.push(change);
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
      if (store.getItem(key) !== value) throw new Error("history change not applied");
    }
    return true;
  } catch {
    let restoreFailed = false;
    for (const { store, key, before, recoveryCopy } of attempted.reverse()) {
      if (restoreFailed && recoveryCopy) continue;
      try {
        if (store.getItem(key) === before) continue;
        if (before === null) store.removeItem(key);
        else store.setItem(key, before);
        if (store.getItem(key) !== before) restoreFailed = true;
      } catch { restoreFailed = true; }
    }
    return false;
  }
}

/** 새 사본·설정·원본 삭제를 모두 확인해야 성공이다. 실패 시 복구까지 막힐 수 있어 원상 유지를 장담하지 않는다. */
export function setHistoryRemember(tool: string, remember: boolean): boolean {
  const key = HISTORY_PREFIX + tool;
  const flag = REMEMBER_PREFIX + tool;
  const persistent = local();
  const temporary = session();
  let moved = false;
  try {
    if (!persistent || !temporary) return false;
    // 읽기 실패를 「기억하기 꺼짐/빈 입력」으로 취급하지 않는다.
    const rawFlag = persistent.getItem(flag);
    let current = false;
    try { current = rawFlag !== null && JSON.parse(rawFlag) === true; } catch { /* 손상된 설정은 꺼짐 */ }
    const to = remember ? persistent : temporary;
    const from = remember ? temporary : persistent;
    if (current === remember) {
      // 앞 시도의 설정 복구가 막혔어도 같은 요청으로 남은 옛 사본을 지울 수 있다.
      moved = applyHistoryChanges([{ store: from, key, value: null }]);
    } else {
      const raw = from.getItem(key);
      moved = applyHistoryChanges([
        { store: to, key, value: raw, recoveryCopy: true },
        // 원본을 복구하지 못하면 새 사본을 읽는 설정도 유지한다.
        { store: persistent, key: flag, value: remember ? "true" : null, recoveryCopy: true },
        { store: from, key, value: null },
      ]);
    }
  } catch { /* 원본 또는 설정을 읽지 못했으면 옮기지 않는다. */ }
  finally {
    // 복구도 실패했을 수 있으므로 성공 여부와 무관하게 화면을 저장소와 다시 맞춘다.
    notify();
  }
  return moved;
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
export function clearHistory(tool: string): boolean {
  // 한쪽이 막혀도 나머지 삭제는 시도한다. 이력을 다 지운 뒤에만 기억하기를 끈다.
  const temporaryRemoved = remove(session(), HISTORY_PREFIX + tool);
  const persistentRemoved = remove(local(), HISTORY_PREFIX + tool);
  const removed = temporaryRemoved && persistentRemoved && remove(local(), REMEMBER_PREFIX + tool);
  notify();
  return removed;
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
