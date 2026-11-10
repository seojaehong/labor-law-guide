import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { registerNosa } from '../../tools/k-labor/groups/nosa.mjs';
import { registerNosaRecords } from '../../tools/k-labor/groups/nosa-records.mjs';

// 스캔 회의록 가져오기 — 글자층 없는 pdf 쪽·사진을 이 PC 안에서 문자 인식(tesseract.js kor). 네트워크를 쓰지 않는다.
// 글자층 있는 pdf 는 예전 길(문자 인식 없음). 값은 가상.
type Handler = (a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const tools: { name: string; handler: Handler }[] = [];
const s = { registerTool(name: string, _cfg: unknown, handler: Handler) { tools.push({ name, handler }); } };
registerNosa(s);
registerNosaRecords(s);
const call = async (n: string, a: Record<string, unknown>) => JSON.parse((await tools.find((t) => t.name === n)!.handler(a)).content[0].text);

process.env.LLG_ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosa-ocr-'));
const dir = path.join(tmp, '기록');
const req = createRequire(import.meta.url);

/** 글자층 있는 회의록 pdf 1쪽을 그림으로 그려, 그림만 든 pdf·png 를 만든다 */
async function scannedFrom(pdfPath: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerMod = 'pdfjs-dist/legacy/build/pdf.worker.mjs'; // 형 선언이 없는 모듈 — 경로를 값으로 넘긴다
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= await import(workerMod);
  const { createCanvas } = req('@napi-rs/canvas');
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), isEvalSupported: false } as never);
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 2.5 });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp } as never).promise;
  const png = await canvas.encode('png');
  const out = await PDFDocument.create();
  const img = await out.embedPng(png);
  const p = out.addPage([img.width / 2.5, img.height / 2.5]);
  p.drawImage(img, { x: 0, y: 0, width: img.width / 2.5, height: img.height / 2.5 });
  const scanPdf = path.join(tmp, '스캔_회의록.pdf');
  fs.writeFileSync(scanPdf, await out.save());
  const scanPng = path.join(tmp, '사진_회의록.png');
  fs.writeFileSync(scanPng, png);
  await task.destroy();
  return { scanPdf, scanPng };
}

describe('스캔 회의록 문자 인식', () => {
  it('글자층 없는 pdf·사진은 문자 인식으로 읽고(인식한 쪽을 알린다), 글자층 있는 pdf 는 예전대로 — 네트워크 호출 0', async () => {
    const made = await call('make_council_meeting_docs', {
      kind: 'minutes', workplace: { name: '가상제조' }, meeting: { kind: '정기', number: 1, date: '2026-03-05' }, seats: { worker: 5, employer: 5 }, attendance: { worker: 5, employer: 5 },
      agenda: [{ title: '야간 작업 순환 방식', type: '협의', article: '20-7' }, { title: '안전화 지급 기준', type: '의결', article: '21-3', inFavor: 9 }],
      writtenDate: '2026-03-06', outDir: dir, formats: ['pdf'],
    });
    const textPdf = made.files.map((f: { path: string }) => f.path).find((p: string) => p.endsWith('_상세회의록.pdf'));
    const { scanPdf, scanPng } = await scannedFrom(textPdf);

    const plain = await call('import_council_minutes', { dir, source: textPdf });
    expect(plain.ok).toBe(true);
    expect(plain.ocrPages ?? []).toEqual([]);

    const net: string[] = [];
    const orig = { fetch: globalThis.fetch, h: http.request, hs: https.request, hg: http.get, hsg: https.get };
    const block = (k: string) => () => { net.push(k); throw new Error(`network blocked: ${k}`); };
    globalThis.fetch = block('fetch') as never;
    http.request = block('http.request') as never;
    https.request = block('https.request') as never;
    http.get = block('http.get') as never;
    https.get = block('https.get') as never;
    try {
      const r = await call('import_council_minutes', { dir, source: scanPdf });
      expect(r.ok, JSON.stringify(r).slice(0, 300)).toBe(true);
      expect(r.ocrPages).toEqual([1]);
      expect(r.warnings.join()).toMatch(/문자 인식/);
      for (const w of ['회의록', '야간', '안전화']) expect(r.text, w).toContain(w);
      const img = await call('import_council_minutes', { dir, source: scanPng });
      expect(img.ok).toBe(true);
      expect(img.kind).toBe('png');
      expect(img.text).toContain('안전화');
    } finally {
      globalThis.fetch = orig.fetch;
      http.request = orig.h;
      https.request = orig.hs;
      http.get = orig.hg;
      https.get = orig.hsg;
    }
    expect(net).toEqual([]);
  }, 180_000);
});
