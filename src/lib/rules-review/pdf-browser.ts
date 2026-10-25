// 화면에서 pdf 읽기 — pdf.js 를 pdf 가 있을 때만 불러온다. 워커 파일 경로를 번들러에 맡기지 않고
// 워커 코드를 같은 스레드에서 돌린다(규정 글자 뽑기는 가벼워 충분하다).
// 스캔 쪽은 그림으로 그려 /api/tools/rules-review/ocr 로 보낸다 — 담당자가 동의한 뒤에만 부른다.
import type { PdfLib, PdfPage } from './pdf';

let loaded: Promise<PdfLib> | null = null;

export function loadPdfLib(): Promise<PdfLib> {
  loaded ??= (async () => {
    // @ts-expect-error 워커 묶음은 타입 선언이 없다 — WorkerMessageHandler 만 쓴다
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return (await import('pdfjs-dist')) as unknown as PdfLib;
  })();
  return loaded;
}

/** 쪽 그림 — 긴 변 1,800px JPEG. 글자 읽기에 충분하고 요청 하나가 1MB 안팎이다 */
export async function pageImage(page: PdfPage): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('쪽 그림을 만들지 못했습니다'))), 'image/jpeg', 0.85));
}

export type OcrResult = ({ lines: string[]; model: 'haiku' | 'sonnet' } | { error: string; message: string; stop: boolean }) & { pass?: string };

/** 쪽 하나 읽기. 통행증이 있으면 자동 확인 토큰 대신 보낸다. stop 이면 남은 쪽도 보내지 않는다(키 없음·한도 초과·확인 실패) */
export async function ocrPage(image: Blob, auth: { token?: string | null; pass?: string | null } = {}): Promise<OcrResult> {
  const form = new FormData();
  form.append('image', image, 'page.jpg');
  if (auth.pass) form.append('pass', auth.pass);
  else if (auth.token) form.append('turnstileToken', auth.token);
  const res = await fetch('/api/tools/rules-review/ocr', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  const pass = typeof body.pass === 'string' ? { pass: body.pass } : {};
  if (res.ok) return { lines: body.lines ?? [], model: body.model, ...pass };
  return { error: body.error ?? 'ocr_failed', message: body.message ?? '스캔 쪽을 읽지 못했습니다.', stop: res.status === 501 || res.status === 429 || res.status === 403, ...pass };
}
