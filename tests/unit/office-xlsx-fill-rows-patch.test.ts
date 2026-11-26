// 조각 4·5(설계 v2.1 §2-4·2-5) — 용량 규칙과 꼬리 덧붙이기(밀기 없음). 합성 반례만.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillXlsxTemplate, type FillRows } from '@/lib/office/xlsx/fill';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET = 'xl/worksheets/sheet1.xml';
const WB = 'xl/workbook.xml';

interface Opts {
  /** sheetData 안 1행(머리) 뒤에 붙일 자료 행들 */
  rows: string;
  merges?: string[];
  printArea?: string;
  after?: string;
}

function book(o: Opts): Record<string, string> {
  const merges = o.merges?.length ? `<mergeCells count="${o.merges.length}">${o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const dn = o.printArea ? `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">${o.printArea}</definedName></definedNames>` : '';
  return {
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    [WB]: `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="평가표" sheetId="1" r:id="rId1"/></sheets>${dn}<calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels':
      `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>`,
    [SHEET]:
      `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D4"/><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c><c r="B1" t="inlineStr"><is><t>위험요인</t></is></c><c r="C1" t="inlineStr"><is><t>대책</t></is></c></row>` +
      `${o.rows}</sheetData>${merges}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${o.after ?? ''}</worksheet>`,
  };
}

const empty = (r: number) => `<row r="${r}" ht="24" customHeight="1"><c r="A${r}" s="1"/><c r="B${r}" s="1"/><c r="C${r}" s="1"/><c r="D${r}" s="1"/></row>`;

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const z = new JSZip();
  for (const [k, v] of Object.entries(files)) z.file(k, v);
  return z.generateAsync({ type: 'uint8array' });
}
async function unzip(bytes: Uint8Array): Promise<Map<string, string>> {
  const z = await JSZip.loadAsync(bytes);
  const out = new Map<string, string>();
  for (const f of Object.values(z.files)) if (!f.dir) out.set(f.name, await f.async('string'));
  return out;
}
const rowsOf = (n: number, overflow: FillRows['overflow'] = 'insertRows'): FillRows => ({
  sheet: '평가표',
  startRow: 2,
  columns: { A: 'no', B: 'hazard' },
  overflow,
  data: Array.from({ length: n }, (_, i) => ({ no: i + 1, hazard: `합성 위험 ${i + 1}` })),
});
const rowTag = (xml: string, r: number) => new RegExp(`<row r="${r}"[^>]*>`).exec(xml)?.[0] ?? '';
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('용량(§2-4) — 실제로 있는 같은 서식 빈 행만 센다', () => {
  it('빈 행 3개에 3행 — 덧붙임 없음, 시트 밖 부품·통합문서 그대로', async () => {
    const input = await zip(book({ rows: empty(2) + empty(3) + empty(4), printArea: "'평가표'!$A$1:$D$4" }));
    const r = await fillXlsxTemplate(input, { rows: rowsOf(3) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows.count).toBe(0);
    const a = await unzip(r.bytes!);
    const b = await unzip(input);
    for (const [k, v] of b) if (k !== SHEET) expect(a.get(k), k).toBe(v);
    expect(a.get(SHEET)).toContain('합성 위험 3');
    expect(r.preserved!.allSame).toBe(true);
  });

  it('XML 에 없는 행은 용량이 아니다(S04) — 4행이면 1행을 꼬리에 덧붙이고 인쇄영역·dimension 끝을 늘린다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + empty(4), printArea: "'평가표'!$A$1:$D$4" })), { rows: rowsOf(4) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows).toMatchObject({ count: 1, at: 5, same: true });
    const a = await unzip(r.bytes!);
    const sheet = a.get(SHEET)!;
    expect(rowTag(sheet, 5)).toContain('ht="24"');
    expect(sheet).toMatch(/<c r="D5" s="1"\/>/);
    expect(sheet).toContain('합성 위험 4');
    expect(sheet).toContain('<dimension ref="A1:D5"/>');
    expect(a.get(WB)).toContain("'평가표'!$A$1:$D$5");
    expect(r.preserved!.allSame).toBe(true);
    expect(codes(r)).not.toContain('PRESERVATION_LOSS');
  });

  it('서식이 다른 행(바닥글 모양)은 용량에서 뺀다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + `<row r="3"><c r="A3"/></row>` })), { rows: rowsOf(1) });
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows.count).toBe(0);
    const r2 = await fillXlsxTemplate(await zip(book({ rows: empty(2) + `<row r="3"><c r="A3"/></row>` })), { rows: rowsOf(2) });
    // 3행은 서식이 달라 용량 1 — 2행째는 덧붙여야 하는데 3행(빈 행)은 「놓인 것」이 아니라 그 행을 쓴다
    expect(r2.ok).toBe(true);
    expect(r2.preserved!.insertedRows).toMatchObject({ count: 1, at: 3 });
  });
});

describe('꼬리 덧붙이기(§2-5) — 밀지 않는다', () => {
  it('자료 행의 가로 병합을 새 행에 복사한다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3), merges: ['C2:D2', 'C3:D3'] })), { rows: rowsOf(3) });
    expect(r.ok).toBe(true);
    const sheet = (await unzip(r.bytes!)).get(SHEET)!;
    expect(sheet).toContain('<mergeCell ref="C4:D4"/>');
    expect(sheet).toMatch(/<mergeCells count="3">/);
    expect(r.preserved!.allSame).toBe(true);
  });

  it('아래에 값이 놓여 있으면(바닥글) 덧붙이지 않고 OVERFLOW + 초과 행 수', async () => {
    const footer = `<row r="6"><c r="A6" t="inlineStr"><is><t>작성자 서명</t></is></c></row>`;
    // 빈 행 2(2·3) + 바닥글 앞 빈 자리 2(4·5) = 4행까지는 쓴다, 5행째부터 1행 모자람
    const ok = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + footer })), { rows: rowsOf(4) });
    expect(ok.ok).toBe(true);
    expect(ok.preserved!.insertedRows.count).toBe(0);
    // 5행째부터 1행 모자람 — 덧붙이기는 막히고(6행에 값), 수식 없는 서식이라 닫힌 밀기(§2-5b)로 바닥글을 1행 내린다
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + footer })), { rows: rowsOf(5) });
    expect(r.ok).toBe(true);
    // 미는 자리 = 바닥글 앞 빈 자리(4·5) 끝 다음 = 6행
    expect(r.preserved!.insertedRows).toMatchObject({ count: 1, at: 6 });
    expect(codes(r)).toContain('ROWS_PUSHED');
    expect((await unzip(r.bytes!)).get(SHEET)).toMatch(/<c r="A7" t="inlineStr"><is><t>작성자 서명/);
    const e = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + footer })), { rows: rowsOf(5, 'error') });
    expect(e.code).toBe('OVERFLOW');
    expect(e.overflowRows).toBe(1);
  });

  it('인쇄영역 끝에서 넘치는데 아래에 병합이 있으면 덧붙이지 않고 밀기로 병합을 내린다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2), merges: ['A8:D8'], printArea: "'평가표'!$A$1:$D$2" })), { rows: rowsOf(2) });
    expect(r.ok).toBe(true);
    expect(codes(r)).toContain('ROWS_PUSHED');
    expect((await unzip(r.bytes!)).get(SHEET)).toContain('<mergeCell ref="A9:D9"/>');
    expect(r.preserved!.allSame).toBe(true);
    // 병합이 없으면 같은 자리에 덧붙인다
    const ok = await fillXlsxTemplate(await zip(book({ rows: empty(2), printArea: "'평가표'!$A$1:$D$2" })), { rows: rowsOf(2) });
    expect(ok.preserved!.insertedRows).toMatchObject({ count: 1, at: 3 });
  });

  it("overflow:'error' 면 벽(인쇄영역 끝)을 넘칠 때 OVERFLOW — 벽 없는 빈 아래는 G4-11 대로 쓴다", async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2), printArea: "'평가표'!$A$1:$D$2" })), { rows: rowsOf(2, 'error') });
    expect(r.code).toBe('OVERFLOW');
    expect(r.overflowRows).toBe(1);
  });

  it('인쇄영역 끝이 at−1 이 아니면 늘리지 않고 PRINT_AREA_NOT_EXTENDED 경고, 통합문서 그대로', async () => {
    const input = await zip(book({ rows: empty(2), printArea: "'평가표'!$A$1:$D$9" }));
    const r = await fillXlsxTemplate(input, { rows: rowsOf(2) });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(WB)).toBe((await unzip(input)).get(WB));
    expect(codes(r)).toContain('PRINT_AREA_NOT_EXTENDED');
  });
});
