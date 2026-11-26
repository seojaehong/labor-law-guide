// 조각 6b(설계 v2.1 §2-7) — sst 정리: 덮어쓴 옛 글을 sharedStrings 에서 지운다.
// 합성 자료만. 시트 셋: 평가표(보임·채우는 시트)·숨김(state="hidden")·매우숨김(state="veryHidden").
// S6B-1 = 실패 시험 먼저(RED 확인), S6B-2 에서 구현해 켰다.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { fillXlsxTemplate, type FillXlsxResult } from '@/lib/office/xlsx/fill';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const S1 = 'xl/worksheets/sheet1.xml';
const S2 = 'xl/worksheets/sheet2.xml';
const S3 = 'xl/worksheets/sheet3.xml';
const SST = 'xl/sharedStrings.xml';
const REV = 'xl/revisions/revisionHeaders.xml';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

interface Opts {
  /** <si> 원문 목록(번호 = 순서) */
  si: string[];
  rows1: string;
  rows2?: string;
  rows3?: string;
  /** count 속성(없으면 uniqueCount 와 같게) */
  count?: number;
  revisions?: boolean;
}
const s = (ref: string, n: number) => `<c r="${ref}" t="s"><v>${n}</v></c>`;
const t = (text: string) => `<si><t>${text}</t></si>`;

function book(o: Opts): Record<string, string> {
  const sheet = (rows: string) =>
    `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><dimension ref="A1:D4"/><sheetData>${rows}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const files: Record<string, string> = {
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
      `<Override PartName="/${S1}" ContentType="${CT}.worksheet+xml"/><Override PartName="/${S2}" ContentType="${CT}.worksheet+xml"/>` +
      `<Override PartName="/${S3}" ContentType="${CT}.worksheet+xml"/><Override PartName="/${SST}" ContentType="${CT}.sharedStrings+xml"/>` +
      `${o.revisions ? `<Override PartName="/${REV}" ContentType="${CT}.revisionHeaders+xml"/>` : ''}` +
      `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':
      `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="평가표" sheetId="1" r:id="rId1"/>` +
      `<sheet name="숨김" sheetId="2" state="hidden" r:id="rId2"/><sheet name="매우숨김" sheetId="3" state="veryHidden" r:id="rId3"/></sheets>` +
      `<calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels':
      `<?xml version="1.0"?><Relationships xmlns="${PKG_R}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${R}/worksheet" Target="worksheets/sheet3.xml"/>` +
      `<Relationship Id="rId4" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId5" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>` +
      `${o.revisions ? `<Relationship Id="rId6" Type="${R}/revisionHeaders" Target="revisions/revisionHeaders.xml"/>` : ''}</Relationships>`,
    'xl/styles.xml':
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    [SST]: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<sst xmlns="${MAIN}" count="${o.count ?? o.si.length}" uniqueCount="${o.si.length}">${o.si.join('')}</sst>`,
    [S1]: sheet(o.rows1),
    [S2]: sheet(o.rows2 ?? ''),
    [S3]: sheet(o.rows3 ?? ''),
  };
  if (o.revisions) files[REV] = `<headers xmlns="${MAIN}" guid="{00000000-0000-0000-0000-000000000001}" lastGuid="{00000000-0000-0000-0000-000000000001}"/>`;
  return files;
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

/** 결과 필드는 S6B-2 에서 타입에 들어간다 — 그 전에도 시험이 컴파일되도록 좁혀 읽는다 */
const cleared = (r: FillXlsxResult) => (r as FillXlsxResult & { clearedSharedStrings?: number }).clearedSharedStrings;
/** sst 의 <si> 원문 목록(번호 순) */
const siList = (xml: string) => [...xml.matchAll(/<si\b[^>]*\/>|<si\b[^>]*>[\s\S]*?<\/si>/g)].map((m) => m[0]);

/**
 * 정리기와 독립한 판독기 — <si> 마다 본문·런의 <t> 를 이어 붙이고(rPh 발음 표기는 따로 모음),
 * XML 개체·숫자 문자 참조·_xHHHH_ 를 푼 글 목록. 「옛 글이 남았나」를 엑셀이 보는 글로 판정한다.
 */
function sstTexts(xml: string): string[] {
  const unent = (x: string) =>
    x
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  const tTexts = (x: string) => [...x.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unent(m[1]!)).join('');
  return siList(xml).flatMap((si) => {
    const phon = [...si.matchAll(/<rPh\b[\s\S]*?<\/rPh>/g)].map((m) => tTexts(m[0]));
    return [tTexts(si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')), ...phon];
  });
}
const remains = (sstXml: string, old: string) => sstTexts(sstXml).some((x) => x.includes(old));

describe('sst 정리 — 덮어쓴 옛 글 지우기(§2-7)', () => {
  it('① 같은 번호를 가리키던 마지막 참조 두 칸을 한 요청에서 동시에 덮어쓰면 그 <si> 를 비운다', async () => {
    const src = book({ si: [t('옛 글 갑'), t('머리')], rows1: `<row r="1">${s('A1', 1)}</row><row r="2">${s('B2', 0)}${s('C2', 0)}</row>` });
    const r = await fillXlsxTemplate(await zip(src), {
      cells: [
        { sheet: '평가표', cell: 'B2', value: '새 글 하나' },
        { sheet: '평가표', cell: 'C2', value: '새 글 둘' },
      ],
    });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    const sis = siList(a.get(SST)!);
    expect(sis).toHaveLength(2);
    expect(sis[0]).toBe('<si><t/></si>');
    expect(sis[1]).toBe(t('머리'));
    expect(cleared(r)).toBe(1);
    expect(a.get(S1)).toContain(s('A1', 1)); // 생존 칸은 그대로
  });

  it('② 숨김·매우 숨김 시트가 같은 번호를 가리키면 비우지 않는다', async () => {
    const src = book({
      si: [t('숨김이 쓰는 글'), t('매우 숨김이 쓰는 글')],
      rows1: `<row r="2">${s('B2', 0)}${s('C2', 1)}</row>`,
      rows2: `<row r="1">${s('A1', 0)}</row>`,
      rows3: `<row r="1">${s('A1', 1)}</row>`,
    });
    const r = await fillXlsxTemplate(await zip(src), {
      cells: [
        { sheet: '평가표', cell: 'B2', value: '새 글 하나' },
        { sheet: '평가표', cell: 'C2', value: '새 글 둘' },
      ],
    });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    expect(a.get(SST)).toBe(src[SST]); // 비울 번호가 없으면 sst 부품 바이트 그대로
    expect(cleared(r)).toBe(0);
    expect(a.get(S2)).toBe(src[S2]);
    expect(a.get(S3)).toBe(src[S3]);
  });

  it('③ t="s" 칸을 숫자로 바꿔도 그 옛 번호는 후보다', async () => {
    const src = book({ si: [t('옛 글 을'), t('머리')], rows1: `<row r="1">${s('A1', 1)}</row><row r="2">${s('B2', 0)}</row>` });
    const r = await fillXlsxTemplate(await zip(src), { cells: [{ sheet: '평가표', cell: 'B2', value: 42 }] });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    expect(siList(a.get(SST)!)[0]).toBe('<si><t/></si>');
    expect(cleared(r)).toBe(1);
    expect(a.get(S1)).toMatch(/<c r="B2"[^>]*><v>42<\/v><\/c>/);
  });

  it('④ 원래부터 빈 <si> 는 건드리지 않는다 — 후보여도 바이트 그대로', async () => {
    // 빈 <si> 는 엑셀이 쓰는 두 모양(<t></t>·<t/>) 모두
    const src = book({ si: ['<si><t></t></si>', '<si><t/></si>', t('머리')], rows1: `<row r="1">${s('A1', 2)}</row><row r="2">${s('B2', 0)}${s('C2', 1)}</row>` });
    const r = await fillXlsxTemplate(await zip(src), {
      cells: [
        { sheet: '평가표', cell: 'B2', value: '새 글 하나' },
        { sheet: '평가표', cell: 'C2', value: '새 글 둘' },
      ],
    });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    expect(a.get(SST)).toBe(src[SST]);
    expect(cleared(r)).toBe(0);
  });

  it('⑤ 높은 번호의 생존 칸이 있어도 번호를 당기지 않는다(count·uniqueCount 그대로)', async () => {
    const src = book({
      si: [t('옛 글 병'), t('가운데'), t('머리'), t('높은 번호 생존')],
      count: 9,
      rows1: `<row r="1">${s('A1', 2)}</row><row r="2">${s('B2', 0)}</row><row r="4">${s('D4', 3)}</row>`,
      rows2: `<row r="1">${s('A1', 1)}</row>`,
    });
    const r = await fillXlsxTemplate(await zip(src), { cells: [{ sheet: '평가표', cell: 'B2', value: '새 글' }] });
    expect(r.ok).toBe(true);
    const a = await unzip(r.bytes!);
    const sstOut = a.get(SST)!;
    expect(sstOut).toContain('count="9" uniqueCount="4"');
    expect(siList(sstOut)).toEqual(['<si><t/></si>', t('가운데'), t('머리'), t('높은 번호 생존')]);
    expect(a.get(S1)).toContain(s('D4', 3));
    expect(a.get(S1)).toContain(s('A1', 2));
    expect(a.get(S2)).toBe(src[S2]);
    expect(cleared(r)).toBe(1);
  });

  it('⑥ rich run·rPh 를 가진 <si> 는 자식을 전부 지워 <si><t/></si> 로 둔다', async () => {
    const rich =
      '<si><r><rPr><b/><sz val="11"/></rPr><t xml:space="preserve">옛 </t></r><r><t>런 글</t></r>' +
      '<rPh sb="0" eb="1"><t>ヨミ</t></rPh><phoneticPr fontId="0" type="noConversion"/></si>';
    const src = book({ si: [rich, t('머리')], rows1: `<row r="1">${s('A1', 1)}</row><row r="2">${s('B2', 0)}</row>` });
    const r = await fillXlsxTemplate(await zip(src), { cells: [{ sheet: '평가표', cell: 'B2', value: '새 글' }] });
    expect(r.ok).toBe(true);
    const sstOut = (await unzip(r.bytes!)).get(SST)!;
    expect(siList(sstOut)[0]).toBe('<si><t/></si>');
    expect(remains(sstOut, '옛 런 글')).toBe(false);
    expect(remains(sstOut, 'ヨミ')).toBe(false);
    expect(cleared(r)).toBe(1);
  });

  it('음성 대조 — 숫자 문자 참조·_xHHHH_·런으로 쪼갠 옛 글이 sst 에 남지 않는다(안 비우는 정리기는 실패)', async () => {
    // 「비밀글A」 = 런 두 개 + &#xAE00;(글) + _x0041_(A). 판독기가 이 글을 입력에서 찾아내야 단언이 의미가 있다
    const hidden = '<si><r><t>비밀</t></r><r><t>&#xAE00;_x0041_</t></r></si>';
    const src = book({ si: [hidden, t('머리')], rows1: `<row r="1">${s('A1', 1)}</row><row r="2">${s('B2', 0)}</row>` });
    expect(remains(src[SST]!, '비밀글A')).toBe(true); // 아무것도 안 비우면 출력도 이 상태 → 아래 단언이 실패한다
    const r = await fillXlsxTemplate(await zip(src), { cells: [{ sheet: '평가표', cell: 'B2', value: '새 글' }] });
    expect(r.ok).toBe(true);
    const sstOut = (await unzip(r.bytes!)).get(SST)!;
    expect(remains(sstOut, '비밀글A')).toBe(false);
    expect(sstTexts(sstOut)).toContain('머리'); // 생존 글은 남는다
  });

  it('결과 필드 — clearedSharedStrings 는 비운 <si> 수', async () => {
    const src = book({
      si: [t('옛 하나'), t('옛 둘'), t('머리')],
      rows1: `<row r="1">${s('A1', 2)}</row><row r="2">${s('B2', 0)}${s('C2', 1)}</row>`,
    });
    const r = await fillXlsxTemplate(await zip(src), {
      cells: [
        { sheet: '평가표', cell: 'B2', value: '새 하나' },
        { sheet: '평가표', cell: 'C2', value: '새 둘' },
      ],
    });
    expect(r.ok).toBe(true);
    expect(cleared(r)).toBe(2);
  });

  it('경고 — 변경 이력(revisions) 부품이 있으면 정리하지 않고 SST_CLEANUP_SKIPPED', async () => {
    const src = book({ si: [t('옛 글 정'), t('머리')], rows1: `<row r="1">${s('A1', 1)}</row><row r="2">${s('B2', 0)}</row>`, revisions: true });
    const r = await fillXlsxTemplate(await zip(src), { cells: [{ sheet: '평가표', cell: 'B2', value: '새 글' }] });
    expect(r.ok).toBe(true);
    expect(r.issues.map((x) => x.code)).toContain('SST_CLEANUP_SKIPPED');
    expect((await unzip(r.bytes!)).get(SST)).toBe(src[SST]);
    expect(cleared(r)).toBe(0);
  });
});
