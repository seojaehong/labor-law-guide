import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';

// 합성 평가표: 2행 머리, 3행부터 자료. 실명·실주소 없음.
async function makeSheet(dataRows = 3): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('표지');
  const ws = wb.addWorksheet('평가표');
  ws.getCell('A1').value = '위험성평가표';
  ws.mergeCells('A1:E1');
  ws.getRow(2).values = ['공정', '위험요인', '등급', '빈도', '위험성'];
  // 3·4행: 공정 칸 세로 병합
  ws.getCell('A3').value = '조리';
  ws.mergeCells('A3:A4');
  ws.getCell('B3').value = '칼 베임';
  ws.getCell('C3').value = '높음 (6)';
  ws.getCell('D3').value = 2;
  ws.getCell('E3').value = { formula: 'D3*3', result: 6 } as ExcelJS.CellFormulaValue;
  ws.getCell('B4').value = '바닥 미끄럼';
  // C4 는 빈 칸
  ws.getCell('D4').value = 3;
  ws.getCell('E4').value = { formula: 'D4*3' } as ExcelJS.CellFormulaValue; // 캐시 없음
  for (let i = 0; i < dataRows - 2; i++) {
    const r = 5 + i;
    ws.getCell(`A${r}`).value = '배식';
    ws.getCell(`B${r}`).value = `요인 ${i + 1}`;
    ws.getCell(`C${r}`).value = '보통 (3)';
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

describe('extractXlsxRows — 원문 위치 붙은 행 추출', () => {
  it('머리행을 읽고 문자 등급을 글자 그대로 남긴다', async () => {
    const r = await extractXlsxRows(await makeSheet(), { sheet: '평가표', headerRow: 2 });
    expect(r.ok).toBe(true);
    expect(r.headers).toEqual(['공정', '위험요인', '등급', '빈도', '위험성']);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([3, 4, 5]);
    const g = r.rows[0].cells['등급'];
    expect(g.cell).toBe('C3');
    expect(g.raw).toBe('높음 (6)');
    expect(typeof g.raw).toBe('string');
    expect(r.rows[0].cells['빈도'].raw).toBe(2);
  });

  it('세로 병합 칸은 아래 행에 mergedFrom 으로 원 칸 주소를 단다', async () => {
    const r = await extractXlsxRows(await makeSheet(), { sheet: '평가표', headerRow: 2 });
    const top = r.rows[0].cells['공정'];
    expect(top.cell).toBe('A3');
    expect(top.raw).toBe('조리');
    expect(top.mergedFrom).toBeUndefined();
    const below = r.rows[1].cells['공정'];
    expect(below.cell).toBe('A4');
    expect(below.mergedFrom).toBe('A3');
    expect(below.raw).toBe('조리');
  });

  it('수식 셀은 formula 와 cachedValue 를 따로 돌리고, 캐시가 없으면 warnings 에 셀 주소', async () => {
    const r = await extractXlsxRows(await makeSheet(), { sheet: '평가표', headerRow: 2 });
    const e3 = r.rows[0].cells['위험성'];
    expect(e3.formula).toBe('D3*3');
    expect(e3.cachedValue).toBe(6);
    const e4 = r.rows[1].cells['위험성'];
    expect(e4.formula).toBe('D4*3');
    expect(e4.cachedValue).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('E4'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('E3'))).toBe(false);
  });

  it('빈 칸도 cell 주소를 유지한다', async () => {
    const r = await extractXlsxRows(await makeSheet(), { sheet: '평가표', headerRow: 2 });
    const c4 = r.rows[1].cells['등급'];
    expect(c4.cell).toBe('C4');
    expect(c4.raw).toBeNull();
    expect(Object.keys(r.rows[2].cells)).toEqual(['공정', '위험요인', '등급', '빈도', '위험성']);
    expect(r.rows[2].cells['빈도']).toMatchObject({ cell: 'D5', raw: null });
  });

  it('maxRows 를 넘으면 잘라 warnings 에 남긴다', async () => {
    const r = await extractXlsxRows(await makeSheet(10), { sheet: '평가표', headerRow: 2, maxRows: 4 });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([3, 4, 5, 6]);
    expect(r.warnings.some((w) => w.includes('maxRows'))).toBe(true);
  });

  it('없는 시트·.xls 바이트는 예외 없이 ok:false', async () => {
    const r1 = await extractXlsxRows(await makeSheet(), { sheet: '없음', headerRow: 2 });
    expect(r1.ok).toBe(false);
    expect(r1.reason).toMatch(/없음/);
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const r2 = await extractXlsxRows(xls, { sheet: '평가표', headerRow: 2 });
    expect(r2).toMatchObject({ ok: false, needsReview: true });
    expect(r2.rows).toEqual([]);
  });
});
