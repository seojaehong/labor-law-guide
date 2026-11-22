// XLSX 템플릿 채우기 — 바이트 입력 → 바이트 출력, fs·네트워크 없음.
// 고객 원본에 지정 셀·행만 채우고 나머지 서식은 그대로 둔다.
// ExcelJS 는 저장할 때 옛 수식 캐시(<v>)를 남기므로, 수식 셀 캐시를 지우고 fullCalcOnLoad 를 켠다.
import ExcelJS from 'exceljs';
import { colLetter, inspectXlsx, openXlsx, type InspectXlsxResult } from './inspect';

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
  allSame: boolean;
}

export interface FillXlsxResult {
  ok: boolean;
  needsReview?: boolean;
  reason?: string;
  bytes?: Uint8Array;
  changedCells: { sheet: string; cell: string }[];
  preserved?: PreservedReport;
  fullCalcOnLoad: boolean;
  /** overflow='error' 로 멈췄을 때 넘친 자료 행 수 */
  overflowRows?: number;
  warnings: string[];
}

const CELL_RE = /^[A-Z]{1,3}[1-9]\d*$/;
const COL_RE = /^[A-Z]{1,3}$/;

function fail(reason: string, extra: Partial<FillXlsxResult> = {}): FillXlsxResult {
  return { ok: false, reason, changedCells: [], fullCalcOnLoad: false, warnings: [], ...extra };
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

export function comparePreserved(before: InspectXlsxResult, after: InspectXlsxResult): PreservedReport {
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
  };
  const allSame = Object.values(report).every((x) => x.same);
  return { ...report, allSame };
}

/** 모든 수식 셀의 캐시값을 지운다(공유 수식은 풀어서 제 수식으로 쓴다). */
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

/** startRow 부터 지정 열이 모두 빈 행이 몇 줄 이어지는가(인쇄영역 끝 또는 시트 끝까지). */
function templateCapacity(ws: ExcelJS.Worksheet, startRow: number, cols: string[]): number {
  let bound = ws.rowCount;
  const pa = ws.pageSetup?.printArea;
  const m = pa?.match(/:\$?[A-Z]+\$?(\d+)$/);
  if (m) bound = Math.max(bound, Number(m[1]));
  let n = 0;
  for (let r = startRow; r <= bound; r++) {
    const row = ws.getRow(r);
    const empty = cols.every((c) => {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master.address !== cell.address) return isEmptyValue(cell.master.value);
      return isEmptyValue(cell.value);
    });
    if (!empty) break;
    n++;
  }
  return n;
}

export async function fillXlsxTemplate(bytes: Uint8Array, opts: FillXlsxOptions = {}): Promise<FillXlsxResult> {
  const before = await inspectXlsx(bytes);
  if (!before.ok) return fail(before.reason ?? '검사 실패', { needsReview: true });
  const opened = await openXlsx(bytes);
  if ('reason' in opened) return fail(opened.reason, { needsReview: true });
  const { wb } = opened;

  const warnings: string[] = [];
  const changedCells: { sheet: string; cell: string }[] = [];

  // 입력 검사(쓰기 전에 전부 확인)
  for (const c of opts.cells ?? []) {
    if (!wb.getWorksheet(c.sheet)) return fail(`시트를 찾을 수 없습니다: ${c.sheet}`);
    if (!CELL_RE.test(c.cell)) return fail(`셀 주소가 올바르지 않습니다: ${c.cell}`);
  }
  const rows = opts.rows;
  if (rows) {
    if (!wb.getWorksheet(rows.sheet)) return fail(`시트를 찾을 수 없습니다: ${rows.sheet}`);
    if (!Number.isInteger(rows.startRow) || rows.startRow < 1) return fail(`startRow 가 올바르지 않습니다: ${rows.startRow}`);
    const bad = Object.keys(rows.columns).filter((c) => !COL_RE.test(c));
    if (bad.length) return fail(`열 문자가 올바르지 않습니다: ${bad.join(', ')}`);
    if (!Array.isArray(rows.data)) return fail('rows.data 가 배열이 아닙니다.');
  }

  for (const c of opts.cells ?? []) {
    const ws = wb.getWorksheet(c.sheet)!;
    const cell = ws.getCell(c.cell);
    if (cell.isMerged && cell.master.address !== cell.address) {
      warnings.push(`${c.sheet}!${c.cell} 는 병합 칸(${cell.master.address})의 일부라 쓰지 않았습니다.`);
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
        return fail(`자료 ${rows.data.length}행이 템플릿 빈 행 ${capacity}행보다 ${extra}행 많습니다.`, {
          overflowRows: extra,
        });
      }
      const at = rows.startRow + capacity;
      ws.insertRows(at, Array.from({ length: extra }, () => []), 'i');
      warnings.push(
        `템플릿 빈 행 ${capacity}행이 모자라 ${at}행 앞에 ${extra}행을 넣었습니다. 아래쪽 수식·병합·인쇄영역 참조는 자동으로 고쳐지지 않으니 확인하세요.`,
      );
    }
    rows.data.forEach((rec, i) => {
      const r = rows.startRow + i;
      for (const [col, key] of Object.entries(rows.columns)) {
        const v = rec[key];
        if (v === undefined) continue;
        const cell = ws.getCell(`${col}${r}`);
        cell.value = v;
        changedCells.push({ sheet: rows.sheet, cell: cell.address });
      }
    });
  }

  clearFormulaCaches(wb);
  restoreValidationRanges(wb, before);
  wb.calcProperties.fullCalcOnLoad = true;
  const out = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);

  const after = await inspectXlsx(out);
  if (!after.ok) return fail(`채운 파일을 다시 검사하지 못했습니다: ${after.reason}`, { needsReview: true });
  const preserved = comparePreserved(before, after);
  if (!preserved.allSame) {
    const diff = Object.entries(preserved)
      .filter(([k, v]) => k !== 'allSame' && typeof v === 'object' && !v.same)
      .map(([k]) => k);
    warnings.push(`보존 항목이 달라졌습니다: ${diff.join(', ')}`);
  }

  return { ok: true, bytes: out, changedCells, preserved, fullCalcOnLoad: true, warnings };
}
