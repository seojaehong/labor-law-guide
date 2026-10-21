// pdf 본문 읽기. pdf.js(Apache-2.0, Mozilla)를 .pdf 를 고를 때만 불러온다.
// 파일은 브라우저 밖으로 나가지 않는다. 그리기는 하지 않고 **글자 레이어만** 뽑는다.
//
// 스캔본(글자 레이어 없는 이미지 PDF)은 빈 결과가 나온다. 그때는 OCR 로 넘어가지 않고
// 「글자를 직접 붙여넣으라」고 말한다 — 추측해서 읽는 것이 빈손보다 나쁘다.
import { MAX_FILE_BYTES, readableText } from './doc-io';

/** public/pdfjs/ 에 빌드 때 복사한다(scripts/copy-pdfjs-worker.mjs) */
export const PDF_WORKER_URL = '/pdfjs/pdf.worker.min.mjs';

/** 쪽 수 상한. 취업규칙은 보통 20~40쪽이고, 터무니없이 큰 문서로 브라우저를 묶지 않는다. */
export const MAX_PDF_PAGES = 200;

const PDF_HEAD = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** pdf.js 모듈. 브라우저는 기본 빌드, node(시험)는 legacy 빌드를 써야 한다(기본 빌드는 DOMMatrix 를 찾는다). */
type PdfjsLike = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: object) => { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = { getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void };

export async function readPdfText(
  data: ArrayBuffer | Uint8Array,
  workerSrc: string = PDF_WORKER_URL,
  load: () => Promise<PdfjsLike> = () => import('pdfjs-dist') as unknown as Promise<PdfjsLike>,
): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  if (!PDF_HEAD.every((b, i) => bytes[i] === b)) throw new Error('PDF 파일 형식이 아닙니다');

  const pdfjs = await load();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  // isEvalSupported·standardFontDataUrl 을 끄는 이유: 글자만 뽑으므로 글꼴과 평가가 필요 없다.
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  let doc: PdfDoc | null = null;
  try {
    doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES) throw new Error(`쪽이 너무 많습니다(${doc.numPages}쪽). ${MAX_PDF_PAGES}쪽 이하만 읽습니다`);
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      try {
        const content = await page.getTextContent();
        out.push(joinPage(content.items));
      } finally {
        page.cleanup();
      }
    }
    return readableText(out.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  } catch (e) {
    if (e instanceof Error && (e.message.includes('쪽이 너무 많습니다') || e.message.includes('읽을 수 있는 글자'))) throw e;
    throw new Error('PDF 본문을 읽지 못했습니다. 암호가 걸렸거나 글자 없이 그림만 있는 문서일 수 있습니다. 글자를 직접 붙여넣으세요');
  } finally {
    doc?.destroy();
  }
}

type Item = { str?: string; hasEOL?: boolean };

/** pdf.js 는 조각(span) 단위로 준다. 조문 머리가 줄 처음에 와야 splitArticles 가 읽으므로 줄바꿈을 살린다. */
function joinPage(items: unknown[]): string {
  let line = '';
  const lines: string[] = [];
  for (const raw of items) {
    const it = raw as Item;
    if (typeof it.str !== 'string') continue;
    line += it.str;
    if (it.hasEOL) { lines.push(line.trim()); line = ''; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.filter(Boolean).join('\n');
}
