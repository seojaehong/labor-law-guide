// 사양(JSON)으로 xlsx 서식 만들기 — 바이트 출력, fs·네트워크 없음.
// 행 배치: [제목 1행(선택, 열 폭만큼 병합)] → [headerRows(선택)] → 열 머리행 → rows 자료.
import ExcelJS from 'exceljs';
import type { FillValue } from './fill';

export interface XlsxSpecColumn {
  key: string;
  header: string;
  width?: number;
  wrap?: boolean;
}

export interface XlsxSpecSheet {
  name: string;
  /** 1행 제목. 있으면 열 수만큼 병합한다. */
  title?: string;
  columns: XlsxSpecColumn[];
  /** 열 머리행 위에 넣을 추가 머리행(묶음 머리 등). 칸마다 글자 또는 null. 병합은 merges 로 지정. */
  headerRows?: (string | null)[][];
  merges?: string[];
  validations?: { range: string; list: string[] }[];
  /** 틀고정: 고정되지 않은 첫 칸 주소(예 'B3') */
  freeze?: string;
  print?: { orientation: 'landscape' | 'portrait'; paper: 'A4'; fitToWidth?: number; printTitlesRows?: string };
  rows?: Record<string, FillValue | undefined>[];
}

export interface XlsxSpec {
  sheets: XlsxSpecSheet[];
}

export type MakeXlsxResult = { ok: true; bytes: Uint8Array } | { ok: false; errors: string[] };

const CELL_RE = /^\$?[A-Z]{1,3}\$?[1-9]\d*$/;
const RANGE_RE = /^\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?$/;
const MERGE_RE = /^\$?[A-Z]{1,3}\$?[1-9]\d*:\$?[A-Z]{1,3}\$?[1-9]\d*$/;
const BAD_SHEET_CHARS = /[\\/?*[\]:]/;

function validate(spec: XlsxSpec): string[] {
  const errors: string[] = [];
  if (!spec || !Array.isArray(spec.sheets) || spec.sheets.length === 0) return ['시트가 하나도 없습니다.'];
  const seen = new Set<string>();
  spec.sheets.forEach((s, i) => {
    const at = `sheets[${i}]${s?.name ? `(${s.name})` : ''}`;
    const name = typeof s?.name === 'string' ? s.name.trim() : '';
    if (!name) errors.push(`${at}: 시트 이름이 비어 있습니다.`);
    else {
      if (seen.has(name)) errors.push(`${at}: 시트 이름 중복: ${name}`);
      seen.add(name);
      if (name.length > 31) errors.push(`${at}: 시트 이름이 31자를 넘습니다.`);
      if (BAD_SHEET_CHARS.test(name)) errors.push(`${at}: 시트 이름에 쓸 수 없는 글자(\\ / ? * [ ] :)가 있습니다.`);
    }
    const cols = Array.isArray(s?.columns) ? s.columns : [];
    if (cols.length === 0) errors.push(`${at}: 열이 없습니다.`);
    const keys = new Set<string>();
    for (const c of cols) {
      if (!c?.key) errors.push(`${at}: 열 key 가 비어 있습니다.`);
      else if (keys.has(c.key)) errors.push(`${at}: 열 key 중복: ${c.key}`);
      else keys.add(c.key);
    }
    for (const m of s?.merges ?? []) if (!MERGE_RE.test(m)) errors.push(`${at}: 병합 범위 형식이 틀렸습니다: ${m}`);
    for (const v of s?.validations ?? []) {
      if (!RANGE_RE.test(v?.range ?? '')) errors.push(`${at}: 유효성 범위 형식이 틀렸습니다: ${v?.range}`);
      const list = Array.isArray(v?.list) ? v.list : [];
      if (list.length === 0) errors.push(`${at}: 유효성 ${v?.range} 목록이 비어 있습니다.`);
      else if (list.some((x) => /[,"]/.test(String(x)))) errors.push(`${at}: 유효성 ${v.range} 목록 항목에 쉼표·따옴표가 있습니다.`);
      else if (list.join(',').length > 255) errors.push(`${at}: 유효성 ${v.range} 목록이 255자를 넘습니다.`);
    }
    if (s?.freeze !== undefined && !CELL_RE.test(s.freeze)) errors.push(`${at}: 틀고정 칸 주소가 틀렸습니다: ${s.freeze}`);
    if (s?.print) {
      if (s.print.orientation !== 'landscape' && s.print.orientation !== 'portrait')
        errors.push(`${at}: 인쇄 방향은 landscape·portrait 만 됩니다.`);
      if (s.print.paper !== 'A4') errors.push(`${at}: 용지는 A4 만 지원합니다.`);
      if (s.print.printTitlesRows !== undefined && !/^[1-9]\d*:[1-9]\d*$/.test(s.print.printTitlesRows))
        errors.push(`${at}: 인쇄제목 행 형식이 틀렸습니다(예 1:2): ${s.print.printTitlesRows}`);
      if (s.print.fitToWidth !== undefined && !(Number.isInteger(s.print.fitToWidth) && s.print.fitToWidth >= 1))
        errors.push(`${at}: fitToWidth 는 1 이상 정수여야 합니다.`);
    }
    (s?.rows ?? []).forEach((r, ri) => {
      for (const k of Object.keys(r ?? {})) if (!keys.has(k)) errors.push(`${at}: rows[${ri}] 에 없는 열 key: ${k}`);
    });
  });
  return errors;
}

export async function makeXlsxFromSpec(spec: XlsxSpec): Promise<MakeXlsxResult> {
  const errors = validate(spec);
  if (errors.length) return { ok: false, errors };

  const wb = new ExcelJS.Workbook();
  try {
    for (const s of spec.sheets) {
      const ws = wb.addWorksheet(s.name.trim());
      const n = s.columns.length;
      s.columns.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        if (c.width !== undefined) col.width = c.width;
        if (c.wrap) col.alignment = { wrapText: true, vertical: 'top' };
      });

      let r = 1;
      if (s.title) {
        const cell = ws.getCell(r, 1);
        cell.value = s.title;
        cell.font = { bold: true, size: 14 };
        if (n > 1) ws.mergeCells(r, 1, r, n);
        r++;
      }
      for (const hr of s.headerRows ?? []) {
        const row = ws.getRow(r);
        hr.forEach((v, i) => {
          if (v !== null && v !== undefined) row.getCell(i + 1).value = v;
        });
        row.font = { bold: true };
        r++;
      }
      const head = ws.getRow(r);
      s.columns.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'thin' } };
      });
      r++;
      for (const d of s.rows ?? []) {
        const row = ws.getRow(r);
        s.columns.forEach((c, i) => {
          const v = d[c.key];
          if (v !== undefined && v !== null && v !== '') row.getCell(i + 1).value = v;
        });
        r++;
      }

      for (const m of s.merges ?? []) ws.mergeCells(m);
      for (const v of s.validations ?? []) {
        (ws as unknown as { dataValidations: { add(range: string, v: unknown): void } }).dataValidations.add(
          v.range.replace(/\$/g, ''),
          { type: 'list', allowBlank: true, formulae: [`"${v.list.join(',')}"`] },
        );
      }
      if (s.freeze) {
        const cell = ws.getCell(s.freeze.replace(/\$/g, ''));
        ws.views = [
          { state: 'frozen', xSplit: Number(cell.col) - 1, ySplit: Number(cell.row) - 1, topLeftCell: cell.address },
        ];
      }
      if (s.print) {
        ws.pageSetup.orientation = s.print.orientation;
        ws.pageSetup.paperSize = 9;
        if (s.print.fitToWidth !== undefined) {
          ws.pageSetup.fitToPage = true;
          ws.pageSetup.fitToWidth = s.print.fitToWidth;
          ws.pageSetup.fitToHeight = 0;
        }
        if (s.print.printTitlesRows) ws.pageSetup.printTitlesRow = s.print.printTitlesRows;
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, bytes: new Uint8Array(buf as ArrayBuffer) };
  } catch (e) {
    return { ok: false, errors: [`서식을 만들지 못했습니다: ${(e as Error).message}`] };
  }
}
