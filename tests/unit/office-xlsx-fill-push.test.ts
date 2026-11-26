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

  it('밀린 바닥글은 값·서식이 그대로이고, 다시 채우면(빈 요청) 바이트가 같다', async () => {
    const first = await fillXlsxTemplate(await zip(S09()), { rows: rowsOf(5) });
    const again = await fillXlsxTemplate(first.bytes!, {});
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
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

describe.todo('닫힌 밀기 — 도형 고정점(S11 모양): from/row ≥ at−1 만 +n, 걸침·absolute 거부, 엑셀 COM 오라클 대조');
