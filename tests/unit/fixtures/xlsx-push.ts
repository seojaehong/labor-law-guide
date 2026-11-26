// 닫힌 밀기(§2-5b) 합성 서식 — push 시험과 엑셀 COM 오라클 시험이 함께 쓴다
import JSZip from 'jszip';
import type { FillRows } from '@/lib/office/xlsx/fill';

export const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const SHEET = 'xl/worksheets/sheet1.xml';
export const WB = 'xl/workbook.xml';

export interface Opts {
  rows: string;
  merges?: string[];
  printArea?: string;
  /** sheetData 와 mergeCells 사이(없음)·mergeCells 뒤에 붙일 원소 */
  afterMerges?: string;
  beforeMargins?: string;
  afterMargins?: string;
}
export function book(o: Opts): Record<string, string> {
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
      `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D6"/>` +
      `<sheetViews><sheetView workbookViewId="0"><selection activeCell="A6" sqref="A6"/></sheetView></sheetViews><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c><c r="B1" t="inlineStr"><is><t>위험요인</t></is></c></row>` +
      `${o.rows}</sheetData>${merges}${o.afterMerges ?? ''}${o.beforeMargins ?? ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${o.afterMargins ?? ''}</worksheet>`,
  };
}
export const empty = (r: number) => `<row r="${r}" ht="24" customHeight="1"><c r="A${r}" s="1"/><c r="B${r}" s="1"/><c r="C${r}" s="1"/><c r="D${r}" s="1"/></row>`;
export const footer = `<row r="5"><c r="A5" t="inlineStr"><is><t>작성자 서명</t></is></c></row><row r="6"><c r="A6" t="inlineStr"><is><t>확인자</t></is></c></row>`;

export async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const z = new JSZip();
  for (const [k, v] of Object.entries(files)) z.file(k, v);
  return z.generateAsync({ type: 'uint8array' });
}
export async function unzip(bytes: Uint8Array): Promise<Map<string, string>> {
  const z = await JSZip.loadAsync(bytes);
  const out = new Map<string, string>();
  for (const f of Object.values(z.files)) if (!f.dir) out.set(f.name, await f.async('string'));
  return out;
}
export const rowsOf = (n: number): FillRows => ({
  sheet: '평가표',
  startRow: 2,
  columns: { A: 'no', B: 'hazard' },
  overflow: 'insertRows',
  data: Array.from({ length: n }, (_, i) => ({ no: i + 1, hazard: `합성 위험 ${i + 1}` })),
});

// 빈 행 2·3·4, 바닥글 5·6 → 5행 자료면 2행 모자람(at=5, n=2)
export const S09 = (extra: Partial<Opts> = {}) =>
  book({
    rows: empty(2) + empty(3) + empty(4) + footer,
    merges: ['A5:D5', 'C2:D2'],
    printArea: "'평가표'!$A$1:$D$6",
    afterMerges: `<hyperlinks><hyperlink ref="A6" location="'평가표'!A6" display="확인자"/></hyperlinks>`,
    afterMargins: `<rowBreaks count="1" manualBreakCount="1"><brk id="5" max="16383" man="1"/></rowBreaks>`,
    ...extra,
  });

// ── 도형 고정점(S11 모양) ── drawing1 = 밀 시트의 도형, drawing2 = 다른 시트(바이트 동일해야 함)
export const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
export const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const DRAW = 'xl/drawings/drawing1.xml';
export const sp = (id: number) =>
  `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="도형 ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
  `<xdr:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:sp>`;
export const pos = (col: number, row: number, tag = 'from') => `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>12700</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>25400</xdr:rowOff></xdr:${tag}>`;
export const two = (r1: number, r2: number, id: number, editAs?: string, body = sp(id)) =>
  `<xdr:twoCellAnchor${editAs ? ` editAs="${editAs}"` : ''}>${pos(0, r1)}${pos(2, r2, 'to')}${body}<xdr:clientData/></xdr:twoCellAnchor>`;
export const one = (r: number, id: number) => `<xdr:oneCellAnchor>${pos(1, r)}<xdr:ext cx="300" cy="400"/>${sp(id)}<xdr:clientData/></xdr:oneCellAnchor>`;
export const drawingXml = (anchors: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}">${anchors}</xdr:wsDr>`;

/** S09 서식에 drawing 부품을 붙인다. 고정점 행은 0 기반(at=5 → 경계 4) */
export function withDrawing(anchors: string, extra: Partial<Opts> = {}): Record<string, string> {
  const f = S09({ afterMargins: `<drawing r:id="rId9"/>`, ...extra });
  f['[Content_Types].xml'] = f['[Content_Types].xml'].replace(
    '</Types>',
    `<Override PartName="/${DRAW}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
  );
  f['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId9" Type="${R}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  f[DRAW] = drawingXml(anchors);
  return f;
}

