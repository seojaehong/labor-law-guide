// 칸 패치(설계 v2.1 §2-1·2-2·2-3·2-4) — 원본 시트 XML 에서 바꿀 칸만 고친다.
// 바꾸지 않은 행·칸·공백은 원문 그대로 둔다(토큰 동일). 원본 접두(x: 등)·BOM 을 유지한다.
// 순수 함수 — zip·ExcelJS 를 모른다.
import { spreadsheetPrefix } from './ooxml';
import { colNumber, parseCellAddress } from './workload';

export type PatchValue = string | number | boolean | null;
export interface CellEdit {
  cell: string;
  value: PatchValue;
}
export interface PatchWarning {
  code: 'FORMULA_CELL_SKIPPED' | 'MERGED_CELL_SKIPPED';
  cell: string;
  message: string;
}
export type SheetPatchResult =
  | { ok: true; xml: string; changed: string[]; warnings: PatchWarning[] }
  | { ok: false; code: 'UNSUPPORTED_INPUT'; reason: string };

const BOM = '﻿';
const MAX_TEXT = 32_767;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 값 검사(§2-2) — 문제가 있으면 사유, 없으면 null */
export function checkPatchValue(v: unknown): string | null {
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : `수가 아닙니다(NaN·무한대): ${v}`;
  if (typeof v !== 'string') return `지원하지 않는 값 종류입니다: ${typeof v}`;
  if (v.length > MAX_TEXT) return `글이 ${MAX_TEXT}자를 넘습니다(${v.length}자).`;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(v)) return '글에 쓸 수 없는 제어 문자가 있습니다.';
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) return '글에 짝 없는 서로게이트 문자가 있습니다.';
  return null;
}

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
/** 엑셀 _xHHHH_ 이스케이프 풀기(_x005F_ 는 밑줄 자체라 한 번만 푼다) */
export const unescapeOoxmlText = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** <si>·<is> 본문 → 글(발음 표기 rPh 는 뺀다) */
function richText(body: string, p: string): string {
  const P = esc(p);
  const noPh = body.replace(new RegExp(`<${P}rPh\\b[\\s\\S]*?</${P}rPh>`, 'g'), '');
  const ts = [...noPh.matchAll(new RegExp(`<${P}t\\b[^>]*?(?:/>|>([\\s\\S]*?)</${P}t>)`, 'g'))].map((m) => m[1] ?? '');
  return unescapeOoxmlText(decodeXml(ts.join('')));
}

/** sharedStrings.xml(원본·판독 사본 어느 쪽이든) → 번호별 글 */
export function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const body = xml.startsWith(BOM) ? xml.slice(1) : xml;
  const pr = spreadsheetPrefix(body);
  const p = pr.ok ? pr.prefix : '';
  const P = esc(p);
  return [...body.matchAll(new RegExp(`<${P}si\\b[^>]*?(?:/>|>([\\s\\S]*?)</${P}si>)`, 'g'))].map((m) => richText(m[1] ?? '', p));
}

const attrOf = (tag: string, name: string) => new RegExp(`\\s${esc(name)}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];

interface Seg {
  /** 원문 조각(바꾸지 않으면 그대로 이어 붙인다) */
  text: string;
  kind: 'gap' | 'item';
}
interface CellTok extends Seg {
  kind: 'item';
  r: string;
  col: number;
  open: string;
  inner: string;
}
interface RowTok extends Seg {
  kind: 'item';
  r: number;
  open: string;
  selfClose: boolean;
  cells: (Seg | CellTok)[];
  dirty: boolean;
}

/** 여는 태그·본문 반복을 gap/item 조각으로 나눈다 */
function split<T extends Seg>(src: string, re: RegExp, make: (m: RegExpExecArray) => T): (Seg | T)[] {
  const out: (Seg | T)[] = [];
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ kind: 'gap', text: src.slice(last, m.index) });
    out.push(make(m));
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'gap', text: src.slice(last) });
  return out;
}

type Range = { r1: number; c1: number; r2: number; c2: number };
function parseRange(ref: string): Range | null {
  const [a, b = a] = ref.replace(/\$/g, '').split(':');
  const x = parseCellAddress(a);
  const y = parseCellAddress(b);
  if (!x || !y) return null;
  return { r1: Math.min(x.row, y.row), c1: Math.min(x.col, y.col), r2: Math.max(x.row, y.row), c2: Math.max(x.col, y.col) };
}
const inRange = (g: Range, row: number, col: number) => row >= g.r1 && row <= g.r2 && col >= g.c1 && col <= g.c2;

/** 칸의 지금 값(비교용). 수식 칸은 비교하지 않으므로 다루지 않는다 */
function currentValue(c: CellTok, p: string, sst: string[]): PatchValue {
  const P = esc(p);
  const t = attrOf(c.open, 't');
  const v = new RegExp(`<${P}v\\b[^>]*>([\\s\\S]*?)</${P}v>`).exec(c.inner)?.[1];
  if (t === 'inlineStr') {
    const is = new RegExp(`<${P}is\\b[^>]*>([\\s\\S]*?)</${P}is>`).exec(c.inner)?.[1];
    return is === undefined ? null : richText(is, p);
  }
  if (v === undefined) return null;
  const raw = decodeXml(v);
  if (t === 's') return sst[Number(raw)] ?? null;
  if (t === 'b') return raw === '1';
  if (t === 'str' || t === 'e') return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

const normText = (s: string) => s.replace(/\r\n?/g, '\n');
function sameValue(cur: PatchValue, next: PatchValue): boolean {
  if (next === null) return cur === null || cur === '';
  if (typeof next === 'string') return typeof cur === 'string' && normText(cur) === normText(next);
  return cur === next;
}

function encodeText(s: string): string {
  return normText(s)
    .replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildCell(p: string, addr: string, s: string | undefined, v: PatchValue): string {
  const sa = s !== undefined ? ` s="${s}"` : '';
  if (v === null) return `<${p}c r="${addr}"${sa}/>`;
  if (typeof v === 'number') return `<${p}c r="${addr}"${sa}><${p}v>${String(v)}</${p}v></${p}c>`;
  if (typeof v === 'boolean') return `<${p}c r="${addr}"${sa} t="b"><${p}v>${v ? 1 : 0}</${p}v></${p}c>`;
  const text = normText(v);
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<${p}c r="${addr}"${sa} t="inlineStr"><${p}is><${p}t${space}>${encodeText(text)}</${p}t></${p}is></${p}c>`;
}


const ROW_COPY_ATTRS = ['ht', 'customHeight', 's', 'customFormat'];

type Tokenized = {
  ok: true;
  hasBom: boolean;
  xml: string;
  p: string;
  P: string;
  /** sheetData 여는 태그까지(자기닫힘이면 여는 태그로 바꾼 것) */
  head: string;
  /** </sheetData> 부터 끝까지 */
  tail: string;
  body: string;
  rows: (Seg | RowTok)[];
};
type Unsupported = { ok: false; code: 'UNSUPPORTED_INPUT'; reason: string };

/** 시트 원문을 sheetData 앞·행 조각들·뒤로 나눈다. sheetData 는 한 번만 토큰화한다(§2-0) */
function tokenizeSheet(raw: string): Tokenized | Unsupported {
  const hasBom = raw.startsWith(BOM);
  const xml = hasBom ? raw.slice(1) : raw;
  const pr = spreadsheetPrefix(xml);
  if (!pr.ok) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: pr.reason };
  const p = pr.prefix;
  const P = esc(p);
  const open = new RegExp(`<${P}sheetData\\b[^>]*?(/?)>`).exec(xml);
  if (!open) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: '시트에 sheetData 가 없습니다.' };
  const bodyStart = open.index + open[0].length;
  let bodyEnd = bodyStart;
  let head = xml.slice(0, bodyStart);
  let tail: string;
  if (open[1] === '/') {
    head = xml.slice(0, open.index) + open[0].replace(/\s*\/>$/, '>');
    tail = `</${p}sheetData>` + xml.slice(bodyStart);
  } else {
    const close = xml.indexOf(`</${p}sheetData>`, bodyStart);
    if (close < 0) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: 'sheetData 가 닫히지 않았습니다.' };
    bodyEnd = close;
    tail = xml.slice(close);
  }
  const body = xml.slice(bodyStart, bodyEnd);

  let bad: string | null = null;
  const rowRe = new RegExp(`<${P}row\\b([^>]*?)(/>|>([\\s\\S]*?)</${P}row>)`, 'g');
  const cellRe = () => new RegExp(`<${P}c\\b([^>]*?)(/>|>([\\s\\S]*?)</${P}c>)`, 'g');
  const rows = split<RowTok>(body, rowRe, (m) => {
    const selfClose = m[2] === '/>';
    const rowOpen = selfClose ? m[0] : m[0].slice(0, m[0].indexOf('>') + 1);
    const rAttr = attrOf(rowOpen, 'r');
    if (!rAttr && !bad) bad = 'r 이 생략된 <row> 는 지원하지 않습니다.';
    const cells = selfClose
      ? []
      : split<CellTok>(m[3] ?? '', cellRe(), (c) => {
          const r = attrOf(`<x${c[1]}>`, 'r') ?? '';
          const a = parseCellAddress(r);
          if (!a && !bad) bad = 'r 이 생략되었거나 틀린 <c> 는 지원하지 않습니다.';
          const openTag = c[0].slice(0, c[0].indexOf('>') + 1);
          return { kind: 'item', text: c[0], r, col: a?.col ?? 0, open: openTag, inner: c[3] ?? '' };
        });
    return { kind: 'item', text: m[0], r: Number(rAttr), open: rowOpen, selfClose, cells, dirty: false };
  });
  if (bad) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: bad };
  return { ok: true, hasBom, xml, p, P, head, tail, body, rows };
}

function serialize(t: Pick<Tokenized, 'hasBom' | 'p' | 'head' | 'tail' | 'rows'>): string {
  const rowText = (r: RowTok) => {
    if (!r.dirty) return r.text;
    const openTag = r.selfClose ? r.open.replace(/\s*\/>$/, '>') : r.open;
    return `${openTag}${r.cells.map((c) => c.text).join('')}</${t.p}row>`;
  };
  return (t.hasBom ? BOM : '') + t.head + t.rows.map((s) => (s.kind === 'item' ? rowText(s as RowTok) : s.text)).join('') + t.tail;
}

const rowItemsOf = (rows: (Seg | RowTok)[]) => rows.filter((s): s is RowTok => s.kind === 'item');
const cellsOf = (row: RowTok) => row.cells.filter((c): c is CellTok => c.kind === 'item');
const hasContent = (c: CellTok, P: string) => new RegExp(`<${P}(?:v|is|f)\\b`).test(c.inner);

function mergeRanges(xml: string, P: string): Range[] {
  const out: Range[] = [];
  for (const m of xml.matchAll(new RegExp(`<${P}mergeCell\\b[^>]*\\sref="([^"]+)"`, 'g'))) {
    const g = parseRange(m[1]);
    if (g) out.push(g);
  }
  return out;
}

function colStyleOf(xml: string, P: string): (col: number) => string | undefined {
  const colStyles: { min: number; max: number; style: string }[] = [];
  for (const m of xml.matchAll(new RegExp(`<${P}col\\b[^>]*>`, 'g'))) {
    const style = attrOf(m[0], 'style');
    if (style !== undefined) colStyles.push({ min: Number(attrOf(m[0], 'min')), max: Number(attrOf(m[0], 'max')), style });
  }
  return (col) => colStyles.find((c) => col >= c.min && col <= c.max)?.style;
}

/**
 * 시트 XML 하나에 칸 편집을 적용한다. 원문(raw, 접두·BOM 그대로)을 받아 원문을 돌린다.
 * 수식 칸·공유/배열 수식 범위 안 칸·병합 종속 칸은 쓰지 않고 경고, 지금 값과 같으면 쓰지 않는다.
 */
export function patchSheetCells(raw: string, edits: CellEdit[], sst: string[]): SheetPatchResult {
  const t = tokenizeSheet(raw);
  if (!t.ok) return t;
  const { xml, p, P, body, rows } = t;
  const formulaRanges: Range[] = [];
  for (const m of body.matchAll(new RegExp(`<${P}f\\b[^>]*\\sref="([^"]+)"`, 'g'))) {
    const g = parseRange(m[1]);
    if (g) formulaRanges.push(g);
  }
  const merges = mergeRanges(xml, P);
  const colStyle = colStyleOf(xml, P);
  const warnings: PatchWarning[] = [];
  const changed: string[] = [];

  // 같은 주소는 마지막 것만, 행·열 순서로
  const byAddr = new Map<string, CellEdit>();
  for (const e of edits) byAddr.set(e.cell, e);
  const sorted = [...byAddr.values()]
    .map((e) => ({ e, a: parseCellAddress(e.cell)! }))
    .sort((x, y) => x.a.row - y.a.row || x.a.col - y.a.col);

  for (const { e, a } of sorted) {
    const master = merges.find((g) => inRange(g, a.row, a.col));
    if (master && !(master.r1 === a.row && master.c1 === a.col)) {
      warnings.push({ code: 'MERGED_CELL_SKIPPED', cell: e.cell, message: `${e.cell} 는 병합 칸의 일부라 쓰지 않았습니다.` });
      continue;
    }
    let row = rowItemsOf(rows).find((r) => r.r === a.row);
    const existing = row ? cellsOf(row).find((c) => c.col === a.col) : undefined;
    if ((existing && new RegExp(`<${P}f\\b`).test(existing.inner)) || formulaRanges.some((g) => inRange(g, a.row, a.col))) {
      warnings.push({ code: 'FORMULA_CELL_SKIPPED', cell: e.cell, message: `${e.cell} 는 수식 칸이라 쓰지 않았습니다.` });
      continue;
    }
    if (existing && sameValue(currentValue(existing, p, sst), e.value)) continue;
    if (!existing && e.value === null) continue;

    let style = existing ? attrOf(existing.open, 's') : undefined;
    if (!row) {
      // 없는 행 — 위쪽에서 칸이 있는 마지막 행의 행 속성·같은 열 칸 서식을 복사한다(§2-4)
      const tmpl = [...rowItemsOf(rows)].reverse().find((r) => r.r < a.row && cellsOf(r).length > 0);
      row = newRowFrom(p, a.row, tmpl, false);
      const tmplCell = tmpl ? cellsOf(tmpl).find((c) => c.col === a.col) : undefined;
      style = tmplCell ? attrOf(tmplCell.open, 's') : colStyle(a.col);
      insertRow(rows, row);
    } else if (!existing) {
      style = attrOf(row.open, 'customFormat') === '1' ? attrOf(row.open, 's') : colStyle(a.col);
    }
    const text = buildCell(p, e.cell, style, e.value);
    const tok: CellTok = { kind: 'item', text, r: e.cell, col: a.col, open: text, inner: '' };
    if (existing) row.cells[row.cells.indexOf(existing)] = tok;
    else {
      const idx = row.cells.findIndex((c) => c.kind === 'item' && (c as CellTok).col > a.col);
      if (idx < 0) row.cells.push(tok);
      else row.cells.splice(idx, 0, tok);
    }
    row.dirty = true;
    changed.push(e.cell);
  }

  if (changed.length === 0) return { ok: true, xml: raw, changed, warnings };
  return { ok: true, xml: serialize(t), changed, warnings };
}

/** tmpl 행의 행 속성으로 새 <row>. withCells 면 tmpl 의 서식 있는 칸을 값 없이 복사한다 */
function newRowFrom(p: string, r: number, tmpl: RowTok | undefined, withCells: boolean): RowTok {
  const attrs = tmpl ? ROW_COPY_ATTRS.map((k) => [k, attrOf(tmpl.open, k)] as const).filter(([, v]) => v !== undefined) : [];
  const open = `<${p}row r="${r}"${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>`;
  const cells: CellTok[] = [];
  if (withCells && tmpl) {
    for (const c of cellsOf(tmpl)) {
      const s = attrOf(c.open, 's');
      if (s === undefined) continue;
      const addr = `${c.r.replace(/\d+$/, '')}${r}`;
      const text = `<${p}c r="${addr}" s="${s}"/>`;
      cells.push({ kind: 'item', text, r: addr, col: c.col, open: text, inner: '' });
    }
  }
  return { kind: 'item', text: '', r, open, selfClose: false, cells, dirty: true };
}

function insertRow(rows: (Seg | RowTok)[], row: RowTok): void {
  const idx = rows.findIndex((s) => s.kind === 'item' && (s as RowTok).r > row.r);
  if (idx < 0) rows.push(row);
  else rows.splice(idx, 0, row);
}

/**
 * 용량(§2-4) — startRow 부터 「XML 에 실제로 있고, 행·칸 서식 서명이 startRow 와 같고, 묶인 열이 빈」 행이 몇 줄 이어지나.
 * XML 에 없는 행은 세지 않는다(S04 44행 오산의 원인).
 */
export function rowCapacity(raw: string, startRow: number, cols: number[]): number | Unsupported {
  const t = tokenizeSheet(raw);
  if (!t.ok) return t;
  const byR = new Map(rowItemsOf(t.rows).map((r) => [r.r, r]));
  const sig = (row: RowTok) =>
    JSON.stringify([
      ...['s', 'ht', 'customFormat', 'customHeight'].map((k) => attrOf(row.open, k) ?? ''),
      ...cols.map((col) => {
        const c = cellsOf(row).find((x) => x.col === col);
        return c ? (attrOf(c.open, 's') ?? '') : '';
      }),
    ]);
  const ref = byR.get(startRow);
  if (!ref) return 0;
  const want = sig(ref);
  let n = 0;
  for (let r = startRow; ; r++) {
    const row = byR.get(r);
    if (!row || sig(row) !== want) break;
    if (cellsOf(row).some((c) => cols.includes(c.col) && hasContent(c, t.P))) break;
    n++;
  }
  return n;
}

/** from 행 이상에서 값·수식 칸이 있는 첫 행(없으면 null) — overflow:'error' 의 「벽」 계산용 */
export function firstContentRow(raw: string, from: number): number | null | Unsupported {
  const t = tokenizeSheet(raw);
  if (!t.ok) return t;
  const hit = rowItemsOf(t.rows).find((r) => r.r >= from && cellsOf(r).some((c) => hasContent(c, t.P)));
  return hit ? hit.r : null;
}

export type AppendResult =
  | { ok: true; xml: string; addedMerges: string[]; warnings: string[] }
  | { ok: false; blocked: string }
  | Unsupported;

/** 시트 원문에서 tail(sheetData 뒤) 안의 자식 원소 순서상 mergeCells 가 들어갈 자리 앞 원소들 */
const AFTER_MERGE = ['phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];

/**
 * 꼬리 덧붙이기(§2-5) — at 행부터 count 행을 새로 만든다. 아무것도 밀지 않는다.
 * at 아래에 놓인 것(값·수식 칸, 병합, 쪽 나눔, 그 아래에서 시작하는 유효성·조건부서식·링크)이 있으면 blocked.
 * 새 행은 at 위 마지막 자료 행의 행 속성·칸 서식·가로 병합을 복사한다. dimension 끝 행을 늘린다.
 * 그림 고정점·메모는 다른 부품이라 호출자가 따로 본다.
 */
export function appendTailRows(raw: string, at: number, count: number, opts: { afterPush?: boolean } = {}): AppendResult {
  const t = tokenizeSheet(raw);
  if (!t.ok) return t;
  const { xml, P, rows } = t;
  const items = rowItemsOf(rows);
  const warnings: string[] = [];
  if (!opts.afterPush) {
    const blocked = belowBlocker(t, at);
    if (blocked.blocked) return { ok: false, blocked: blocked.blocked };
    warnings.push(...blocked.warnings);
  }
  const merges = mergeRanges(xml, P);
  const tmpl = [...items].reverse().find((r) => r.r < at && cellsOf(r).length > 0);
  if (!tmpl) return { ok: false, blocked: '복사할 자료 행이 없습니다' };
  return insertTemplateRows(t, at, count, tmpl, merges, warnings);
}

function belowBlocker(t: Tokenized, at: number): { blocked?: string; warnings: string[] } {
  const { xml, P, rows } = t;
  const items = rowItemsOf(rows);
  const warnings: string[] = [];
  const filled = items.find((r) => r.r >= at && cellsOf(r).some((c) => hasContent(c, P)));
  if (filled) return { blocked: `${filled.r}행에 값·수식이 있습니다`, warnings };
  const merges = mergeRanges(xml, P);
  const below = merges.find((g) => g.r2 >= at);
  if (below) return { blocked: `${at}행 아래에 걸친 병합이 있습니다`, warnings };
  for (const m of xml.matchAll(new RegExp(`<${P}brk\\b[^>]*\\sid="(\\d+)"`, 'g'))) {
    if (Number(m[1]) >= at - 1 && new RegExp(`<${P}rowBreaks\\b`).test(xml)) return { blocked: '아래에 쪽 나눔이 있습니다', warnings };
  }
  for (const m of xml.matchAll(new RegExp(`<${P}(dataValidation|conditionalFormatting|hyperlink)\\b[^>]*\\s(?:sqref|ref)="([^"]+)"`, 'g'))) {
    for (const ref of m[2].trim().split(/\s+/)) {
      const g = parseRange(ref);
      if (!g) continue;
      if (g.r1 >= at) return { blocked: `${at}행 아래에서 시작하는 ${m[1]} 범위(${ref})가 있습니다`, warnings };
      if (g.r2 >= at) warnings.push(`${m[1]} 범위 ${ref} 가 새 행에도 걸립니다.`);
    }
  }
  return { warnings };
}

/** 이음매: A1 주소·범위의 행 끝점을 옮긴다. startRule/endRule 이 끝점마다 옮길지 정한다 */
export function shiftRefRows(ref: string, move: (row: number, which: 'start' | 'end' | 'single') => number): string {
  const m = /^(\$?[A-Z]*\$?)(\d+)(?::(\$?[A-Z]*\$?)(\d+))?$/.exec(ref);
  if (!m) return ref;
  if (m[3] === undefined) return `${m[1]}${move(Number(m[2]), 'single')}`;
  return `${m[1]}${move(Number(m[2]), 'start')}:${m[3]}${move(Number(m[4]), 'end')}`;
}

const PUSH_ALLOWED = new Set([
  'worksheet', 'sheetPr', 'tabColor', 'outlinePr', 'pageSetUpPr', 'dimension', 'sheetViews', 'sheetView', 'selection', 'pane',
  'sheetFormatPr', 'cols', 'col', 'sheetData', 'mergeCells', 'mergeCell', 'hyperlinks', 'hyperlink', 'printOptions', 'pageMargins',
  'pageSetup', 'headerFooter', 'oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter', 'rowBreaks',
  'colBreaks', 'brk', 'drawing', 'legacyDrawingHF', 'protectedRanges', 'protectedRange', 'ignoredErrors', 'ignoredError',
  'cellWatches', 'cellWatch', 'phoneticPr', 'sheetProtection',
]);
const MAX_ROW = 1_048_576;
const A1_LOCATION = /^(?:(?:'(?:[^']|'')+'|[^'!\s]+)!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?$/;

/**
 * 닫힌 밀기(§2-5b) — at 이상의 행과 그 행을 가리키는 시트 안 주소를 n 행 내리고, at..at+n−1 에 위 자료 행 서식으로 새 행을 만든다.
 * 허용 목록 밖 원소·수식·걸치는 병합·틀 고정 경계·단순 A1 이 아닌 내부 링크가 있으면 blocked.
 * 시트 밖(통합문서 이름·다른 시트 수식·도형 고정점)은 호출자가 본다.
 */
export function pushRows(raw: string, at: number, n: number, sheetName: string): AppendResult {
  const t = tokenizeSheet(raw);
  if (!t.ok) return t;
  const { xml, p, P, rows } = t;
  const outside = t.head + t.tail;
  for (const m of outside.matchAll(/<([\w.-]+:)?([\w.-]+)[\s/>]/g)) {
    if ((m[1] ?? '') !== p || !PUSH_ALLOWED.has(m[2])) return { ok: false, blocked: `밀 수 없는 원소가 있습니다(${m[1] ?? ''}${m[2]})` };
  }
  if (new RegExp(`<${P}f[\\s>/]`).test(t.body)) return { ok: false, blocked: '수식이 있습니다' };
  const items = rowItemsOf(rows);
  if (items.some((r) => r.r >= at && r.r + n > MAX_ROW)) return { ok: false, blocked: '밀면 마지막 행을 넘습니다' };
  const merges = mergeRanges(xml, P);
  if (merges.some((g) => g.r1 < at && g.r2 >= at)) return { ok: false, blocked: `${at}행을 걸치는 병합이 있습니다` };
  const pane = new RegExp(`<${P}pane\\b[^>]*>`).exec(outside)?.[0];
  if (pane) {
    const ys = Number(attrOf(pane, 'ySplit') ?? 0);
    if (ys > 0 && ys + 1 >= at) return { ok: false, blocked: '틀 고정 경계가 밀리는 자리에 걸칩니다' };
  }
  for (const m of outside.matchAll(new RegExp(`<${P}hyperlink\\b[^>]*>`, 'g'))) {
    const loc = attrOf(m[0], 'location');
    if (loc !== undefined && !A1_LOCATION.test(loc.replace(/&apos;/g, "'"))) return { ok: false, blocked: `내부 링크 주소(${loc})를 옮길 수 없습니다` };
  }
  const tmpl = [...items].reverse().find((r) => r.r < at && cellsOf(r).length > 0);
  if (!tmpl) return { ok: false, blocked: '복사할 자료 행이 없습니다' };

  // 1) 행·칸 주소
  for (const r of items) {
    if (r.r < at) continue;
    const nr = r.r + n;
    const shiftOpen = (tag: string) => tag.replace(/(\sr=")([A-Z]*)(\d+)(")/, (_a, x: string, col: string, _d: string, y: string) => `${x}${col}${nr}${y}`);
    r.text = r.text.replace(new RegExp(`<${P}(?:row|c)\\b[^>]*>`, 'g'), shiftOpen);
    r.open = shiftOpen(r.open);
    for (const c of cellsOf(r)) {
      c.r = c.r.replace(/\d+$/, String(nr));
      c.text = shiftOpen(c.text);
      c.open = shiftOpen(c.open);
    }
    r.r = nr;
  }
  // 2) 시트 안 주소 — 끝점마다 at 이상이면 +n
  const mv = (row: number) => (row >= at ? row + n : row);
  const shiftList = (v: string) => v.trim().split(/\s+/).map((x) => shiftRefRows(x, mv)).join(' ');
  const attr = (text: string, tag: string, name: string, f: (v: string) => string) =>
    text.replace(new RegExp(`<${P}${tag}\\b[^>]*>`, 'g'), (el) => el.replace(new RegExp(`(\\s${name}=")([^"]*)(")`), (_a, x: string, v: string, y: string) => `${x}${f(v)}${y}`));
  const sameSheetLoc = (v: string) => {
    const raw2 = v.replace(/&apos;/g, "'");
    const bang = raw2.lastIndexOf('!');
    const sheetPart = bang >= 0 ? raw2.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'") : sheetName;
    if (sheetPart !== sheetName) return v;
    return bang >= 0 ? v.slice(0, v.lastIndexOf('!') + 1) + shiftRefRows(raw2.slice(bang + 1), mv) : shiftRefRows(v, mv);
  };
  let { head, tail } = t;
  for (const part of ['head', 'tail'] as const) {
    let s = part === 'head' ? head : tail;
    s = attr(s, 'dimension', 'ref', (v) => shiftRefRows(v, mv));
    s = attr(s, 'selection', 'activeCell', (v) => shiftRefRows(v, mv));
    s = attr(s, 'selection', 'sqref', shiftList);
    s = attr(s, 'pane', 'topLeftCell', (v) => shiftRefRows(v, mv));
    s = attr(s, 'mergeCell', 'ref', (v) => shiftRefRows(v, mv));
    s = attr(s, 'hyperlink', 'ref', (v) => shiftRefRows(v, mv));
    s = attr(s, 'hyperlink', 'location', sameSheetLoc);
    s = attr(s, 'protectedRange', 'sqref', shiftList);
    s = attr(s, 'ignoredError', 'sqref', shiftList);
    s = attr(s, 'cellWatch', 'r', (v) => shiftRefRows(v, mv));
    // 쪽 나눔(0 기반 id) — rowBreaks 안의 brk 만
    s = s.replace(new RegExp(`<${P}rowBreaks\\b[\\s\\S]*?</${P}rowBreaks>`), (block) =>
      block.replace(new RegExp(`(<${P}brk\\b[^>]*\\sid=")(\\d+)(")`, 'g'), (_a, x: string, id: string, y: string) => `${x}${Number(id) >= at - 1 ? Number(id) + n : Number(id)}${y}`),
    );
    if (part === 'head') head = s;
    else tail = s;
  }
  const pushed: Tokenized = { ...t, head, tail };
  return insertTemplateRows(pushed, at, n, tmpl, merges.map((g) => ({ ...g, r1: mv(g.r1), r2: mv(g.r2) })), []);
}

function insertTemplateRows(t: Tokenized, at: number, count: number, tmpl: RowTok, merges: Range[], warnings: string[]): AppendResult {
  const { p, P, rows } = t;
  const items = rowItemsOf(rows);
  for (let k = 0; k < count; k++) {
    const r = at + k;
    if (items.some((x) => x.r === r)) continue; // 빈 <row> 는 그대로 쓴다
    insertRow(rows, newRowFrom(p, r, tmpl, true));
  }

  // 가로 병합 복사
  const addedMerges: string[] = [];
  for (const g of merges.filter((x) => x.r1 === tmpl.r && x.r2 === tmpl.r)) {
    for (let k = 0; k < count; k++) {
      const r = at + k;
      addedMerges.push(`${colLetterOf(g.c1)}${r}:${colLetterOf(g.c2)}${r}`);
    }
  }
  let { head, tail } = t;
  if (addedMerges.length) {
    const tags = addedMerges.map((ref) => `<${p}mergeCell ref="${ref}"/>`).join('');
    const mc = new RegExp(`<${P}mergeCells\\b([^>]*)>`).exec(tail);
    if (mc) {
      const closeAt = tail.indexOf(`</${p}mergeCells>`, mc.index);
      const n = (Number(attrOf(mc[0], 'count') ?? merges.length) || merges.length) + addedMerges.length;
      const open = /\scount="/.test(mc[0]) ? mc[0].replace(/\scount="\d*"/, ` count="${n}"`) : mc[0];
      tail = tail.slice(0, mc.index) + open + tail.slice(mc.index + mc[0].length, closeAt) + tags + tail.slice(closeAt);
    } else {
      const block = `<${p}mergeCells count="${addedMerges.length}">${tags}</${p}mergeCells>`;
      const afterSheetData = `</${p}sheetData>`.length;
      let pos = -1;
      for (const name of AFTER_MERGE) {
        const i = tail.search(new RegExp(`<${P}${name}\\b`));
        if (i >= 0 && (pos < 0 || i < pos)) pos = i;
      }
      if (pos < 0) pos = tail.lastIndexOf('</');
      if (pos < afterSheetData) pos = afterSheetData;
      tail = tail.slice(0, pos) + block + tail.slice(pos);
    }
  }
  // dimension 끝 행
  const last = at + count - 1;
  head = head.replace(new RegExp(`(<${P}dimension\\b[^>]*\\sref=")([^"]+)(")`), (all, a: string, ref: string, b: string) => {
    const m = /^(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?)(\d+)$/.exec(ref);
    if (!m || Number(m[2]) >= last) return all;
    return `${a}${m[1]}${last}${b}`;
  });
  return { ok: true, xml: serialize({ ...t, head, tail }), addedMerges, warnings };
}

function colLetterOf(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** 패치 결과 검증용 — 시트 원문에서 칸 하나의 값을 읽는다 */
export function readCellValue(raw: string, addr: string, sst: string[]): PatchValue | undefined {
  const xml = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const pr = spreadsheetPrefix(xml);
  const p = pr.ok ? pr.prefix : '';
  const P = esc(p);
  const m = new RegExp(`<${P}c\\b([^>]*?\\sr="${esc(addr)}"[^>]*?)(/>|>([\\s\\S]*?)</${P}c>)`).exec(xml);
  if (!m) return undefined;
  const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
  return currentValue({ kind: 'item', text: m[0], r: addr, col: colNumber(addr.replace(/\d+$/, '')), open: openTag, inner: m[3] ?? '' }, p, sst);
}
