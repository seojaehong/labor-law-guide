import { describe, expect, it } from 'vitest';
import { compareRow } from '@/lib/leave/annual-leave';
import { leaveCsv, leaveExportRow, leaveTsv, spreadsheetCell, type LeaveResultRow } from '@/lib/leave/leave-export';
import { buildWorkbook } from '@/lib/leave/leave-xlsx';
import ExcelJS from 'exceljs';

function fixture(hireDate: string, recordedDays = 16, asOf = '2026-10-05', name = '합성직원'): LeaveResultRow {
  return { row: { name, hireDate, recordedDays, raw: `${name}\t${hireDate}\t${recordedDays}` }, result: compareRow({ name, hireDate, recordedDays }, asOf) };
}

describe('leave export verdict parity', () => {
  for (const [hireDate, asOf] of [['', '2026-10-05'], ['2026-02-31', '2026-10-05'], ['2027-01-01', '2026-10-05'], ['2023-10-05', '']]) {
    it(`exports calculation failure for ${hireDate || 'missing hire'} / ${asOf || 'missing reference'}`, async () => {
      const item = fixture(hireDate, 16, asOf);
      const row = leaveExportRow(item);
      expect(row[2]).toBe(''); expect(row[4]).toBe(''); expect(row[5]).toBe('계산 불가'); expect(row[3]).toBe(16);
      expect(leaveCsv([item], asOf)).not.toMatch(/NaN|Invalid Date|일치/);
      expect(leaveTsv([item], asOf)).not.toMatch(/NaN|Invalid Date|일치/);
      const wb = await buildWorkbook([{ name: '결과', header: ['이름', '입사일', '발생', '대장', '차이', '판정', '근거'], rows: [row] }]);
      const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await wb.xlsx.writeBuffer());
      expect(restored.worksheets[0].getCell('C2').value).toBe('');
      expect(restored.worksheets[0].getCell('E2').value).toBe('');
      expect(restored.worksheets[0].getCell('F2').value).toBe('계산 불가');
    });
  }
  it('preserves genuine match and difference as numeric values', () => {
    expect(leaveExportRow(fixture('2023-10-05')).slice(2, 6)).toEqual([16, 16, 0, '일치']);
    expect(leaveExportRow(fixture('2023-10-05', 15)).slice(2, 6)).toEqual([16, 15, -1, '차이 있음']);
    expect(spreadsheetCell(-1)).toBe('-1');
  });
  it('rejects non-finite calculated results even with a success verdict', () => {
    const item = fixture('2023-10-05'); item.result!.calculatedDays = NaN;
    expect(leaveExportRow(item)[5]).toBe('계산 불가');
    item.result!.calculatedDays = 16; item.result!.diff = Infinity;
    expect(leaveExportRow(item)[5]).toBe('계산 불가');
  });
});

describe('clipboard formula and delimiter protection', () => {
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(1)', '\t=1+1', '\n+1', 'name\t=1+1\n@SUM(1)']) {
    it(`keeps ${JSON.stringify(value)} in one safe text cell`, async () => {
      const item = fixture('2023-10-05', 16, '2026-10-05', value);
      const cells = leaveTsv([item], '2026-10-05').split('\r\n')[1].split('\t');
      expect(cells).toHaveLength(8);
      expect(cells[0]).not.toMatch(/^[\s]*[=+\-@]/);
      expect(cells[0]).not.toMatch(/[\t\r\n]/);
      const wb = await buildWorkbook([{ name: '결과', header: ['이름'], rows: [[value]] }]);
      const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await wb.xlsx.writeBuffer());
      expect(restored.worksheets[0].getCell('A2').type).toBe(ExcelJS.ValueType.String);
      expect(restored.worksheets[0].getCell('A2').value).toBe(value);
    });
  }
});
