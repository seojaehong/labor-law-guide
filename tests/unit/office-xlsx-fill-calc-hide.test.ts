// 조각 6(설계 v2.1 §2-6·§2-1) — 열 숨김을 칸 패치 경로에서(<col> 쪼개기·<cols> 새로 만들기), 수식 캐시 좁힌 C.
// 합성 반례만. 시트 둘: 평가표(채우는 시트)·요약(다른 시트).
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const S1 = 'xl/worksheets/sheet1.xml';
const S2 = 'xl/worksheets/sheet2.xml';
const WB = 'xl/workbook.xml';

interface Opts {
  cols1?: string;
  rows1?: string;
  rows2?: string;
  names?: string;
  calcPr?: string;
}
function book(o: Opts = {}): Record<string, string> {
  const sheet = (cols: string, rows: string) =>
    `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D4"/><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  return {
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/${S1}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/${S2}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    [WB]:
      `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="평가표" sheetId="1" r:id="rId1"/><sheet name="요약" sheetId="2" r:id="rId2"/></sheets>` +
      `${o.names ?? ''}${o.calcPr ?? '<calcPr calcId="191029"/>'}</workbook>`,
    'xl/_rels/workbook.xml.rels':
      `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    [S1]: sheet(o.cols1 ?? '', o.rows1 ?? `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c></row><row r="2"><c r="A2"/><c r="B2"/></row>`),
    [S2]: sheet('', o.rows2 ?? `<row r="1"><c r="A1" t="inlineStr"><is><t>요약</t></is></c></row>`),
  };
}
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
const write = { cells: [{ sheet: '평가표', cell: 'B2', value: '합성 위험' }] };
const hideM = { hiddenColumns: [{ sheet: '평가표', columns: ['M'] }] };

describe('열 숨김 — 칸 패치 경로(§2-1)', () => {
  it('<cols> 가 없으면 sheetData 앞에 새로 만들고, 바뀐 부품은 그 시트 하나', async () => {
    const src = book();
    const r = await fillXlsxTemplate(await zip(src), { ...write, ...hideM });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    expect(a.get(S1)).toMatch(/<sheetFormatPr defaultRowHeight="15"\/><cols><col min="13" max="13" hidden="1"[^>]*\/><\/cols><sheetData>/);
    const changed = [...Object.entries(src)].filter(([k, v]) => a.get(k) !== v).map(([k]) => k);
    expect(changed).toEqual([S1]);
    expect(r.preserved!.hiddenColumns).toEqual({ applied: hideM.hiddenColumns, same: true });
  });

  it('범위 <col> 를 쪼갠다 — 앞·숨김 한 열·뒤, 속성은 그대로', async () => {
    const r = await fillXlsxTemplate(await zip(book({ cols1: `<cols><col min="1" max="16384" width="9" customWidth="1"/></cols>` })), { ...write, ...hideM });
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(S1)).toContain(
      `<cols><col min="1" max="12" width="9" customWidth="1"/><col min="13" max="13" width="9" customWidth="1" hidden="1"/><col min="14" max="16384" width="9" customWidth="1"/></cols>`,
    );
  });

  it('이미 숨긴 열이면 시트를 바꾸지 않는다', async () => {
    const src = book({ cols1: `<cols><col min="13" max="13" width="0" hidden="1" customWidth="1"/></cols>` });
    const r = await fillXlsxTemplate(await zip(src), hideM);
    expect(r.ok).toBe(true);
    expect((await unzip(r.bytes!)).get(S1)).toBe(src[S1]);
  });

  it('두 열(이웃 포함)·다른 시트도 숨긴다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ cols1: `<cols><col min="12" max="14" width="5" customWidth="1"/></cols>` })), {
      hiddenColumns: [{ sheet: '평가표', columns: ['M', 'N'] }, { sheet: '요약', columns: ['A'] }],
    });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    expect(a.get(S1)).toContain(`<cols><col min="12" max="12" width="5" customWidth="1"/><col min="13" max="13" width="5" customWidth="1" hidden="1"/><col min="14" max="14" width="5" customWidth="1" hidden="1"/></cols>`);
    expect(a.get(S2)).toMatch(/<cols><col min="1" max="1" hidden="1"[^>]*\/><\/cols>/);
  });

  it('같은 요청으로 두 번 채우면 바이트가 같다(멱등)', async () => {
    const first = await fillXlsxTemplate(await zip(book()), { ...write, ...hideM });
    const again = await fillXlsxTemplate(first.bytes!, { ...write, ...hideM });
    expect(Buffer.from(again.bytes!).equals(Buffer.from(first.bytes!))).toBe(true);
  });

  it('ExcelJS 로 통째 저장하지 않는다 — 다른 시트 바이트 동일', async () => {
    const src = book({ rows2: `<row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve"> 공백 보존 </t></is></c></row>` });
    const r = await fillXlsxTemplate(await zip(src), { ...write, ...hideM });
    expect((await unzip(r.bytes!)).get(S2)).toBe(src[S2]);
  });
});

describe('수식 캐시 — 좁힌 C(§2-6)', () => {
  const f1 = `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c></row><row r="2"><c r="A2"/><c r="B2"/><c r="C2"><f>LEN(B2)</f><v>0</v></c></row>`;
  const other = (ref: string) => `<row r="1"><c r="A1"><f>${ref}</f><v>7</v></c></row>`;

  it('수식이 없으면 workbook.xml 바이트 그대로·fullCalcOnLoad false', async () => {
    const src = book();
    const r = await fillXlsxTemplate(await zip(src), write);
    expect(r.fullCalcOnLoad).toBe(false);
    expect((await unzip(r.bytes!)).get(WB)).toBe(src[WB]);
  });

  it('채운 시트 수식의 <v> 만 지우고 fullCalcOnLoad="1"', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: f1, rows2: other('1+1') })), write);
    expect(r.ok).toBe(true);
    expect(r.fullCalcOnLoad).toBe(true);
    const a = await unzip(r.bytes!);
    expect(a.get(S1)).toContain('<c r="C2"><f>LEN(B2)</f></c>');
    expect(a.get(S2)).toContain('<f>1+1</f><v>7</v>'); // 채운 시트를 안 가리키는 다른 시트 수식은 그대로
    expect(a.get(WB)).toContain('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
  });

  it('다른 시트 수식이 채운 시트 이름을 가리키면 그 캐시도 지운다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: f1, rows2: other(`'평가표'!C2`) })), write);
    expect((await unzip(r.bytes!)).get(S2)).toContain(`<f>'평가표'!C2</f></c>`);
  });

  it('이름정의(인쇄 이름 밖)나 INDIRECT 가 있으면 통합문서 수식 캐시를 전부 지운다', async () => {
    for (const o of [
      { names: `<definedNames><definedName name="목록">요약!$A$1</definedName></definedNames>`, rows2: other('목록') },
      { rows2: other('INDIRECT("A1")') },
    ]) {
      const r = await fillXlsxTemplate(await zip(book({ rows1: f1, ...o })), write);
      expect(r.fullCalcOnLoad).toBe(true);
      expect((await unzip(r.bytes!)).get(S2)).not.toContain('<v>7</v>');
    }
  });

  it('바뀐 칸이 없으면(같은 값) 캐시도 calcPr 도 그대로', async () => {
    const src = book({ rows1: f1.replace('<c r="B2"/>', '<c r="B2" t="inlineStr"><is><t>합성 위험</t></is></c>') });
    const r = await fillXlsxTemplate(await zip(src), write);
    expect(r.fullCalcOnLoad).toBe(false);
    expect((await unzip(r.bytes!)).get(S1)).toBe(src[S1]);
  });

  it('calcPr 가 없으면 만들어 넣는다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: f1, calcPr: '' })), write);
    expect((await unzip(r.bytes!)).get(WB)).toMatch(/<calcPr fullCalcOnLoad="1"\/><\/workbook>/);
  });
});
