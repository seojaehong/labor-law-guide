/**
 * S11·S12 — 사람이 손본 hwpx 고치기(편집기술사양 B2~B6·B9). S0b 실측: rhwp 로 다시 쓰면 header 가 바뀐다 → 이 경로가 기본.
 *
 * - header.xml 은 바이트 그대로(B2). section 의 글자만 바꾼다.
 * - S11 글자 치환: 찾는 글자는 문서 전체에서 정확히 1회, 한 run(<hp:t>) 안(B3·B4). 고친 문단의 linesegarray 만 지운다. 문단 수 동일.
 * - S12 칸 채우기: (표 번호, 행, 열) 칸의 첫 문단에 글자를 넣고, 예시 서식(파랑·기울임)을 물려받지 않게 검정·바로 선 글자 모양으로 바꾼다(B5·B6).
 *   글자 모양은 header 에 이미 있는 것 중에서 고른다 — header 를 고치지 않는다.
 * - zip: 항목을 한 번에 읽고, mimetype 첫 항목·무압축(B9).
 */
import JSZip from 'jszip';

export type TextEdit = { old: string; new: string };
export type EditPreview = { old: string; new: string; before: string; after: string; section: string };
export type CellFill = { table: number; row: number; col: number; text: string };

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const countOf = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);
const T_RE = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g;

type Pkg = { names: string[]; files: Record<string, Uint8Array> };

async function readPkg(bytes: Uint8Array): Promise<Pkg> {
  const z = await JSZip.loadAsync(bytes);
  const names = Object.keys(z.files).filter((n) => !z.files[n].dir);
  const files: Record<string, Uint8Array> = {};
  for (const n of names) files[n] = await z.files[n].async('uint8array'); // 항목마다 한 번만 읽는다(B9)
  return { names, files };
}

async function writePkg(p: Pkg): Promise<Uint8Array> {
  const z = new JSZip();
  const order = ['mimetype', ...p.names.filter((n) => n !== 'mimetype')];
  for (const n of order) {
    if (!p.files[n]) continue;
    z.file(n, p.files[n], { createFolders: false, compression: n === 'mimetype' || n.startsWith('BinData/') || n.startsWith('Preview/') ? 'STORE' : 'DEFLATE' });
  }
  return z.generateAsync({ type: 'uint8array' });
}

const sectionNames = (p: Pkg) => p.names.filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const enc = (s: string) => new TextEncoder().encode(s);

/** pos 를 담은 문단의 linesegarray 를 지운다(한글이 옛 줄 나눔으로 그리지 않게) */
function dropLineseg(xml: string, pos: number): string {
  const ls = xml.indexOf('<hp:linesegarray>', pos);
  const end = xml.indexOf('</hp:p>', pos);
  const nextP = xml.indexOf('<hp:p ', pos);
  if (ls < 0 || (end >= 0 && end < ls) || (nextP >= 0 && nextP < ls)) return xml;
  const close = xml.indexOf('</hp:linesegarray>', ls);
  return xml.slice(0, ls) + xml.slice(close + '</hp:linesegarray>'.length);
}

/** S11 — 글자 치환. 모든 치환을 먼저 판정하고 하나라도 거부되면 아무것도 바꾸지 않는다 */
export async function replaceText(bytes: Uint8Array, edits: TextEdit[]): Promise<{ bytes: Uint8Array; preview: EditPreview[] }> {
  const p = await readPkg(bytes);
  const secs = sectionNames(p);
  const xml: Record<string, string> = Object.fromEntries(secs.map((n) => [n, dec(p.files[n])]));
  const paraCount = (s: string) => (s.match(/<hp:p /g) ?? []).length;
  const before = secs.map((n) => paraCount(xml[n]));
  const preview: EditPreview[] = [];
  for (const e of edits) {
    if (!e.old) throw new Error('찾을 글자가 비었습니다');
    const old = escText(e.old);
    const inRun: { sec: string; at: number; t0: number; t1: number }[] = [];
    let plain = '';
    for (const n of secs) {
      for (const m of xml[n].matchAll(T_RE)) {
        plain += unesc(m[1]);
        let k = m[1].indexOf(old);
        while (k >= 0) {
          const t0 = m.index! + m[0].indexOf('>') + 1;
          inRun.push({ sec: n, at: t0 + k, t0, t1: t0 + m[1].length });
          k = m[1].indexOf(old, k + 1);
        }
      }
      plain += '\n';
    }
    const total = countOf(plain, e.old);
    if (total === 0) throw new Error(`찾는 글자가 없습니다: ${e.old}`);
    if (total > 1 || inRun.length > 1) throw new Error(`찾는 글자가 ${Math.max(total, inRun.length)}번 나옵니다(정확히 1번이어야 합니다): ${e.old}`);
    if (inRun.length === 0) throw new Error(`찾는 글자가 강조·글자 모양 경계(run)를 넘습니다. 경계 안으로 줄이거나 둘로 나누세요: ${e.old}`);
    const { sec, at, t0, t1 } = inRun[0];
    const s = xml[sec];
    preview.push({ old: e.old, new: e.new, before: unesc(s.slice(t0, at)).slice(-20), after: unesc(s.slice(at + old.length, t1)).slice(0, 20), section: sec });
    xml[sec] = dropLineseg(s.slice(0, at) + escText(e.new) + s.slice(at + old.length), at);
  }
  secs.forEach((n, i) => {
    if (paraCount(xml[n]) !== before[i]) throw new Error('문단 수가 바뀌었습니다 — 고치지 않습니다');
    p.files[n] = enc(xml[n]);
  });
  return { bytes: await writePkg(p), preview };
}

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

type CharInfo = { id: number; color: string; italic: boolean; bold: boolean; height: string; font: string };
function charTable(header: string): CharInfo[] {
  return [...header.matchAll(/<hh:charPr\s[^>]*?\bid="(\d+)"[\s\S]*?<\/hh:charPr>/g)].map((m) => ({
    id: Number(m[1]),
    color: /textColor="([^"]*)"/.exec(m[0])?.[1] ?? '',
    italic: m[0].includes('<hh:italic/>'),
    bold: m[0].includes('<hh:bold/>'),
    height: /\bheight="(\d+)"/.exec(m[0])?.[1] ?? '',
    font: /<hh:fontRef hangul="(\d+)"/.exec(m[0])?.[1] ?? '',
  }));
}
const isBlack = (c: CharInfo) => /^#0{6}$/i.test(c.color) && !c.italic;

/** 검정·바로 선 글자 모양 — 지금 모양이 그렇면 그대로, 아니면 크기·글꼴·굵기가 같은 것 → 크기만 같은 것 순 */
function blackFor(chars: CharInfo[], cur: number): number {
  const c = chars.find((x) => x.id === cur);
  if (!c) throw new Error(`글자 모양 ${cur} 이 header 에 없습니다`);
  if (isBlack(c)) return cur;
  const same = chars.find((x) => isBlack(x) && x.height === c.height && x.font === c.font && x.bold === c.bold) ?? chars.find((x) => isBlack(x) && x.height === c.height);
  if (!same) throw new Error(`칸 글자 모양 ${cur}(${c.color}${c.italic ? '·기울임' : ''})을 대신할 검정 글자 모양이 header 에 없습니다 — 한글에서 고쳐 주세요`);
  return same.id;
}

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
    const cur = Number(/charPrIDRef="(\d+)"/.exec(s.slice(pStart, pEnd))?.[1] ?? 0);
    const cp = blackFor(chars, cur);
    const lines = f.text.split('\n').map(escText).join('</hp:t><hp:lineBreak/><hp:t>');
    const newP = `${open}<hp:run charPrIDRef="${cp}"><hp:t>${lines}</hp:t></hp:run></hp:p>`;
    const next = s.slice(0, pStart) + newP + s.slice(pEnd);
    const [a, b] = subCount(next);
    if (a !== b || a !== subCount(s)[0]) throw new Error('칸 여닫음 수가 맞지 않습니다 — 고치지 않습니다');
    xml[sec] = next;
  }
  for (const n of secs) p.files[n] = enc(xml[n]);
  return writePkg(p);
}
