// xls → xlsx 변환 뒤 깨진 외부 연결 정리.
// LibreOffice 는 .xls 의 외부 연결을 xlsx 로 옮기며 시트 이름을 `….xls].xls]…` 처럼 망가뜨린다.
// 엑셀은 시트 이름에 [ ] : \ / ? * 를 허용하지 않아 그런 파일을 원본부터 열지 못한다.
// 깨진 연결만 지운다(workbook.xml externalReference · workbook.xml.rels 관계 · [Content_Types].xml Override · 부품과 그 rels).
// 수식·이름이 `[n]`(externalReferences 안 순서, 1부터)으로 가리키는 연결은 지우지 않고 경고만 남긴다 —
// 앞 항목을 지우면 뒤 항목 번호가 당겨지므로, 뒤에 참조되는 항목이 있어도 지우지 않는다.
// 바꿀 것이 없으면 입력 바이트를 그대로 돌려준다. 경고에는 개수만 싣는다(이름·경로·내용 없음).
import JSZip from 'jszip';

const BAD_SHEET_NAME = /[[\]:\\/?*]/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 속성 하나 — 큰따옴표·작은따옴표, = 앞뒤 공백 */
const attrPat = (name, value) => `\\b${name}\\s*=\\s*(?:"${value}"|'${value}')`;
const unescapeXml = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function partOf(target) {
  if (target.startsWith('/')) return target.slice(1);
  return `xl/${target}`.replace(/\/\.\//g, '/');
}

function relsOf(part) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

/** 수식이 들어갈 수 있는 부품 — 서식(styles 의 「쉼표 [0]」 스타일 이름)·테마·문서 속성·공유 문자열·메모는 뺀다 */
const FORMULA_PARTS = /^xl\/(?:workbook\.xml|(?:worksheets|chartsheets|macrosheets|dialogsheets|tables|charts|drawings|ctrlProps|pivotCache|pivotTables|queryTables|slicerCaches|timelineCaches)\/[^/]+\.(?:xml|vml))$/i;

/**
 * 외부 연결 번호(1부터) 중 어디선가 `[n]` 으로 가리키는 것.
 * 수식이 들어가는 자리(<f>·표 계산 열·조건부서식 cfvo val·유효성·이름·도형 textlink·vml·차트 …)가 많아
 * 요소를 고르지 않고, 수식이 들어갈 수 있는 부품 전부에서 글 칸(<t>)을 지운 뒤 엔티티를 풀어 찾는다.
 * 남기는 쪽으로 치우친다(수식 속 문자열 "[3]" 도 참조로 센다) — 지워서 번호가 당겨지면 다른 파일을 조용히 가리키게 된다.
 */
async function referencedIndexes(zip) {
  const used = new Set();
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || !FORMULA_PARTS.test(name)) continue;
    const s = unescapeXml((await zip.file(name).async('string')).replace(/<(?:\w+:)?t\b[^>]*>[\s\S]*?<\/(?:\w+:)?t>/g, ''));
    for (const r of s.matchAll(/\[(\d+)\]/g)) used.add(Number(r[1]));
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
  const refs = [...wb.matchAll(/<(?:\w+:)?externalReference\b[^>]*?\b\w+:id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/g)].map((m) => m[1] ?? m[2]);
  if (!refs.length) return same;
  let rels = await relsFile.async('string');

  // 연결마다 {rid, part, broken}
  const links = [];
  for (const rid of refs) {
    const rel = new RegExp(`<(?:\\w+:)?Relationship\\b[^>]*${attrPat('Id', esc(rid))}[^>]*>`).exec(rels)?.[0];
    const tm = rel && /\bTarget\s*=\s*(?:"([^"]+)"|'([^']+)')/.exec(rel);
    const target = tm && (tm[1] ?? tm[2]);
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
  // 참조·관계·형식 선언이 모두 없어진 것을 확인한 뒤에만 부품을 지운다 — 반쪽 상태(참조만 남음 등)를 만들지 않는다
  const refRe = (rid) => new RegExp(`<(?:\\w+:)?externalReference\\b[^>]*?\\b\\w+:id\\s*=\\s*(?:"${esc(rid)}"|'${esc(rid)}')[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?externalReference>)`, 'g');
  const relRe = (rid) => new RegExp(`<(?:\\w+:)?Relationship\\b[^>]*${attrPat('Id', esc(rid))}[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?Relationship>)`, 'g');
  const ovRe = (part) => new RegExp(`<(?:\\w+:)?Override\\b[^>]*${attrPat('PartName', `/${esc(part)}`)}[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?Override>)`, 'g');
  for (const l of drop) {
    const wbHits = (wb.match(refRe(l.rid)) ?? []).length;
    const relHits = (rels.match(relRe(l.rid)) ?? []).length;
    const ovHits = ct === null ? 0 : (ct.match(ovRe(l.part)) ?? []).length;
    // 각각 정확히 하나여야 한다(형식 선언은 Default 로 대신할 수 있어 0 도 허용)
    if (wbHits !== 1 || relHits !== 1 || ovHits > 1 || !l.part) return { bytes, removed: 0, warnings: [linkWarning('EXTERNAL_LINKS_CHECK_FAILED', drop.length), ...warnings] };
    wb = wb.replace(refRe(l.rid), '');
    rels = rels.replace(relRe(l.rid), '');
    if (ct !== null) ct = ct.replace(ovRe(l.part), '');
  }
  for (const l of drop) {
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
