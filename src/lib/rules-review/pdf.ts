// pdf 규정 읽기 — 글자층이 있는 쪽은 브라우저 안에서 글자를 뽑고, 글자층이 없는 쪽(스캔)은 따로 알린다.
// 한글에서 pdf 로 저장한 규정은 쪽마다 줄이 화면 폭에서 끊겨 있다. 조·항·호 머리가 아닌 줄은 앞 줄에 잇는다.
// 쪽 번호 줄(「- 3 -」)과 쪽마다 되풀이되는 꼬리말(「파일 이름_제…호 19/28」)은 버린다.
import type { DocLine } from './model';

/** pdf.js 의 필요한 부분만 — 화면(브라우저 빌드)과 시험(node legacy 빌드)이 같은 함수를 쓴다 */
export interface PdfLib {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
export interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
}
interface Item { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

export interface PdfPageInfo { no: number; chars: number; scanned: boolean }

/** 글자층 판정 — 한글·숫자가 이만큼도 없으면 스캔(이미지) 쪽으로 본다 */
export const SCANNED_BELOW = 20;

const PAGE_NO = /^[-–—]?\s*\d{1,4}\s*[-–—]?$|^\d{1,4}\s*\/\s*\d{1,4}$/;
/** 새 줄로 시작해야 하는 머리 — 조·항·호·목, 장·절, 부칙, 별표·별지 */
const STARTS = /^\s*(제\s*\d+\s*(조|장|절|관)|[①-⑳➀-➉❶-❿]|\d+\.\s|\d+\)|[가-하]\.\s|\([0-9가-하]+\)|부\s*칙|[[(<〔【]?\s*별\s*[표지]|【|〔|<\s*(개정|신설|삭제)|\d{4}\.\s*\d{1,2}\.)/;

/** 화면 줄 */
export interface Row { text: string }

/** 쪽 하나의 글자 조각 → 화면 줄 */
function pageLines(items: Item[]): Row[] {
  const rows: { y: number; h: number; parts: Item[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5], h = Math.abs(it.height || it.transform[3]) || 10;
    const row = rows.find((r) => Math.abs(r.y - y) < Math.min(r.h, h) * 0.5);
    if (row) row.parts.push(it); else rows.push({ y, h, parts: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const ps = r.parts.sort((a, b) => a.transform[4] - b.transform[4]);
    let s = '', end = -Infinity;
    for (const p of ps) {
      const x = p.transform[4];
      // 양쪽 맞춤으로 벌어진 글자 사이는 빈칸이 아니다 — 글자 높이 절반 넘게 떨어졌을 때만 띄운다
      if (s && x - end > r.h * 0.5 &&!s.endsWith(' ') && !p.str.startsWith(' ')) s += ' ';
      s += p.str;
      end = x + p.width;
    }
    return { text: s.replace(/\s+/g, ' ').trim() };
  }).filter((r) => r.text && !PAGE_NO.test(r.text));
}

/** 쪽마다 되풀이되는 줄(숫자만 다른 것 포함) — 쪽 절반 이상에 나오면 머리말·꼬리말로 본다 */
function repeated(pages: Row[][]): Set<string> {
  const key = (t: string) => t.replace(/\d+/g, '#');
  const count = new Map<string, number>();
  for (const p of pages) for (const k of new Set(p.map((r) => key(r.text)))) count.set(k, (count.get(k) ?? 0) + 1);
  const need = Math.max(2, Math.ceil(pages.length / 2));
  return new Set([...count].filter(([k, n]) => n >= need && !STARTS.test(k.replace(/#/g, '1'))).map(([k]) => k));
}

const JOSA = /[은는이가을를의에와과도로며고서면여야게]$/;
const bare = (w: string) => w.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9]+$/g, '');

/** 화면 줄 → 문단 줄. 머리로 시작하지 않는 줄은 앞 줄에 잇는다.
 *  pdf 에는 줄 끝 빈칸이 남지 않아 낱말 가운데서 끊겼는지(「한/다」) 어절 사이에서 끊겼는지(「해당하는/표」) 모른다.
 *  같은 문서의 줄 가운데에 쓰인 낱말을 모아, 두 조각을 붙인 꼴이 쓰인 적이 있으면 붙이고 뒤 조각이 홀로 쓰인 적이 있으면 띄운다. 둘 다 없으면 붙인다 */
export function joinWrapped(rows: Row[]): string[] {
  const words = new Set<string>();
  // 줄 첫·끝 낱말은 끊긴 조각일 수 있어 뺀다
  for (const r of rows) for (const w of r.text.split(' ').slice(1, -1)) words.add(bare(w));
  const out: string[] = [];
  for (const r of rows) {
    if (!out.length || STARTS.test(r.text)) { out.push(r.text); continue; }
    const prev = out[out.length - 1];
    const a = bare(prev.slice(prev.lastIndexOf(' ') + 1)), b = bare(r.text.split(' ')[0]);
    // 붙인 꼴이 쓰였으면 붙이고, 앞·뒤 조각이 홀로 쓰였거나 앞 조각이 조사·어미로 끝나면 띄운다
    // 한 글자 앞 조각(「직/장을」)은 낱말 가운데서 끊긴 경우가 많아 띄울 근거로 쓰지 않는다
    const glue = words.has(a + b) || a.length < 2 || !(words.has(b) || words.has(a) || JOSA.test(a));
    out[out.length - 1] = prev + (glue ? '' : ' ') + r.text;
  }
  return out;
}

export async function readPdf(bytes: Uint8Array, lib: PdfLib, onScanned?: (page: PdfPage, no: number) => Promise<string[] | null>): Promise<{ lines: DocLine[]; pages: PdfPageInfo[] }> {
  // pdf.js 는 받은 버퍼를 워커로 넘기며 비운다 — 사본을 준다
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false });
  const doc = await task.promise;
  const byPage: Row[][] = [];
  const pages: PdfPageInfo[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const rows = pageLines((await page.getTextContent()).items as Item[]);
      const chars = rows.map((r) => r.text).join('').replace(/[^가-힣0-9]/g, '').length;
      const scanned = chars < SCANNED_BELOW;
      pages.push({ no: n, chars, scanned });
      if (scanned && onScanned) { const got = await onScanned(page, n); byPage.push((got ?? []).map((text) => ({ text }))); }
      else byPage.push(rows);
    }
  } finally {
    await task.destroy();
  }
  const drop = repeated(byPage);
  const rows = byPage.flat().filter((r) => !drop.has(r.text.replace(/\d+/g, '#')));
  return { lines: joinWrapped(rows).map((text) => ({ text, controls: 0 })), pages };
}
