import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';

// 1x1 투명 PNG (합성)
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// 합성 템플릿: 2행 머리, 3~7행 빈 자료칸(위험성 E 는 수식, 캐시 있음), 8행 합계. 실명·실주소 없음.
async function makeTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  wb.addWorksheet('참고').getCell('A1').value = '참고';
  ws.getCell('A1').value = '위험성평가표';
  ws.mergeCells('A1:F1');
  ws.getRow(2).values = ['번호', '위험요인', '빈도', '강도', '위험성', '등급'];
  for (let r = 3; r <= 7; r++) {
    for (const c of ['A', 'B', 'C', 'D', 'E', 'F']) {
      ws.getCell(`${c}${r}`).border = { bottom: { style: 'thin' } };
    }
    ws.getCell(`E${r}`).value = { formula: `C${r}*D${r}`, result: 0 } as ExcelJS.CellFormulaValue;
  }
  ws.getCell('A8').value = '합계';
  ws.mergeCells('A8:D8');
  ws.getCell('E8').value = { formula: 'SUM(E3:E7)', result: 0 } as ExcelJS.CellFormulaValue;
  ws.addConditionalFormatting({
    ref: 'E3:E7',
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
  (ws as unknown as { dataValidations: { add(range: string, v: unknown): void } }).dataValidations.add('C3:C7', {
    type: 'list',
    allowBlank: true,
    formulae: ['"1,2,3"'],
  });
  ws.pageSetup.printArea = 'A1:F8';
  ws.pageSetup.printTitlesRow = '1:2';
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  wb.definedNames.add("'평가표'!$B$3:$B$7", '위험요인목록');
  const imageId = wb.addImage({ base64: PNG_1X1, extension: 'png' });
  ws.addImage(imageId, { tl: { col: 7, row: 0 }, ext: { width: 20, height: 20 } });
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

const COLUMNS = { A: 'no', B: 'hazard', C: 'freq', D: 'sev', F: 'grade' };

function data(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    hazard: `요인 ${i + 1}`,
    freq: 2,
    sev: 3,
    grade: i === 0 ? '높음 (6)' : '보통 (3)',
  }));
}

async function sheetXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file('xl/worksheets/sheet1.xml')!.async('string')) as string;
}

describe('fillXlsxTemplate — 원본 서식 보존 채우기', () => {
  it('fullCalcOnLoad="1" 을 켜고 수식 셀의 <v> 캐시를 지운다', async () => {
    const tpl = await makeTemplate();
    // 템플릿에는 캐시가 있다(전제 확인)
    expect(await sheetXml(tpl)).toMatch(/<c r="E3"[^>]*>(?:(?!<\/c>)[\s\S])*<v>/);

    const r = await fillXlsxTemplate(tpl, {
      cells: [{ sheet: '참고', cell: 'A2', value: '작성일 2026-01-01' }],
      rows: { sheet: '평가표', startRow: 3, columns: COLUMNS, data: data(2), overflow: 'error' },
    });
    expect(r.ok).toBe(true);
    expect(r.fullCalcOnLoad).toBe(true);
    const zip = await JSZip.loadAsync(r.bytes!);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbXml).toContain('fullCalcOnLoad="1"');
    const xml = await sheetXml(r.bytes!);
    const formulaCells = [...xml.matchAll(/<c r="([A-Z]+\d+)"(?:[^>]*[^/>])?>((?:(?!<\/c>)[\s\S])*)<\/c>/g)].filter((m) =>
      m[2].includes('<f'),
    );
    expect(formulaCells.length).toBe(6);
    for (const m of formulaCells) expect(m[2], m[1]).not.toContain('<v>');
  });

  it('보존 항목(병합·수식·조건부서식·유효성·인쇄·그림·이름정의)이 before 와 after 같다', async () => {
    const r = await fillXlsxTemplate(await makeTemplate(), {
      cells: [{ sheet: '참고', cell: 'B2', value: '메모' }],
      rows: { sheet: '평가표', startRow: 3, columns: COLUMNS, data: data(5), overflow: 'error' },
    });
    expect(r.ok).toBe(true);
    const p = r.preserved!;
    for (const key of [
      'merges',
      'formulaCells',
      'conditionalRules',
      'validations',
      'printArea',
      'printTitles',
      'orientation',
      'fitToWidth',
      'images',
      'definedNames',
    ] as const) {
      expect(p[key].same, key).toBe(true);
      expect(p[key].after, key).toEqual(p[key].before);
    }
    expect(p.allSame).toBe(true);
    expect(p.merges.before['평가표']).toEqual(['A1:F1', 'A8:D8']);
    expect(p.images.before['평가표']).toBe(1);
    expect(p.validations.before['평가표']).toEqual(['C3:C7']);
    expect(p.printArea.before['평가표']).toBe('A1:F8');
    expect(r.changedCells).toContainEqual({ sheet: '참고', cell: 'B2' });
    expect(r.changedCells).toContainEqual({ sheet: '평가표', cell: 'F7' });
    expect(r.changedCells).toHaveLength(1 + 5 * 5);
  });

  it("overflow='error' 이고 자료가 빈 행보다 많으면 ok:false + 넘친 행 수", async () => {
    const r = await fillXlsxTemplate(await makeTemplate(), {
      rows: { sheet: '평가표', startRow: 3, columns: COLUMNS, data: data(7), overflow: 'error' },
    });
    expect(r.ok).toBe(false);
    expect(r.overflowRows).toBe(2);
    expect(r.bytes).toBeUndefined();
  });

  it("overflow='insertRows' 면 행을 넣고 warnings 에 남긴다", async () => {
    const r = await fillXlsxTemplate(await makeTemplate(), {
      rows: { sheet: '평가표', startRow: 3, columns: COLUMNS, data: data(7), overflow: 'insertRows' },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('2행'))).toBe(true);
    const ex = await extractXlsxRows(r.bytes!, { sheet: '평가표', headerRow: 2 });
    const hazards = ex.rows.map((x) => x.cells['위험요인'].raw);
    expect(hazards.slice(0, 7)).toEqual(data(7).map((d) => d.hazard));
    // 합계 행은 아래로 밀린다
    const total = ex.rows.find((x) => x.cells['번호'].raw === '합계');
    expect(total?.rowNumber).toBe(10);
  });

  it('채운 파일을 extractXlsxRows 로 다시 읽으면 입력과 같다(문자 등급 포함)', async () => {
    const input = data(4);
    const r = await fillXlsxTemplate(await makeTemplate(), {
      rows: { sheet: '평가표', startRow: 3, columns: COLUMNS, data: input, overflow: 'error' },
    });
    expect(r.ok).toBe(true);
    const ex = await extractXlsxRows(r.bytes!, { sheet: '평가표', headerRow: 2 });
    const got = ex.rows.slice(0, input.length).map((x) => ({
      no: x.cells['번호'].raw,
      hazard: x.cells['위험요인'].raw,
      freq: x.cells['빈도'].raw,
      sev: x.cells['강도'].raw,
      grade: x.cells['등급'].raw,
    }));
    expect(got).toEqual(input);
    expect(typeof got[0].grade).toBe('string');
    expect(got[0].grade).toBe('높음 (6)');
  });

  it('inspectXlsx 가 needsReview 인 입력이면 채우지 않고 같은 구조를 돌린다', async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const r = await fillXlsxTemplate(xls, { cells: [{ sheet: 'x', cell: 'A1', value: 1 }] });
    expect(r.ok).toBe(false);
    expect(r.needsReview).toBe(true);
    expect(typeof r.reason).toBe('string');
    expect(r.bytes).toBeUndefined();
    expect(r.changedCells).toEqual([]);
  });

  it('없는 시트·잘못된 셀 주소는 ok:false', async () => {
    const tpl = await makeTemplate();
    const a = await fillXlsxTemplate(tpl, { cells: [{ sheet: '없음', cell: 'A1', value: 1 }] });
    expect(a.ok).toBe(false);
    const b = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: '1A', value: 1 }] });
    expect(b.ok).toBe(false);
  });
});
