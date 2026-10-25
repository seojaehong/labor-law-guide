// 두 번째 판독(tesseract.js, kor) 실측 — 시험 pdf 2쪽(글자층 없는 스캔 쪽)을 그림으로 그려 node 에서 읽히고,
// 모델이 읽었다고 친 줄과 숫자·조 번호를 맞춰 본다. 언어 자료를 불러오느라 몇 초 걸려 평소에는 건너뛴다.
// RR_TESS=1 npx vitest run tests/unit/rules-review-tesseract-real.test.ts
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { crossCheck } from '@/lib/rules-review/ocr-crosscheck';

// 2쪽 원문 — rules-review-pdf.test.ts 의 모델 응답과 같은 글
const MODEL = ['제4조(휴가) ① 휴가는 연 15일로 한다.', '② 휴가 신청은 3일 전까지 한다.', '제5조(징계) 징계는 「시험 인사 규정」에 따른다.'];

it.skipIf(!process.env.RR_TESS)('tesseract.js kor — 시험 pdf 스캔 쪽을 읽고 모델 줄과 숫자·조 번호를 맞춘다', async () => {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync('tests/fixtures/laws/sample-rules.pdf')) });
  const page = await (await task.promise).getPage(2);
  // 화면(pdf-browser.ts pageImage)과 같은 그림 — 긴 변 1,800px JPEG 85
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const jpeg = await canvas.encode('jpeg', 85);
  await task.destroy();

  const { createWorker } = await import('tesseract.js');
  // 화면이 public/tesseract/lang 으로 내려받는 것과 같은 언어 자료(4.0.0_best_int)
  const langPath = join(dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/kor/package.json')), '4.0.0_best_int');
  const worker = await createWorker('kor', 1, { langPath, cacheMethod: 'none' });
  try {
    const { data } = await worker.recognize(jpeg);
    console.log(data.text);
    expect(crossCheck(MODEL, data.text)).toEqual({ state: 'checked', checked: 3, flagged: [] });
    // 모델이 숫자 하나를 잘못 읽었다면 그 줄이 걸린다
    const wrong = [MODEL[0].replace('15일', '16일'), ...MODEL.slice(1)];
    expect(crossCheck(wrong, data.text)).toEqual({ state: 'checked', checked: 3, flagged: [{ line: 1, text: wrong[0], anchors: ['16'] }] });
  } finally {
    await worker.terminate();
  }
}, 180_000);
