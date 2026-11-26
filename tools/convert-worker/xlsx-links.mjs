// xls → xlsx 변환 뒤 깨진 외부 연결 정리.
// LibreOffice 는 .xls 의 외부 연결을 xlsx 로 옮기며 시트 이름을 `….xls].xls]…` 처럼 망가뜨린다.
// 엑셀은 시트 이름에 [ ] : \ / ? * 를 허용하지 않아 그런 파일을 원본부터 열지 못한다.
// 깨진 연결만 지운다(workbook.xml externalReference · workbook.xml.rels 관계 · [Content_Types].xml Override · 부품과 그 rels).
// 수식·이름이 `[n]`(externalReferences 안 순서, 1부터)으로 가리키는 연결은 지우지 않고 경고만 남긴다 —
// 앞 항목을 지우면 뒤 항목 번호가 당겨지므로, 뒤에 참조되는 항목이 있어도 지우지 않는다.
// 바꿀 것이 없으면 입력 바이트를 그대로 돌려준다. 경고에는 개수만 싣는다(이름·경로·내용 없음).
import JSZip from 'jszip';

const BAD_SHEET_NAME = /[[\]:\\/?*]/;
// 수식이 들어가는 요소 — 시트 <f>, 차트 <c:f>, x14 <xm:f>, 조건부 서식·유효성 <formula*>, 이름 <definedName>
const FORMULA_EL = /<(?:\w+:)?(?:f|formula|formula1|formula2|definedName)\b[^>]*>([^<]*)</g;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function partOf(target) {
  if (target.startsWith('/')) return target.slice(1);
  return `xl/${target}`.replace(/\/\.\//g, '/');
}

function relsOf(part) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

/** 외부 연결 번호(1부터) 중 수식·이름이 가리키는 것 */
async function referencedIndexes(zip) {
  const used = new Set();
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || !name.endsWith('.xml') || name.startsWith('xl/externalLinks/')) continue;
    const s = await zip.file(name).async('string');
    for (const m of s.matchAll(FORMULA_EL)) for (const r of m[1].matchAll(/\[(\d+)\]/g)) used.add(Number(r[1]));
  }
  return used;
}

/**
 * @param {Uint8Array} bytes xlsx
 * @returns {Promise<{bytes: Uint8Array, removed: number, warnings: {code: string, message: string, count: number}[]}>}
 */
export async function repairExternalLinks(bytes) {
  const same = { bytes, removed: 0, warnings: [] };
  const zip = await JSZip.loadAsync(bytes);
  const wbFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!wbFile || !relsFile) return same;
  let wb = await wbFile.async('string');
  const refs = [...wb.matchAll(/<(?:\w+:)?externalReference\b[^>]*?\b\w+:id="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  if (!refs.length) return same;
  let rels = await relsFile.async('string');

  // 연결마다 {rid, part, broken}
  const links = [];
  for (const rid of refs) {
    const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${esc(rid)}"[^>]*>`).exec(rels)?.[0];
    const target = rel && /\bTarget="([^"]+)"/.exec(rel)?.[1];
    const part = target ? partOf(target) : '';
    const file = part && zip.file(part);
    let broken = false;
    if (file) {
      const x = await file.async('string');
      broken = [...x.matchAll(/<(?:\w+:)?sheetName\b[^>]*\bval="([^"]*)"/g)].some((m) => BAD_SHEET_NAME.test(m[1]));
    }
    links.push({ rid, part, broken });
  }
  if (!links.some((l) => l.broken)) return same;

  const used = await referencedIndexes(zip);
  const lastUsed = Math.max(0, ...used);
  const drop = links.filter((l, i) => l.broken && i + 1 > lastUsed);
  const kept = links.filter((l) => l.broken).length - drop.length;
  const warnings = [];
  if (kept) warnings.push(linkWarning('EXTERNAL_LINKS_KEPT_REFERENCED', kept));
  if (!drop.length) return { bytes, removed: 0, warnings };

  let ct = (await zip.file('[Content_Types].xml')?.async('string')) ?? null;
  for (const l of drop) {
    wb = wb.replace(new RegExp(`<(?:\\w+:)?externalReference\\b[^>]*?\\b\\w+:id="${esc(l.rid)}"[^>]*?(?:/>|>\\s*</(?:\\w+:)?externalReference>)`), '');
    rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${esc(l.rid)}"[^>]*?(?:/>|>\\s*</Relationship>)`), '');
    if (ct !== null) ct = ct.replace(new RegExp(`<Override\\b[^>]*\\bPartName="/${esc(l.part)}"[^>]*?(?:/>|>\\s*</Override>)`), '');
    zip.remove(l.part);
    zip.remove(relsOf(l.part));
  }
  // 모두 지웠으면 빈 껍데기도 지운다(빈 externalReferences 는 규격 위반)
  wb = wb.replace(/<(?:\w+:)?externalReferences\b[^>]*>\s*<\/(?:\w+:)?externalReferences>|<(?:\w+:)?externalReferences\b[^>]*\/>/, '');
  zip.file('xl/workbook.xml', wb);
  zip.file('xl/_rels/workbook.xml.rels', rels);
  if (ct !== null) zip.file('[Content_Types].xml', ct);
  warnings.unshift(linkWarning('EXTERNAL_LINKS_REMOVED', drop.length));
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes: out, removed: drop.length, warnings };
}

const MESSAGES = {
  EXTERNAL_LINKS_REMOVED: 'removed external links with broken sheet names',
  EXTERNAL_LINKS_KEPT_REFERENCED: 'kept broken external links referenced by formulas or names',
  EXTERNAL_LINKS_CHECK_FAILED: 'could not inspect external links; output left as converted',
};

/** office 엔진 Warning 모양({code, message}) + 개수. 이름·경로·내용은 싣지 않는다 */
export function linkWarning(code, count) {
  return { code, message: `${MESSAGES[code]} (${count})`, count };
}

/** 응답 헤더용 —`EXTERNAL_LINKS_REMOVED=2,EXTERNAL_LINKS_KEPT_REFERENCED=1` */
export function warningsHeader(warnings) {
  return warnings.map((w) => `${w.code}=${w.count}`).join(',');
}
