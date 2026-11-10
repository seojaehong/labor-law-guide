// 스캔(그림뿐인) 회의록 읽기 — 글자층이 없는 pdf 쪽과 사진(png·jpg)을 이 PC 안에서 문자 인식(OCR)한다.
// pdf 쪽은 pdf.js 로 그림을 그리고(@napi-rs/canvas), tesseract.js 가 한국어 자료(@tesseract.js-data/kor, best_int)로 읽는다.
// ★ 네트워크를 쓰지 않는다 — 언어 자료는 설치된 패키지 폴더에서 읽고(langPath), 캐시도 쓰지 않는다(cacheMethod none).
// ★ 규정 점검(rules-file.mjs)은 스캔 쪽을 읽지 않는 결정을 그대로 둔다. 이 파일은 import_council_minutes 만 쓴다.
// 문자 인식은 틀릴 수 있다 — 결과에 어느 쪽을 인식했는지 남기고, 가져온 회의록은 「가져옴 — 확인 전」으로만 저장된다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readPdf } from '@/lib/rules-review/pdf';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

export const OCR_IMAGE_KINDS = ['png', 'jpg', 'jpeg'];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 30;
const SCALE = 2.5;

const req = createRequire(import.meta.url);

/** 설치돼 있으면 문자 인식 묶음을 불러온다. 없으면 null(이유) */
export async function ocrAvailable() {
  try {
    req.resolve('tesseract.js');
    req.resolve('@tesseract.js-data/kor/package.json');
    req.resolve('@napi-rs/canvas');
    return null;
  } catch (e) {
    return `문자 인식 묶음(tesseract.js·@tesseract.js-data/kor·@napi-rs/canvas)이 설치돼 있지 않습니다: ${e instanceof Error ? e.message.split('\n')[0] : e}`;
  }
}

async function ocrWorker() {
  const { createWorker } = await import('tesseract.js');
  const langPath = path.join(path.dirname(req.resolve('@tesseract.js-data/kor/package.json')), '4.0.0_best_int');
  return createWorker('kor', 1, { langPath, gzip: true, cacheMethod: 'none' });
}

const lines = (s) => s.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** 사진 한 장 → 글자 */
export async function ocrImage(filePath) {
  const w = await ocrWorker();
  try {
    const { data } = await w.recognize(fs.readFileSync(filePath));
    return { text: lines(data.text).join('\n'), ocrPages: [1], pages: 1 };
  } finally {
    await w.terminate();
  }
}

/** pdf → 글자. 글자층이 있는 쪽은 그대로, 없는 쪽만 그림으로 그려 문자 인식 */
export async function readPdfWithOcr(filePath) {
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  if (bytes.length > MAX_BYTES) throw new Error('pdf 는 20MB 이하만 읽습니다');
  globalThis.pdfjsWorker ??= pdfWorker;
  const { createCanvas } = req('@napi-rs/canvas');
  let w = null;
  const ocrPages = [];
  try {
    const { lines: out, pages } = await readPdf(bytes, pdfjs, async (page, no) => {
      if (no > MAX_PAGES) return null;
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      w ??= await ocrWorker();
      const { data } = await w.recognize(await canvas.encode('png'));
      ocrPages.push(no);
      return lines(data.text);
    });
    return { text: out.map((l) => l.text).join('\n'), ocrPages, pages: pages.length };
  } finally {
    if (w) await w.terminate();
  }
}
