/**
 * S1 — header 모양 복제기(편집기술사양 U3·U4·U5, 261119).
 *
 * 한글은 charPr·paraPr·borderFill 을 id 가 아니라 등장 순서로 읽는다. 그래서 새 항목은 언제나 컨테이너 끝에 붙이고
 * id = 첫 id + 현재 개수, itemCnt 를 함께 올린다. 같은 내용(id 를 뺀 XML)이 이미 있으면 그 id 를 돌려준다.
 * 문단 여백은 hp:switch 의 case(HwpUnitChar)·default 두 벌이 있다 — 어느 쪽을 한글이 읽는지 기록이 갈리므로(U2-갈림) 같은 값을 둘 다에 쓴다.
 */

type Container = { container: string; tag: string; base: number };
export const CHAR: Container = { container: 'charProperties', tag: 'charPr', base: 0 };
export const PARA: Container = { container: 'paraProperties', tag: 'paraPr', base: 0 };
export const BORDER: Container = { container: 'borderFills', tag: 'borderFill', base: 1 };

export type Edited = { header: string; id: number };

const itemRe = (tag: string) => new RegExp(`<hh:${tag}\\s[^>]*?\\bid="(\\d+)"[\\s\\S]*?</hh:${tag}>|<hh:${tag}\\s[^>]*?\\bid="(\\d+)"[^>]*/>`, 'g');
const withoutId = (xml: string, tag: string) => xml.replace(new RegExp(`(<hh:${tag}\\s[^>]*?)\\bid="\\d+"`), '$1id=""');

function block(header: string, c: Container): RegExpExecArray {
  const m = new RegExp(`(<hh:${c.container}\\b[^>]*>)([\\s\\S]*?)(</hh:${c.container}>)`).exec(header);
  if (!m) throw new Error(`header 에 ${c.container} 가 없습니다`);
  return m;
}

/** 컨테이너 안 항목 하나(id 지정) */
export function getItem(header: string, c: Container, id: number): string {
  const [, , inner] = block(header, c);
  for (const m of inner.matchAll(itemRe(c.tag))) if (Number(m[1] ?? m[2]) === id) return m[0];
  throw new Error(`${c.tag} id=${id} 이 없습니다`);
}

/** 항목을 컨테이너 끝에 붙인다. item 의 id 값은 무엇이든 새 id 로 바뀐다. 같은 내용이 있으면 그 id */
export function appendItem(header: string, c: Container, item: string): Edited {
  const m = block(header, c);
  const [whole, open, inner, close] = m;
  const items = [...inner.matchAll(itemRe(c.tag))];
  const key = withoutId(item, c.tag);
  for (const it of items) if (withoutId(it[0], c.tag) === key) return { header, id: Number(it[1] ?? it[2]) };
  const id = c.base + items.length;
  const fresh = item.replace(new RegExp(`(<hh:${c.tag}\\s[^>]*?\\bid=")\\d*"`), `$1${id}"`);
  const newOpen = open.replace(/itemCnt="\d+"/, `itemCnt="${items.length + 1}"`);
  const out = header.slice(0, m.index) + newOpen + inner + fresh + close + header.slice(m.index + whole.length);
  return { header: out, id };
}

export interface CharPatch {
  height?: number; // HWPUNIT(1pt = 100)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string; // #RRGGBB
  /** 글꼴 — fontRef 의 7개 언어 칸 전부에 같은 글꼴 번호 */
  font?: number;
}

/** 글자 모양 복제: src 를 복사해 patch 만 바꾸고 끝에 붙인다 */
export function cloneChar(header: string, src: number, patch: CharPatch): Edited {
  let x = getItem(header, CHAR, src);
  if (patch.height !== undefined) x = x.replace(/(<hh:charPr\s[^>]*?\bheight=")\d+"/, `$1${patch.height}"`);
  if (patch.color !== undefined) x = x.replace(/(<hh:charPr\s[^>]*?\btextColor=")[^"]*"/, `$1${patch.color}"`);
  if (patch.font !== undefined) x = x.replace(/<hh:fontRef\b[^>]*\/>/, `<hh:fontRef ${['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((k) => `${k}="${patch.font}"`).join(' ')}/>`);
  // 요소 순서(OWPML): … offset, italic, bold, underline …
  if (patch.italic !== undefined) {
    x = x.replace(/<hh:italic\/>/, '');
    if (patch.italic) x = x.replace(/(<hh:offset\b[^>]*\/>)/, '$1<hh:italic/>');
  }
  if (patch.bold !== undefined) {
    x = x.replace(/<hh:bold\/>/, '');
    if (patch.bold) x = x.replace(/(<hh:offset\b[^>]*\/>(?:<hh:italic\/>)?)/, '$1<hh:bold/>');
  }
  if (patch.underline !== undefined) x = x.replace(/(<hh:underline\s+type=")[A-Z_]+"/, `$1${patch.underline ? 'BOTTOM' : 'NONE'}"`);
  return appendItem(header, CHAR, x);
}

export interface ParaPatch {
  /** HWPUNIT. U2 — 환산 상수 미실측이므로 값은 한글 렌더로 확정한다 */
  left?: number;
  intent?: number;
  right?: number;
  prev?: number;
  next?: number;
  lineSpacing?: number; // %
  align?: 'JUSTIFY' | 'LEFT' | 'RIGHT' | 'CENTER' | 'DISTRIBUTE';
  keepWithNext?: boolean;
  breakNonLatinWord?: 'KEEP_WORD' | 'BREAK_WORD';
  /** true 면 left·intent·right·prev·next 를 pt 로 받아 한글이 저장하는 꼴로 쓴다 — case = pt×100, default = pt×200.
   *  근거: 한글로 저장한 법령안 hwpx 는 모든 문단에서 default 가 case 의 2배(intent −1400/−2800 = 14pt, 261119 실측).
   *  false(기본)면 받은 HWPUNIT 값을 두 벌에 그대로 쓴다. 어느 쪽이 맞는지는 한글 렌더로 확정한다(U2-갈림) */
  pt?: boolean;
}

/** 문단 모양 복제: case·default 두 벌에 같이 쓴다(pt 면 100:200 비) */
export function clonePara(header: string, src: number, patch: ParaPatch): Edited {
  let x = getItem(header, PARA, src);
  const setIn = (part: RegExp, k: string, v: number) => {
    x = x.replace(part, (seg) => seg.replace(new RegExp(`(<hc:${k} value=")-?\\d+"`), `$1${v}"`));
  };
  for (const k of ['left', 'intent', 'right', 'prev', 'next'] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (patch.pt) {
      setIn(/<hp:case\b[\s\S]*?<\/hp:case>/, k, Math.round(v * 100));
      setIn(/<hp:default>[\s\S]*?<\/hp:default>/, k, Math.round(v * 200));
    } else x = x.replace(new RegExp(`(<hc:${k} value=")-?\\d+"`, 'g'), `$1${v}"`);
  }
  if (patch.lineSpacing !== undefined) x = x.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+"/g, `$1${patch.lineSpacing}"`);
  if (patch.align) x = x.replace(/(<hh:align horizontal=")[A-Z]+"/, `$1${patch.align}"`);
  if (patch.keepWithNext !== undefined) x = x.replace(/(keepWithNext=")\d"/, `$1${patch.keepWithNext ? 1 : 0}"`);
  if (patch.breakNonLatinWord) x = x.replace(/(breakNonLatinWord=")[A-Z_]+"/, `$1${patch.breakNonLatinWord}"`);
  return appendItem(header, PARA, x);
}

/** 글꼴 추가 — 언어 7칸(fontface) 끝에 같은 이름을 붙이고 번호를 돌려준다. 이미 있으면 그 번호.
 *  fontface 는 itemCnt 가 아니라 fontCnt 를 쓴다. 번호는 언어마다 따로 세므로 7칸 개수가 같을 때만 하나의 번호로 쓸 수 있다 */
export function addFont(header: string, face: string): Edited {
  const faces = [...header.matchAll(/<hh:fontface\b[^>]*>[\s\S]*?<\/hh:fontface>/g)];
  if (!faces.length) throw new Error('header 에 fontface 가 없습니다');
  const ids = faces.map((f) => [...f[0].matchAll(/<hh:font id="(\d+)" face="([^"]*)"/g)]);
  const found = ids.map((list) => list.find((m) => m[2] === face)?.[1]);
  if (found.every((v) => v !== undefined) && new Set(found).size === 1) return { header, id: Number(found[0]) };
  const n = ids[0].length;
  if (ids.some((list) => list.length !== n)) throw new Error('언어별 글꼴 수가 달라 한 번호로 붙일 수 없습니다');
  let out = header;
  for (const f of faces.reverse()) {
    const first = /<hh:font id="\d+"[\s\S]*?<\/hh:font>/.exec(f[0])![0];
    const add = first.replace(/id="\d+"/, `id="${n}"`).replace(/face="[^"]*"/, `face="${face}"`);
    const next = f[0].replace(/fontCnt="\d+"/, `fontCnt="${n + 1}"`).replace('</hh:fontface>', `${add}</hh:fontface>`);
    out = out.slice(0, f.index) + next + out.slice(f.index! + f[0].length);
  }
  return { header: out, id: n };
}

/** 문단 모양의 case·default 여백 값(시험·검사용) */
export function paraMargins(header: string, id: number): { case: Record<string, number>; default: Record<string, number> } {
  const x = getItem(header, PARA, id);
  const pick = (part: string) => Object.fromEntries([...part.matchAll(/<hc:(\w+) value="(-?\d+)"/g)].map((m) => [m[1], Number(m[2])]));
  const cs = /<hp:case\b[\s\S]*?<\/hp:case>/.exec(x)?.[0] ?? '';
  const df = /<hp:default>[\s\S]*?<\/hp:default>/.exec(x)?.[0] ?? '';
  return { case: pick(cs), default: pick(df) };
}
