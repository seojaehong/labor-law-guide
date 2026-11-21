/**
 * S11·S12 — 사람이 손본 hwpx 고치기(편집기술사양 B2~B6·B9). S0b 실측: rhwp 로 다시 쓰면 header 가 바뀐다 → 이 경로가 기본.
 *
 * - header.xml 은 바이트 그대로(B2). section 의 글자만 바꾼다.
 * - S11 글자 치환: 모든 치환을 **원본 기준으로** 먼저 판정한다. 찾는 글자는 문서 전체에서 정확히 1회, 한 글자 조각(<hp:t> 안 태그 사이) 안(B3·B4).
 *   글자 조각 사이(run·문단·탭·줄바꿈 경계)는 이어 세지 않는다. 고친 문단의 linesegarray 만 지운다. 문단 수 동일.
 * - S12 칸 채우기: (표 번호, 행, 열) 칸의 첫 문단에 글자를 넣고, 예시 서식(파랑·기울임·밑줄 등)을 물려받지 않게 꾸밈 없는 검정 글자 모양으로 바꾼다(B5·B6).
 *   글자 모양은 header 에 이미 있는 것 중에서 고른다 — header 를 고치지 않는다. 첫 문단에 글자 밖 내용(누름틀·그림 등)이 있으면 채우지 않는다.
 * - 미리보기(Preview/*)는 지운다 — 옛 글자가 PrvText·PrvImage 에 남아 고친 파일에 실려 나가지 않게(T4 와 같은 사고).
 * - zip: 항목을 한 번에 읽고, mimetype 첫 항목·무압축(B9).
 */
import JSZip from 'jszip';
import { stripControl } from '@/lib/contract-write/text';

export type TextEdit = { old: string; new: string };
export type EditPreview = { old: string; new: string; before: string; after: string; section: string };
/** keepChar = 칸의 글자 모양을 그대로 쓴다(법정 서식 원본처럼 예시 색·기울임이 없는 바탕일 때). 기본은 꾸밈 없는 검정으로 바꾼다 */
export type CellFill = { table: number; row: number; col: number; text: string; keepChar?: boolean };

const escText = (s: string) => stripControl(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const countOf = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);
const T_RE = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g;
const SEP = '\u0000';

type Pkg = { names: string[]; files: Record<string, Uint8Array> };

async function readPkg(bytes: Uint8Array): Promise<Pkg> {
  const z = await JSZip.loadAsync(bytes);
  const names = Object.keys(z.files).filter((n) => !z.files[n].dir);
  const files: Record<string, Uint8Array> = {};
  for (const n of names) files[n] = await z.files[n].async('uint8array'); // 항목마다 한 번만 읽는다(B9)
  return { names, files };
}

const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const enc = (s: string) => new TextEncoder().encode(s);

/** 미리보기 항목과 그 manifest 줄을 지운다(한글은 미리보기 없이도 연다 — 엔진 산출물이 그렇다) */
function dropPreview(p: Pkg) {
  p.names = p.names.filter((n) => !n.startsWith('Preview/'));
  const hpf = 'Contents/content.hpf';
  if (p.files[hpf]) p.files[hpf] = enc(dec(p.files[hpf]).replace(/<opf:item\b[^>]*href="Preview\/[^"]*"[^>]*\/>/g, ''));
}

async function writePkg(p: Pkg): Promise<Uint8Array> {
  dropPreview(p);
  const z = new JSZip();
  const order = ['mimetype', ...p.names.filter((n) => n !== 'mimetype')];
  for (const n of order) {
    if (!p.files[n]) continue;
    z.file(n, p.files[n], { createFolders: false, compression: n === 'mimetype' || n.startsWith('BinData/') ? 'STORE' : 'DEFLATE' });
  }
  return z.generateAsync({ type: 'uint8array' });
}

const sectionNames = (p: Pkg) => p.names.filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));

/** 깊이를 세며 open 태그에 짝인 close 의 끝 위치 */
function blockEnd(xml: string, start: number, tag: string): number {
  const re = new RegExp(`<hp:${tag}[\\s>]|</hp:${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error(`hp:${tag} 짝이 맞지 않습니다`);
}

/** pos 를 담은 가장 안쪽 문단의 자기 linesegarray(문단 끝 바로 앞)를 지운다 — 뒤에 표·각주가 있어도 */
function dropLineseg(xml: string, pos: number): string {
  let pStart = -1;
  let pEnd = -1;
  for (const m of xml.slice(0, pos).matchAll(/<hp:p\s/g)) {
    const end = blockEnd(xml, m.index!, 'p');
    if (end > pos) {
      pStart = m.index!;
      pEnd = end;
    }
  }
  if (pStart < 0) return xml;
  const close = pEnd - '</hp:p>'.length;
  const LS_END = '</hp:linesegarray>';
  if (xml.slice(close - LS_END.length, close) !== LS_END) return xml;
  const ls = xml.lastIndexOf('<hp:linesegarray>', close);
  return xml.slice(0, ls) + xml.slice(close);
}

type Seg = { sec: string; start: number; raw: string };
/** <hp:t> 안의 글자 조각(태그 사이) — 위치는 section 문자열 기준 */
function textSegs(sec: string, xml: string): Seg[] {
  const out: Seg[] = [];
  for (const m of xml.matchAll(T_RE)) {
    const base = m.index! + m[0].indexOf('>') + 1;
    for (const s of m[1].matchAll(/<[^>]*>|[^<]+/g)) if (!s[0].startsWith('<')) out.push({ sec, start: base + s.index!, raw: s[0] });
  }
  return out;
}

/** S11 — 글자 치환. 모든 치환을 원본에서 먼저 판정하고, 하나라도 거부되면 아무것도 바꾸지 않는다 */
export async function replaceText(bytes: Uint8Array, edits: TextEdit[]): Promise<{ bytes: Uint8Array; preview: EditPreview[] }> {
  const p = await readPkg(bytes);
  const secs = sectionNames(p);
  const xml: Record<string, string> = Object.fromEntries(secs.map((n) => [n, dec(p.files[n])]));
  const paraCount = (s: string) => (s.match(/<hp:p\s/g) ?? []).length;
  const before = secs.map((n) => paraCount(xml[n]));
  const segs = secs.flatMap((n) => textSegs(n, xml[n]));
  const plain = segs.map((s) => unesc(s.raw)).join(SEP);
  const joined = segs.map((s) => unesc(s.raw)).join('');
  type Hit = { sec: string; at: number; len: number; rep: string; e: TextEdit; seg: Seg };
  const hits: Hit[] = [];
  for (const e of edits) {
    if (!e.old) throw new Error('찾을 글자가 비었습니다');
    if (/[\r\n]/.test(e.new)) throw new Error(`바꿀 글자에 줄바꿈을 넣을 수 없습니다: ${e.old}`);
    const total = countOf(plain, e.old);
    if (total === 0) {
      if (countOf(joined, e.old) > 0) throw new Error(`찾는 글자가 강조·글자 모양 경계(run)를 넘습니다. 경계 안으로 줄이거나 둘로 나누세요: ${e.old}`);
      throw new Error(`찾는 글자가 없습니다: ${e.old}`);
    }
    if (total > 1) throw new Error(`찾는 글자가 ${total}번 나옵니다(정확히 1번이어야 합니다): ${e.old}`);
    const forms = [...new Set([escText(e.old), escText(e.old).replace(/"/g, '&quot;').replace(/'/g, '&apos;')])];
    const found: Hit[] = [];
    for (const seg of segs) {
      for (const f of forms) {
        for (let k = seg.raw.indexOf(f); k >= 0; k = seg.raw.indexOf(f, k + 1)) found.push({ sec: seg.sec, at: seg.start + k, len: f.length, rep: escText(e.new), e, seg });
      }
    }
    if (found.length !== 1) throw new Error(`찾는 글자를 원문에서 한 곳으로 정하지 못했습니다(${found.length}곳): ${e.old}`);
    hits.push(found[0]);
  }
  // 겹치는 치환은 거부 — 앞 치환 결과를 뒤 치환이 다시 바꾸는 일이 없게(원본 기준 판정)
  for (const a of hits) for (const b of hits) if (a !== b && a.sec === b.sec && a.at < b.at + b.len && b.at < a.at + a.len) throw new Error(`치환 범위가 겹칩니다: ${a.e.old} / ${b.e.old}`);
  const preview: EditPreview[] = hits.map((h) => {
    const k = h.at - h.seg.start;
    return { old: h.e.old, new: h.e.new, before: unesc(h.seg.raw.slice(0, k)).slice(-20), after: unesc(h.seg.raw.slice(k + h.len)).slice(0, 20), section: h.sec };
  });
  for (const h of [...hits].sort((a, b) => b.at - a.at)) {
    const s = xml[h.sec];
    xml[h.sec] = dropLineseg(s.slice(0, h.at) + h.rep + s.slice(h.at + h.len), h.at);
  }
  secs.forEach((n, i) => {
    if (paraCount(xml[n]) !== before[i]) throw new Error('문단 수가 바뀌었습니다 — 고치지 않습니다');
    p.files[n] = enc(xml[n]);
  });
  return { bytes: await writePkg(p), preview };
}

/** 바로 아래 자식(같은 태그 중첩 제외)의 시작 위치들 */
function children(xml: string, from: number, to: number, tag: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`<hp:${tag}[\\s>]`, 'g');
  re.lastIndex = from;
  for (let m = re.exec(xml); m && m.index < to; m = re.exec(xml)) {
    out.push(m.index);
    re.lastIndex = blockEnd(xml, m.index, tag);
  }
  return out;
}

type CharInfo = { id: number; plain: boolean; bold: boolean; height: string; font: string };
function charTable(header: string): CharInfo[] {
  return [...header.matchAll(/<hh:charPr\s[^>]*?\bid="(\d+)"[\s\S]*?<\/hh:charPr>/g)].map((m) => {
    const x = m[0];
    const color = /textColor="([^"]*)"/.exec(x)?.[1] ?? '';
    const shade = /shadeColor="([^"]*)"/.exec(x)?.[1] ?? 'none';
    // 꾸밈 없는 검정 — 기울임·밑줄·취소선·위첨자·아래첨자·음영이 없다
    const plain =
      /^#0{6}$/i.test(color) &&
      !x.includes('<hh:italic/>') &&
      !/<hh:underline\s+type="(?!NONE")/.test(x) &&
      !/<hh:strikeout\s+shape="(?!NONE")/.test(x) &&
      !/<hh:(supscript|subscript)\/>/.test(x) &&
      /^(none|#FFFFFF)$/i.test(shade);
    return { id: Number(m[1]), plain, bold: x.includes('<hh:bold/>'), height: /\bheight="(\d+)"/.exec(x)?.[1] ?? '', font: /<hh:fontRef hangul="(\d+)"/.exec(x)?.[1] ?? '' };
  });
}

/** 꾸밈 없는 검정 글자 모양 — 지금 모양이 그렇면 그대로, 아니면 크기·글꼴·굵기 → 크기·굵기 → 크기 순으로 같은 것 */
function plainFor(chars: CharInfo[], cur: number): number {
  const c = chars.find((x) => x.id === cur);
  if (!c) throw new Error(`글자 모양 ${cur} 이 header 에 없습니다`);
  if (c.plain) return cur;
  const same =
    chars.find((x) => x.plain && x.height === c.height && x.font === c.font && x.bold === c.bold) ??
    chars.find((x) => x.plain && x.height === c.height && x.bold === c.bold) ??
    chars.find((x) => x.plain && x.height === c.height);
  if (!same) throw new Error(`칸 글자 모양 ${cur} 을 대신할 꾸밈 없는 검정 글자 모양이 header 에 없습니다 — 한글에서 고쳐 주세요`);
  return same.id;
}

// 칸 첫 문단에서 지워도 되는 것: 글자 run(줄바꿈 포함)·빈 run·linesegarray. 그 밖(누름틀·그림·책갈피·탭)이 있으면 채우지 않는다
const PLAIN_RUN = /<hp:run charPrIDRef="\d+"(?:\/>|>(?:<hp:t\/>|<hp:t>(?:[^<]|<hp:lineBreak\/>)*<\/hp:t>)*<\/hp:run>)/g;
const LINESEG = /<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g;

/** S12 — 칸 채우기. 표 번호는 문서 순서(0부터, 표 안의 표 포함), 행·열은 cellAddr */
export async function fillCells(bytes: Uint8Array, fills: CellFill[]): Promise<Uint8Array> {
  const p = await readPkg(bytes);
  const chars = charTable(dec(p.files['Contents/header.xml']));
  const secs = sectionNames(p);
  const xml: Record<string, string> = Object.fromEntries(secs.map((n) => [n, dec(p.files[n])]));
  const subCount = (s: string) => [(s.match(/<hp:subList[\s>]/g) ?? []).length, (s.match(/<\/hp:subList>/g) ?? []).length];
  for (const f of fills) {
    let idx = f.table;
    let sec = '';
    let tbl = -1;
    for (const n of secs) {
      const starts = [...xml[n].matchAll(/<hp:tbl[\s>]/g)].map((m) => m.index!);
      if (idx < starts.length) {
        sec = n;
        tbl = starts[idx];
        break;
      }
      idx -= starts.length;
    }
    if (tbl < 0) throw new Error(`표 ${f.table} 이 없습니다`);
    const s = xml[sec];
    const tblEnd = blockEnd(s, tbl, 'tbl');
    let target = -1;
    for (const tr of children(s, tbl + 1, tblEnd, 'tr')) {
      for (const tc of children(s, tr, blockEnd(s, tr, 'tr'), 'tc')) {
        const tcEnd = blockEnd(s, tc, 'tc');
        const addrs = [...s.slice(tc, tcEnd).matchAll(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/g)];
        const own = addrs[addrs.length - 1];
        if (own && Number(own[1]) === f.col && Number(own[2]) === f.row) target = tc;
      }
    }
    if (target < 0) throw new Error(`표 ${f.table} 에 ${f.row}행 ${f.col}열 칸이 없습니다`);
    const pStart = s.indexOf('<hp:p ', target);
    const pEnd = blockEnd(s, pStart, 'p');
    const open = /^<hp:p [^>]*>/.exec(s.slice(pStart))![0];
    const inner = s.slice(pStart + open.length, pEnd - '</hp:p>'.length);
    if (inner.replace(PLAIN_RUN, '').replace(LINESEG, '').trim()) throw new Error(`표 ${f.table} ${f.row}행 ${f.col}열 첫 문단에 글자 밖 내용(누름틀·그림·탭 등)이 있어 채우지 않습니다 — 한글에서 넣어 주세요`);
    const cur = Number(/charPrIDRef="(\d+)"/.exec(inner)?.[1] ?? 0);
    const cp = f.keepChar ? cur : plainFor(chars, cur);
    const lines = f.text.split(/\r?\n/).map(escText).join('<hp:lineBreak/>');
    const newP = `${open}<hp:run charPrIDRef="${cp}"><hp:t>${lines}</hp:t></hp:run></hp:p>`;
    const next = s.slice(0, pStart) + newP + s.slice(pEnd);
    const [a, b] = subCount(next);
    if (a !== b || a !== subCount(s)[0]) throw new Error('칸 여닫음 수가 맞지 않습니다 — 고치지 않습니다');
    xml[sec] = next;
  }
  for (const n of secs) p.files[n] = enc(xml[n]);
  return writePkg(p);
}
