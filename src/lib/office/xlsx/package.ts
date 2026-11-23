// ExcelJS 밖 보존 비교 — zip 부품·관계(rels)·extLst·x14 원문을 채우기 전후로 센다(G4 Act on 2).
// ExcelJS 는 차트·피벗·표·슬라이서·x14 교차시트 드롭다운·스파크라인 등을 읽지 못해 저장할 때 버린다.
// 그런 부분은 ExcelJS 모델로 비교하면 「같음」으로 나온다. 그래서 원문 바이트에서 직접 센다.
// 되살릴 수 있는 것(글상자만 든 drawing·printerSettings·인쇄 이름 원문 표기)은 restorePackage 가 결과 zip 에 되돌린다.
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

/** 잃으면 안 되는 부품 종류(경로 정규식). 서식·테마·문서 속성·calcChain 처럼 다시 쓰는 것이 정상인 부품은 넣지 않는다 */
const PART_KINDS: [string, RegExp][] = [
  ['chart', /^xl\/charts\/chart[^/]*\.xml$/],
  ['chartsheet', /^xl\/chartsheets\/[^/]+\.xml$/],
  ['pivotTable', /^xl\/pivotTables\/[^/]+\.xml$/],
  ['pivotCache', /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/],
  ['table', /^xl\/tables\/[^/]+\.xml$/],
  ['comments', /^xl\/comments[^/]*\.xml$/],
  ['threadedComment', /^xl\/threadedComments\/[^/]+\.xml$/],
  ['externalLink', /^xl\/externalLinks\/[^/]+\.xml$/],
  ['slicer', /^xl\/slicers\/[^/]+\.xml$/],
  ['timeline', /^xl\/timelines\/[^/]+\.xml$/],
  ['embedding', /^xl\/embeddings\/[^/]+$/],
  ['activeX', /^xl\/activeX\/[^/]+\.xml$/],
  ['ctrlProp', /^xl\/ctrlProps\/[^/]+\.xml$/],
  ['customXml', /^customXml\/item\d+\.xml$/],
  ['vbaProject', /^xl\/vbaProject\.bin$/],
  ['drawing', /^xl\/drawings\/drawing[^/]*\.xml$/],
  ['printerSettings', /^xl\/printerSettings\/[^/]+$/],
];

/** 잃으면 안 되는 관계 종류(Type 끝 이름) */
const REL_KINDS = new Set(['chart', 'chartsheet', 'pivotTable', 'pivotCacheDefinition', 'table', 'comments', 'externalLink', 'hyperlink', 'image', 'oleObject', 'control', 'package', 'slicer', 'timeline', 'threadedComment', 'drawing', 'printerSettings']);

/** 원문 표기를 지켜야 하는 인쇄 이름 */
const PRINT_NAMES = ['_xlnm.Print_Area', '_xlnm.Print_Titles'];

/** drawing 안 도형(글상자·선·묶음·차트 틀) — 그림(pic)은 ExcelJS 가 다시 쓰므로 세지 않는다 */
const SHAPE_RE = /<xdr:(?:sp|grpSp|cxnSp|graphicFrame)\b/g;

export interface PackageFingerprint {
  parts: Record<string, number>;
  /** 그림 바이트 해시(이름이 바뀌어도 같은 그림이면 같다) */
  media: string[];
  rels: Record<string, number>;
  /** 시트 이름별 extLst 원문 항목 */
  sheets: Record<string, { extUris: string[]; x14DataValidations: number; x14ConditionalFormattings: number; sparklineGroups: number; legacyDrawing: number; oleObjects: number; controls: number; drawingShapes: number }>;
  definedNames: string[];
  /** 인쇄 이름 원문(엔티티 푼 것) — 키 `_xlnm.Print_Area@시트이름` */
  printNames: Record<string, string>;
}

export interface PackageComparison {
  before: PackageFingerprint;
  after: PackageFingerprint;
  /** 잃은 항목 — 사람이 읽는 설명 */
  lost: string[];
  same: boolean;
}

const dec = new TextDecoder('utf-8');
const text = (parts: Map<string, Uint8Array>, name: string) => {
  const b = parts.get(name);
  return b ? dec.decode(b) : '';
};
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : '';
};

const unescapeXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');

/** 시트 이름 → 시트 XML 경로 */
function sheetPaths(parts: Map<string, Uint8Array>): Map<string, string> {
  const out = new Map<string, string>();
  const wb = text(parts, 'xl/workbook.xml');
  const rels = text(parts, 'xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) targets.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const target = targets.get(attr(m[0], 'r:id'));
    if (!target) continue;
    out.set(unescapeXml(attr(m[0], 'name')), target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  return out;
}

/** workbook.xml 의 시트 이름 순서(localSheetId 가 가리키는 번호) */
function sheetOrder(parts: Map<string, Uint8Array>): string[] {
  return [...text(parts, 'xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => unescapeXml(attr(m[0], 'name')));
}

/** 'xl/worksheets/sheet1.xml' → 'xl/worksheets/_rels/sheet1.xml.rels' */
const relsPathOf = (part: string) => {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
};

/** 부품 기준 상대 Target → zip 경로 */
function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const seg = fromPart.split('/').slice(0, -1);
  for (const s of target.split('/')) {
    if (s === '..') seg.pop();
    else if (s !== '.' && s !== '') seg.push(s);
  }
  return seg.join('/');
}

/** zip 경로 → 부품 기준 상대 Target */
function relativeTarget(fromPart: string, toPath: string): string {
  const from = fromPart.split('/').slice(0, -1);
  const to = toPath.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/');
}

interface Rel {
  id: string;
  type: string;
  kind: string;
  target: string;
  external: boolean;
}

function parseRels(xml: string): Rel[] {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const type = attr(m[0], 'Type');
    return { id: attr(m[0], 'Id'), type, kind: type.split('/').pop() ?? '', target: unescapeXml(attr(m[0], 'Target')), external: attr(m[0], 'TargetMode') === 'External' };
  });
}

/** 시트의 drawing 부품 경로(없으면 null) */
function drawingOf(parts: Map<string, Uint8Array>, sheetPath: string): string | null {
  const rel = parseRels(text(parts, relsPathOf(sheetPath))).find((r) => r.kind === 'drawing' && !r.external);
  return rel ? resolveTarget(sheetPath, rel.target) : null;
}

/** 인쇄 이름 원문 — `_xlnm.Print_Area@시트이름` → 범위 문자열(엔티티 푼 것) */
function printNamesOf(parts: Map<string, Uint8Array>): Record<string, string> {
  const order = sheetOrder(parts);
  const out: Record<string, string> = {};
  for (const m of text(parts, 'xl/workbook.xml').matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)) {
    const name = attr(m[1], 'name');
    const id = attr(m[1], 'localSheetId');
    if (!PRINT_NAMES.includes(name) || id === '' || order[Number(id)] === undefined) continue;
    out[`${name}@${order[Number(id)]}`] = unescapeXml(m[2]);
  }
  return out;
}

/**
 * 한 범위 참조의 끝 행을 늘린다 — $ 표기·시트 접두는 그대로. 'A1:F8' 과 "'표'!$A$1:$F$8" 모두 받는다.
 * at(행 번호)이 범위 안이거나 바로 아래면 끝 행에 extra 를 더한다. 한 범위가 아니면 null.
 */
export function growRange(ref: string, at: number, extra: number): string | null {
  const m = /^(.*!)?(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)$/.exec(ref);
  if (!m) return null;
  const r1 = Number(m[3]);
  const r2 = Number(m[5]);
  if (at < r1 || at > r2 + 1) return ref;
  return `${m[1] ?? ''}${m[2]}${r1}:${m[4]}${r2 + extra}`;
}

/** 채운 뒤 기대하는 인쇄 이름 — 행을 넣은 시트의 인쇄영역만 끝 행이 는다(여러 범위면 원문 그대로) */
export function expectedPrintNames(before: PackageFingerprint, inserted: { sheet: string; at: number; count: number } | null): Record<string, string> {
  const out = { ...before.printNames };
  const key = inserted && `_xlnm.Print_Area@${inserted.sheet}`;
  if (inserted && key && out[key] !== undefined) out[key] = growRange(out[key], inserted.at, inserted.count) ?? out[key];
  return out;
}

export function packageFingerprint(parts: Map<string, Uint8Array>): PackageFingerprint {
  const fp: PackageFingerprint = { parts: {}, media: [], rels: {}, sheets: {}, definedNames: [], printNames: printNamesOf(parts) };
  for (const [name, data] of parts) {
    for (const [kind, re] of PART_KINDS) if (re.test(name)) fp.parts[kind] = (fp.parts[kind] ?? 0) + 1;
    if (/^xl\/media\//.test(name)) fp.media.push(createHash('sha256').update(data).digest('hex').slice(0, 16));
    if (/\.rels$/.test(name)) {
      for (const m of dec.decode(data).matchAll(/<Relationship\b[^>]*>/g)) {
        const kind = attr(m[0], 'Type').split('/').pop() ?? '';
        if (REL_KINDS.has(kind)) fp.rels[kind] = (fp.rels[kind] ?? 0) + 1;
      }
    }
  }
  fp.media.sort();
  for (const [sheet, path] of sheetPaths(parts)) {
    const xml = text(parts, path);
    const ext = xml.match(/<extLst>[\s\S]*<\/extLst>/)?.[0] ?? '';
    const drawing = drawingOf(parts, path);
    fp.sheets[sheet] = {
      extUris: [...ext.matchAll(/<ext\b[^>]*\buri="([^"]*)"/g)].map((m) => m[1]).sort(),
      x14DataValidations: count(ext, /<x14:dataValidation\b/g),
      x14ConditionalFormattings: count(ext, /<x14:conditionalFormatting\b/g),
      sparklineGroups: count(ext, /<x14:sparklineGroup\b/g),
      legacyDrawing: count(xml, /<legacyDrawing\b/g),
      oleObjects: count(xml, /<oleObject\b/g),
      controls: count(xml, /<control\b/g),
      drawingShapes: drawing ? count(text(parts, drawing), SHAPE_RE) : 0,
    };
  }
  fp.definedNames = [...text(parts, 'xl/workbook.xml').matchAll(/<definedName\b([^>]*)>/g)]
    .map((m) => `${attr(m[1], 'name')}${attr(m[1], 'localSheetId') ? `@${attr(m[1], 'localSheetId')}` : ''}`)
    .sort();
  return fp;
}

function multisetLost(before: string[], after: string[]): string[] {
  const left = new Map<string, number>();
  for (const a of after) left.set(a, (left.get(a) ?? 0) + 1);
  const lost: string[] = [];
  for (const b of before) {
    const n = left.get(b) ?? 0;
    if (n > 0) left.set(b, n - 1);
    else lost.push(b);
  }
  return lost;
}

/** expectedPrint 를 주지 않으면 인쇄 이름은 before 원문과 같아야 한다 */
export function comparePackage(before: PackageFingerprint, after: PackageFingerprint, expectedPrint: Record<string, string> = before.printNames): PackageComparison {
  const lost: string[] = [];
  for (const [k, n] of Object.entries(before.parts)) if ((after.parts[k] ?? 0) < n) lost.push(`부품 ${k} ${n} → ${after.parts[k] ?? 0}`);
  const media = multisetLost(before.media, after.media);
  if (media.length) lost.push(`그림 ${media.length}개`);
  for (const [k, n] of Object.entries(before.rels)) if ((after.rels[k] ?? 0) < n) lost.push(`관계 ${k} ${n} → ${after.rels[k] ?? 0}`);
  for (const [sheet, b] of Object.entries(before.sheets)) {
    const a = after.sheets[sheet];
    if (!a) {
      lost.push(`시트 ${sheet}`);
      continue;
    }
    const uris = multisetLost(b.extUris, a.extUris);
    if (uris.length) lost.push(`${sheet} extLst ${uris.join(',')}`);
    for (const k of ['x14DataValidations', 'x14ConditionalFormattings', 'sparklineGroups', 'legacyDrawing', 'oleObjects', 'controls', 'drawingShapes'] as const) {
      if (a[k] < b[k]) lost.push(`${sheet} ${k} ${b[k]} → ${a[k]}`);
    }
  }
  const names = multisetLost(before.definedNames, after.definedNames);
  if (names.length) lost.push(`이름정의 ${names.join(',')}`);
  for (const [k, v] of Object.entries(expectedPrint)) {
    if (after.printNames[k] !== v) lost.push(`인쇄 이름 ${k} 표기 ${v} → ${after.printNames[k] ?? '없음'}`);
  }
  return { before, after, lost, same: lost.length === 0 };
}

/** 사슬 순서상 <drawing> 앞에 와야 하는 시트 자식(CT_Worksheet) */
const BEFORE_DRAWING = ['</sheetData>', '<pageMargins', '<pageSetup', '<headerFooter', '</headerFooter>', '<rowBreaks', '</rowBreaks>', '<colBreaks', '</colBreaks>', '<customProperties', '</customProperties>', '<cellWatches', '</cellWatches>', '<ignoredErrors', '</ignoredErrors>', '<smartTags', '</smartTags>'];
/** <drawing> 뒤에 와야 하는 시트 자식 */
const AFTER_DRAWING = ['<legacyDrawing', '<drawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];

/** 시트 XML 에 <drawing r:id> 를 CT_Worksheet 순서 자리에 넣는다 */
function insertDrawingElement(xml: string, rid: string): string {
  const start = Math.max(...BEFORE_DRAWING.map((t) => xml.lastIndexOf(t)));
  const from = start < 0 ? 0 : start;
  const at = Math.min(...AFTER_DRAWING.map((t) => xml.indexOf(t, from)).filter((i) => i >= 0));
  return `${xml.slice(0, at)}<drawing r:id="${rid}"/>${xml.slice(at)}`;
}

/** 시트 루트에 xmlns:r 이 없으면 단다 */
function ensureRNamespace(xml: string): string {
  return xml.replace(/<worksheet\b[^>]*>/, (tag) => (/\bxmlns:r=/.test(tag) ? tag : tag.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')));
}

/** 같은 폴더에서 안 쓰는 이름 — drawing1.xml 이 있으면 drawing2.xml … */
function freshName(taken: (p: string) => boolean, path: string): string {
  if (!taken(path)) return path;
  const m = /^(.*?)(\d*)(\.[^./]+)$/.exec(path);
  const [stem, ext] = m ? [m[1], m[3]] : [path, ''];
  for (let n = 1; ; n++) if (!taken(`${stem}${n}${ext}`)) return `${stem}${n}${ext}`;
}

/** 행을 넣었을 때 drawing 고정점(0부터 센 행)을 함께 내린다 — 병합과 같은 규칙(넣는 자리 위는 그대로) */
function shiftAnchors(xml: string, at: number, extra: number): string {
  return xml.replace(/(<xdr:(?:from|to)>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>)/g, (_m, a: string, r: string, b: string) => `${a}${Number(r) >= at - 1 ? Number(r) + extra : Number(r)}${b}`);
}

const RESTORABLE = new Set(['drawing', 'printerSettings']);

export interface RestoreResult {
  bytes: Uint8Array;
  /** 되살린 것 — 사람이 읽는 설명 */
  restored: string[];
  /** 되살리지 못한 것과 이유 */
  unrecoverable: string[];
}

/**
 * ExcelJS 가 저장하며 버린 시트 부품(글상자 drawing·printerSettings)을 원본에서 결과 zip 으로 되돌리고,
 * rels·[Content_Types].xml·시트 XML 의 <drawing r:id>/<pageSetup r:id> 를 맞춘다. 인쇄 이름은 기대 원문 표기로 되쓴다.
 * 결과 시트가 이미 제 drawing 을 가졌거나(그림), 버린 부품이 제 rels 를 가지면 되살리지 않고 unrecoverable 에 적는다.
 */
export async function restorePackage(
  orig: Map<string, Uint8Array>,
  out: Uint8Array,
  opts: { expectedPrint: Record<string, string>; inserted: { sheet: string; at: number; count: number } | null },
): Promise<RestoreResult> {
  const zip = await JSZip.loadAsync(out);
  const cur = new Map<string, Uint8Array>();
  for (const [n, f] of Object.entries(zip.files)) if (!f.dir) cur.set(n, await f.async('uint8array'));
  const enc = new TextEncoder();
  const changed = new Set<string>();
  const put = (name: string, data: string | Uint8Array) => {
    cur.set(name, typeof data === 'string' ? enc.encode(data) : data);
    changed.add(name);
  };
  const restored: string[] = [];
  const unrecoverable: string[] = [];

  // ① 인쇄 이름 원문 표기
  const order = sheetOrder(cur);
  const wbXml = text(cur, 'xl/workbook.xml');
  const wbNext = wbXml.replace(/(<definedName\b([^>]*)>)([^<]*)(<\/definedName>)/g, (all, open: string, attrs: string, body: string, close: string) => {
    const name = attr(attrs, 'name');
    const id = attr(attrs, 'localSheetId');
    const want = PRINT_NAMES.includes(name) && id !== '' ? opts.expectedPrint[`${name}@${order[Number(id)]}`] : undefined;
    if (want === undefined || unescapeXml(body) === want) return all;
    return `${open}${escapeXml(want)}${close}`;
  });
  if (wbNext !== wbXml) put('xl/workbook.xml', wbNext);

  // ② 시트 부품
  const origCT = text(orig, '[Content_Types].xml');
  const outSheets = sheetPaths(cur);
  for (const [sheet, origPath] of sheetPaths(orig)) {
    const outPath = outSheets.get(sheet);
    if (!outPath || !cur.has(outPath)) continue;
    for (const rel of parseRels(text(orig, relsPathOf(origPath)))) {
      if (!RESTORABLE.has(rel.kind) || rel.external) continue;
      const src = resolveTarget(origPath, rel.target);
      const data = orig.get(src);
      if (!data) continue;
      const outRelsPath = relsPathOf(outPath);
      const outRels = parseRels(text(cur, outRelsPath));
      if (outRels.some((r) => r.kind === rel.kind)) continue; // ExcelJS 가 같은 종류를 이미 썼다(그림 drawing 등) — 비교가 도형 수로 판정
      let sheetXml = text(cur, outPath);
      const why =
        orig.has(relsPathOf(src)) ? '부품이 제 관계(rels)를 가집니다'
        : rel.kind === 'drawing' && /<drawing\b/.test(sheetXml) ? '시트에 이미 다른 drawing 이 있습니다'
        : rel.kind === 'printerSettings' && !/<pageSetup\b/.test(sheetXml) ? '시트에 pageSetup 이 없습니다'
        : rel.kind === 'printerSettings' && /<pageSetup\b[^>]*\br:id=/.test(sheetXml) ? 'pageSetup 에 이미 r:id 가 있습니다'
        : null;
      if (why) {
        unrecoverable.push(`${sheet} ${rel.kind}(${src}) 되살리지 못함 — ${why}`);
        continue;
      }
      const dest = freshName((p) => cur.has(p), src);
      const body = rel.kind === 'drawing' && opts.inserted?.sheet === sheet ? enc.encode(shiftAnchors(dec.decode(data), opts.inserted.at, opts.inserted.count)) : data;
      put(dest, body);

      // Content_Types — 원본의 Override(부품 이름) 또는 Default(확장자)를 옮긴다
      let ct = text(cur, '[Content_Types].xml');
      const ov = [...origCT.matchAll(/<Override\b[^>]*>/g)].find((m) => attr(m[0], 'PartName') === `/${src}`);
      const ext = src.split('.').pop() ?? '';
      if (ov) {
        if (!ct.includes(`PartName="/${dest}"`)) ct = ct.replace('</Types>', `<Override PartName="/${dest}" ContentType="${attr(ov[0], 'ContentType')}"/></Types>`);
      } else {
        const df = [...origCT.matchAll(/<Default\b[^>]*>/g)].find((m) => attr(m[0], 'Extension').toLowerCase() === ext.toLowerCase());
        const has = [...ct.matchAll(/<Default\b[^>]*>/g)].some((m) => attr(m[0], 'Extension').toLowerCase() === ext.toLowerCase());
        if (df && !has) ct = ct.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${attr(df[0], 'ContentType')}"/>`);
      }
      put('[Content_Types].xml', ct);

      // 시트 rels
      const ids = new Set(outRels.map((r) => r.id));
      let n = 1;
      while (ids.has(`rId${n}`)) n++;
      const rid = `rId${n}`;
      const relTag = `<Relationship Id="${rid}" Type="${rel.type}" Target="${escapeXml(relativeTarget(outPath, dest))}"/>`;
      const relsXml = text(cur, outRelsPath);
      put(
        outRelsPath,
        relsXml
          ? relsXml.replace('</Relationships>', `${relTag}</Relationships>`)
          : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTag}</Relationships>`,
      );

      // 시트 XML 참조
      sheetXml = ensureRNamespace(sheetXml);
      sheetXml = rel.kind === 'drawing' ? insertDrawingElement(sheetXml, rid) : sheetXml.replace(/<pageSetup\b([^>]*?)(\/?)>/, (_m, a: string, slash: string) => `<pageSetup${a} r:id="${rid}"${slash}>`);
      put(outPath, sheetXml);
      restored.push(`${sheet} ${rel.kind} ${dest}`);
    }
  }

  if (!changed.size) return { bytes: out, restored, unrecoverable };
  for (const name of changed) zip.file(name, cur.get(name)!);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, restored, unrecoverable };
}
