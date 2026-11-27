// PPTX 읽기 — 장별 도형 글자·표·notes. fs·네트워크 없음(바이트 입력).
// 사양 = .ralph/spec-office-v0.md §4. 장 순서는 presentation.xml 의 sldIdLst 를 따른다.
import { DEFAULT_LIMITS, readZipGuarded, type Limits } from '../limits';

export interface PptxShape {
  id: string;
  name: string;
  text?: string;
  /** 표 = 행 × 칸 글자 */
  table?: string[][];
}

export interface PptxSlide {
  no: number;
  shapes: PptxShape[];
  notes?: string;
}

export interface PptxExtractResult {
  ok: boolean;
  needsReview?: boolean;
  code?: 'UNSUPPORTED_INPUT' | 'INPUT_TOO_LARGE' | 'ZIP_TOO_LARGE';
  reason?: string;
  slides: PptxSlide[];
}

const review = (reason: string): PptxExtractResult => ({ ok: false, needsReview: true, code: 'UNSUPPORTED_INPUT', reason, slides: [] });

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** <a:p> 단락마다 한 줄, <a:br/> 은 줄바꿈 */
function paragraphsText(xml: string): string {
  const paras = xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[\s\S]*?<\/a:p>/g) ?? [];
  return paras
    .map((p) =>
      (p.match(/<a:t>[\s\S]*?<\/a:t>|<a:t\s[^>]*>[\s\S]*?<\/a:t>|<a:br\b[^>]*\/>/g) ?? [])
        .map((t) => (t.startsWith('<a:br') ? '\n' : decodeXml(t.replace(/^<a:t\b[^>]*>/, '').replace(/<\/a:t>$/, ''))))
        .join(''),
    )
    .join('\n');
}

function attr(xml: string, tag: string, name: string): string {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : '';
}

function parseShapes(xml: string): PptxShape[] {
  const out: PptxShape[] = [];
  for (const m of xml.match(/<p:(sp|graphicFrame|pic)\b[\s\S]*?<\/p:\1>/g) ?? []) {
    const shape: PptxShape = { id: attr(m, 'p:cNvPr', 'id'), name: attr(m, 'p:cNvPr', 'name') };
    if (m.startsWith('<p:graphicFrame')) {
      const tbl = m.match(/<a:tbl>[\s\S]*<\/a:tbl>/);
      if (tbl) {
        shape.table = (tbl[0].match(/<a:tr\b[\s\S]*?<\/a:tr>/g) ?? []).map((tr) =>
          (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) ?? []).map((tc) => paragraphsText(tc)),
        );
      }
    } else if (m.startsWith('<p:sp')) {
      const body = m.match(/<p:txBody>[\s\S]*<\/p:txBody>/);
      if (body) shape.text = paragraphsText(body[0]);
    }
    out.push(shape);
  }
  return out;
}

function relsMap(xml: string): Map<string, { target: string; type: string }> {
  const map = new Map<string, { target: string; type: string }>();
  for (const r of xml.match(/<Relationship\b[^>]*\/?>/g) ?? []) {
    map.set(attr(r, 'Relationship', 'Id'), { target: attr(r, 'Relationship', 'Target'), type: attr(r, 'Relationship', 'Type') });
  }
  return map;
}

/** base 폴더 기준 상대 경로 → zip 경로 */
function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const utf8 = new TextDecoder('utf-8');
async function readText(zip: Map<string, Uint8Array>, p: string): Promise<string | null> {
  const f = zip.get(p);
  return f ? utf8.decode(f) : null;
}

export async function extractPptx(bytes: Uint8Array, limits: Limits = DEFAULT_LIMITS): Promise<PptxExtractResult> {
  if (!bytes || bytes.length === 0) return review('빈 바이트');
  if (bytes.length > limits.maxInputBytes) return { ok: false, code: 'INPUT_TOO_LARGE', reason: `입력이 ${limits.maxInputBytes} 바이트를 넘습니다.`, slides: [] };
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return review('zip(pptx) 형식이 아님');
  // 선언 크기를 믿지 않고 실제로 풀며 누적 상한을 건다(G4 Act on 4)
  const z = readZipGuarded(bytes, limits);
  if (!z.ok) return z.code === 'ZIP_TOO_LARGE' ? { ok: false, code: 'ZIP_TOO_LARGE', reason: z.message, slides: [] } : review(`zip 을 열지 못함: ${z.message}`);
  const zip = z.parts;
  try {
    const pres = await readText(zip, 'ppt/presentation.xml');
    if (!pres) return review('ppt/presentation.xml 이 없음(pptx 가 아님)');
    const presRels = relsMap((await readText(zip, 'ppt/_rels/presentation.xml.rels')) ?? '');
    let slidePaths = (pres.match(/<p:sldId\b[^>]*\/?>/g) ?? [])
      .map((s) => presRels.get(attr(s, 'p:sldId', 'r:id'))?.target)
      .filter((t): t is string => !!t)
      .map((t) => resolvePath('ppt', t));
    if (!slidePaths.length) {
      slidePaths = [...zip.keys()]
        .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
    }

    const slides: PptxSlide[] = [];
    for (const [i, sp] of slidePaths.entries()) {
      const xml = await readText(zip, sp);
      if (xml === null) return review(`장 파일이 없음: ${sp}`);
      const slide: PptxSlide = { no: i + 1, shapes: parseShapes(xml) };
      const dir = sp.slice(0, sp.lastIndexOf('/'));
      const file = sp.slice(sp.lastIndexOf('/') + 1);
      const rels = relsMap((await readText(zip, `${dir}/_rels/${file}.rels`)) ?? '');
      const notesRel = [...rels.values()].find((r) => /\/notesSlide$/.test(r.type));
      if (notesRel) {
        const nx = await readText(zip, resolvePath(dir, notesRel.target));
        if (nx) {
          const bodies = (nx.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []).filter((s) => /<p:ph\b[^>]*type="body"/.test(s));
          const t = bodies.map((s) => paragraphsText((s.match(/<p:txBody>[\s\S]*<\/p:txBody>/) ?? [''])[0])).join('\n');
          if (t) slide.notes = t;
        }
      }
      slides.push(slide);
    }
    return { ok: true, slides };
  } catch (e) {
    return review(`pptx 를 읽지 못함: ${(e as Error).message}`);
  }
}
