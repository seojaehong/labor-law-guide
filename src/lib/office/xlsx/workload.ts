// ExcelJS 에 넘기기 전 사전 스캔 — 시트 XML 원문에서 작업량을 어림한다(G4 Act on 3).
// ExcelJS 는 불러올 때 데이터 유효성 범위·병합 범위를 칸 단위로 푼다. 6KB 파일에 A1:XFD1048576 한 줄이면 170억 칸이다.
// 그래서 칸 수 + 유효성 범위 넓이 + 병합 범위 넓이를 더해 maxCells 와 비교하고, 엑셀 한계 밖 주소는 거른다.

export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLS = 16_384; // XFD

export interface Workload {
  cells: number;
  validationArea: number;
  mergeArea: number;
  maxRow: number;
  maxCol: number;
  units: number;
}

export type WorkloadResult = { ok: true; workload: Workload } | { ok: false; code: 'WORKLOAD_TOO_LARGE' | 'BAD_ADDRESS'; message: string };

/** 'A' → 1, 'XFD' → 16384. 글자가 아니면 NaN */
export function colNumber(letters: string): number {
  if (!/^[A-Z]{1,3}$/.test(letters)) return NaN;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 'B3' → {row:3,col:2}. 엑셀 한계(1,048,576행·XFD열) 밖이거나 모양이 틀리면 null */
export function parseCellAddress(addr: string): { row: number; col: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/.exec(addr);
  if (!m) return null;
  const col = colNumber(m[1]);
  const row = Number(m[2]);
  if (!(col >= 1 && col <= EXCEL_MAX_COLS) || row > EXCEL_MAX_ROWS) return null;
  return { row, col };
}

/** 'A1:C3' 또는 'A1' 의 넓이. 열·행 전체 참조(A:A, 1:1)는 엑셀 한계 끝까지로 센다. 모양이 틀리면 null */
export function rangeArea(ref: string): number | null {
  const parts = ref.split(':');
  if (parts.length === 1) return parseCellAddress(parts[0]) ? 1 : null;
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const ca = parseCellAddress(a);
  const cb = parseCellAddress(b);
  if (ca && cb) return (Math.abs(cb.row - ca.row) + 1) * (Math.abs(cb.col - ca.col) + 1);
  const colA = colNumber(a.replace(/\$/g, ''));
  const colB = colNumber(b.replace(/\$/g, ''));
  if (colA && colB) return (Math.abs(colB - colA) + 1) * EXCEL_MAX_ROWS;
  const rowA = Number(a.replace(/\$/g, ''));
  const rowB = Number(b.replace(/\$/g, ''));
  if (Number.isInteger(rowA) && Number.isInteger(rowB) && rowA > 0 && rowB > 0) return (Math.abs(rowB - rowA) + 1) * EXCEL_MAX_COLS;
  return null;
}

const SHEET_PART = /^xl\/worksheets\/[^/]+\.xml$/;

/** zip 부품(이미 크기 검사를 통과한 것)에서 시트 XML 의 작업량을 센다 */
export function scanXlsxWorkload(parts: Map<string, Uint8Array>, maxCells: number): WorkloadResult {
  const dec = new TextDecoder('utf-8');
  const w: Workload = { cells: 0, validationArea: 0, mergeArea: 0, maxRow: 0, maxCol: 0, units: 0 };
  const over = () => w.cells + w.validationArea + w.mergeArea > maxCells;
  const tooBig = (): WorkloadResult => ({
    ok: false,
    code: 'WORKLOAD_TOO_LARGE',
    message: `작업량이 상한(${maxCells}칸 환산)을 넘습니다 — 칸 ${w.cells}, 유효성 범위 ${w.validationArea}, 병합 범위 ${w.mergeArea}.`,
  });
  for (const [name, data] of parts) {
    if (!SHEET_PART.test(name)) continue;
    const xml = dec.decode(data);
    for (const m of xml.matchAll(/<c\b[^>]*?\br="([^"]*)"/g)) {
      const a = parseCellAddress(m[1]);
      if (!a) return { ok: false, code: 'BAD_ADDRESS', message: `${name}: 엑셀 한계 밖이거나 틀린 칸 주소 ${m[1].slice(0, 20)}` };
      w.cells++;
      if (a.row > w.maxRow) w.maxRow = a.row;
      if (a.col > w.maxCol) w.maxCol = a.col;
      if (w.cells > maxCells) return tooBig();
    }
    for (const m of xml.matchAll(/<dataValidation\b[^>]*?\bsqref="([^"]*)"/g)) {
      for (const ref of m[1].trim().split(/\s+/)) {
        if (!ref) continue;
        const area = rangeArea(ref);
        if (area === null) return { ok: false, code: 'BAD_ADDRESS', message: `${name}: 유효성 범위가 틀렸습니다 ${ref.slice(0, 30)}` };
        w.validationArea += area;
        if (over()) return tooBig();
      }
    }
    for (const m of xml.matchAll(/<mergeCell\b[^>]*?\bref="([^"]*)"/g)) {
      const area = rangeArea(m[1]);
      if (area === null) return { ok: false, code: 'BAD_ADDRESS', message: `${name}: 병합 범위가 틀렸습니다 ${m[1].slice(0, 30)}` };
      w.mergeArea += area;
      if (over()) return tooBig();
    }
  }
  w.units = w.cells + w.validationArea + w.mergeArea;
  return { ok: true, workload: w };
}
