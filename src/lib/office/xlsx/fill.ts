// XLSX 템플릿 채우기 — 바이트 입력 → 바이트 출력, fs·네트워크 없음.
// 고객 원본에 지정 셀·행만 채우고 나머지 서식은 그대로 둔다.
// ExcelJS 는 저장할 때 옛 수식 캐시(<v>)를 남기므로, 수식 셀 캐시를 지우고 fullCalcOnLoad 를 켠다.
// 보존 비교는 두 겹이다 — ①ExcelJS 모델(병합·수식·유효성·인쇄…) ②ExcelJS 밖 zip 부품·rels·extLst·x14 원문(package.ts).
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { colLetter, inspectOpened, openXlsx, sheetPaths, type InspectXlsxResult, type OpenedXlsx, type OpenFailCode } from './inspect';
import { appendTailRows, checkPatchValue, firstContentRow, patchSheetCells, pushRows, readCellValue, readSharedStrings, rowCapacity, shiftRefRows } from './patch';
import { spreadsheetPrefix } from './ooxml';
import { comparePackage, expectedPrintNames, growRange, packageFingerprint, restorePackage, type PackageComparison } from './package';
import { EXCEL_MAX_ROWS, colNumber, parseCellAddress, EXCEL_MAX_COLS } from './workload';
import { DEFAULT_LIMITS, readZipGuarded, type Limits } from '../limits';
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

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
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

/** 모든 수식 셀의 캐시값을 지운다(공유 수식은 풀어서 제 수식으로 쓴다). 쓰기 전에 불러 공유 수식 주인 칸을 덮어써도 깨지지 않게 한다 */
function clearFormulaCaches(wb: ExcelJS.Workbook): void {
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.type !== ExcelJS.ValueType.Formula) return;
        const v = cell.value as unknown as Record<string, unknown>;
        if (v.shareType === 'array') {
          cell.value = { formula: cell.formula, shareType: 'array', ref: v.ref } as unknown as ExcelJS.CellValue;
        } else {
          cell.value = { formula: cell.formula } as ExcelJS.CellFormulaValue;
        }
      });
    });
  }
}

/**
 * ExcelJS 4.4 는 불러올 때 유효성 범위를 칸 단위로 풀고, 저장할 때 주소를 문자열 순으로 정렬해 다시 묶는다.
 * 그래서 C3:C20 이 「C10:C20」+「C3:C20」 두 개로 겹쳐 써진다(행 번호 자릿수가 바뀌는 범위).
 * 원래 범위의 칸이 모두 같은 유효성으로 남아 있으면 그 칸들을 원래 범위 키 하나로 되돌린다.
 */
function restoreValidationRanges(wb: ExcelJS.Workbook, before: InspectXlsxResult): void {
  for (const ws of wb.worksheets) {
    const info = before.sheets.find((s) => s.name === ws.name);
    const dv = (ws as unknown as { dataValidations?: { model: Record<string, unknown> } }).dataValidations;
    if (!info || !dv) continue;
    const model = dv.model;
    for (const v of info.validations) {
      for (const part of v.range.split(/\s+/)) {
        const m = part.match(/^([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?$/);
        if (!m || !m[3]) continue;
        const c1 = ws.getColumn(m[1]).number;
        const c2 = ws.getColumn(m[3]).number;
        const r1 = Number(m[2]);
        const r2 = Number(m[4]);
        const keys: string[] = [];
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) keys.push(`${colLetter(c)}${r}`);
        const first = model[keys[0]];
        if (!first || !keys.every((k) => JSON.stringify(model[k]) === JSON.stringify(first))) continue;
        for (const k of keys) delete model[k];
        model[part] = first;
      }
    }
  }
}

/**
 * startRow 부터 지정 열이 모두 빈 행이 몇 줄 이어지는가.
 * 인쇄영역이 있으면 그 끝이 벽이다. 인쇄영역이 없고 시트 끝까지 비어 있으면 벽이 없다(Infinity) — 시트 끝은 벽이 아니다(G4 Act on 11).
 */
function templateCapacity(ws: ExcelJS.Worksheet, startRow: number, cols: string[]): number {
  const pa = ws.pageSetup?.printArea;
  const m = pa?.match(/:\$?[A-Z]+\$?(\d+)$/);
  const printEnd = m ? Number(m[1]) : null;
  const bound = printEnd ?? ws.rowCount;
  let n = 0;
  for (let r = startRow; r <= bound; r++) {
    const row = ws.getRow(r);
    const empty = cols.every((c) => {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master.address !== cell.address) return isEmptyValue(cell.master.value);
      return isEmptyValue(cell.value);
    });
    if (!empty) return n;
    n++;
  }
  return printEnd === null ? Infinity : n;
}

/** at 행 앞에 extra 행을 넣는다. 병합은 함께 내리고, 인쇄영역(한 범위)은 늘린다. 수식 참조·이름정의·유효성·조건부서식 범위는 손대지 않는다 */
function insertRowsKeepingMerges(ws: ExcelJS.Worksheet, at: number, extra: number): { printArea: 'grown' | 'unchanged' | 'not-simple' } {
  const merges = [...((ws.model as unknown as { merges?: string[] }).merges ?? [])];
  const moved: [string, string][] = [];
  for (const ref of merges) {
    const [a, b = a] = ref.split(':');
    const ca = parseCellAddress(a);
    const cb = parseCellAddress(b);
    if (!ca || !cb) continue;
    if (cb.row < at) continue; // 위쪽 병합은 그대로
    const top = ca.row >= at ? ca.row + extra : ca.row; // 넣는 자리를 걸치면 아래 끝만 늘린다
    const next = `${colLetter(ca.col)}${top}:${colLetter(cb.col)}${cb.row + extra}`;
    ws.unMergeCells(ref);
    moved.push([ref, next]);
  }
  ws.insertRows(at, Array.from({ length: extra }, () => []), 'i');
  for (const [, next] of moved) ws.mergeCells(next);
  const pa = ws.pageSetup?.printArea;
  if (!pa) return { printArea: 'unchanged' };
  // ExcelJS 모델 값('A1:F8', $ 없음)을 늘린다. 원문 $ 표기는 저장 뒤 restorePackage 가 되쓴다
  const grown = growRange(pa, at, extra);
  if (grown === null) return { printArea: 'not-simple' };
  if (grown === pa) return { printArea: 'unchanged' };
  ws.pageSetup.printArea = grown;
  return { printArea: 'grown' };
}

export async function fillXlsxTemplate(bytes: Uint8Array, opts: FillXlsxOptions = {}, limits: Limits = DEFAULT_LIMITS, strict = false): Promise<FillXlsxResult> {
  const opened = await openXlsx(bytes, limits);
  if ('reason' in opened) return fail(opened.reason, { code: opened.code, ...(opened.code === 'UNSUPPORTED_INPUT' ? { needsReview: true } : {}) });
  const before = inspectOpened(opened);
  const pkgBefore = packageFingerprint(opened.parts);
  const { wb } = opened;

  const issues: Warning[] = [];
  const warn = (code: string, message: string, at?: string) => issues.push(at ? { code, message, at } : { code, message });
  const changedCells: { sheet: string; cell: string }[] = [];

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
  if (hidden.length === 0) return patchFill(bytes, opened, before, opts.cells ?? [], rows ?? null, limits, strict);

  let inserted = { count: 0, at: null as number | null };
  try {
    // 공유 수식을 먼저 풀어 둔다 — 주인 칸을 덮어써도 저장이 깨지지 않게
    clearFormulaCaches(wb);

    for (const c of opts.cells ?? []) {
      const ws = wb.getWorksheet(c.sheet)!;
      const cell = ws.getCell(c.cell);
      if (cell.isMerged && cell.master.address !== cell.address) {
        warn('MERGED_CELL_SKIPPED', `${c.sheet}!${c.cell} 는 병합 칸(${cell.master.address})의 일부라 쓰지 않았습니다.`, `${c.sheet}!${c.cell}`);
        continue;
      }
      cell.value = c.value;
      changedCells.push({ sheet: c.sheet, cell: c.cell });
    }

    if (rows) {
      const ws = wb.getWorksheet(rows.sheet)!;
      const cols = Object.keys(rows.columns);
      const capacity = templateCapacity(ws, rows.startRow, cols);
      const extra = rows.data.length - capacity;
      if (extra > 0) {
        if ((rows.overflow ?? 'error') === 'error') {
          return fail(`자료 ${rows.data.length}행이 템플릿 빈 행 ${capacity}행보다 ${extra}행 많습니다.`, { code: 'OVERFLOW', overflowRows: extra });
        }
        const at = rows.startRow + capacity;
        const r = insertRowsKeepingMerges(ws, at, extra);
        inserted = { count: extra, at };
        const pa = r.printArea === 'grown' ? '인쇄영역은 늘렸습니다' : r.printArea === 'not-simple' ? '인쇄영역은 여러 범위라 늘리지 못했습니다' : '인쇄영역은 그대로입니다';
        warn(
          'ROWS_INSERTED',
          `템플릿 빈 행 ${capacity}행이 모자라 ${at}행 앞에 ${extra}행을 넣었습니다. 넣은 행에는 위 행의 서식만 있고 수식·데이터 유효성은 없습니다. ` +
            `아래로 밀린 칸의 수식 참조 범위(SUM 등)·이름정의·유효성·조건부서식 범위는 늘어나지 않았습니다. 병합은 함께 내렸고 ${pa}. 엑셀에서 확인하세요.`,
          `${rows.sheet}!${at}`,
        );
      }
      rows.data.forEach((rec, i) => {
        const r = rows.startRow + i;
        for (const [col, key] of Object.entries(rows.columns)) {
          const v = rec[key];
          if (v === undefined) continue;
          const cell = ws.getCell(`${col}${r}`);
          // 병합 종속 칸에 쓰면 ExcelJS 는 주인 칸을 덮어쓴다 — 쓰지 않고 알린다(G4 Act on 7)
          if (cell.isMerged && cell.master.address !== cell.address) {
            warn('MERGED_CELL_SKIPPED', `${rows.sheet}!${cell.address} 는 병합 칸(${cell.master.address})의 일부라 쓰지 않았습니다(자료 ${i + 1}행 ${key}).`, `${rows.sheet}!${cell.address}`);
            continue;
          }
          cell.value = v;
          changedCells.push({ sheet: rows.sheet, cell: cell.address });
        }
      });
    }

    for (const h of hidden) {
      const ws = wb.getWorksheet(h.sheet)!;
      for (const c of h.columns) ws.getColumn(c).hidden = true;
    }

    restoreValidationRanges(wb, before);
    wb.calcProperties.fullCalcOnLoad = true;
    const written = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    // ExcelJS 가 버린 부품·바꾼 인쇄 이름 표기를 원본에서 되돌린다
    const insertedAt = rows && inserted.count > 0 && inserted.at !== null ? { sheet: rows.sheet, at: inserted.at, count: inserted.count } : null;
    const expectedPrint = expectedPrintNames(pkgBefore, insertedAt);
    const fixed = await restorePackage(opened.parts, written, { expectedPrint, inserted: insertedAt });
    const out = fixed.bytes;
    if (out.length > limits.maxOutputBytes) return fail(`결과가 ${limits.maxOutputBytes} 바이트를 넘습니다.`, { code: 'WRITE_FAILED' });

    // 다시 열어 비교 — 결과는 우리가 만든 것이라 입력 상한 대신 넉넉한 상한으로 연다
    const reopenLimits = { ...limits, maxInputBytes: Math.max(limits.maxInputBytes, out.length), maxUnzippedBytes: Math.max(limits.maxUnzippedBytes, 4 * limits.maxUnzippedBytes), maxCells: Number.MAX_SAFE_INTEGER };
    const reopened = await openXlsx(out, reopenLimits);
    if ('reason' in reopened) return fail(`채운 파일을 다시 검사하지 못했습니다: ${reopened.reason}`, { code: 'WRITE_FAILED', needsReview: true });
    const after = inspectOpened(reopened);
    const zAfter = readZipGuarded(out, reopenLimits);
    const cmp = zAfter.ok ? comparePackage(pkgBefore, packageFingerprint(zAfter.parts), expectedPrint) : { lost: ['결과 zip 을 다시 풀지 못함'], same: false };
    const lostAll = [...cmp.lost, ...fixed.unrecoverable];
    const pkg = { lost: lostAll, restored: fixed.restored, same: lostAll.length === 0 };
    // 인쇄영역(ExcelJS 모델 값) 기대값 — 행을 넣은 시트만 끝 행이 는다
    const printAreaExpected: Record<string, string | null> = {};
    for (const s of before.sheets) {
      const pa = s.printArea ?? null;
      printAreaExpected[s.name] = pa && insertedAt && insertedAt.sheet === s.name ? (growRange(pa, insertedAt.at, insertedAt.count) ?? pa) : pa;
    }
    const preserved = comparePreserved(before, after, pkg, inserted, { printArea: printAreaExpected, hiddenColumns: hidden });
    if (!preserved.allSame) {
      const diff = Object.entries(preserved)
        .filter(([k, v]) => k !== 'allSame' && typeof v === 'object' && !v.same)
        .map(([k]) => k);
      const lost = pkg.lost.length ? ` — 엑셀 라이브러리가 읽지 못해 빠진 것: ${pkg.lost.join(' · ')}` : '';
      warn('PRESERVATION_LOSS', `보존 항목이 달라졌습니다: ${diff.join(', ')}${lost}`);
      if (strict) {
        return fail(`엄격 모드: 보존 항목이 달라져 결과를 돌려주지 않습니다(${diff.join(', ')}).`, { code: 'PRESERVATION_LOSS', preserved, issues, warnings: issues.map((x) => x.message) });
      }
    }
    return { ok: true, bytes: out, changedCells, preserved, fullCalcOnLoad: true, warnings: issues.map((x) => x.message), issues };
  } catch (e) {
    // 쓰기·저장 중 라이브러리 예외(공유 수식·깨진 모델 등) — 던지지 않고 구조화 실패로(G4 Act on 12)
    return fail(`채우는 중 오류가 났습니다: ${(e as Error).message}`, { code: 'WRITE_FAILED' });
  }
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
): Promise<FillXlsxResult> {
  const issues: Warning[] = [];
  const changedCells: { sheet: string; cell: string }[] = [];
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
    if (r.changed.length > 0) newParts.set(path, r.xml);
  }
  const cellsForCheck = all;

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
  });
  if (!preserved.allSame) {
    const diff = Object.entries(preserved)
      .filter(([k, v]) => k !== 'allSame' && typeof v === 'object' && !v.same)
      .map(([k]) => k);
    issues.push({ code: 'PRESERVATION_LOSS', message: `보존 항목이 달라졌습니다: ${diff.join(', ')}` });
    if (strict) return fail(`엄격 모드: 보존 항목이 달라져 결과를 돌려주지 않습니다(${diff.join(', ')}).`, { code: 'PRESERVATION_LOSS', preserved, issues, warnings: issues.map((x) => x.message) });
  }
  return { ok: true, bytes: out, changedCells, preserved, fullCalcOnLoad: false, warnings: issues.map((x) => x.message), issues };
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
