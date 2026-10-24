// 스캔 쪽 두 번째 판독 — 서버(하이쿠·소넷)가 읽은 같은 쪽 그림을 이 브라우저 안에서 tesseract.js(kor)로 한 번 더 읽는다.
// 그림은 브라우저 밖으로 더 나가지 않는다. 워커·코어·한국어 자료는 이 사이트 public/tesseract/ 에서 받는다(scripts/copy-tesseract.mjs).
// tesseract.js 는 스캔 쪽 읽기를 할 때만 불러온다. 쪽은 하나씩 차례로 읽고, 실패·시간 초과는 null(「대조 못 함」)로 돌려준다.
import type { Worker } from 'tesseract.js';

/** 쪽 하나 읽기 한도 — 넘으면 그 쪽은 대조 못 함 */
export const PAGE_TIMEOUT_MS = 30_000;
/** 처음 한 번 워커 띄우기(코어 약 3.9MB · 한국어 자료 약 1.6MB 내려받기 포함) 한도 */
export const LOAD_TIMEOUT_MS = 90_000;

const within = <T>(p: Promise<T>, ms: number) => new Promise<T>((ok, no) => {
  const t = setTimeout(() => no(new Error('timeout')), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); });
});

export interface SecondReader {
  /** 쪽 그림 → 글자. 읽지 못하면 null — 절대 거부하지 않는다 */
  read(image: Blob): Promise<string | null>;
  /** 남은 쪽을 다 읽은 뒤 워커를 닫는다 */
  close(): Promise<void>;
}

export function secondReader(): SecondReader {
  let worker: Promise<Worker> | null = null;
  let dead = false;
  let queue: Promise<unknown> = Promise.resolve();
  const at = (p: string) => new URL(p, window.location.href).href;
  const start = () => (worker ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker('kor', 1, { workerPath: at('/tesseract/worker.min.js'), corePath: at('/tesseract/core'), langPath: at('/tesseract/lang') });
  })());
  const drop = () => {
    const w = worker;
    worker = null;
    w?.then((x) => x.terminate()).catch(() => { /* 이미 죽은 워커 */ });
  };
  const job = async (image: Blob): Promise<string | null> => {
    if (dead) return null;
    let w: Worker;
    try { w = await within(start(), LOAD_TIMEOUT_MS); } catch { dead = true; drop(); return null; }
    try {
      const { data } = await within(w.recognize(image), PAGE_TIMEOUT_MS);
      return data.text;
    } catch {
      // 읽기를 멈출 수 없으니 워커를 버린다 — 다음 쪽은 새로 띄운다(자료는 브라우저에 남아 있다)
      drop();
      return null;
    }
  };
  return {
    read(image) {
      const p = queue.then(() => job(image)).catch(() => null);
      queue = p;
      return p;
    },
    async close() {
      await queue.catch(() => null);
      drop();
    },
  };
}
