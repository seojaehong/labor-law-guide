import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readGrid } from '../../src/lib/leave/leave-sheet.ts';

const dates = ['2019-03-02', '2024-02-29', '2026-10-05'];
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('synthetic dates');
for (const date of dates) {
  const row = sheet.addRow(['synthetic', new Date(`${date}T00:00:00.000Z`)]);
  row.getCell(2).numFmt = 'yyyy-mm-dd';
}
const bytes = await workbook.xlsx.writeBuffer();
const decoded = new ExcelJS.Workbook();
await decoded.xlsx.load(bytes);
const restored = decoded.worksheets[0];
assert.deepEqual(dates.map((_, index) => restored.getRow(index + 1).getCell(2).value.toISOString()), dates.map(date => `${date}T00:00:00.000Z`));
assert.deepEqual(readGrid(restored).map(row => row[1]), dates);
console.log(JSON.stringify({ timezone: process.env.TZ, dates: readGrid(restored).map(row => row[1]) }));
