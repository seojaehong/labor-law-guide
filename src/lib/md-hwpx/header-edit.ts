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
}

/** 문단 모양 복제: case·default 두 벌에 같은 값을 쓴다 */
export function clonePara(header: string, src: number, patch: ParaPatch): Edited {
  let x = getItem(header, PARA, src);
  for (const k of ['left', 'intent', 'right', 'prev', 'next'] as const) {
    const v = patch[k];
    if (v !== undefined) x = x.replace(new RegExp(`(<hc:${k} value=")-?\\d+"`, 'g'), `$1${v}"`);
  }
  if (patch.lineSpacing !== undefined) x = x.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+"/g, `$1${patch.lineSpacing}"`);
  if (patch.align) x = x.replace(/(<hh:align horizontal=")[A-Z]+"/, `$1${patch.align}"`);
  if (patch.keepWithNext !== undefined) x = x.replace(/(keepWithNext=")\d"/, `$1${patch.keepWithNext ? 1 : 0}"`);
  if (patch.breakNonLatinWord) x = x.replace(/(breakNonLatinWord=")[A-Z_]+"/, `$1${patch.breakNonLatinWord}"`);
  return appendItem(header, PARA, x);
}

/** 문단 모양의 case·default 여백 값(시험·검사용) */
export function paraMargins(header: string, id: number): { case: Record<string, number>; default: Record<string, number> } {
  const x = getItem(header, PARA, id);
  const pick = (part: string) => Object.fromEntries([...part.matchAll(/<hc:(\w+) value="(-?\d+)"/g)].map((m) => [m[1], Number(m[2])]));
  const cs = /<hp:case\b[\s\S]*?<\/hp:case>/.exec(x)?.[0] ?? '';
  const df = /<hp:default>[\s\S]*?<\/hp:default>/.exec(x)?.[0] ?? '';
  return { case: pick(cs), default: pick(df) };
}
