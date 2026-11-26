// 조각 5b(설계 v2.1 §2-5b) — 닫힌 밀기. 허용 목록 안에서만 at 아래를 n 행 내린다. 합성 반례만.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillXlsxTemplate, type FillRows } from '@/lib/office/xlsx/fill';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET = 'xl/worksheets/sheet1.xml';
const WB = 'xl/workbook.xml';

interface Opts {
  rows: string;
  merges?: string[];
  printArea?: string;
  /** sheetData 와 mergeCells 사이(없음)·mergeCells 뒤에 붙일 원소 */
  afterMerges?: string;
  beforeMargins?: string;
  afterMargins?: string;
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
      `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D6"/>` +
      `<sheetViews><sheetView workbookViewId="0"><selection activeCell="A6" sqref="A6"/></sheetView></sheetViews><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c><c r="B1" t="inlineStr"><is><t>위험요인</t></is></c></row>` +
      `${o.rows}</sheetData>${merges}${o.afterMerges ?? ''}${o.beforeMargins ?? ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${o.afterMargins ?? ''}</worksheet>`,
  };
}
const empty = (r: number) => `<row r="${r}" ht="24" customHeight="1"><c r="A${r}" s="1"/><c r="B${r}" s="1"/><c r="C${r}" s="1"/><c r="D${r}" s="1"/></row>`;
const footer = `<row r="5"><c r="A5" t="inlineStr"><is><t>작성자 서명</t></is></c></row><row r="6"><c r="A6" t="inlineStr"><is><t>확인자</t></is></c></row>`;

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
const rowsOf = (n: number): FillRows => ({
  sheet: '평가표',
  startRow: 2,
  columns: { A: 'no', B: 'hazard' },
  overflow: 'insertRows',
  data: Array.from({ length: n }, (_, i) => ({ no: i + 1, hazard: `합성 위험 ${i + 1}` })),
});

// 빈 행 2·3·4, 바닥글 5·6 → 5행 자료면 2행 모자람(at=5, n=2)
const S09 = (extra: Partial<Opts> = {}) =>
  book({
    rows: empty(2) + empty(3) + empty(4) + footer,
    merges: ['A5:D5', 'C2:D2'],
    printArea: "'평가표'!$A$1:$D$6",
    afterMerges: `<hyperlinks><hyperlink ref="A6" location="'평가표'!A6" display="확인자"/></hyperlinks>`,
    afterMargins: `<rowBreaks count="1" manualBreakCount="1"><brk id="5" max="16383" man="1"/></rowBreaks>`,
    ...extra,
  });

describe('닫힌 밀기(§2-5b) — 바닥글이 있는 서식(S09 모양)', () => {
  it('at 아래 행·칸·병합·링크·쪽 나눔·선택·dimension·인쇄영역을 n 행 내리고 새 행에 자료를 쓴다', async () => {
    const r = await fillXlsxTemplate(await zip(S09()), { rows: rowsOf(5) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.preserved!.insertedRows).toMatchObject({ count: 2, at: 5, same: true });
    const a = await unzip(r.bytes!);
    const s = a.get(SHEET)!;
    expect(s).toMatch(/<row r="7"><c r="A7" t="inlineStr"><is><t>작성자 서명<\/t>/);
    expect(s).toMatch(/<c r="A8" t="inlineStr"><is><t>확인자<\/t>/);
    expect(s).toContain('<mergeCell ref="A7:D7"/>');
    expect(s).toContain('<mergeCell ref="C2:D2"/>');
    expect(s).toContain(`<hyperlink ref="A8" location="'평가표'!A8"`);
    expect(s).toContain('<brk id="7"');
    expect(s).toContain('<selection activeCell="A8" sqref="A8"/>');
    expect(s).toContain('<dimension ref="A1:D8"/>');
    expect(s).toContain('합성 위험 5');
    expect(a.get(WB)).toContain("'평가표'!$A$1:$D$8");
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect(r.preserved!.allSame).toBe(true);
  });

  it('바닥글이 자료 행과 서식이 같아도, 묶인 열이 병합에 덮인 행은 빈 자리로 세지 않는다(실서식 S09 20행)', async () => {
    // 5행 = 자료 행과 같은 서식이지만 A5:D5 병합(값은 A5) — B5 는 덮인 칸이라 쓸 수 없다
    const foot = `<row r="5" ht="24" customHeight="1"><c r="A5" s="1" t="inlineStr"><is><t>작성자 서명</t></is></c><c r="B5" s="1"/><c r="C5" s="1"/><c r="D5" s="1"/></row>`;
    const r = await fillXlsxTemplate(await zip(book({ rows: empty(2) + empty(3) + empty(4) + foot, merges: ['A5:D5'] })), {
      rows: { ...rowsOf(4), columns: { B: 'hazard' } },
    });
    expect(r.reason).toBeUndefined();
    expect(r.issues.map((i) => i.code)).not.toContain('MERGED_CELL_SKIPPED');
    expect(r.issues.map((i) => i.code)).toContain('ROWS_PUSHED');
    expect((await unzip(r.bytes!)).get(SHEET)).toContain('<mergeCell ref="A6:D6"/>');
  });

  it('밀린 바닥글은 값·서식이 그대로이고, 다시 채우면(빈 요청) 바이트가 같다', async () => {
    const first = await fillXlsxTemplate(await zip(S09()), { rows: rowsOf(5) });
    const again = await fillXlsxTemplate(first.bytes!, {});
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
  });
});

describe('인쇄영역 밖 제자리 쓰기 경고(실서식 S09 at=21)', () => {
  const tpl = () => book({ rows: empty(2) + empty(3) + empty(4), printArea: "'평가표'!$A$1:$D$3" });
  it('쓴 마지막 자료 행이 인쇄영역 끝보다 아래면 PRINT_AREA_NOT_EXTENDED', async () => {
    const r = await fillXlsxTemplate(await zip(tpl()), { rows: rowsOf(3) });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain('PRINT_AREA_NOT_EXTENDED');
  });
  it('인쇄영역 안에서 끝나면 경고 없음', async () => {
    const r = await fillXlsxTemplate(await zip(tpl()), { rows: rowsOf(2) });
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).not.toContain('PRINT_AREA_NOT_EXTENDED');
  });
});

describe('닫힌 밀기 — 거부(OVERFLOW 유지)', () => {
  // [이름, 덧붙일 것, 사유에 있어야 할 말] — 사유까지 단언해야 「원래 막혔던 것」과 구별된다
  const cases: [string, Partial<Opts>, RegExp][] = [
    ['수식이 있으면', { rows: empty(2) + empty(3) + empty(4) + footer + `<row r="9"><c r="A9"><f>1+1</f><v>2</v></c></row>` }, /수식/],
    ['조건부서식이 있으면', { beforeMargins: `<conditionalFormatting sqref="A2:A4"><cfRule type="expression" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>` }, /조건부서식/],
    ['유효성이 있으면', { beforeMargins: `<dataValidations count="1"><dataValidation type="list" sqref="B2:B4"><formula1>"a,b"</formula1></dataValidation></dataValidations>` }, /유효성/],
    ['at 을 걸치는 병합이 있으면', { merges: ['A4:A5'] }, /걸치는 병합/],
    ['목록 밖 원소(autoFilter)가 있으면', { afterMerges: `<autoFilter ref="A1:B4"/>` }, /autoFilter/],
    ['내부 링크 location 이 단순 A1 이 아니면', { afterMerges: `<hyperlinks><hyperlink ref="A6" location="이름정의"/></hyperlinks>` }, /내부 링크/],
  ];
  for (const [name, extra, why] of cases) {
    it(`${name} 밀지 않고 OVERFLOW`, async () => {
      const r = await fillXlsxTemplate(await zip(S09(extra)), { rows: rowsOf(5) });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('OVERFLOW');
      expect(r.overflowRows).toBe(2);
      expect(r.reason).toMatch(why);
    });
  }

  it('이름정의(인쇄 이름·#REF! 밖)가 있으면 OVERFLOW', async () => {
    const files = S09();
    files[WB] = files[WB].replace('</definedNames>', '<definedName name="목록">\'평가표\'!$B$2:$B$4</definedName></definedNames>');
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(5) });
    expect(r.code).toBe('OVERFLOW');
    expect(r.reason).toMatch(/이름정의/);
  });

  it('본문이 #REF! 뿐인 이름은 밀기를 막지 않고 바이트 그대로 둔다', async () => {
    const files = S09();
    files[WB] = files[WB].replace('</definedNames>', '<definedName name="찌꺼기">#REF!</definedName></definedNames>');
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(5) });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(WB)).toContain('<definedName name="찌꺼기">#REF!</definedName>');
  });

  it("overflow:'error' 면 밀지 않는다", async () => {
    const r = await fillXlsxTemplate(await zip(S09()), { rows: { ...rowsOf(5), overflow: 'error' } });
    expect(r.code).toBe('OVERFLOW');
  });
});

// ── 도형 고정점(S11 모양) ── drawing1 = 밀 시트의 도형, drawing2 = 다른 시트(바이트 동일해야 함)
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const DRAW = 'xl/drawings/drawing1.xml';
const sp = (id: number) =>
  `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="도형 ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
  `<xdr:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:sp>`;
const pos = (col: number, row: number, tag = 'from') => `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>12700</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>25400</xdr:rowOff></xdr:${tag}>`;
const two = (r1: number, r2: number, id: number, editAs?: string, body = sp(id)) =>
  `<xdr:twoCellAnchor${editAs ? ` editAs="${editAs}"` : ''}>${pos(0, r1)}${pos(2, r2, 'to')}${body}<xdr:clientData/></xdr:twoCellAnchor>`;
const one = (r: number, id: number) => `<xdr:oneCellAnchor>${pos(1, r)}<xdr:ext cx="300" cy="400"/>${sp(id)}<xdr:clientData/></xdr:oneCellAnchor>`;
const drawingXml = (anchors: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}">${anchors}</xdr:wsDr>`;

/** S09 서식에 drawing 부품을 붙인다. 고정점 행은 0 기반(at=5 → 경계 4) */
function withDrawing(anchors: string, extra: Partial<Opts> = {}): Record<string, string> {
  const f = S09({ afterMargins: `<drawing r:id="rId9"/>`, ...extra });
  f['[Content_Types].xml'] = f['[Content_Types].xml'].replace(
    '</Types>',
    `<Override PartName="/${DRAW}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
  );
  f['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId9" Type="${R}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  f[DRAW] = drawingXml(anchors);
  return f;
}

describe('닫힌 밀기 — 도형 고정점(S11 모양)', () => {
  it('윗변 행(0 기반 from/row) ≥ at−1 인 고정점만 from·to 행을 +n, 위 고정점·오프셋·xfrm 은 그대로', async () => {
    // 위(0~2행) = 그대로, 경계(4) = 밀림, 아래 oneCell(5) = 밀림
    const anchors = two(0, 2, 2) + two(4, 5, 3) + one(5, 4);
    const r = await fillXlsxTemplate(await zip(withDrawing(anchors)), { rows: rowsOf(5) });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    const d = (await unzip(r.bytes!)).get(DRAW)!;
    expect(d).toBe(drawingXml(two(0, 2, 2) + two(6, 7, 3) + one(7, 4)));
    expect(r.preserved!.allSame).toBe(true);
  });

  it('도형만 밀어도 다시 채우면(빈 요청) 바이트가 같다', async () => {
    const first = await fillXlsxTemplate(await zip(withDrawing(two(4, 5, 3))), { rows: rowsOf(5) });
    const again = await fillXlsxTemplate(first.bytes!, {});
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
  });

  it('밀 일이 없으면(용량 안) drawing 은 바이트 그대로', async () => {
    const files = withDrawing(two(4, 5, 3));
    const r = await fillXlsxTemplate(await zip(files), { rows: rowsOf(3) });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(DRAW)).toBe(files[DRAW]);
  });

  const reject: [string, string, RegExp][] = [
    ['at 을 걸치는 고정점(윗변 위·아래 끝 아래)', two(2, 5, 3), /걸치/],
    ['at 아래 editAs="absolute"', two(4, 5, 3, 'absolute'), /absolute|고정/],
    ['absoluteAnchor', `<xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="1" cy="1"/>${sp(3)}<xdr:clientData/></xdr:absoluteAnchor>`, /absoluteAnchor/],
    ['묶음 도형(grpSp)', two(4, 5, 3, undefined, `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="3" name="g"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${sp(5)}</xdr:grpSp>`), /grpSp/],
    ['mc:AlternateContent', `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a14">${two(4, 5, 3)}</mc:Choice></mc:AlternateContent>`, /AlternateContent/],
    ['셀에 이어진 도형 글(textlink)', two(4, 5, 3, undefined, sp(3).replace('textlink=""', 'textlink="$A$6"')), /textlink|셀 연결/],
    ['그림 하이퍼링크', two(4, 5, 3, undefined, sp(3).replace('name="도형 3"/>', 'name="도형 3"><a:hlinkClick r:id="rId1" xmlns:r="' + R + '"/></xdr:cNvPr>')), /하이퍼링크/],
  ];
  for (const [name, anchors, why] of reject) {
    it(`${name} 이 있으면 밀지 않고 OVERFLOW`, async () => {
      const r = await fillXlsxTemplate(await zip(withDrawing(anchors)), { rows: rowsOf(5) });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('OVERFLOW');
      expect(r.reason).toMatch(why);
    });
  }

  it('위에만 있는 묶음 도형도 통합 거부(허용 목록 밖은 위치와 무관)', async () => {
    const g = two(0, 1, 3, undefined, `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="3" name="g"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${sp(5)}</xdr:grpSp>`);
    const r = await fillXlsxTemplate(await zip(withDrawing(g + two(4, 5, 6))), { rows: rowsOf(5) });
    expect(r.code).toBe('OVERFLOW');
  });
});

describe.todo('닫힌 밀기 — 엑셀 COM 오라클 대조(로컬 윈도 전용 스크립트, 합성 반례 + S11 714/216)');
