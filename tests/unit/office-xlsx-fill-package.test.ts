// 공개 가스공사 서식 E2E(261123)에서 나온 결함 재현 — 자료는 모두 합성(같은 구조만 흉내 낸다).
// ①ExcelJS 가 빈 글상자 drawing·printerSettings·시트 rels 를 떨군다 ②인쇄영역 $ 고정이 $A1:$F8 로 바뀐다
// ③보존 비교가 둘 다 못 잡는다 ④숨김 열 옵션.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { fillXlsxTemplate as libFill } from '@/lib/office';
import { comparePackage, packageFingerprint } from '@/lib/office/xlsx/package';
import { DEFAULT_LIMITS, readZipGuarded } from '@/lib/office/limits';

const DRAWING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
  '<xdr:twoCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
  '<xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
  '<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="2" name="TextBox 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr/><a:p/></xdr:txBody></xdr:sp>' +
  '<xdr:clientData/></xdr:twoCellAnchor>' +
  // 결재 칸 옆 글상자(0부터 센 8행 = 9행) — 행을 넣으면 함께 내려가야 한다
  '<xdr:oneCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="100" cy="100"/>' +
  '<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="3" name="TextBox 2"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr/><a:p/></xdr:txBody></xdr:sp>' +
  '<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
const PRINTER = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

/** 합성 서식: 평가표(3~7 빈 자료칸, 8 결재) + 빈 글상자 drawing + printerSettings + $A$1:$F$8 인쇄영역. 그림 없음 */
async function gasLike(opts: { drawingRels?: boolean } = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('평가표');
  wb.addWorksheet('Sheet1');
  ws.getRow(2).values = ['번호', '위험요인', '빈도', '강도', '위험성', '등급'];
  ws.getCell('A8').value = '결재';
  ws.mergeCells('A8:F8');
  ws.getColumn('R').width = 11;
  ws.getColumn('T').width = 13;
  ws.pageSetup.printArea = 'A1:F8';
  ws.pageSetup.printTitlesRow = '1:2';
  ws.pageSetup.orientation = 'landscape';
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  zip.file('xl/drawings/drawing1.xml', DRAWING);
  zip.file('xl/printerSettings/printerSettings1.bin', PRINTER);
  if (opts.drawingRels) {
    zip.file(
      'xl/drawings/_rels/drawing1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/" TargetMode="External"/></Relationships>',
    );
  }
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="../printerSettings/printerSettings1.bin"/></Relationships>',
  );
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  ct = ct.replace('<Default Extension="rels"', '<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/><Default Extension="rels"');
  ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  zip.file('[Content_Types].xml', ct);
  let sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  sheet = sheet.replace(/<pageSetup\b([^>]*?)\/>/, (_m, a: string) => `<pageSetup${a} r:id="rId1"/>`).replace('</worksheet>', '<drawing r:id="rId2"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', sheet);
  let wbXml = await zip.file('xl/workbook.xml')!.async('string');
  wbXml = wbXml.replace(/(<definedName name="_xlnm.Print_Area"[^>]*>)[^<]*(<\/definedName>)/, (_m, open: string, close: string) => `${open}&apos;평가표&apos;!$A$1:$F$8${close}`);
  zip.file('xl/workbook.xml', wbXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const parts = (b: Uint8Array) => {
  const z = readZipGuarded(b, DEFAULT_LIMITS);
  if (!z.ok) throw new Error(z.message);
  return new Map([...z.parts].filter(([n]) => !n.endsWith('/'))); // JSZip 이 넣는 폴더 항목은 부품이 아니다
};
const txt = (p: Map<string, Uint8Array>, n: string) => new TextDecoder().decode(p.get(n) ?? new Uint8Array());
const printAreaText = (p: Map<string, Uint8Array>) => /<definedName name="_xlnm.Print_Area"[^>]*>([^<]*)<\/definedName>/.exec(txt(p, 'xl/workbook.xml'))?.[1];

const COLS = { A: 'no', B: 'hazard' };
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ no: i + 1, hazard: `요인 ${i + 1}` }));

describe('fill — ExcelJS 밖 부품 복구(drawing·printerSettings·시트 rels)', () => {
  it('합성 서식 전제: ExcelJS 가 열 수 있고 세 부품이 들어 있다', async () => {
    const tpl = await gasLike();
    const p = parts(tpl);
    for (const n of ['xl/drawings/drawing1.xml', 'xl/printerSettings/printerSettings1.bin', 'xl/worksheets/_rels/sheet1.xml.rels']) expect(p.has(n), n).toBe(true);
    await new ExcelJS.Workbook().xlsx.load(tpl as unknown as ExcelJS.Buffer);
    expect(printAreaText(p)).toBe('&apos;평가표&apos;!$A$1:$F$8');
  });

  it('comparePackage 는 ExcelJS 원 왕복이 잃은 drawing·printerSettings·인쇄영역 $ 표기를 잃은 것으로 보고한다', async () => {
    const tpl = await gasLike();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tpl as unknown as ExcelJS.Buffer);
    const raw = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const cmp = comparePackage(packageFingerprint(parts(tpl)), packageFingerprint(parts(raw)));
    expect(cmp.same).toBe(false);
    const lost = cmp.lost.join(' | ');
    expect(lost).toMatch(/drawing/);
    expect(lost).toMatch(/printerSettings/);
    expect(lost).toMatch(/\$A\$1:\$F\$8/);
  });

  it('칸만 채워도 부품·rels·Content_Types·시트 참조가 모두 되살아나고 allSame:true', async () => {
    const tpl = await gasLike();
    const r = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'B3', value: '합성' }], hiddenColumns: [{ sheet: '평가표', columns: ['Z'] }] });
    expect(r.ok).toBe(true);
    const before = parts(tpl);
    const after = parts(r.bytes!);
    for (const n of before.keys()) if (n !== 'xl/calcChain.xml') expect(after.has(n), n).toBe(true);
    expect(after.size).toBe(before.size);
    expect(txt(after, 'xl/drawings/drawing1.xml')).toBe(DRAWING);
    expect([...after.get('xl/printerSettings/printerSettings1.bin')!]).toEqual([...PRINTER]);

    const rels = txt(after, 'xl/worksheets/_rels/sheet1.xml.rels');
    const relId = (type: string) => new RegExp(`<Relationship\\b[^>]*Id="([^"]+)"[^>]*Type="[^"]*/${type}"[^>]*Target="([^"]+)"`).exec(rels);
    const dr = relId('drawing');
    const ps = relId('printerSettings');
    expect(dr?.[2]).toBe('../drawings/drawing1.xml');
    expect(ps?.[2]).toBe('../printerSettings/printerSettings1.bin');
    const ct = txt(after, '[Content_Types].xml');
    expect(ct).toMatch(/<Default Extension="bin" ContentType="application\/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"\/>/);
    expect(ct).toMatch(/<Override PartName="\/xl\/drawings\/drawing1.xml" ContentType="application\/vnd.openxmlformats-officedocument.drawing\+xml"\/>/);

    const sheet = txt(after, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain(`<drawing r:id="${dr![1]}"/>`);
    expect(sheet).toMatch(new RegExp(`<pageSetup\\b[^>]*\\br:id="${ps![1]}"`));
    // 순서: pageSetup 뒤, extLst·legacyDrawing·tableParts 앞(CT_Worksheet 순서 — 어기면 엑셀이 복구 창을 띄운다)
    const iDrawing = sheet.indexOf('<drawing ');
    expect(iDrawing).toBeGreaterThan(sheet.indexOf('<pageSetup'));
    for (const later of ['<legacyDrawing', '<tableParts', '<extLst']) {
      const i = sheet.indexOf(later);
      if (i >= 0) expect(iDrawing, later).toBeLessThan(i);
    }
    expect(sheet.indexOf('</worksheet>')).toBeGreaterThan(iDrawing);

    await new ExcelJS.Workbook().xlsx.load(r.bytes! as unknown as ExcelJS.Buffer);
    expect(r.preserved!.package.same).toBe(true);
    expect(r.preserved!.allSame).toBe(true);
    expect(r.issues.some((w) => w.code === 'PRESERVATION_LOSS')).toBe(false);
  });

  it('행을 넣지 않으면 인쇄영역 원문 $A$1:$F$8 을 그대로 지킨다', async () => {
    const r = await fillXlsxTemplate(await gasLike(), { cells: [{ sheet: '평가표', cell: 'B3', value: '합성' }] });
    expect(printAreaText(parts(r.bytes!))).toBe('&apos;평가표&apos;!$A$1:$F$8');
  });

  it('아래에 도형 고정점이 있으면 조각 5 에선 덧붙이지 않고 OVERFLOW(조각 5b 닫힌 밀기에서 다시 GREEN)', async () => {
    const r = await fillXlsxTemplate(await gasLike(), {
      rows: { sheet: '평가표', startRow: 3, columns: COLS, data: rowsOf(7), overflow: 'insertRows' },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('OVERFLOW');
    expect(r.reason).toMatch(/그림·도형/);
  });

  it.todo('조각 5b — 닫힌 밀기: 끝 행만 늘리고 $ 표기 유지, 아래 고정점만 2행 내림');

  it.skip('(옛 밀기 단언 — 조각 5b 에서 새 단언으로) 행을 넣으면 끝 행만 늘리고 $ 표기는 지킨다', async () => {
    const r = await fillXlsxTemplate(await gasLike(), {
      rows: { sheet: '평가표', startRow: 3, columns: COLS, data: rowsOf(7), overflow: 'insertRows' },
    });
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows).toEqual({ count: 2, at: 8, same: false });
    expect(printAreaText(parts(r.bytes!))).toBe('&apos;평가표&apos;!$A$1:$F$10');
    expect(r.preserved!.printArea.after['평가표']).toBe('A1:F10');
    expect(r.preserved!.printArea.same).toBe(true);
    expect(r.preserved!.package.same).toBe(true);
    // 넣은 자리(8행) 위 고정점은 그대로, 아래(0부터 8 = 9행) 는 2행 내려간다
    const rowsAt = [...txt(parts(r.bytes!), 'xl/drawings/drawing1.xml').matchAll(/<xdr:(from|to)>[\s\S]*?<xdr:row>(\d+)/g)].map((m) => `${m[1]}${m[2]}`);
    expect(rowsAt).toEqual(['from0', 'to1', 'from10']);
  });

  it('(옛 경로·열 숨김) 복구할 수 없으면(drawing 이 제 rels 를 가짐) PRESERVATION_LOSS, 엄격 모드면 실패', async () => {
    const tpl = await gasLike({ drawingRels: true });
    const r = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'B3', value: '합성' }], hiddenColumns: [{ sheet: '평가표', columns: ['Z'] }] });
    expect(r.ok).toBe(true);
    expect(r.preserved!.package.same).toBe(false);
    expect(r.preserved!.package.lost.join(' ')).toMatch(/drawing/);
    expect(r.preserved!.allSame).toBe(false);
    expect(r.issues.some((w) => w.code === 'PRESERVATION_LOSS')).toBe(true);
    const s = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'B3', value: '합성' }], hiddenColumns: [{ sheet: '평가표', columns: ['Z'] }] }, DEFAULT_LIMITS, true);
    expect(s.ok).toBe(false);
    expect(s.code).toBe('PRESERVATION_LOSS');
  });
});

describe('fill — 숨김 열(hiddenColumns)', () => {
  it('S 열만 숨기고 이웃 R·T 열은 보이며 너비도 그대로, 보존 비교는 의도한 변경으로 본다', async () => {
    const r = await fillXlsxTemplate(await gasLike(), {
      cells: [{ sheet: '평가표', cell: 'S3', value: 'HZ-0001' }],
      hiddenColumns: [{ sheet: '평가표', columns: ['S'] }],
    });
    expect(r.ok).toBe(true);
    const sheet = txt(parts(r.bytes!), 'xl/worksheets/sheet1.xml');
    const cols = [...(sheet.match(/<cols>[\s\S]*?<\/cols>/)?.[0] ?? '').matchAll(/<col\b[^>]*\/>/g)].map((m) => m[0]);
    const colFor = (n: number) => cols.find((c) => Number(/min="(\d+)"/.exec(c)![1]) <= n && n <= Number(/max="(\d+)"/.exec(c)![1]));
    expect(colFor(19)).toMatch(/hidden="1"/); // S
    expect(colFor(18) ?? '').not.toMatch(/hidden="1"/); // R
    expect(colFor(20) ?? '').not.toMatch(/hidden="1"/); // T
    expect(colFor(18)).toMatch(/width="11"/);
    expect(colFor(20)).toMatch(/width="13"/);
    expect(r.preserved!.hiddenColumns).toEqual({ applied: [{ sheet: '평가표', columns: ['S'] }], same: true });
    expect(r.preserved!.allSame).toBe(true);
  });

  it('라이브러리 입구(@/lib/office)로 hiddenColumns 만 줘도 숨긴다', async () => {
    const r = await libFill(await gasLike(), { limits: DEFAULT_LIMITS, hiddenColumns: [{ sheet: '평가표', columns: ['S'] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.message);
    expect(txt(parts(r.files![0].bytes), 'xl/worksheets/sheet1.xml')).toMatch(/<col\b[^>]*min="19"[^>]*max="19"[^>]*hidden="1"/);
    expect(r.data.preserved.hiddenColumns.applied).toEqual([{ sheet: '평가표', columns: ['S'] }]);
    expect(r.data.preserved.allSame).toBe(true);
  });

  it('없는 시트·잘못된 열 문자는 INVALID_ARGS', async () => {
    const tpl = await gasLike();
    const a = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'B3', value: 1 }], hiddenColumns: [{ sheet: '없음', columns: ['S'] }] });
    expect(a.ok).toBe(false);
    expect(a.code).toBe('INVALID_ARGS');
    const b = await fillXlsxTemplate(tpl, { cells: [{ sheet: '평가표', cell: 'B3', value: 1 }], hiddenColumns: [{ sheet: '평가표', columns: ['s1'] }] });
    expect(b.ok).toBe(false);
  });
});
