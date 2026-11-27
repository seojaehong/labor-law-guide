// 접두를 아는 원문 판독기(설계 v2.1 §2-0).
// .NET 생성기 서식은 SpreadsheetML 부품을 `<x:worksheet xmlns:x="…/main">` 처럼 접두로 쓰고 BOM 을 붙인다.
// ExcelJS 와 우리 원문 정규식은 접두 없는 이름만 알아보므로, 판독은 접두·BOM 을 걷어 낸 사본으로 한다.
// 원본 부품은 건드리지 않는다(출력 zip 은 원본 접두 그대로 — 칸 패치 조각에서 씀).

export const SPREADSHEET_MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const STRICT_NS = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const BOM = '\uFEFF';

export type PrefixResult = { ok: true; prefix: string } | { ok: false; reason: string };

/** 루트 원소의 여는 태그(선언·주석·처리지시 건너뜀). 없으면 null */
function rootTag(xml: string): { start: number; end: number; tag: string } | null {
  const re = /<(\?[\s\S]*?\?|!--[\s\S]*?--|![^>]*|[^?!][^>]*)>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const head = m[1][0];
    if (head === '?' || head === '!') continue;
    return { start: m.index, end: m.index + m[0].length, tag: m[0] };
  }
  return null;
}

/**
 * 부품 루트에서 SpreadsheetML 주 네임스페이스에 묶인 접두를 돌린다.
 * 기본 네임스페이스면 '', `xmlns:x=` 면 'x:'. 주 네임스페이스가 없으면 '' (다른 종류 부품).
 * Strict OOXML 은 거절한다.
 */
export function spreadsheetPrefix(xml: string): PrefixResult {
  const root = rootTag(xml.startsWith(BOM) ? xml.slice(1) : xml);
  if (!root) return { ok: true, prefix: '' };
  let prefix = '';
  for (const m of root.tag.matchAll(/\bxmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/g)) {
    if (m[2] === STRICT_NS) return { ok: false, reason: 'Strict OOXML 형식은 지원하지 않습니다. 엑셀에서 「Excel 통합 문서」로 다시 저장해 주세요.' };
    if (m[2] === SPREADSHEET_MAIN_NS && m[1]) prefix = `${m[1]}:`;
  }
  return { ok: true, prefix };
}

export type NormalizeResult =
  | { ok: true; parts: Map<string, Uint8Array>; changed: string[] }
  | { ok: false; reason: string };

const XML_PART = /\.(xml|rels)$/i;

/**
 * ExcelJS·원문 정규식용 2차 판독 사본. 원본 Map 은 바꾸지 않는다.
 * - 모든 XML 부품의 BOM 을 뗀다.
 * - 주 네임스페이스가 접두로 묶인 부품은 그 접두를 원소 이름에서 걷어 내고 기본 네임스페이스로 바꾼다.
 */
export function normalizeSpreadsheetParts(parts: Map<string, Uint8Array>): NormalizeResult {
  const dec = new TextDecoder('utf-8', { ignoreBOM: true });
  const enc = new TextEncoder();
  const out = new Map(parts);
  const changed: string[] = [];
  for (const [name, data] of parts) {
    if (!XML_PART.test(name)) continue;
    const orig = dec.decode(data);
    let xml = orig.startsWith(BOM) ? orig.slice(1) : orig;
    const p = spreadsheetPrefix(xml);
    if (!p.ok) return { ok: false, reason: `${name}: ${p.reason}` };
    if (p.prefix) {
      const root = rootTag(xml)!;
      if (/\bxmlns\s*=/.test(root.tag)) return { ok: false, reason: `${name}: 접두와 기본 네임스페이스를 함께 쓴 부품은 지원하지 않습니다.` };
      const px = p.prefix.slice(0, -1).replace(/[.]/g, '\\.');
      xml = xml
        .replace(new RegExp(`<(/?)${px}:`, 'g'), '<$1')
        .replace(new RegExp(`\\bxmlns:${px}\\s*=\\s*"${SPREADSHEET_MAIN_NS.replace(/[.]/g, '\\.')}"`), `xmlns="${SPREADSHEET_MAIN_NS}"`);
    }
    if (xml !== orig) {
      out.set(name, enc.encode(xml));
      changed.push(name);
    }
  }
  return { ok: true, parts: out, changed };
}
