// XLSX 행 추출 — 바이트 입력, fs·네트워크 없음.
// 머리행 아래 행을 셀 주소·원문값·수식·캐시값·병합 출처와 함께 돌린다.
// 문자 값은 그대로 둔다(「높음 (6)」 을 숫자로 바꾸지 않는다 — 척도 보존).
import ExcelJS from 'exceljs';
import { openXlsx, sheetPaths, type OpenFailCode } from './inspect';
import { unescapeOoxmlText } from './patch';
import { DEFAULT_LIMITS, type Limits } from '../limits';

export type XlsxRaw = string | number | boolean | null;

export interface ExtractedCell {
  cell: string;
  raw: XlsxRaw;
  cachedValue?: XlsxRaw;
  formula?: string;
  mergedFrom?: string;
}

export interface ExtractedRow {
  rowNumber: number;
  cells: Record<string, ExtractedCell>;
}

export interface ExtractXlsxOptions {
  /** 시트 이름. 없으면 첫 시트 */
  sheet?: string;
  /** 머리행 번호(1부터). 기본 1 */
  headerRow?: number;
  /** 돌릴 자료 행 상한. 기본 10000 */
  maxRows?: number;
}

export interface ExtractXlsxResult {
  ok: boolean;
  needsReview?: boolean;
  reason?: string;
  code?: OpenFailCode | 'INVALID_ARGS';
  sheet?: string;
  headers: string[];
  rows: ExtractedRow[];
  warnings: string[];
}

const DEFAULT_MAX_ROWS = 10000;

function fail(reason: string, code: ExtractXlsxResult['code'] = 'INVALID_ARGS'): ExtractXlsxResult {
  return { ok: false, ...(code === 'UNSUPPORTED_INPUT' ? { needsReview: true } : {}), code, reason, headers: [], rows: [], warnings: [] };
}

/** ExcelJS 셀 값 → 원문 값. 문자는 그대로, 날짜는 ISO 문자열, 서식 글자는 이어 붙인 글자. */
function toRaw(v: unknown): XlsxRaw {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if (typeof o.text === 'string') return o.text; // 하이퍼링크
    if (typeof o.error === 'string') return o.error;
  }
  return String(v);
}


export async function extractXlsxRows(bytes: Uint8Array, opts: ExtractXlsxOptions = {}, limits: Limits = DEFAULT_LIMITS): Promise<ExtractXlsxResult> {
  const opened = await openXlsx(bytes, limits);
  if ('reason' in opened) return fail(opened.reason, opened.code);
  const { wb } = opened;

  const ws = opts.sheet === undefined ? wb.worksheets[0] : wb.getWorksheet(opts.sheet);
  if (!ws) return fail(`시트를 찾을 수 없습니다: ${opts.sheet ?? '(첫 시트)'}`);
  // ExcelJS 는 inlineStr 글의 _xHHHH_ 를 풀지 않는다(sst 글은 푼다) — 엑셀과 같게 읽으려고 inlineStr 칸만 푼다(설계 v2.1 §2-2)
  const sheetPart = sheetPaths(opened.parts).get(ws.name);
  const sheetXml = sheetPart ? new TextDecoder('utf-8').decode(opened.parts.get(sheetPart)) : '';
  const inline = new Set<string>();
  for (const m of sheetXml.matchAll(/<c\b([^>]*)>/g)) {
    if (!/\st="inlineStr"/.test(m[1])) continue;
    const r = /\sr="([^"]+)"/.exec(m[1])?.[1];
    if (r) inline.add(r);
  }
  const val = (cell: ExcelJS.Cell): XlsxRaw => {
    const v = toRaw(cell.value);
    return typeof v === 'string' && inline.has(cell.address) ? unescapeOoxmlText(v) : v;
  };
  const headerRow = opts.headerRow ?? 1;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  if (!Number.isInteger(headerRow) || headerRow < 1) return fail(`headerRow 가 올바르지 않습니다: ${headerRow}`);
  if (!Number.isInteger(maxRows) || maxRows < 1) return fail(`maxRows 가 올바르지 않습니다: ${maxRows}`);

  const warnings: string[] = [];
  const colCount = ws.columnCount;
  // 읽는 고리는 (마지막 행 - 머리행) × 열 수 만큼 돈다 — 먼 칸 하나로 수십억 번 돌지 않게 작업량 상한에 건다(G4 Act on 3)
  const loop = Math.max(0, ws.rowCount - headerRow) * colCount;
  if (loop > limits.maxCells) {
    return fail(`읽을 범위(${ws.rowCount - headerRow}행 × ${colCount}열)가 작업량 상한 ${limits.maxCells}칸을 넘습니다.`, 'WORKLOAD_TOO_LARGE');
  }

  // 머리: 빈 머리 칸은 열 문자, 같은 이름이 겹치면 「이름#열문자」 로 구분하고 경고
  const headers: string[] = [];
  const hRow = ws.getRow(headerRow);
  const seen = new Set<string>();
  for (let c = 1; c <= colCount; c++) {
    const cell = hRow.getCell(c);
    const letter = cell.address.replace(/\d+$/, '');
    let name = cell.isMerged && cell.master.address !== cell.address ? '' : val(cell) === null ? '' : String(val(cell)).trim();
    if (!name) name = letter;
    if (seen.has(name)) {
      warnings.push(`머리 「${name}」 가 겹쳐 ${cell.address} 를 「${name}#${letter}」 로 씁니다.`);
      name = `${name}#${letter}`;
    }
    seen.add(name);
    headers.push(name);
  }

  const rows: ExtractedRow[] = [];
  let truncated = 0;
  const lastRow = ws.rowCount;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, ExtractedCell> = {};
    let hasOwnValue = false;
    const rowWarnings: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const out: ExtractedCell = { cell: cell.address, raw: null };
      if (cell.isMerged && cell.master.address !== cell.address) {
        out.mergedFrom = cell.master.address;
        out.raw = val(cell.master);
      } else if (cell.type === ExcelJS.ValueType.Formula) {
        hasOwnValue = true;
        out.formula = cell.formula;
        const result = (cell.value as ExcelJS.CellFormulaValue).result;
        if (result === undefined) {
          rowWarnings.push(`${cell.address}: 수식 캐시값이 없습니다(파일을 엑셀에서 다시 계산해 저장해야 값이 보입니다).`);
        } else {
          out.cachedValue = toRaw(result);
        }
        out.raw = out.cachedValue ?? null;
      } else {
        out.raw = val(cell);
        if (out.raw !== null) hasOwnValue = true;
      }
      cells[headers[c - 1]] = out;
    }
    if (!hasOwnValue) continue; // 완전히 빈 행(병합 이어짐만 있는 행 포함)은 건너뛴다
    if (rows.length >= maxRows) {
      truncated++;
      continue;
    }
    rows.push({ rowNumber: r, cells });
    warnings.push(...rowWarnings);
  }
  if (truncated > 0) warnings.push(`maxRows ${maxRows} 를 넘어 ${truncated}행을 잘랐습니다.`);

  return { ok: true, sheet: ws.name, headers, rows, warnings };
}
