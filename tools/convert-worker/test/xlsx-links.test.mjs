// node --test tools/convert-worker/test/xlsx-links.test.mjs
// 깨진 외부 연결 정리 — 합성 zip 만 쓴다(soffice 없이 돈다).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import JSZip from 'jszip';

import { repairExternalLinks, warningsHeader } from '../xlsx-links.mjs';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL_EXT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink';
const CT_EXT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml';
const BROKEN = ['합성.xls].xls]시트1', '합성.xls].xls].xls]시트2'];
const GOOD = ['시트1', '시트2'];

/** links = [{names}], formula = 시트 A1 수식(없으면 값), definedName = 이름 정의 수식 */
async function makeXlsx({ links = [], formula, definedName } = {}) {
  const z = new JSZip();
  const ov = links.map((_, i) => `<Override PartName="/xl/externalLinks/externalLink${i + 1}.xml" ContentType="${CT_EXT}"/>`).join('');
  z.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${ov}</Types>`,
  );
  const ext = links.length ? `<externalReferences>${links.map((_, i) => `<externalReference r:id="rId${i + 2}"/>`).join('')}</externalReferences>` : '';
  const dn = definedName ? `<definedNames><definedName name="합성이름">${definedName}</definedName></definedNames>` : '';
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook ${NS}><sheets><sheet name="표" sheetId="1" r:id="rId1"/></sheets>${ext}${dn}</workbook>`);
  const rels = links.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL_EXT}" Target="externalLinks/externalLink${i + 1}.xml"/>`).join('');
  z.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${rels}</Relationships>`,
  );
  const cell = formula ? `<c r="A1"><f>${formula}</f><v>1</v></c>` : '<c r="A1"><v>1</v></c>';
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS}><sheetData><row r="1">${cell}</row></sheetData></worksheet>`);
  links.forEach((l, i) => {
    const names = l.names.map((n) => `<sheetName val="${n}"/>`).join('');
    z.file(`xl/externalLinks/externalLink${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<externalLink ${NS}><externalBook r:id="rId1"><sheetNames>${names}</sheetNames></externalBook></externalLink>`);
    z.file(
      `xl/externalLinks/_rels/externalLink${i + 1}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///합성/원본${i + 1}.xls" TargetMode="External"/></Relationships>`,
    );
  });
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const codes = (ws) => ws.map(({ code, count }) => ({ code, count }));

async function parts(bytes) {
  const z = await JSZip.loadAsync(bytes);
  const read = async (n) => (await z.file(n)?.async('string')) ?? null;
  return { names: Object.keys(z.files).filter((n) => !z.files[n].dir), wb: await read('xl/workbook.xml'), rels: await read('xl/_rels/workbook.xml.rels'), ct: await read('[Content_Types].xml') };
}

describe('repairExternalLinks — 깨진 외부 연결 정리', () => {
  test('깨진 이름 2개 제거 · 가운데 정상 1개 보존', async () => {
    const src = await makeXlsx({ links: [{ names: BROKEN }, { names: GOOD }, { names: BROKEN }] });
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 2);
    assert.deepEqual(codes(r.warnings), [{ code: 'EXTERNAL_LINKS_REMOVED', count: 2 }]);
    // office 엔진 Warning 모양({code, message}) 을 따른다
    assert.equal(typeof r.warnings[0].message, 'string');
    assert.ok(r.warnings[0].message.length > 0);
    const p = await parts(r.bytes);
    // 정상 연결(rId3 → externalLink2)만 남는다
    assert.deepEqual([...p.wb.matchAll(/<externalReference r:id="([^"]+)"\/>/g)].map((m) => m[1]), ['rId3']);
    assert.match(p.rels, /Id="rId3"[^>]*externalLink2\.xml/);
    assert.doesNotMatch(p.rels, /externalLink[13]\.xml/);
    assert.match(p.ct, /\/xl\/externalLinks\/externalLink2\.xml/);
    assert.doesNotMatch(p.ct, /externalLink[13]\.xml/);
    const ext = p.names.filter((n) => n.startsWith('xl/externalLinks/')).sort();
    assert.deepEqual(ext, ['xl/externalLinks/_rels/externalLink2.xml.rels', 'xl/externalLinks/externalLink2.xml']);
    // 다른 부품은 남는다
    assert.ok(p.names.includes('xl/worksheets/sheet1.xml'));
    assert.match(p.rels, /Id="rId1"[^>]*worksheets\/sheet1\.xml/);
  });

  test('깨진 것만 있으면 빈 externalReferences 껍데기까지 지운다', async () => {
    const r = await repairExternalLinks(await makeXlsx({ links: [{ names: BROKEN }, { names: BROKEN }] }));
    assert.equal(r.removed, 2);
    const p = await parts(r.bytes);
    assert.doesNotMatch(p.wb, /externalReference/);
    assert.equal(p.names.filter((n) => n.startsWith('xl/externalLinks/')).length, 0);
    assert.match(p.wb, /<sheets>.*<\/sheets><\/workbook>/);
  });

  test('수식이 [n] 으로 가리키는 깨진 연결은 보존 + 경고, 바이트 그대로', async () => {
    const src = await makeXlsx({ links: [{ names: GOOD }, { names: BROKEN }], formula: "'[2]시트1'!A1+1" });
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 0);
    assert.deepEqual(codes(r.warnings), [{ code: 'EXTERNAL_LINKS_KEPT_REFERENCED', count: 1 }]);
    assert.equal(r.bytes, src);
  });

  test('이름 정의가 [n] 으로 가리켜도 보존', async () => {
    const src = await makeXlsx({ links: [{ names: BROKEN }], definedName: '[1]!합성' });
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 0);
    assert.deepEqual(codes(r.warnings), [{ code: 'EXTERNAL_LINKS_KEPT_REFERENCED', count: 1 }]);
    assert.equal(r.bytes, src);
  });

  test('뒤의 정상 연결이 참조되면 앞의 깨진 연결을 지우지 않는다(번호 당김 방지)', async () => {
    const src = await makeXlsx({ links: [{ names: BROKEN }, { names: GOOD }], formula: '[2]시트1!A1' });
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 0);
    assert.deepEqual(codes(r.warnings), [{ code: 'EXTERNAL_LINKS_KEPT_REFERENCED', count: 1 }]);
    assert.equal(r.bytes, src);
  });

  test('앞의 정상 연결만 참조되면 뒤의 깨진 연결은 지운다', async () => {
    const r = await repairExternalLinks(await makeXlsx({ links: [{ names: GOOD }, { names: BROKEN }], formula: '[1]시트1!A1' }));
    assert.equal(r.removed, 1);
    const p = await parts(r.bytes);
    assert.deepEqual([...p.wb.matchAll(/<externalReference r:id="([^"]+)"\/>/g)].map((m) => m[1]), ['rId2']);
  });

  test('외부 연결 없는 파일은 바이트 그대로', async () => {
    const src = await makeXlsx();
    const r = await repairExternalLinks(src);
    assert.equal(r.bytes, src);
    assert.equal(r.removed, 0);
    assert.deepEqual(r.warnings, []);
  });

  test('정상 외부 연결만 있으면 바이트 그대로', async () => {
    const src = await makeXlsx({ links: [{ names: GOOD }, { names: GOOD }] });
    const r = await repairExternalLinks(src);
    assert.equal(r.bytes, src);
    assert.deepEqual(r.warnings, []);
  });

  test('경고에는 개수만 — 시트 이름·경로가 새지 않는다', async () => {
    const r = await repairExternalLinks(await makeXlsx({ links: [{ names: BROKEN }, { names: BROKEN }], formula: '[1]x!A1' }));
    const s = JSON.stringify(r.warnings) + warningsHeader(r.warnings);
    assert.doesNotMatch(s, /합성|xls|시트|file:/);
    assert.equal(warningsHeader(r.warnings), 'EXTERNAL_LINKS_REMOVED=1,EXTERNAL_LINKS_KEPT_REFERENCED=1');
  });
});

// 3각 검수 1차(261127) 반례 — 판정표 #22·24
async function tweak(bytes, fn) {
  const z = await JSZip.loadAsync(bytes);
  await fn(z);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
const editPart = async (z, name, f) => z.file(name, f(await z.file(name).async('string')));

describe('repairExternalLinks — 3각 검수 1차 반례', () => {
  // 연결 순서 [깨짐, 정상, 정상] — 어디선가 [2] 를 쓰면 첫 깨진 연결을 지우면 안 된다(번호가 당겨져 [2] 가 셋째를 가리킴)
  const three = () => makeXlsx({ links: [{ names: BROKEN }, { names: GOOD }, { names: GOOD }] });

  test('표의 계산 열 수식([2])도 참조로 센다', async () => {
    const src = await tweak(await three(), (z) => z.file('xl/tables/table1.xml', `<table ${NS} id="1" name="T" ref="A1:A2"><tableColumns count="1"><tableColumn id="1" name="c"><calculatedColumnFormula>'[2]시트1'!A1</calculatedColumnFormula></tableColumn></tableColumns></table>`));
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 0);
  });

  test('숫자 문자 참조(&#91;2&#93;)로 적힌 수식도 참조로 센다', async () => {
    const r = await repairExternalLinks(await makeXlsx({ links: [{ names: BROKEN }, { names: GOOD }, { names: GOOD }], formula: '&#91;2&#93;시트1!A1' }));
    assert.equal(r.removed, 0);
  });

  test('조건부서식 cfvo val·도형 textlink 속성 속 [2] 도 참조로 센다', async () => {
    for (const extra of [
      ['xl/worksheets/sheet1.xml', (s) => s.replace('</worksheet>', `<conditionalFormatting sqref="A1"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="formula" val="'[2]시트1'!A1"/><cfvo type="max"/><color rgb="FF000000"/></dataBar></cfRule></conditionalFormatting></worksheet>`)],
      ['xl/drawings/drawing1.xml', () => `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:sp textlink="[2]시트1!$A$1"/></xdr:wsDr>`],
    ]) {
      const src = await tweak(await three(), async (z) => (z.file(extra[0]) ? editPart(z, extra[0], extra[1]) : z.file(extra[0], extra[1]())));
      const r = await repairExternalLinks(src);
      assert.equal(r.removed, 0, extra[0]);
    }
  });

  test('서식(styles.xml)의 셀 스타일 이름 「쉼표 [0]」·「[2]」 는 참조가 아니다(실서식 S11 오탐)', async () => {
    const src = await tweak(await makeXlsx({ links: [{ names: BROKEN }, { names: BROKEN }] }), (z) => z.file('xl/styles.xml', `<styleSheet ${NS}><cellStyles count="2"><cellStyle name="쉼표 [0]" xfId="0" builtinId="6"/><cellStyle name="합성 [2]" xfId="0"/></cellStyles></styleSheet>`));
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 2);
  });

  test('글 칸(<t>)의 [2] 는 참조가 아니다', async () => {
    const src = await tweak(await makeXlsx({ links: [{ names: BROKEN }] }), (z) => editPart(z, 'xl/worksheets/sheet1.xml', (s) => s.replace('<c r="A1"><v>1</v></c>', '<c r="A1" t="inlineStr"><is><t>항목 [1]</t></is></c>')));
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 1);
  });

  test('externalReference 안에 주석이 있어도 참조·관계·부품을 함께 지운다', async () => {
    const src = await tweak(await makeXlsx({ links: [{ names: BROKEN }] }), (z) => editPart(z, 'xl/workbook.xml', (s) => s.replace('<externalReference r:id="rId2"/>', '<externalReference r:id="rId2"><!--memo--></externalReference>')));
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 1);
    const p = await parts(r.bytes);
    assert.doesNotMatch(p.wb, /externalReference/);
    assert.doesNotMatch(p.rels, /rId2/);
    assert.equal(p.names.filter((n) => n.startsWith('xl/externalLinks/')).length, 0);
  });

  test('접두 붙은 Override(p:Override)·작은따옴표 r:id 도 함께 지운다', async () => {
    let src = await makeXlsx({ links: [{ names: BROKEN }] });
    src = await tweak(src, async (z) => {
      await editPart(z, '[Content_Types].xml', (s) => s.replace('<Types xmlns=', '<p:Types xmlns:p=').replace('</Types>', '</p:Types>').replace(/<(Default|Override)\b/g, '<p:$1'));
      await editPart(z, 'xl/workbook.xml', (s) => s.replace('<externalReference r:id="rId2"/>', "<externalReference r:id='rId2'/>"));
    });
    const r = await repairExternalLinks(src);
    assert.equal(r.removed, 1);
    const p = await parts(r.bytes);
    assert.doesNotMatch(p.ct, /externalLink1/);
    assert.doesNotMatch(p.wb, /externalReference/);
  });

  test('세 곳 중 하나라도 지우지 못하면 원본을 두고 경고만 낸다', async () => {
    // 관계 Id 를 대문자 속성으로 바꿔 관계를 찾지 못하게 — 부품만 지워지는 반쪽 상태를 만들지 않는다
    const src = await tweak(await makeXlsx({ links: [{ names: BROKEN }] }), (z) => editPart(z, 'xl/workbook.xml', (s) => s.replace('<externalReference r:id="rId2"/>', '<externalReference r:id="rId2"/><externalReference r:id="rId2"/>')));
    const r = await repairExternalLinks(src);
    assert.equal(r.bytes, src);
    assert.equal(r.removed, 0);
    assert.ok(r.warnings.some((w) => w.code === 'EXTERNAL_LINKS_CHECK_FAILED'));
  });
});
