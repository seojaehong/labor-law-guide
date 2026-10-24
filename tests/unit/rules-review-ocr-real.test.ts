// 스캔 쪽 읽기 정확도 실측 — 글자층이 있는 실제 규정 pdf 쪽을 그림으로 그려 하이쿠·소넷에 읽히고, 글자층(정답)과 견준다.
// 규정 파일·결과는 저장소에 넣지 않는다. 실제 API 를 부른다(쪽당 하이쿠·소넷 한 번씩).
// RR_OCR_DIR=<pdf 폴더> RR_OUT=<결과 폴더> (ANTHROPIC_API_KEY=… 또는 RR_OCR_URL=<배포 주소>/api/tools/rules-review/ocr) [RR_OCR_FILES=4] npx vitest run tests/unit/rules-review-ocr-real.test.ts
import { it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPage, type OcrModel } from '@/lib/rules-review/ocr-call';

const DIR = process.env.RR_OCR_DIR ?? '';
const OUT = process.env.RR_OUT ?? '';
const KEY = process.env.ANTHROPIC_API_KEY ?? '';
const keep = (s: string) => s.replace(/[^가-힣0-9]/g, '');

/** 편집 거리 기반 같음 정도(0~1) — 한글·숫자만 견준다(띄어쓰기·문장부호·표 모양 차이는 빼고 글자를 맞게 읽었는지만) */
function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

const URL_ = process.env.RR_OCR_URL ?? '';
const BYPASS = process.env.VERCEL_BYPASS ?? '';

it.skipIf(!DIR || !OUT || !(KEY || URL_))('스캔 쪽 읽기 정확도 — 하이쿠·소넷', async () => {
  // 작업공간에 묶이지 않은 조직 키는 작업공간 머리를 함께 보내야 한다
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic({ apiKey: KEY, ...(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {}) });
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.pdf') && !/대비표|편람/.test(f)).slice(0, Number(process.env.RR_OCR_FILES ?? 4));
  const rows = [];
  for (const f of files) {
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(DIR, f))) });
    const doc = await task.promise;
    for (const no of [...new Set([1, Math.ceil(doc.numPages / 2)])]) {
      const page = await doc.getPage(no);
      const items = (await page.getTextContent()).items as { str: string }[];
      // 쪽 꼬리말(「파일 이름_제…호 3/10」)은 옮기지 말라고 했으니 정답에서도 뺀다
      const truth = keep(items.map((i) => i.str).join('').replace(/\S*_제[\d,]+호_\d{8}_\S*\s*\d+\s*\/\s*\d+/g, ''));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const data = (await canvas.encode('jpeg', 85)).toString('base64');
      const row: Record<string, unknown> = { file: f, page: no, truthChars: truth.length };
      // RR_OCR_URL 이면 배포된 라우트를 그대로 부른다(하이쿠 → 덜 읽히면 소넷, 사용자가 받는 결과 그대로)
      if (URL_) {
        const t0 = Date.now();
        const form = new FormData();
        form.append('image', new Blob([new Uint8Array(Buffer.from(data, 'base64'))], { type: 'image/jpeg' }), 'p.jpg');
        const res = await fetch(URL_, { method: 'POST', body: form, headers: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {} });
        const body = await res.json().catch(() => ({}));
        row.route = res.ok ? { model: body.model, sim: Number(similarity(truth, keep(body.lines.join(''))).toFixed(4)), ms: Date.now() - t0 } : { status: res.status, error: body.error };
        rows.push(row);
        writeFileSync(join(OUT, 'ocr_accuracy.json'), JSON.stringify(rows, null, 1));
        continue;
      }
      for (const m of ['haiku', 'sonnet'] as OcrModel[]) {
        const t0 = Date.now();
        try {
          const r = await readPage(client, m, 'image/jpeg', data);
          row[m] = { sim: Number(similarity(truth, keep(r.text)).toFixed(4)), ok: r.ok, ms: Date.now() - t0, chars: keep(r.text).length, usage: r.usage };
        } catch (e) {
          row[m] = { error: (e as Error).message.slice(0, 400) };
        }
      }
      rows.push(row);
      writeFileSync(join(OUT, 'ocr_accuracy.json'), JSON.stringify(rows, null, 1));
    }
    await task.destroy();
  }
}, 900_000);
