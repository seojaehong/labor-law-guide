import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { inspectXlsx } from '@/lib/office/xlsx/inspect';

// 1x1 투명 PNG (합성)
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  wb.addWorksheet('참고');
  ws.getCell('A1').value = '위험성평가표';
  ws.mergeCells('A1:F1');
  ws.mergeCells('A3:A4');
  ws.getRow(2).values = ['번호', '위험요인', '빈도', '강도', '위험성', '비고'];
  ws.getCell('C5').value = 2;
  ws.getCell('D5').value = 3;
  ws.getCell('E5').value = { formula: 'C5*D5' } as ExcelJS.CellFormulaValue;
  ws.getCell('E6').value = { formula: 'C6*D6' } as ExcelJS.CellFormulaValue;
  ws.getCell('E7').value = { formula: 'SUM(E5:E6)' } as ExcelJS.CellFormulaValue;
  ws.addConditionalFormatting({
    ref: 'E5:E20',
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: ['5'],
        priority: 1,
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFF0000' } } },
      },
    ],
  });
  // ExcelJS 타입 선언에 dataValidations 가 빠져 있다(런타임에는 있다).
  (ws as unknown as { dataValidations: { add(range: string, v: unknown): void } }).dataValidations.add('C5:C20', {
    type: 'list',
    allowBlank: true,
    formulae: ['"1,2,3"'],
  });
  ws.pageSetup.printArea = 'A1:F20';
  ws.pageSetup.printTitlesRow = '1:2';
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  wb.definedNames.add("'평가표'!$B$5:$B$20", '위험요인목록');
  const imageId = wb.addImage({ base64: PNG_1X1, extension: 'png' });
  ws.addImage(imageId, { tl: { col: 6, row: 0 }, ext: { width: 20, height: 20 } });
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

describe('inspectXlsx — 템플릿 구조 검사', () => {
  it('합성 템플릿의 병합·수식·조건부서식·유효성·인쇄설정·그림·이름정의를 정확히 본다', async () => {
    const r = await inspectXlsx(await makeTemplate());
    expect(r.ok).toBe(true);
    expect(r.needsReview).toBeFalsy();
    expect(r.sheets.map((s) => s.name)).toEqual(['평가표', '참고']);
    const s = r.sheets[0];
    expect([...s.merges].sort()).toEqual(['A1:F1', 'A3:A4']);
    expect(s.formulaCells).toBe(3);
    expect(s.conditionalRules).toBe(1);
    expect(s.validations).toHaveLength(1);
    expect(s.validations[0]).toMatchObject({ range: 'C5:C20', type: 'list', list: ['1', '2', '3'] });
    expect(s.printArea).toBe('A1:F20');
    expect(s.printTitles).toBe('1:2');
    expect(s.orientation).toBe('landscape');
    expect(s.paper).toBe('A4');
    expect(s.fitToWidth).toBe(1);
    expect(s.images).toBe(1);
    expect(s.dims).toMatch(/^A1:/);
    expect(r.definedNames).toEqual([{ name: '위험요인목록', ranges: ["'평가표'!$B$5:$B$20"] }]);
    expect(r.inputCandidates).toContainEqual({ sheet: '평가표', range: 'C5:C20', reason: 'validation' });

    const ref = r.sheets[1];
    expect(ref.merges).toEqual([]);
    expect(ref.formulaCells).toBe(0);
    expect(ref.images).toBe(0);
    expect(ref.printArea).toBeUndefined();
  });

  it('.xls(BIFF) 시그니처는 예외 없이 needsReview', async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const r = await inspectXlsx(xls);
    expect(r.ok).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/xls/i);
    expect(r.sheets).toEqual([]);
  });

  it('깨진 zip 은 예외 없이 needsReview', async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    const r = await inspectXlsx(broken);
    expect(r.ok).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(typeof r.reason).toBe('string');
  });

  it('빈 바이트는 예외 없이 needsReview', async () => {
    const r = await inspectXlsx(new Uint8Array(0));
    expect(r.ok).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(r.reason).toMatch(/비어/);
  });
});
