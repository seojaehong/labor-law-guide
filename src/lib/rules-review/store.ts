// 작업 자동 저장 — 이 브라우저의 IndexedDB 에만 둔다(서버로 가지 않는다). 막힌 브라우저(사생활 보호 창 등)에서는 조용히 건너뛴다.
import type { Source } from './ingest';
import type { Workspace } from './workspace';

const DB = 'rules-review';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveWorkspace(ws: Workspace): Promise<boolean> {
  try { await run('readwrite', (s) => s.put(ws, 'workspace')); return true; } catch { return false; }
}

export async function saveSources(sources: Record<string, Source>): Promise<boolean> {
  try { await run('readwrite', (s) => s.put(sources, 'sources')); return true; } catch { return false; }
}

export async function loadAll(): Promise<{ ws: Workspace | null; sources: Record<string, Source> }> {
  try {
    const ws = (await run<Workspace>('readonly', (s) => s.get('workspace'))) ?? null;
    const sources = (await run<Record<string, Source>>('readonly', (s) => s.get('sources'))) ?? {};
    return { ws: ws?.version === 1 ? ws : null, sources };
  } catch {
    return { ws: null, sources: {} };
  }
}

export async function clearAll(): Promise<void> {
  try { await run('readwrite', (s) => s.clear()); } catch { /* 저장소를 쓸 수 없는 브라우저 */ }
}
