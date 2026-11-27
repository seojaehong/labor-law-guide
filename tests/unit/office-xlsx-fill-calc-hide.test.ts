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

// 3각 검수 1차(261127) 반례 — 판정표 C:/Users/iceam/dev/_reviews/261127_pr300_s6_s7/G4_판정표.md #6~10·13·14·19
describe('3각 검수 1차 — 수식 캐시·calcPr·열 숨김 반례', () => {
  const plain = `<row r="1"><c r="A1" t="inlineStr"><is><t>번호</t></is></c></row><row r="2"><c r="A2"/><c r="B2"/></row>`;
  const other = (ref: string) => `<row r="1"><c r="A1"><f>${ref}</f><v>7</v></c></row>`;
  const withF = plain.replace('<c r="B2"/>', '<c r="B2"/><c r="C2"><f>LEN(B2)</f><v>0</v></c>');
  /** 시트 이름을 바꾼 통합문서(workbook.xml 의 이름만, 엔티티 그대로 넣는다) */
  const renamed = (files: Record<string, string>, from: string, to: string) => ({ ...files, [WB]: files[WB].replace(`name="${from}"`, `name="${to}"`) });
  /** 셋째 시트 「끝」을 덧붙인다 */
  const S3 = 'xl/worksheets/sheet3.xml';
  const withThird = (files: Record<string, string>, rows3: string) => ({
    ...files,
    '[Content_Types].xml': files['[Content_Types].xml'].replace('</Types>', `<Override PartName="/${S3}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    [WB]: files[WB].replace('</sheets>', '<sheet name="끝" sheetId="3" r:id="rId9"/></sheets>'),
    'xl/_rels/workbook.xml.rels': files['xl/_rels/workbook.xml.rels'].replace('</Relationships>', `<Relationship Id="rId9" Type="${R}/worksheet" Target="worksheets/sheet3.xml"/></Relationships>`),
    [S3]: files[S2].replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${rows3}</sheetData>`),
  });
  const hideB = { ...write, hiddenColumns: [{ sheet: '평가표', columns: ['B'] }] };

  it('주석 속 <f> 를 수식으로 보지 않는다 — 수식 없는 칸의 값은 그대로', async () => {
    const rows2 = `<row r="1"><c r="A1"><f>평가표!B2</f><v>7</v></c><c r="C1"><!-- <f>0</f> --><v>42</v></c></row>`;
    const r = await fillXlsxTemplate(await zip(book({ rows1: plain, rows2 })), write);
    const s2 = (await unzip(r.bytes!)).get(S2)!;
    expect(s2).toContain('<v>42</v>');
    expect(s2).not.toContain('<v>7</v>');
  });

  it('공백이 붙은 <v > 캐시도 지운다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: plain, rows2: `<row r="1"><c r="A1"><f>평가표!B2</f><v >7</v></c></row>` })), write);
    expect((await unzip(r.bytes!)).get(S2)).not.toMatch(/<v\s*>7</);
  });

  it('자기닫힘 <f/> 만 있는 시트도 수식 시트로 본다', async () => {
    const rows1 = plain.replace('<c r="B2"/>', '<c r="B2"/><c r="C2"><f t="dataTable" ref="C2:C3" r1="B2"/><v>18</v></c>');
    const r = await fillXlsxTemplate(await zip(book({ rows1 })), write);
    expect(r.fullCalcOnLoad).toBe(true);
    expect((await unzip(r.bytes!)).get(S1)).not.toContain('<v>18</v>');
  });

  it('시트 이름 엔티티(R&D)와 대소문자 다른 참조(data!)도 그 시트를 가리키는 것으로 본다', async () => {
    for (const [name, ref, plainName] of [['R&amp;D', `'R&amp;D'!B2`, 'R&D'], ['Data', 'data!B2', 'Data']] as const) {
      const files = renamed(book({ rows1: plain, rows2: other(ref) }), '평가표', name);
      const r = await fillXlsxTemplate(await zip(files), { cells: [{ sheet: plainName, cell: 'B2', value: '합성' }] });
      expect(r.ok).toBe(true);
      expect((await unzip(r.bytes!)).get(S2)).not.toContain('<v>7</v>');
    }
  });

  it('건너 참조(평가표 → 요약 → 끝)의 끝 시트 캐시도 지운다', async () => {
    const files = withThird(book({ rows1: plain, rows2: other('평가표!B2') }), `<row r="1"><c r="A1"><f>요약!A1</f><v>5</v></c></row>`);
    const r = await fillXlsxTemplate(await zip(files), write);
    expect((await unzip(r.bytes!)).get(S3)).not.toContain('<v>5</v>');
  });

  it('3차원 참조(평가표:요약!)의 첫 시트를 바꿔도 그 수식 캐시를 지운다', async () => {
    const files = withThird(book({ rows1: plain }), `<row r="1"><c r="A1"><f>SUM(평가표:요약!B2)</f><v>5</v></c></row>`);
    const r = await fillXlsxTemplate(await zip(files), write); // 범위의 첫 시트(평가표:)를 바꾼다
    expect((await unzip(r.bytes!)).get(S3)).not.toContain('<v>5</v>');
  });

  it('calcPr 가 없을 때 workbookView 안 extLst 가 아니라 통합문서 바로 아래에 넣는다', async () => {
    const files = book({ rows1: withF, calcPr: '' });
    files[WB] = files[WB].replace('<sheets>', '<bookViews><workbookView><extLst/></workbookView></bookViews><sheets>');
    const r = await fillXlsxTemplate(await zip(files), write);
    const wb = (await unzip(r.bytes!)).get(WB)!;
    expect(wb).toContain('<workbookView><extLst/></workbookView>');
    expect(wb).toMatch(/<\/sheets><calcPr fullCalcOnLoad="1"\/><\/workbook>/);
  });

  it('작은따옴표 속성 fullCalcOnLoad 를 두 번 쓰지 않는다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: withF, calcPr: `<calcPr calcId="1" fullCalcOnLoad='0'/>` })), write);
    expect(r.ok).toBe(true);
    const wb = (await unzip(r.bytes!)).get(WB)!;
    expect(wb.match(/fullCalcOnLoad/g)).toHaveLength(1);
    expect(wb).toContain('fullCalcOnLoad="1"');
  });

  it('= 앞뒤 공백 속성(<col min = "1">)을 두 번 쓰지 않고 나머지 열 폭을 지킨다', async () => {
    const r = await fillXlsxTemplate(await zip(book({ rows1: plain, cols1: '<cols><col min = "1" max="3" width="10" customWidth="1"/></cols>' })), hideB);
    expect(r.ok).toBe(true);
    const s1 = (await unzip(r.bytes!)).get(S1)!;
    expect(s1).toContain('<col min="1" max="1" width="10" customWidth="1"/>');
    expect(s1).toContain('<col min="2" max="2" width="10" customWidth="1" hidden="1"/>');
    expect(s1).toContain('<col min="3" max="3" width="10" customWidth="1"/>');
  });

  it('<col> 안에 내용이 있거나 <cols> 가 둘이면 조용히 망치지 않고 거절한다', async () => {
    for (const cols1 of ['<cols><col min="1" max="3" width="10" customWidth="1"><!--note--></col></cols>', '<cols><col min="1" max="1" width="9"/></cols><cols><col min="2" max="2" width="9" hidden="0"/></cols>']) {
      const r = await fillXlsxTemplate(await zip(book({ rows1: plain, cols1 })), hideB);
      expect(r.ok).toBe(false);
    }
  });
});
