// ExcelJS 밖 보존 비교 — zip 부품·관계(rels)·extLst·x14 원문을 채우기 전후로 센다(G4 Act on 2).
// ExcelJS 는 차트·피벗·표·슬라이서·x14 교차시트 드롭다운·스파크라인 등을 읽지 못해 저장할 때 버린다.
// 그런 부분은 ExcelJS 모델로 비교하면 「같음」으로 나온다. 그래서 원문 바이트에서 직접 센다.
import { createHash } from 'node:crypto';

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
];

/** 잃으면 안 되는 관계 종류(Type 끝 이름) */
const REL_KINDS = new Set(['chart', 'chartsheet', 'pivotTable', 'pivotCacheDefinition', 'table', 'comments', 'externalLink', 'hyperlink', 'image', 'oleObject', 'control', 'package', 'slicer', 'timeline', 'threadedComment']);

export interface PackageFingerprint {
  parts: Record<string, number>;
  /** 그림 바이트 해시(이름이 바뀌어도 같은 그림이면 같다) */
  media: string[];
  rels: Record<string, number>;
  /** 시트 이름별 extLst 원문 항목 */
  sheets: Record<string, { extUris: string[]; x14DataValidations: number; x14ConditionalFormattings: number; sparklineGroups: number; legacyDrawing: number; oleObjects: number; controls: number }>;
  definedNames: string[];
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
    out.set(attr(m[0], 'name'), target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  return out;
}

export function packageFingerprint(parts: Map<string, Uint8Array>): PackageFingerprint {
  const fp: PackageFingerprint = { parts: {}, media: [], rels: {}, sheets: {}, definedNames: [] };
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
    fp.sheets[sheet] = {
      extUris: [...ext.matchAll(/<ext\b[^>]*\buri="([^"]*)"/g)].map((m) => m[1]).sort(),
      x14DataValidations: count(ext, /<x14:dataValidation\b/g),
      x14ConditionalFormattings: count(ext, /<x14:conditionalFormatting\b/g),
      sparklineGroups: count(ext, /<x14:sparklineGroup\b/g),
      legacyDrawing: count(xml, /<legacyDrawing\b/g),
      oleObjects: count(xml, /<oleObject\b/g),
      controls: count(xml, /<control\b/g),
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

export function comparePackage(before: PackageFingerprint, after: PackageFingerprint): PackageComparison {
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
    for (const k of ['x14DataValidations', 'x14ConditionalFormattings', 'sparklineGroups', 'legacyDrawing', 'oleObjects', 'controls'] as const) {
      if (a[k] < b[k]) lost.push(`${sheet} ${k} ${b[k]} → ${a[k]}`);
    }
  }
  const names = multisetLost(before.definedNames, after.definedNames);
  if (names.length) lost.push(`이름정의 ${names.join(',')}`);
  return { before, after, lost, same: lost.length === 0 };
}
