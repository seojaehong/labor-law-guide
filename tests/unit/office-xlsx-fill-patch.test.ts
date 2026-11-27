// 조각 2·3(설계 v2.1 §2-1·2-2·2-3·2-4·3) — 「원본 zip 그대로, 바꿀 칸만 패치」 회귀 묶음.
// 합성 반례만 쓴다(실서식은 KLABOR_PRIVATE_XLSX_DIR 로만). 부품 바이트를 우리가 정하려고 XML 을 손으로 짠다.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillXlsxTemplate } from '@/lib/office/xlsx/fill';
import { extractXlsxRows } from '@/lib/office/xlsx/extract';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const BOM = '﻿';
const SHEET = 'xl/worksheets/sheet1.xml';

const SST = ['위험요인', '비고_x000D_둘째 줄', '바닥'];

function sheetXml(): string {
  return (
    `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D6"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="16384" width="9" style="1"/></cols><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
    `<row r="2" ht="20" customHeight="1"><c r="A2" s="1" t="s"><v>2</v></c><c r="B2" s="1"/><c r="C2"><f>1+1</f><v>2</v></c><c r="D2"><f t="shared" ref="D2:D3" si="0">C2</f><v>2</v></c></row>` +
    `<row r="3" ht="20" customHeight="1"><c r="A3" s="1"/><c r="B3" s="1"/><c r="D3"><f t="shared" si="0"/><v>0</v></c></row>` +
    `<row r="5"/>` +
    `<row r="6" ht="20" customHeight="1"><c r="A6" s="1"/><c r="B6" s="1"/></row>` +
    `</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `<rowBreaks count="1" manualBreakCount="1"><brk id="4" max="16383" man="1"/></rowBreaks><legacyDrawing r:id="rId2"/></worksheet>`
  );
}

/** 접두 없는 SpreadsheetML 원소에 x: 를 붙이고 BOM 을 단다(.NET 생성기 모양) */
function prefixed(xml: string): string {
  return BOM + xml.replace(/<(\/?)([A-Za-z]\w*)(?=[\s/>])/g, '<$1x:$2').replace(`xmlns="${MAIN}"`, `xmlns:x="${MAIN}"`);
}

function partsFor(prefix: boolean): Record<string, string> {
  const sp = (x: string) => (prefix ? prefixed(x) : x);
  return {
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
      `<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>` +
      `<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': sp(`<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="평가표" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`),
    'xl/_rels/workbook.xml.rels':
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>` +
      `<Relationship Id="rId4" Type="${R}/calcChain" Target="calcChain.xml"/></Relationships>`,
    'xl/styles.xml': sp(
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs></styleSheet>`,
    ),
    'xl/sharedStrings.xml': sp(`<sst xmlns="${MAIN}" count="3" uniqueCount="3">${SST.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`),
    'xl/calcChain.xml': sp(`<calcChain xmlns="${MAIN}"><c r="C2" i="1"/><c r="D2"/><c r="D3"/></calcChain>`),
    [SHEET]: sp(sheetXml()),
    'xl/worksheets/_rels/sheet1.xml.rels':
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/comments" Target="../comments1.xml"/>` +
      `<Relationship Id="rId2" Type="${R}/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/></Relationships>`,
    'xl/comments1.xml': sp(`<comments xmlns="${MAIN}"><authors><author>합성</author></authors><commentList><comment ref="A1" authorId="0"><text><t>메모</t></text></comment></commentList></comments>`),
    'xl/drawings/vmlDrawing1.vml':
      `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
      `<v:shape id="_x0000_s1025" type="#_x0000_t202" style="visibility:hidden"><x:ClientData ObjectType="Note"><x:Row>0</x:Row><x:Column>0</x:Column></x:ClientData></v:shape></xml>`,
  };
}

async function build(prefix: boolean): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(partsFor(prefix))) zip.file(k, v);
  return zip.generateAsync({ type: 'uint8array' });
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes);
  const out = new Map<string, Uint8Array>();
  for (const f of Object.values(zip.files)) if (!f.dir) out.set(f.name, await f.async('uint8array'));
  return out;
}

const dec = new TextDecoder('utf-8', { ignoreBOM: true });
const same = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
/** 칸 하나(<c r="ADDR">…)를 지운 시트 문자열 — 「그 칸 밖은 토큰 동일」 대조용 */
const withoutCell = (xml: string, addr: string) => xml.replace(new RegExp(`<(?:x:)?c r="${addr}"[^>]*?(?:/>|>[\\s\\S]*?</(?:x:)?c>)`), '');
const cellXml = (xml: string, addr: string) => new RegExp(`<(?:x:)?c r="${addr}"[^>]*?(?:/>|>[\\s\\S]*?</(?:x:)?c>)`).exec(xml)?.[0] ?? '';
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe.each([
  ['접두 없음', false],
  ['x: 접두·BOM(안전집 모양)', true],
])('칸 패치 — %s', (_label, prefix) => {
  it('칸 하나 쓰기: 시트 밖 부품은 바이트 동일, 시트는 그 칸 밖 토큰 동일, 접두 유지', async () => {
    const input = await build(prefix);
    const r = await fillXlsxTemplate(input, { cells: [{ sheet: '평가표', cell: 'B2', value: '미끄럼 주의' }] });
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
    const before = await unzip(input);
    const after = await unzip(r.bytes!);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    // 허용 변경(§2-1·§2-6): 그 시트 + 수식이 있으면 workbook.xml 의 calcPr fullCalcOnLoad 하나
    for (const [name, data] of before) if (name !== SHEET && name !== 'xl/workbook.xml') expect(same(data, after.get(name)), name).toBe(true);
    const calcOn = (s: string) => s.replace(/\sfullCalcOnLoad="1"/, '');
    expect(calcOn(dec.decode(after.get('xl/workbook.xml')))).toBe(dec.decode(before.get('xl/workbook.xml')));
    expect(r.fullCalcOnLoad).toBe(true);
    const sb = dec.decode(before.get(SHEET));
    const sa = dec.decode(after.get(SHEET));
    // 수식 칸 캐시(<v>)는 좁힌 C 로 지워진다 — 그 밖 토큰은 같아야 한다
    const noV = (s: string) => s.replace(/(<(?:x:)?f\b[^>]*?(?:\/>|>[^<]*<\/(?:x:)?f>))<(?:x:)?v>[^<]*<\/(?:x:)?v>/g, '$1');
    expect(withoutCell(sa, 'B2')).toBe(withoutCell(noV(sb), 'B2'));
    const b2 = cellXml(sa, 'B2');
    expect(b2).toContain('s="1"');
    expect(b2).toContain('t="inlineStr"');
    expect(b2).toContain('미끄럼 주의');
    if (prefix) {
      expect(sa.startsWith(`${BOM}<x:worksheet`)).toBe(true);
      expect(b2.startsWith('<x:c ')).toBe(true);
    }
    expect(r.changedCells).toEqual([{ sheet: '평가표', cell: 'B2' }]);
  });

  it('수식 칸·공유 수식 범위 안 칸은 쓰지 않고 FORMULA_CELL_SKIPPED, 시트 바이트 동일', async () => {
    const input = await build(prefix);
    const r = await fillXlsxTemplate(input, {
      cells: [
        { sheet: '평가표', cell: 'C2', value: 9 },
        { sheet: '평가표', cell: 'D3', value: 9 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(codes(r).filter((c) => c === 'FORMULA_CELL_SKIPPED')).toHaveLength(2);
    expect(r.changedCells).toEqual([]);
    const before = await unzip(input);
    const after = await unzip(r.bytes!);
    for (const [name, data] of before) expect(same(data, after.get(name)), name).toBe(true);
  });

  it('없는 행에 쓰기: 마지막 자료 행의 행 속성·칸 서식을 복사한 새 <row>', async () => {
    const r = await fillXlsxTemplate(await build(prefix), { cells: [{ sheet: '평가표', cell: 'A7', value: '새 행' }] });
    expect(r.ok).toBe(true);
    const sa = dec.decode((await unzip(r.bytes!)).get(SHEET));
    const row7 = new RegExp(`<${prefix ? 'x:' : ''}row r="7"[^>]*>`).exec(sa)?.[0] ?? '';
    expect(row7).toContain('ht="20"');
    expect(row7).toContain('customHeight="1"');
    expect(cellXml(sa, 'A7')).toContain('s="1"');
    expect(sa.indexOf('r="7"')).toBeGreaterThan(sa.indexOf('r="6"'));
  });

  it('자기닫힘 <row/> 에 쓰기', async () => {
    const r = await fillXlsxTemplate(await build(prefix), { cells: [{ sheet: '평가표', cell: 'A5', value: '다섯째' }] });
    expect(r.ok).toBe(true);
    const sa = dec.decode((await unzip(r.bytes!)).get(SHEET));
    expect(cellXml(sa, 'A5')).toContain('다섯째');
    expect(sa).not.toMatch(/<(x:)?row r="5"\/>/);
  });

  it('값이 같으면 쓰지 않는다 — 부품 바이트 전부 동일', async () => {
    const input = await build(prefix);
    const r = await fillXlsxTemplate(input, { cells: [{ sheet: '평가표', cell: 'A2', value: '바닥' }] });
    expect(r.ok).toBe(true);
    expect(r.changedCells).toEqual([]);
    const before = await unzip(input);
    const after = await unzip(r.bytes!);
    for (const [name, data] of before) expect(same(data, after.get(name)), name).toBe(true);
  });

  it('멱등: 같은 입력으로 두 번 채우면 부품 바이트가 같다', async () => {
    const input = await build(prefix);
    const cells = [{ sheet: '평가표', cell: 'B3', value: '줄1\n줄2' }];
    const a = await unzip((await fillXlsxTemplate(input, { cells })).bytes!);
    const b = await unzip((await fillXlsxTemplate(input, { cells })).bytes!);
    for (const [name, data] of a) expect(same(data, b.get(name)), name).toBe(true);
  });
});

describe('글 쓰기 규칙(§2-2)', () => {
  it('C0 제어문자는 INVALID_ARGS', async () => {
    const r = await fillXlsxTemplate(await build(false), { cells: [{ sheet: '평가표', cell: 'B2', value: 'a\u0001b' }] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_ARGS');
  });

  it('사용자 글 안 _xHHHH_ 는 이스케이프해 엑셀과 같게 다시 읽힌다, 앞뒤 공백은 xml:space', async () => {
    const r = await fillXlsxTemplate(await build(false), {
      cells: [
        { sheet: '평가표', cell: 'B2', value: '코드 _x0041_ 그대로' },
        { sheet: '평가표', cell: 'B3', value: ' 앞 공백' },
      ],
    });
    expect(r.ok).toBe(true);
    const sa = dec.decode((await unzip(r.bytes!)).get(SHEET));
    expect(cellXml(sa, 'B2')).toContain('_x005F_x0041_');
    expect(cellXml(sa, 'B3')).toContain('xml:space="preserve"');
    const ex = await extractXlsxRows(r.bytes!, { headerRow: 1 });
    expect(ex.rows.find((row) => row.rowNumber === 2)?.cells['비고\r둘째 줄']?.raw ?? ex.rows.find((row) => row.rowNumber === 2)?.cells[ex.headers[1]]?.raw).toBe('코드 _x0041_ 그대로');
  });
});

// 다음 조각의 반례(지금은 자리만) — 조각 5·5b·6·6b 에서 RED 로 바꾼다
describe('후속 조각 자리', () => {
  it.todo('조각 6b: sst 정리 반례 6종(마지막 참조 둘·숨김 시트·숫자 교체·기존 빈 <si>·높은 번호 생존·rich run/rPh)');
});
