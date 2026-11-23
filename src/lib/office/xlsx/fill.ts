// XLSX 템플릿 채우기 — 바이트 입력 → 바이트 출력, fs·네트워크 없음.
// 고객 원본에 지정 셀·행만 채우고 나머지 서식은 그대로 둔다.
// ExcelJS 는 저장할 때 옛 수식 캐시(<v>)를 남기므로, 수식 셀 캐시를 지우고 fullCalcOnLoad 를 켠다.
// 보존 비교는 두 겹이다 — ①ExcelJS 모델(병합·수식·유효성·인쇄…) ②ExcelJS 밖 zip 부품·rels·extLst·x14 원문(package.ts).
import ExcelJS from 'exceljs';
import { colLetter, inspectOpened, openXlsx, type InspectXlsxResult, type OpenFailCode } from './inspect';
import { comparePackage, packageFingerprint, type PackageComparison } from './package';
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

export interface FillXlsxOptions {
  cells?: FillCell[];
  rows?: FillRows;
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
  /** ExcelJS 밖 — zip 부품·rels·extLst·x14 원문. lost 에 잃은 것 */
  package: { lost: string[]; same: boolean };
  /** insertRows 로 넣은 행(없으면 0). 넣었으면 same:false */
  insertedRows: { count: number; at: number | null; same: boolean };
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

export function comparePreserved(
  before: InspectXlsxResult,
  after: InspectXlsxResult,
  pkg: Pick<PackageComparison, 'lost' | 'same'> = { lost: [], same: true },
  inserted: { count: number; at: number | null } = { count: 0, at: null },
): PreservedReport {
  const names = (r: InspectXlsxResult) => r.definedNames.map((d) => `${d.name}=${d.ranges.join(',')}`).sort();
  const dnBefore = { '': names(before) };
  const dnAfter = { '': names(after) };
  const report: Omit<PreservedReport, 'allSame'> = {
    merges: item(before, after, (s) => [...s.merges].sort()),
    formulaCells: item(before, after, (s) => s.formulaCells),
    conditionalRules: item(before, after, (s) => s.conditionalRules),
    validations: item(before, after, (s) => s.validations.map((v) => v.range).sort()),
    printArea: item(before, after, (s) => s.printArea ?? null),
    printTitles: item(before, after, (s) => s.printTitles ?? null),
    orientation: item(before, after, (s) => s.orientation ?? null),
    fitToWidth: item(before, after, (s) => s.fitToWidth ?? null),
    images: item(before, after, (s) => s.images),
    definedNames: { before: dnBefore, after: dnAfter, same: JSON.stringify(dnBefore) === JSON.stringify(dnAfter) },
    package: { lost: pkg.lost, same: pkg.same },
    insertedRows: { ...inserted, same: inserted.count === 0 },
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

/** 'A1:F8' → 행 끝을 늘린다. 한 범위가 아니면 null */
function growPrintArea(pa: string, at: number, extra: number): string | null {
  const m = /^(\$?[A-Z]+\$?)(\d+):(\$?[A-Z]+\$?)(\d+)$/.exec(pa);
  if (!m) return null;
  const r1 = Number(m[2]);
  const r2 = Number(m[4]);
  if (at < r1 || at > r2 + 1) return pa;
  return `${m[1]}${r1}:${m[3]}${r2 + extra}`;
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
  const grown = growPrintArea(pa, at, extra);
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

    restoreValidationRanges(wb, before);
    wb.calcProperties.fullCalcOnLoad = true;
    const out = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    if (out.length > limits.maxOutputBytes) return fail(`결과가 ${limits.maxOutputBytes} 바이트를 넘습니다.`, { code: 'WRITE_FAILED' });

    // 다시 열어 비교 — 결과는 우리가 만든 것이라 입력 상한 대신 넉넉한 상한으로 연다
    const reopenLimits = { ...limits, maxInputBytes: Math.max(limits.maxInputBytes, out.length), maxUnzippedBytes: Math.max(limits.maxUnzippedBytes, 4 * limits.maxUnzippedBytes), maxCells: Number.MAX_SAFE_INTEGER };
    const reopened = await openXlsx(out, reopenLimits);
    if ('reason' in reopened) return fail(`채운 파일을 다시 검사하지 못했습니다: ${reopened.reason}`, { code: 'WRITE_FAILED', needsReview: true });
    const after = inspectOpened(reopened);
    const zAfter = readZipGuarded(out, reopenLimits);
    const pkg = zAfter.ok ? comparePackage(pkgBefore, packageFingerprint(zAfter.parts)) : { lost: ['결과 zip 을 다시 풀지 못함'], same: false };
    const preserved = comparePreserved(before, after, pkg, inserted);
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
