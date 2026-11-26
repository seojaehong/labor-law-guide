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

/**
 * 시트 XML 하나에 칸 편집을 적용한다. 원문(raw, 접두·BOM 그대로)을 받아 원문을 돌린다.
 * 수식 칸·공유/배열 수식 범위 안 칸·병합 종속 칸은 쓰지 않고 경고, 지금 값과 같으면 쓰지 않는다.
 */
export function patchSheetCells(raw: string, edits: CellEdit[], sst: string[]): SheetPatchResult {
  const hasBom = raw.startsWith(BOM);
  const xml = hasBom ? raw.slice(1) : raw;
  const pr = spreadsheetPrefix(xml);
  if (!pr.ok) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: pr.reason };
  const p = pr.prefix;
  const P = esc(p);

  // sheetData 본문
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
    const rAttr = attrOf(selfClose ? m[0] : m[0].slice(0, m[0].indexOf('>') + 1), 'r');
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
    const rowOpen = selfClose ? m[0] : m[0].slice(0, m[0].indexOf('>') + 1);
    return { kind: 'item', text: m[0], r: Number(rAttr), open: rowOpen, selfClose, cells, dirty: false };
  });
  if (bad) return { ok: false, code: 'UNSUPPORTED_INPUT', reason: bad };

  // 수식 범위·병합
  const formulaRanges: Range[] = [];
  for (const m of body.matchAll(new RegExp(`<${P}f\\b[^>]*\\sref="([^"]+)"`, 'g'))) {
    const g = parseRange(m[1]);
    if (g) formulaRanges.push(g);
  }
  const merges: Range[] = [];
  for (const m of xml.matchAll(new RegExp(`<${P}mergeCell\\b[^>]*\\sref="([^"]+)"`, 'g'))) {
    const g = parseRange(m[1]);
    if (g) merges.push(g);
  }
  const colStyles: { min: number; max: number; style: string }[] = [];
  for (const m of xml.matchAll(new RegExp(`<${P}col\\b[^>]*>`, 'g'))) {
    const style = attrOf(m[0], 'style');
    if (style !== undefined) colStyles.push({ min: Number(attrOf(m[0], 'min')), max: Number(attrOf(m[0], 'max')), style });
  }
  const colStyle = (col: number) => colStyles.find((c) => col >= c.min && col <= c.max)?.style;

  const rowItems = () => rows.filter((s): s is RowTok => s.kind === 'item');
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
    let row = rowItems().find((r) => r.r === a.row);
    const existing = row?.cells.find((c): c is CellTok => c.kind === 'item' && (c as CellTok).col === a.col);
    if ((existing && new RegExp(`<${P}f\\b`).test(existing.inner)) || formulaRanges.some((g) => inRange(g, a.row, a.col))) {
      warnings.push({ code: 'FORMULA_CELL_SKIPPED', cell: e.cell, message: `${e.cell} 는 수식 칸이라 쓰지 않았습니다.` });
      continue;
    }
    if (existing && sameValue(currentValue(existing, p, sst), e.value)) continue;
    if (!existing && e.value === null) continue;

    let style = existing ? attrOf(existing.open, 's') : undefined;
    if (!row) {
      // 없는 행 — 위쪽에서 칸이 있는 마지막 행의 행 속성·같은 열 칸 서식을 복사한다(§2-4)
      const tmpl = [...rowItems()].reverse().find((r) => r.r < a.row && r.cells.some((c) => c.kind === 'item'));
      const attrs = tmpl ? ROW_COPY_ATTRS.map((k) => [k, attrOf(tmpl.open, k)] as const).filter(([, v]) => v !== undefined) : [];
      const openTag = `<${p}row r="${a.row}"${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>`;
      const tmplCell = tmpl?.cells.find((c): c is CellTok => c.kind === 'item' && (c as CellTok).col === a.col);
      style = tmplCell ? attrOf(tmplCell.open, 's') : colStyle(a.col);
      row = { kind: 'item', text: '', r: a.row, open: openTag, selfClose: false, cells: [], dirty: true };
      const idx = rows.findIndex((s) => s.kind === 'item' && (s as RowTok).r > a.row);
      if (idx < 0) rows.push(row);
      else rows.splice(idx, 0, row);
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
  const rowText = (r: RowTok) => {
    if (!r.dirty) return r.text;
    const openTag = r.selfClose ? r.open.replace(/\s*\/>$/, '>') : r.open;
    return `${openTag}${r.cells.map((c) => c.text).join('')}</${p}row>`;
  };
  const out = head + rows.map((s) => (s.kind === 'item' ? rowText(s as RowTok) : s.text)).join('') + tail;
  return { ok: true, xml: (hasBom ? BOM : '') + out, changed, warnings };
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
