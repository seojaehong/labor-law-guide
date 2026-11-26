// XLSX 템플릿 채우기 — 바이트 입력 → 바이트 출력, fs·네트워크 없음.
// 고객 원본에 지정 셀·행만 채우고 나머지 서식은 그대로 둔다.
// 원본 zip 은 그대로 두고 바꿀 시트 XML 의 그 칸만 고친다(설계 v2.1). 수식 캐시는 바뀐 칸이 있고 수식이 있을 때만 좁혀 지우고 그때만 fullCalcOnLoad.
// 보존 비교는 두 겹이다 — ①열어 본 모델(병합·수식·유효성·인쇄…) ②zip 부품·rels·extLst·x14 원문(package.ts).
import JSZip from 'jszip';
import { inspectOpened, openXlsx, sheetPaths, type InspectXlsxResult, type OpenedXlsx, type OpenFailCode } from './inspect';
import { appendTailRows, checkPatchValue, clearFormulaValues, clearSharedStrings, sharedStringRefs, firstContentRow, formulaTexts, hideColumns, patchSheetCells, pushRows, readCellValue, readSharedStrings, rowCapacity, shiftRefRows } from './patch';
import { spreadsheetPrefix } from './ooxml';
import { growRange, type PackageComparison } from './package';
import { EXCEL_MAX_ROWS, colNumber, parseCellAddress, EXCEL_MAX_COLS } from './workload';
import { DEFAULT_LIMITS, type Limits } from '../limits';
import type { Warning } from '../types';

export type FillValue = string | number | boolean | null;

export interface FillCell {
  sheet: string;
  cell: string;
  value: FillValue;
}

export interface FillRows {
  sheet: string;
  /** 첫 자료 행 번호(1부터) */
  startRow: number;
  /** 열 문자 → data 의 키 */
  columns: Record<string, string>;
  data: Record<string, FillValue | undefined>[];
  /** 자료가 템플릿 빈 행보다 많을 때: 'error' = 채우지 않음, 'insertRows' = 행을 넣는다 */
  overflow?: 'error' | 'insertRows';
}

/** 숨길 열 — 화면에 보이면 안 되는 관리용 열(위험요인 ID 등). 보존 비교에서 「의도한 변경」 */
export interface FillHiddenColumns {
  sheet: string;
  /** 열 문자(예 'S') */
  columns: string[];
}

export interface FillXlsxOptions {
  cells?: FillCell[];
  rows?: FillRows;
  hiddenColumns?: FillHiddenColumns[];
}

export interface PreservedItem<T> {
  before: Record<string, T>;
  after: Record<string, T>;
  same: boolean;
}

export interface PreservedReport {
  merges: PreservedItem<string[]>;
  formulaCells: PreservedItem<number>;
  conditionalRules: PreservedItem<number>;
  validations: PreservedItem<string[]>;
  printArea: PreservedItem<string | null>;
  printTitles: PreservedItem<string | null>;
  orientation: PreservedItem<string | null>;
  fitToWidth: PreservedItem<number | null>;
  images: PreservedItem<number>;
  definedNames: PreservedItem<string[]>;
  /** ExcelJS 밖 — zip 부품·rels·extLst·x14·인쇄 이름 원문. lost 에 잃은 것, restored 에 원본에서 되살린 것 */
  package: { lost: string[]; restored: string[]; same: boolean };
  /** insertRows 로 넣은 행(없으면 0). 넣었으면 same:false */
  insertedRows: { count: number; at: number | null; same: boolean };
  /** hiddenColumns 로 숨긴 열 — 의도한 변경이라 늘 same:true */
  hiddenColumns: { applied: FillHiddenColumns[]; same: true };
  allSame: boolean;
}

export interface FillXlsxResult {
  ok: boolean;
  needsReview?: boolean;
  reason?: string;
  code?: OpenFailCode | 'INVALID_ARGS' | 'OVERFLOW' | 'WRITE_FAILED' | 'PRESERVATION_LOSS';
  bytes?: Uint8Array;
  changedCells: { sheet: string; cell: string }[];
  preserved?: PreservedReport;
  fullCalcOnLoad: boolean;
  /** sst 정리(§2-7)로 비운 <si> 수(성공 결과에서 늘 숫자, 비운 것 없으면 0) */
  clearedSharedStrings?: number;
  /** overflow='error' 로 멈췄을 때 넘친 자료 행 수 */
  overflowRows?: number;
  warnings: string[];
  /** warnings 와 같은 내용을 코드와 함께(라이브러리 입구가 쓴다) */
  issues: Warning[];
}

const COL_RE = /^[A-Z]{1,3}$/;

function fail(reason: string, extra: Partial<FillXlsxResult> = {}): FillXlsxResult {
  return { ok: false, code: 'INVALID_ARGS', reason, changedCells: [], fullCalcOnLoad: false, warnings: [], issues: [], ...extra };
}

/** 시트별 값 표 하나를 만든다 */
function perSheet<T>(r: InspectXlsxResult, pick: (s: InspectXlsxResult['sheets'][number]) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const s of r.sheets) out[s.name] = pick(s);
  return out;
}

function item<T>(
  before: InspectXlsxResult,
  after: InspectXlsxResult,
  pick: (s: InspectXlsxResult['sheets'][number]) => T,
): PreservedItem<T> {
  const b = perSheet(before, pick);
  const a = perSheet(after, pick);
  return { before: b, after: a, same: JSON.stringify(b) === JSON.stringify(a) };
}

/**
 * expected.printArea: 시트별 기대 인쇄영역(행을 넣어 끝 행이 는 것). 주면 after 를 이것과 견준다.
 */
export function comparePreserved(
  before: InspectXlsxResult,
  after: InspectXlsxResult,
  pkg: Pick<PackageComparison, 'lost' | 'same'> & { restored?: string[] } = { lost: [], same: true },
  inserted: { count: number; at: number | null } = { count: 0, at: null },
  expected: {
    printArea?: Record<string, string | null>;
    printTitles?: Record<string, string | null>;
    hiddenColumns?: FillHiddenColumns[];
    /** 시트별 덧붙인 병합(before 에 더해진다) */
    merges?: Record<string, string[]>;
    /** 시트별 기대 병합 전체(밀기 — before 를 대신한다) */
    mergesAfter?: Record<string, string[]>;
    insertedIntended?: boolean;
  } = {},
): PreservedReport {
  const names = (r: InspectXlsxResult) => r.definedNames.map((d) => `${d.name}=${d.ranges.join(',')}`).sort();
  const dnBefore = { '': names(before) };
  const dnAfter = { '': names(after) };
  const report: Omit<PreservedReport, 'allSame'> = {
    merges: (() => {
      const it = item(before, after, (s) => [...s.merges].sort());
      if (!expected.merges && !expected.mergesAfter) return it;
      const want = perSheet(before, (s) => (expected.mergesAfter?.[s.name] ? [...expected.mergesAfter[s.name]] : [...s.merges, ...(expected.merges?.[s.name] ?? [])]).sort());
      return { ...it, same: JSON.stringify(it.after) === JSON.stringify(want) };
    })(),
    formulaCells: item(before, after, (s) => s.formulaCells),
    conditionalRules: item(before, after, (s) => s.conditionalRules),
    validations: item(before, after, (s) => s.validations.map((v) => v.range).sort()),
    printArea: (() => {
      const it = item(before, after, (s) => s.printArea ?? null);
      return expected.printArea ? { ...it, same: JSON.stringify(it.after) === JSON.stringify(expected.printArea) } : it;
    })(),
    printTitles: (() => {
      const it = item(before, after, (s) => s.printTitles ?? null);
      return expected.printTitles ? { ...it, same: JSON.stringify(it.after) === JSON.stringify(expected.printTitles) } : it;
    })(),
    orientation: item(before, after, (s) => s.orientation ?? null),
    fitToWidth: item(before, after, (s) => s.fitToWidth ?? null),
    images: item(before, after, (s) => s.images),
    definedNames: { before: dnBefore, after: dnAfter, same: JSON.stringify(dnBefore) === JSON.stringify(dnAfter) },
    package: { lost: pkg.lost, restored: pkg.restored ?? [], same: pkg.same },
    insertedRows: { ...inserted, same: inserted.count === 0 || expected.insertedIntended === true },
    hiddenColumns: { applied: expected.hiddenColumns ?? [], same: true },
  };
  const allSame = Object.values(report).every((x) => x.same);
  return { ...report, allSame };
}

export async function fillXlsxTemplate(bytes: Uint8Array, opts: FillXlsxOptions = {}, limits: Limits = DEFAULT_LIMITS, strict = false): Promise<FillXlsxResult> {
  const opened = await openXlsx(bytes, limits);
  if ('reason' in opened) return fail(opened.reason, { code: opened.code, ...(opened.code === 'UNSUPPORTED_INPUT' ? { needsReview: true } : {}) });
  const before = inspectOpened(opened);
  const { wb } = opened;

  // 입력 검사(쓰기 전에 전부 확인) — 칸 주소는 엑셀 한계(1,048,576행·XFD열) 안이어야 한다(G4 Act on 12)
  for (const c of opts.cells ?? []) {
    if (!wb.getWorksheet(c.sheet)) return fail(`시트를 찾을 수 없습니다: ${c.sheet}`);
    if (typeof c.cell !== 'string' || !parseCellAddress(c.cell) || c.cell.includes('$')) return fail(`셀 주소가 올바르지 않습니다(엑셀 한계 XFD1048576 안): ${c.cell}`);
  }
  const rows = opts.rows;
  if (rows) {
    if (!wb.getWorksheet(rows.sheet)) return fail(`시트를 찾을 수 없습니다: ${rows.sheet}`);
    if (!Number.isInteger(rows.startRow) || rows.startRow < 1 || rows.startRow > EXCEL_MAX_ROWS) return fail(`startRow 가 올바르지 않습니다: ${rows.startRow}`);
    const bad = Object.keys(rows.columns).filter((c) => !COL_RE.test(c) || !(colNumber(c) <= EXCEL_MAX_COLS));
    if (bad.length) return fail(`열 문자가 올바르지 않습니다(XFD 까지): ${bad.join(', ')}`);
    if (!Array.isArray(rows.data)) return fail('rows.data 가 배열이 아닙니다.');
    if (rows.startRow + rows.data.length - 1 > EXCEL_MAX_ROWS) return fail(`자료가 엑셀 마지막 행(${EXCEL_MAX_ROWS})을 넘습니다.`);
  }
  const hidden = opts.hiddenColumns ?? [];
  if (!Array.isArray(hidden)) return fail('hiddenColumns 가 배열이 아닙니다.');
  for (const h of hidden) {
    if (!h || !wb.getWorksheet(h.sheet)) return fail(`시트를 찾을 수 없습니다: ${h?.sheet}`);
    if (!Array.isArray(h.columns)) return fail('hiddenColumns[].columns 가 배열이 아닙니다.');
    const bad = h.columns.filter((c) => typeof c !== 'string' || !COL_RE.test(c) || !(colNumber(c) <= EXCEL_MAX_COLS));
    if (bad.length) return fail(`숨길 열 문자가 올바르지 않습니다(XFD 까지): ${bad.join(', ')}`);
  }

  // 값 검사(§2-2) — 제어 문자·서로게이트·32,767자·NaN 은 쓰기 전에 거절
  for (const c of opts.cells ?? []) {
    const why = checkPatchValue(c.value);
    if (why) return fail(`${c.sheet}!${c.cell}: ${why}`);
  }
  for (const [i, rec] of (rows?.data ?? []).entries()) {
    for (const v of Object.values(rec ?? {})) {
      const why = v === undefined ? null : checkPatchValue(v);
      if (why) return fail(`rows.data[${i}]: ${why}`);
    }
  }
  // 칸만 쓰는 요청은 원본 zip 을 그대로 두고 바꿀 칸만 패치한다(설계 v2.1 조각 3). 행 덧붙이기·열 숨김은 조각 5·6 에서 옮긴다
  // 칸·행·열 숨김 모두 칸 패치 경로(설계 v2.1). 옛 ExcelJS 통째 저장 경로는 조각 6 에서 걷어냈다
  return patchFill(bytes, opened, before, opts.cells ?? [], rows ?? null, limits, strict, hidden);
}

const utf8NoStrip = new TextDecoder('utf-8', { ignoreBOM: true });

/** 통합문서 관계에서 sharedStrings 부품 경로를 찾는다(없으면 기본 자리) */
function sharedStringsPath(parts: Map<string, Uint8Array>): string {
  const rels = parts.get('xl/_rels/workbook.xml.rels');
  const xml = rels ? utf8NoStrip.decode(rels) : '';
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (!/Type="[^"]*\/sharedStrings"/.test(m[0])) continue;
    const target = /Target="([^"]*)"/.exec(m[0])?.[1];
    if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  return 'xl/sharedStrings.xml';
}

/**
 * 칸 패치 경로(설계 v2.1 §2-1~2-4) — 원본 부품을 그대로 두고 바꿀 시트 XML 의 그 칸만 고친다.
 * 수식 칸·병합 종속 칸은 쓰지 않고 경고. 바뀐 칸이 없으면 입력 바이트를 그대로 돌린다.
 */
async function patchFill(
  bytes: Uint8Array,
  opened: OpenedXlsx,
  before: InspectXlsxResult,
  cells: FillCell[],
  rows: FillRows | null,
  limits: Limits,
  strict: boolean,
  hidden: FillHiddenColumns[] = [],
): Promise<FillXlsxResult> {
  const issues: Warning[] = [];
  const changedCells: { sheet: string; cell: string }[] = [];
  const sstCandidates = new Set<number>();
  const paths = sheetPaths(opened.parts);
  const sstPath = sharedStringsPath(opened.parts);
  const sstRaw = opened.raw.get(sstPath);
  const sst = readSharedStrings(sstRaw ? utf8NoStrip.decode(sstRaw) : undefined);
  const newParts = new Map<string, string>();
  const rawText = (path: string) => newParts.get(path) ?? utf8NoStrip.decode(opened.raw.get(path)!);

  // 행 자료 — 용량(§2-4) 안은 제자리, 넘치면 꼬리 덧붙이기(§2-5, 밀지 않음)
  const all: FillCell[] = [...cells];
  let inserted = { count: 0, at: null as number | null };
  const addedMerges: Record<string, string[]> = {};
  let grow: { sheet: string; at: number; count: number } | null = null;
  const mergesAfter: Record<string, string[]> = {};
  let pushedSheet: { sheet: string; at: number; n: number } | null = null;
  if (rows) {
    const path = paths.get(rows.sheet);
    if (!path || !opened.raw.get(path)) return fail(`시트 부품을 찾을 수 없습니다: ${rows.sheet}`, { code: 'UNSUPPORTED_INPUT', needsReview: true });
    const cols = Object.keys(rows.columns).map(colNumber);
    const cap = rowCapacity(rawText(path), rows.startRow, cols);
    if (typeof cap !== 'number') return fail(`${rows.sheet}: ${cap.reason}`, { code: cap.code, needsReview: true });
    const extra = rows.data.length - cap;
    // 벽 앞 빈 자리 — 인쇄영역 끝·값 있는 첫 행 앞까지. 거기 쓰는 것은 아무것도 움직이지 않는다(G4-11)
    const at = rows.startRow + cap;
    let free = 0;
    if (extra > 0) {
      const pa = before.sheets.find((s) => s.name === rows.sheet)?.printArea;
      const wallEnd = pa ? Number(/(\d+)$/.exec(pa)?.[1] ?? NaN) : NaN;
      const content = firstContentRow(rawText(path), at);
      if (typeof content === 'object' && content !== null) return fail(`${rows.sheet}: ${content.reason}`, { code: content.code, needsReview: true });
      // 병합은 벽이 아니다 — 제자리 쓰기는 아무것도 움직이지 않고, 종속 칸은 칸 패치가 건너뛰며 경고한다(G4-7)
      free = Math.min(Number.isFinite(wallEnd) ? Math.max(0, wallEnd - at + 1) : Infinity, content === null ? Infinity : content - at);
    }
    const short = Math.max(0, extra - free);
    // 'error' 는 벽 앞 빈 자리만, 'insertRows' 는 꼬리 덧붙이기 → 막히면 벽 앞 빈 자리로 충분한지 → 아니면 OVERFLOW
    const blockedBy = extra > 0 && (rows.overflow ?? 'error') !== 'error' ? otherPartBlocker(opened, path, at) : null;
    const ap = extra > 0 && (rows.overflow ?? 'error') !== 'error' && !blockedBy ? appendTailRows(rawText(path), at, extra) : null;
    // 닫힌 밀기(§2-5b) — 덧붙이기가 시트 안 「놓인 것」 때문에 막혔고, 시트 밖 고정점은 아래에 없을 때만
    // 도형 고정점만 막았다면 밀기에서 고정점을 함께 내린다(메모·VML 은 여전히 막는다)
    let pushReason: string | null = null;
    const pushable = short > 0 && (rows.overflow ?? 'error') !== 'error' && (blockedBy ? !otherPartBlocker(opened, path, at, true) : ap !== null && !ap.ok);
    if (pushable) {
      // 미는 자리 = 벽 앞 빈 자리 끝(at + free). 그 위 빈 자리는 제자리로 쓴다
      const pAt = at + free;
      const wbWhy = pushWorkbookBlocker(opened, paths);
      const ps = wbWhy ? null : pushRows(rawText(path), pAt, short, rows.sheet);
      const dr = ps && ps.ok ? pushDrawings(opened, path, pAt, short) : null;
      if (ps && ps.ok && dr && !dr.ok) pushReason = dr.blocked;
      else if (ps && ps.ok && dr && dr.ok) {
        const wbXml = shiftWorkbookNames(opened, rows.sheet, pAt, short);
        newParts.set(path, ps.xml);
        for (const [dp, dx] of dr.parts) newParts.set(dp, dx);
        if (wbXml) newParts.set('xl/workbook.xml', wbXml);
        inserted = { count: short, at: pAt };
        const mv = (r: number) => (r >= pAt ? r + short : r);
        const sheetBefore = before.sheets.find((s) => s.name === rows.sheet)!;
        mergesAfter[rows.sheet] = [...sheetBefore.merges.map((m) => shiftRefRows(m, mv)), ...ps.addedMerges];
        pushedSheet = { sheet: rows.sheet, at: pAt, n: short };
        issues.push({ code: 'ROWS_PUSHED', message: `${rows.sheet}: 빈 행이 모자라 ${pAt}행 아래 내용(바닥글 등)을 ${short}행 내리고 그 자리에 위 자료 행 서식으로 새 행을 만들었습니다.`, at: `${rows.sheet}!${pAt}` });
      } else {
        pushReason = wbWhy ?? (ps && !ps.ok ? ('blocked' in ps ? ps.blocked : ps.reason) : null);
      }
    }
    if (short > 0 && !(ap && ap.ok) && !pushedSheet) {
      const why = [blockedBy ?? (ap && !ap.ok ? ('blocked' in ap ? ap.blocked : ap.reason) : null), pushReason].filter(Boolean).join(' / ');
      const msg = why
        ? `자료 ${rows.data.length}행이 빈 행 ${cap + free}행보다 ${short}행 많고, ${at}행 아래에 덧붙일 수 없습니다(${why}). 서식에 빈 행을 더 만들어 다시 올려 주세요.`
        : `자료 ${rows.data.length}행이 템플릿 빈 행 ${cap + free}행보다 ${short}행 많습니다.`;
      return fail(msg, { code: 'OVERFLOW', overflowRows: short });
    }
    if (ap && ap.ok) {
      newParts.set(path, ap.xml);
      inserted = { count: extra, at };
      addedMerges[rows.sheet] = ap.addedMerges;
      grow = { sheet: rows.sheet, at, count: extra };
      for (const w of ap.warnings) issues.push({ code: 'RANGE_COVERS_NEW_ROWS', message: `${rows.sheet}: ${w}`, at: `${rows.sheet}!${at}` });
      issues.push({ code: 'ROWS_APPENDED', message: `${rows.sheet}: 빈 행 ${cap}행이 모자라 ${at}행부터 ${extra}행을 덧붙였습니다(위 자료 행 서식 복사, 아래 내용은 움직이지 않음).`, at: `${rows.sheet}!${at}` });
    }
    rows.data.forEach((rec, i) => {
      for (const [col, key] of Object.entries(rows.columns)) {
        const v = rec[key];
        if (v !== undefined) all.push({ sheet: rows.sheet, cell: `${col}${rows.startRow + i}`, value: v });
      }
    });
  }

  // 인쇄영역 — 끝 행이 at−1 이면 늘리고, 아니면 경고
  if (grow) {
    const g = growPrintArea(opened, grow.sheet, grow.at, grow.count);
    if (g.xml) newParts.set('xl/workbook.xml', g.xml);
    if (g.warn) issues.push({ code: 'PRINT_AREA_NOT_EXTENDED', message: `${grow.sheet}: ${g.warn}`, at: `${grow.sheet}!${grow.at}` });
  }

  const bySheet = new Map<string, FillCell[]>();
  for (const c of all) bySheet.set(c.sheet, [...(bySheet.get(c.sheet) ?? []), c]);
  for (const [sheet, list] of bySheet) {
    const path = paths.get(sheet);
    if (!path || !opened.raw.get(path)) return fail(`시트 부품을 찾을 수 없습니다: ${sheet}`, { code: 'UNSUPPORTED_INPUT', needsReview: true });
    const r = patchSheetCells(rawText(path), list, sst);
    if (!r.ok) return fail(`${sheet}: ${r.reason}`, { code: r.code, needsReview: true });
    for (const w of r.warnings) issues.push({ code: w.code, message: `${sheet}!${w.message}`, at: `${sheet}!${w.cell}` });
    for (const cell of r.changed) changedCells.push({ sheet, cell });
    for (const n of r.replacedSst) sstCandidates.add(n);
    if (r.changed.length > 0) newParts.set(path, r.xml);
  }
  const cellsForCheck = all;

  // sst 정리(§2-7) — 덮어쓴 칸이 가리키던 번호 가운데 이제 아무 칸도 안 가리키는 <si> 를 비운다
  let clearedSharedStrings = 0;
  if (sstCandidates.size > 0 && sstRaw) {
    const skip = sstCleanupBlocker(opened, paths, rawText);
    if (typeof skip === 'string') {
      issues.push({ code: 'SST_CLEANUP_SKIPPED', message: `덮어쓴 옛 글을 공유 문자열(sharedStrings)에서 지우지 않았습니다: ${skip}` });
    } else {
      const unused = new Set([...sstCandidates].filter((n) => n < sst.length && !skip.has(n)));
      const cs = clearSharedStrings(utf8NoStrip.decode(sstRaw), unused);
      if (cs.cleared > 0) {
        newParts.set(sstPath, cs.xml);
        clearedSharedStrings = cs.cleared;
      }
    }
  }

  // 열 숨김(§2-1) — <col> 쪼개기·<cols> 만들기, 이미 숨긴 열은 그대로
  for (const h of hidden) {
    const path = paths.get(h.sheet);
    if (!path || !opened.raw.get(path)) return fail(`시트 부품을 찾을 수 없습니다: ${h.sheet}`, { code: 'UNSUPPORTED_INPUT', needsReview: true });
    const hc = hideColumns(rawText(path), h.columns.map(colNumber));
    if (!hc.ok) return fail(`${h.sheet}: ${hc.reason}`, { code: hc.code, needsReview: true });
    if (hc.changed) newParts.set(path, hc.xml);
  }

  // 수식 캐시 좁힌 C(§2-6) — 바뀐 칸이 있고 수식이 있을 때만. 지운 칸이 있을 때만 fullCalcOnLoad
  let fullCalc = false;
  if (changedCells.length > 0) {
    const changedSheets = new Set(changedCells.map((c) => c.sheet));
    const texts = new Map([...paths].map(([name, path]) => [name, formulaTexts(rawText(path))] as const));
    if ([...texts.values()].some((t) => t.length > 0)) {
      const wbRaw = newParts.get('xl/workbook.xml') ?? utf8NoStrip.decode(opened.raw.get('xl/workbook.xml')!);
      const userNames = [...wbRaw.matchAll(/<(?:[\w.-]+:)?definedName\b([^>]*)>([^<]*)</g)].some(
        (m) => !/name="_xlnm[.](?:Print_Area|Print_Titles|_FilterDatabase)"/.test(m[1]) && m[2].trim() !== '#REF!',
      );
      const dynamic = [...texts.values()].flat().some((f) => /\b(?:INDIRECT|OFFSET)\s*\(|\[/i.test(f));
      const everything = userNames || dynamic;
      const mentions = (f: string) =>
        [...changedSheets].some((s) => f.includes(`'${s.replace(/'/g, "''")}'!`) || (/^[\p{L}\p{N}_.]+$/u.test(s) && new RegExp(`(^|[^\\p{L}\\p{N}_.'])${s.replace(/[.]/g, '\\.')}!`, 'u').test(f)));
      let cleared = 0;
      for (const [name, path] of paths) {
        const t = texts.get(name) ?? [];
        if (t.length === 0) continue;
        if (!everything && !changedSheets.has(name) && !t.some(mentions)) continue;
        const cf = clearFormulaValues(rawText(path));
        if (cf.cleared > 0) {
          newParts.set(path, cf.xml);
          cleared += cf.cleared;
        }
      }
      if (cleared > 0) {
        newParts.set('xl/workbook.xml', setFullCalcOnLoad(wbRaw));
        fullCalc = true;
      }
    }
  }

  let out = bytes;
  if (newParts.size > 0) {
    const zip = await JSZip.loadAsync(bytes);
    for (const [path, xml] of newParts) zip.file(path, new TextEncoder().encode(xml));
    out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
  if (out.length > limits.maxOutputBytes) return fail(`결과가 ${limits.maxOutputBytes} 바이트를 넘습니다.`, { code: 'WRITE_FAILED' });

  // 검증 §3 — 다시 열리는가, 쓴 칸이 요청 값인가, 쓴 칸 수 = 요청 − 건너뜀 − 같은 값
  const reopenLimits = { ...limits, maxInputBytes: Math.max(limits.maxInputBytes, out.length), maxUnzippedBytes: Math.max(limits.maxUnzippedBytes, 4 * limits.maxUnzippedBytes), maxCells: Number.MAX_SAFE_INTEGER };
  const reopened = await openXlsx(out, reopenLimits);
  if ('reason' in reopened) return fail(`채운 파일을 다시 검사하지 못했습니다: ${reopened.reason}`, { code: 'WRITE_FAILED', needsReview: true });
  const want = new Map(cellsForCheck.map((c) => [`${c.sheet}!${c.cell}`, c.value] as const));
  for (const { sheet, cell } of changedCells) {
    const xml = newParts.get(paths.get(sheet)!)!;
    const got = readCellValue(xml, cell, sst);
    const expect = want.get(`${sheet}!${cell}`);
    const norm = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n') : v);
    if (norm(got ?? null) !== norm(expect ?? null)) return fail(`쓴 칸을 다시 읽은 값이 다릅니다: ${sheet}!${cell}`, { code: 'WRITE_FAILED' });
  }
  const after = inspectOpened(reopened);
  const printArea: Record<string, string | null> = {};
  for (const s of before.sheets) {
    const pa = s.printArea ?? null;
    printArea[s.name] = pa && grow && grow.sheet === s.name && newParts.has('xl/workbook.xml') ? (growRange(pa, grow.at, grow.count) ?? pa) : pa;
    if (pa && pushedSheet && pushedSheet.sheet === s.name) printArea[s.name] = pa.split(',').map((x) => shiftNameArea(x, pushedSheet!.at, pushedSheet!.n)).join(',');
  }
  // 쓴 자료 행이 (늘린 뒤의) 인쇄영역 밖이면 경고 — 제자리 쓰기도 포함(실서식 S09 at=21)
  if (rows && rows.data.length > 0 && !issues.some((i) => i.code === 'PRINT_AREA_NOT_EXTENDED')) {
    const pa = printArea[rows.sheet];
    const last = rows.startRow + rows.data.length - 1;
    const ends = pa ? pa.split(',').map((x) => Number(/(\d+)$/.exec(x)?.[1] ?? NaN)).filter(Number.isFinite) : [];
    if (ends.length > 0 && last > Math.max(...ends)) {
      issues.push({ code: 'PRINT_AREA_NOT_EXTENDED', message: `${rows.sheet}: 쓴 자료 행(${last}행까지)이 인쇄영역(${pa}) 밖이라 인쇄되지 않을 수 있습니다. 엑셀에서 인쇄영역을 확인하세요.`, at: `${rows.sheet}!${last}` });
    }
  }
  const printTitles: Record<string, string | null> = {};
  for (const s of before.sheets) {
    const pt = s.printTitles ?? null;
    printTitles[s.name] = pt && pushedSheet && pushedSheet.sheet === s.name ? pt.split(',').map((x) => shiftNameArea(x, pushedSheet!.at, pushedSheet!.n)).join(',') : pt;
  }
  const preserved = comparePreserved(before, after, { lost: [], same: true, restored: [] }, inserted, {
    printArea,
    printTitles: pushedSheet ? printTitles : undefined,
    merges: addedMerges,
    mergesAfter,
    insertedIntended: true,
    hiddenColumns: hidden,
  });
  if (!preserved.allSame) {
    const diff = Object.entries(preserved)
      .filter(([k, v]) => k !== 'allSame' && typeof v === 'object' && !v.same)
      .map(([k]) => k);
    issues.push({ code: 'PRESERVATION_LOSS', message: `보존 항목이 달라졌습니다: ${diff.join(', ')}` });
    if (strict) return fail(`엄격 모드: 보존 항목이 달라져 결과를 돌려주지 않습니다(${diff.join(', ')}).`, { code: 'PRESERVATION_LOSS', preserved, issues, warnings: issues.map((x) => x.message) });
  }
  return { ok: true, bytes: out, changedCells, preserved, fullCalcOnLoad: fullCalc, clearedSharedStrings, warnings: issues.map((x) => x.message), issues };
}

/**
 * sst 정리(§2-7)를 막는 사유(글) 또는 살아 있는 참조 번호 전부.
 * 변경 이력(revisions) 부품이 있거나, 시트 부품을 찾지·판독하지 못하거나, 번호가 손상이면 막는다.
 * 숨김·매우 숨김 시트 포함 통합문서 관계의 모든 시트 + zip 안 xl/worksheets 부품 전부를 센다.
 */
function sstCleanupBlocker(opened: OpenedXlsx, paths: Map<string, string>, rawText: (path: string) => string): string | Set<number> {
  const relsRaw = opened.parts.get('xl/_rels/workbook.xml.rels');
  const rels = relsRaw ? utf8NoStrip.decode(relsRaw) : '';
  if (/Type="[^"]*\/revisionHeaders"/.test(rels) || [...opened.parts.keys()].some((k) => k.startsWith('xl/revisions/'))) return '변경 이력(revisions)이 있는 통합문서입니다.';
  const all = new Set<string>([...paths.values(), ...[...opened.parts.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))]);
  const live = new Set<number>();
  for (const path of all) {
    if (/^xl\/(?:chartsheets|dialogsheets)\//.test(path)) continue; // 칸이 없는 시트
    if (!opened.raw.get(path)) return '시트 부품을 찾지 못했습니다.';
    const r = sharedStringRefs(rawText(path));
    if (!r.ok) return `시트를 판독하지 못했습니다(${r.reason})`;
    for (const n of r.refs) live.add(n);
  }
  return live;
}

/** 부품 경로 기준 상대 Target → zip 경로 */
function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = fromPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') base.pop();
    else if (seg !== '.') base.push(seg);
  }
  return base.join('/');
}

/**
 * 시트 밖 부품에서 at 아래에 놓인 것 — 그림·도형 고정점(0 기반 from/row ≥ at−1)·메모(ref 행 ≥ at)·VML 메모 고정점.
 * 하나라도 있으면 사유, 없으면 null.
 */
function otherPartBlocker(opened: OpenedXlsx, sheetPath: string, at: number, ignoreDrawing = false): string | null {
  for (const { type, xml } of sheetRelParts(opened, sheetPath)) {
    if (/\/drawing$/.test(type)) {
      if (ignoreDrawing) continue;
      for (const a of xml.matchAll(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</g)) if (Number(a[1]) >= at - 1) return '그림·도형이 아래에 있습니다';
    } else if (/\/comments$/.test(type)) {
      for (const c of xml.matchAll(/<(?:\w+:)?comment\b[^>]*\sref="([A-Z]+)(\d+)"/g)) if (Number(c[2]) >= at) return '메모가 아래에 있습니다';
    } else if (/\/vmlDrawing$/.test(type)) {
      for (const r of xml.matchAll(/<x:Row>(\d+)<\/x:Row>/g)) if (Number(r[1]) >= at - 1) return '메모·컨트롤 고정점이 아래에 있습니다';
    }
  }
  return null;
}

/** 시트 rels 가 가리키는 내부 부품(종류·zip 경로·원문) */
function sheetRelParts(opened: OpenedXlsx, sheetPath: string): { type: string; path: string; xml: string }[] {
  const rels = opened.parts.get(sheetPath.replace(/([^/]+)$/, '_rels/$1.rels'));
  if (!rels) return [];
  const out: { type: string; path: string; xml: string }[] = [];
  for (const m of utf8NoStrip.decode(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const type = /Type="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const target = /Target="([^"]*)"/.exec(m[0])?.[1];
    if (!target || /TargetMode="External"/.test(m[0])) continue;
    const path = resolveTarget(sheetPath, target);
    const part = opened.raw.get(path) ?? opened.parts.get(path);
    if (part) out.push({ type, path, xml: utf8NoStrip.decode(part) });
  }
  return out;
}

const ANCHOR_RE = /<((?:[\w.-]+:)?)(twoCellAnchor|oneCellAnchor)\b([^>]*)>([\s\S]*?)<\/\1\2>/g;
/**
 * 닫힌 밀기(§2-5b)의 도형 고정점 — 윗변 행(0 기반 from/row) ≥ at−1 인 고정점만 from·to 행을 +n.
 * 오프셋 EMU·a:xfrm 은 그대로(엑셀 실측으로 제자리). 허용 = twoCellAnchor(editAs 생략·twoCell·oneCell)·oneCellAnchor,
 * 내용물 sp·pic·cxnSp. absoluteAnchor·AlternateContent·grpSp·graphicFrame·textlink·도형 하이퍼링크·걸침·at 아래 absolute 는 거부.
 * 밀 고정점이 없는 부품은 결과에 넣지 않는다(바이트 그대로).
 */
function pushDrawings(opened: OpenedXlsx, sheetPath: string, at: number, n: number): { ok: true; parts: Map<string, string> } | { ok: false; blocked: string } {
  const parts = new Map<string, string>();
  const edge = at - 1;
  for (const { type, path, xml } of sheetRelParts(opened, sheetPath)) {
    if (!/\/drawing$/.test(type)) continue;
    const bad = /<(?:[\w.-]+:)?(absoluteAnchor|AlternateContent|grpSp|graphicFrame|contentPart)\b/.exec(xml);
    if (bad) return { ok: false, blocked: `밀 수 없는 도형(${bad[1]})이 있습니다` };
    if (/\stextlink="[^"]+"/.test(xml)) return { ok: false, blocked: '셀에 이어진 도형 글(textlink)이 있습니다' };
    if (/<(?:[\w.-]+:)?hlink(?:Click|Hover)\b/.test(xml)) return { ok: false, blocked: '도형·그림에 하이퍼링크가 있습니다' };
    let moved = false;
    let blocked: string | null = null;
    const out = xml.replace(ANCHOR_RE, (whole, p: string, kind: string, attrs: string, inner: string) => {
      if (blocked) return whole;
      const rowOf = (tag: string) => {
        const m = new RegExp(`<${p}${tag}>[\\s\\S]*?<${p}row>(\\d+)</${p}row>`).exec(inner);
        return m ? Number(m[1]) : null;
      };
      const from = rowOf('from');
      const to = kind === 'twoCellAnchor' ? rowOf('to') : from;
      if (from === null || to === null) {
        blocked = '도형 고정점 모양을 읽지 못했습니다';
        return whole;
      }
      const editAs = /\seditAs="([^"]*)"/.exec(attrs)?.[1];
      if (from < edge && to >= edge) {
        blocked = `${at}행을 걸치는 도형이 있습니다`;
        return whole;
      }
      if (from < edge) return whole;
      if (editAs === 'absolute') {
        blocked = `${at}행 아래에 셀과 함께 움직이지 않는(absolute) 도형이 있습니다`;
        return whole;
      }
      moved = true;
      const body = inner.replace(new RegExp(`(<${p}(?:from|to)>[\\s\\S]*?<${p}row>)(\\d+)(</${p}row>)`, 'g'), (_m, a: string, r: string, b: string) => `${a}${Number(r) + n}${b}`);
      return whole.slice(0, whole.length - inner.length - `</${p}${kind}>`.length) + body + `</${p}${kind}>`;
    });
    if (blocked) return { ok: false, blocked };
    if (moved) parts.set(path, out);
  }
  return { ok: true, parts };
}

/** workbook.xml 의 calcPr 에 fullCalcOnLoad="1" — 없으면 CT_Workbook 순서 자리(아래 원소들 앞)에 만든다 */
const AFTER_CALCPR = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
function setFullCalcOnLoad(text: string): string {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const pr = spreadsheetPrefix(body);
  const p = pr.ok ? pr.prefix : '';
  const P = p.replace(/[.]/g, '[.]');
  const cp = new RegExp(`<${P}calcPr\\b[^>]*?(/?)>`).exec(text);
  if (cp) {
    const tag = /\sfullCalcOnLoad="[^"]*"/.test(cp[0])
      ? cp[0].replace(/\sfullCalcOnLoad="[^"]*"/, ' fullCalcOnLoad="1"')
      : cp[0].replace(/\s*(\/?)>$/, (_m, s: string) => ` fullCalcOnLoad="1"${s}>`);
    return text.slice(0, cp.index) + tag + text.slice(cp.index + cp[0].length);
  }
  let at = text.lastIndexOf(`</${p}workbook>`);
  for (const name of AFTER_CALCPR) {
    const m = new RegExp(`<${P}${name}[\\s/>]`).exec(text);
    if (m && m.index < at) at = m.index;
  }
  return `${text.slice(0, at)}<${p}calcPr fullCalcOnLoad="1"/>${text.slice(at)}`;
}

/**
 * 인쇄영역(_xlnm.Print_Area, 그 시트의 localSheetId) 끝 행이 at−1 인 한 범위면 끝을 at+count−1 로 늘린 workbook.xml 원문.
 * 원본 접두·BOM·$ 표기를 그대로 둔다. 인쇄영역이 없으면 아무것도 안 한다.
 */
function growPrintArea(opened: OpenedXlsx, sheet: string, at: number, count: number): { xml?: string; warn?: string } {
  const raw = opened.raw.get('xl/workbook.xml');
  if (!raw) return {};
  const text = utf8NoStrip.decode(raw);
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const pr = spreadsheetPrefix(body);
  const P = (pr.ok ? pr.prefix : '').replace(/[.]/g, '[.]');
  const sheetNames = [...body.matchAll(new RegExp(`<${P}sheet[\\s/][^>]*?name="([^"]*)"`, 'g'))].map((m) => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const idx = sheetNames.indexOf(sheet);
  if (idx < 0) return {};
  const re = new RegExp(
    `(<${P}definedName[\\s][^>]*name="_xlnm[.]Print_Area"[^>]*localSheetId="${idx}"[^>]*>)([^<]*)(</${P}definedName>)` +
      `|(<${P}definedName[\\s][^>]*localSheetId="${idx}"[^>]*name="_xlnm[.]Print_Area"[^>]*>)([^<]*)(</${P}definedName>)`,
  );
  const m = re.exec(text);
  if (!m) return {};
  const open = m[1] ?? m[4];
  const ref = m[2] ?? m[5];
  const close = m[3] ?? m[6];
  if (ref.includes(',')) return { warn: '인쇄영역이 여러 범위라 늘리지 않았습니다. 엑셀에서 확인하세요.' };
  const e = /^(.*:\$?[A-Z]+\$?)(\d+)$/.exec(ref);
  if (!e) return { warn: '인쇄영역 모양을 읽지 못해 늘리지 않았습니다.' };
  if (Number(e[2]) !== at - 1) return { warn: `인쇄영역 끝(${e[2]}행)이 자료 끝과 이어지지 않아 늘리지 않았습니다 — 덧붙인 ${at}~${at + count - 1}행이 인쇄되지 않을 수 있습니다.` };
  const next = `${open}${e[1]}${at + count - 1}${close}`;
  return { xml: text.slice(0, m.index) + next + text.slice(m.index + m[0].length) };
}

/**
 * 인쇄영역·인쇄제목의 한 영역(시트 접두 포함 가능)을 밀기 규칙으로 옮긴다(§2-5b):
 * 시작 행 ≥ at 이면 +n, 끝 행 ≥ at−1 이면 +n(끝만 늘어남). 행 번호 없는 열 범위는 그대로.
 */
function shiftNameArea(area: string, at: number, n: number): string {
  const bang = area.lastIndexOf('!');
  const prefix = bang >= 0 ? area.slice(0, bang + 1) : '';
  const ref = bang >= 0 ? area.slice(bang + 1) : area;
  return prefix + shiftRefRows(ref, (row, which) => (which === 'end' ? (row >= at - 1 ? row + n : row) : row >= at ? row + n : row));
}

/** 닫힌 밀기를 통합문서 차원에서 막는 것 — 어느 시트든 수식·조건부서식·유효성, 인쇄 이름·#REF! 밖의 이름정의 */
function pushWorkbookBlocker(opened: OpenedXlsx, paths: Map<string, string>): string | null {
  for (const [name, path] of paths) {
    const raw = opened.raw.get(path);
    if (!raw) continue;
    const xml = utf8NoStrip.decode(raw);
    if (/<(?:[\w.-]+:)?f[\s>/]/.test(xml)) return `「${name}」 시트에 수식이 있습니다`;
    if (/<(?:[\w.-]+:)?(?:conditionalFormatting|dataValidations)[\s>/]/.test(xml)) return `「${name}」 시트에 조건부서식·유효성이 있습니다`;
  }
  const wb = opened.raw.get('xl/workbook.xml');
  if (wb) {
    for (const m of utf8NoStrip.decode(wb).matchAll(/<(?:[\w.-]+:)?definedName\b([^>]*)>([^<]*)</g)) {
      const nm = /\sname="([^"]*)"/.exec(m[1])?.[1] ?? '';
      if (nm === '_xlnm.Print_Area' || nm === '_xlnm.Print_Titles' || m[2].trim() === '#REF!') continue;
      return `이름정의(${nm})가 있습니다`;
    }
  }
  return null;
}

/** 밀기 뒤 그 시트의 인쇄영역·인쇄제목 이름을 옮긴 workbook.xml 원문(바뀐 것이 없으면 null). 접두·BOM·$ 표기 그대로 */
function shiftWorkbookNames(opened: OpenedXlsx, sheet: string, at: number, n: number): string | null {
  const raw = opened.raw.get('xl/workbook.xml');
  if (!raw) return null;
  const text = utf8NoStrip.decode(raw);
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const sheetNames = [...body.matchAll(/<(?:[\w.-]+:)?sheet[\s/][^>]*?name="([^"]*)"/g)].map((m) =>
    m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
  );
  const idx = sheetNames.indexOf(sheet);
  if (idx < 0) return null;
  const out = text.replace(/(<(?:[\w.-]+:)?definedName\b([^>]*)>)([^<]*)(<\/)/g, (all, open: string, attrs: string, ref: string, close: string) => {
    const nm = /\sname="([^"]*)"/.exec(attrs)?.[1];
    const local = /\slocalSheetId="(\d+)"/.exec(attrs)?.[1];
    if ((nm !== '_xlnm.Print_Area' && nm !== '_xlnm.Print_Titles') || Number(local) !== idx) return all;
    return open + ref.split(',').map((x) => shiftNameArea(x, at, n)).join(',') + close;
  });
  return out === text ? null : out;
}
