import type { ComparisonRow } from './annual-leave';
import type { ParsedRow } from './leave-sheet';

export type LeaveResultRow = { row: ParsedRow; result: ComparisonRow | null };

export function isLeaveCalculationError(result: ComparisonRow | null): boolean {
  return !result || result.verdict === 'error' || !Number.isFinite(result.calculatedDays) || !Number.isFinite(result.diff);
}

/** Shared by clipboard and XLSX: failure is never a successful comparison. */
export function leaveExportRow({ row, result }: LeaveResultRow): (string | number)[] {
  const recorded = row.recordedDays !== null && Number.isFinite(row.recordedDays)
    ? row.recordedDays : row.recordedRaw ?? '';
  if (isLeaveCalculationError(result)) {
    return [row.name, row.hireDate, '', recorded, '', '계산 불가', row.error || result?.errorMessage || '계산 결과를 확인할 수 없습니다'];
  }
  const valid = result!;
  const hasRecorded = row.recordedDays !== null;
  return [row.name, row.hireDate, valid.calculatedDays, recorded, hasRecorded ? valid.diff : '',
    hasRecorded ? valid.verdict === 'match' ? '일치' : '차이 있음'
      : row.recordedRaw ? '대조 못 함(숫자 아님)' : '대장값 없음', valid.basisLabel];
}

export function leaveCsv(rows: LeaveResultRow[], asOf: string): string {
  const header = ['이름', '입사일', '기준일', '발생일수', '대장기재', '차이', '판정', '적용근거'];
  const data = rows.map(item => {
    const cells = leaveExportRow(item);
    return [...cells.slice(0, 2), asOf, ...cells.slice(2)];
  });
  return [header, ...data].map(cells => cells.map(cell => `"${spreadsheetCell(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Clipboard delimiters cannot create another cell; string formulas remain text. */
export function spreadsheetCell(cell: string | number): string {
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  const text = cell.replace(/[\t\r\n\u0000-\u001f\u007f]/g, ' ');
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function leaveTsv(rows: LeaveResultRow[], asOf: string): string {
  const header = ['이름', '입사일', '기준일', '발생일수', '대장기재', '차이', '판정', '적용근거'];
  const data = rows.map(item => {
    const cells = leaveExportRow(item);
    return [...cells.slice(0, 2), asOf, ...cells.slice(2)];
  });
  return [header, ...data].map(cells => cells.map(spreadsheetCell).join('\t')).join('\r\n');
}
