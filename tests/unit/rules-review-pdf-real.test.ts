// pdf 읽기 실측 — 같은 규정의 한글 원본과 pdf 를 둘 다 가진 폴더로, pdf 에서 뽑은 조문이 한글 원본과 얼마나 같은지 본다.
// 규정 파일은 저장소에 넣지 않는다. RR_PDF_DIR=<폴더> RR_OUT=<결과 폴더> npx vitest run tests/unit/rules-review-pdf-real.test.ts
import { it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readLines } from '@/lib/rules-review/ingest';
import { articleText, parseRegulation, type DocLine, type Regulation } from '@/lib/rules-review/model';
import { KIND_LABEL, runChecks, type Finding } from '@/lib/rules-review/checks';
import { readPdf, type PdfLib } from '@/lib/rules-review/pdf';

const DIR = process.env.RR_PDF_DIR ?? '';
const OUT = process.env.RR_OUT ?? '';
const wasm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm'));
const squash = (s: string) => s.replace(/\s+/g, '');
const reg = (name: string, lines: DocLine[]) => parseRegulation({ key: name, name, fileName: name, kind: 'txt', lines });

/** 글자 기준 같음 정도(공백 무시) — 긴 쪽 대비 같은 글자 비율, 가볍게 LCS 대신 앞뒤 일치로 잰다 */
function same(a: string, b: string): number {
  const x = squash(a), y = squash(b);
  if (!x && !y) return 1;
  let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0; while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return (p + s) / Math.max(x.length, y.length);
}

it.skipIf(!DIR || !OUT)('pdf 와 한글 원본 대조', async () => {
  const files = readdirSync(DIR);
  const rows = [];
  const hwpRegs: Regulation[] = [], pdfRegs: Regulation[] = [];
  for (const pdf of files.filter((f) => f.toLowerCase().endsWith('.pdf'))) {
    const stem = pdf.replace(/\.pdf$/i, '');
    const hwp = files.find((f) => /\.hwpx?$/i.test(f) && f.replace(/\.hwpx?$/i, '').replace(/\(\d{8}\).*$/, '').replace(/\s/g, '') === stem.replace(/\(\d{8}\).*$/, '').replace(/\s/g, ''));
    if (!hwp) continue;
    const t0 = Date.now();
    const p = await readPdf(new Uint8Array(readFileSync(join(DIR, pdf))), pdfjs as unknown as PdfLib);
    const ms = Date.now() - t0;
    const h = await readLines({ path: hwp, bytes: new Uint8Array(readFileSync(join(DIR, hwp))) }, wasm);
    const A = reg(stem, h.lines), B = reg(stem, p.lines);
    hwpRegs.push(A); pdfRegs.push(B);
    const heads = (r: typeof A) => r.articles.map((a) => `${a.no}`);
    const ha = heads(A), hb = new Set(heads(B));
    const matched = A.articles.filter((a) => hb.has(a.no));
    const exact = matched.filter((a) => { const b = B.articles.find((x) => x.no === a.no)!; return same(articleText(A, a), articleText(B, b)) >= 0.999; });
    const spaced = matched.filter((a) => { const b = B.articles.find((x) => x.no === a.no)!; const n = (t: string) => t.replace(/\s+/g, ' ').trim(); return n(articleText(A, a)) === n(articleText(B, b)); });
    const n = (t: string) => t.replace(/\s+/g, ' ').trim();
    const spaceDiffs = matched.filter((a) => !spaced.includes(a) && exact.includes(a)).slice(0, 4).map((a) => {
      const x = n(articleText(A, a)), y = n(articleText(B, B.articles.find((q) => q.no === a.no)!));
      let i = 0; while (x[i] === y[i]) i++;
      return { hwp: x.slice(Math.max(0, i - 12), i + 12), pdf: y.slice(Math.max(0, i - 12), i + 12) };
    });
    const worst = matched.map((a) => { const b = B.articles.find((x) => x.no === a.no)!; return { no: a.no, s: same(articleText(A, a), articleText(B, b)), hwp: articleText(A, a).slice(0, 300), pdf: articleText(B, b).slice(0, 300) }; })
      .sort((x, y) => x.s - y.s).slice(0, 2);
    rows.push({ pdf, hwp, ms, pages: p.pages.length, scanned: p.pages.filter((x) => x.scanned).length, artsHwp: ha.length, artsPdf: B.articles.length, matched: matched.length, exact: exact.length, spaced: spaced.length, spaceDiffs, extraPdf: B.articles.filter((b) => !ha.includes(b.no)).map((b) => b.no).slice(0, 8), worst });
  }
  writeFileSync(join(OUT, 'pdf_vs_hwp.json'), JSON.stringify(rows, null, 1));
  // 같은 규정 묶음을 한글로 읽었을 때와 pdf 로 읽었을 때 점검 항목이 어떻게 다른가
  const tally = (fs: Finding[]) => { const o: Record<string, number> = {}; for (const f of fs) o[KIND_LABEL[f.kind]] = (o[KIND_LABEL[f.kind]] ?? 0) + 1; return o; };
  const key = (f: Finding) => `${f.kind}|${f.reg}|${f.article}|${f.before}`;
  const annexLines = (r: Regulation) => r.lines.map((l, i) => ({ i, t: l.text.slice(0, 80) })).filter((x) => /별\s*[표지]/.test(x.t) && x.i > (r.annexStart ?? r.suppStart ?? 0) - 5).slice(0, 12);
  writeFileSync(join(OUT, 'annex_lines.json'), JSON.stringify(hwpRegs.map((r, k) => ({ reg: r.name, hwpAnnexes: r.annexes.map((a) => a.label), pdfAnnexes: pdfRegs[k].annexes.map((a) => a.label), hwp: annexLines(r), pdf: annexLines(pdfRegs[k]) })).filter((x) => x.hwpAnnexes.length !== x.pdfAnnexes.length), null, 1));
  const fh = runChecks(hwpRegs), fp = runChecks(pdfRegs);
  const kh = new Set(fh.map(key)), kp = new Set(fp.map(key));
  writeFileSync(join(OUT, 'checks_pdf_vs_hwp.json'), JSON.stringify({
    hwp: tally(fh), pdf: tally(fp),
    onlyPdf: fp.filter((f) => !kh.has(key(f))).map((f) => ({ kind: KIND_LABEL[f.kind], reg: f.reg, article: f.article, before: f.before, message: f.message })),
    onlyHwp: fh.filter((f) => !kp.has(key(f))).map((f) => ({ kind: KIND_LABEL[f.kind], reg: f.reg, article: f.article, before: f.before, message: f.message })),
  }, null, 1));
}, 600_000);
