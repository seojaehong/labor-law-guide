// 규정 정비 점검 — 규정 한 개를 「줄(문단) 목록」으로 받아 조문·항·부칙·별표 위치를 찾는다.
// 줄 번호는 hwp·hwpx 의 경우 src/lib/hwp/apply.ts toLines() 번호와 같다. 그래야 걸린 글자를 반영본에 그대로 고칠 수 있다.
// 조문 머리 정규식은 src/lib/laws/precise/articles.ts 와 같은 모양이다(그쪽은 파이썬 쌍둥이가 있어 건드리지 않는다).

export type SourceKind = 'hwp' | 'hwpx' | 'docx' | 'txt' | 'pdf';

export interface DocLine {
  text: string;
  /** 문단 안 표·그림 등 컨트롤 수. 0 이 아니면 반영본에 자동으로 고치지 않는다 */
  controls: number;
}

export interface Article {
  no: string;
  title: string;
  /** 머리 줄 */
  start: number;
  /** 마지막 줄(끝 포함) */
  end: number;
  /** 본문이 「삭제」뿐인 조문 */
  deleted: boolean;
  /** 본문에 나온 항 번호(①=1) */
  paras: number[];
  /** 항 번호를 비슷한 다른 글자(➂)로 적은 자리 */
  glyphs: { line: number; at: number; char: string; n: number }[];
}

export interface Annex {
  /** 정리한 이름 — 「별표1」·「별지1」 */
  key: string;
  label: string;
  line: number;
  deleted: boolean;
}

export interface Regulation {
  key: string;
  name: string;
  fileName: string;
  kind: SourceKind;
  lines: DocLine[];
  articles: Article[];
  /** 첫 부칙 줄. 없으면 null */
  suppStart: number | null;
  /** 첫 별표·별지 줄. 없으면 null */
  annexStart: number | null;
  annexes: Annex[];
  meta: { enacted?: string; amended?: string; dept?: string };
}

const NO = String.raw`제\s*\d+\s*조(?:\s*의\s*\d+)?`;
export const HEAD = new RegExp(String.raw`^\s*(${NO})\s*(?:\(([^)]*)\)|【([^】]*)】|(?=\s+(?!에|의|와|과|을|를|및|부터|까지|제|·|,)\S))`);
const CHAPTER = /^\s*제\s*\d+\s*(?:장|절|관)(?:\s|$)/;
export const SUPP = /^\s*(?:부\s*칙|附\s*則)(?:\s|$|[(<[【])/;
// [별표 3] 제목 · <별표 Ⅰ> · 별지 제4호서식(공통제출) · 【별표 1】
// 「(별지)제 4호 서식」처럼 괄호가 이름 바로 뒤에서 닫히는 변형도 머리로 본다
const ANNEX_HEAD = /^\s*[[<【(]?\s*(별\s*[표지])\s*[\]>】)]?\s*(?:제\s*)?([0-9]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)(?:\s*[-의]\s*[0-9]+)?\s*(?:호)?\s*(?:서식)?\s*[\]>】)]?/;
export const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
// 모양이 비슷한 다른 동그라미 숫자(딩뱃 ➀·➂, 검은 ❶) — 항 번호로 셈하되 글자를 바로잡을 곳으로 남긴다
const LOOKALIKE = ['➀➁➂➃➄➅➆➇➈➉', '❶❷❸❹❺❻❼❽❾❿', '➊➋➌➍➎➏➐➑➒➓'];

export const squashNo = (s: string) => s.replace(/\s/g, '');
/** 「제12조의2」 → [12, 2] */
export const noKey = (no: string) => (no.match(/\d+/g) ?? []).map(Number);

/** 로마 숫자 별표(<별표 Ⅳ>)는 아라비아 숫자 별표와 다른 계열로 둔다 — 옛 별표가 삭제돼 남은 규정이 있다 */
export function annexKey(kind: string, num: string): string {
  return `${squashNo(kind)}${/^\d+$/.test(num) ? Number(num) : num}`;
}

const DELETED = /^\s*(?:삭\s*제)(?:\s|$|[[<(])/;
// 별표 머리 뒤의 삭제 표시 — 「삭제[2009.5.20]」·「[2019.12.11.별지삭제]」·「… 삭제<21.12.15.>」
const ANNEX_DELETED = /^\s*삭\s*제|삭\s*제\s*(?:$|[<[(])|[[<][^\]>]*삭제[^\]>]*[\]>]/;

export function parseRegulation(base: Omit<Regulation, 'articles' | 'suppStart' | 'annexStart' | 'annexes' | 'meta'>): Regulation {
  const articles: Article[] = [];
  const annexes: Annex[] = [];
  const meta: Regulation['meta'] = {};
  let suppStart: number | null = null;
  let annexStart: number | null = null;
  let cur: Article | null = null;
  const close = () => { if (cur) articles.push(cur); cur = null; };
  base.lines.forEach((l, i) => {
    const text = l.text.replace(/\s+$/, '');
    const t = text.trim();
    if (!t) return;
    if (i < 12) {
      const m = t.match(/^(제\s*정|최근\s*개정|소관\s*부서|담당\s*부서|주관\s*부서)\s*[:：]?\s*(.+)$/);
      if (m) {
        const k = m[1].replace(/\s/g, '');
        if (k === '제정') meta.enacted = m[2].trim();
        else if (k === '최근개정') meta.amended = m[2].trim();
        else meta.dept = m[2].trim();
        return;
      }
    }
    const ax = t.match(ANNEX_HEAD);
    // 별표 머리는 줄 맨 앞에 오고, 본문 속 「별표 1에 따른다」와 달리 뒤에 조사가 바로 붙지 않는다
    if (ax && !/^\s*(?:에|의|와|과|을|를|로|에서|및|,)/.test(t.slice(ax[0].length))) {
      close();
      annexStart ??= i;
      const rest = t.slice(ax[0].length);
      annexes.push({ key: annexKey(ax[1], ax[2]), label: ax[0].replace(/[[\]<>【】()]/g, '').trim(), line: i, deleted: ANNEX_DELETED.test(rest) });
      return;
    }
    if (annexStart !== null) return; // 별표·별지 영역 — 조문을 찾지 않는다
    if (SUPP.test(t)) {
      close();
      suppStart ??= i;
      return;
    }
    if (suppStart !== null) return; // 부칙 아래 조문은 부칙의 조문이다
    if (CHAPTER.test(t)) { close(); return; }
    const m = HEAD.exec(text);
    if (m) {
      close();
      const rest = text.slice(m[0].length);
      cur = { no: squashNo(m[1]), title: (m[2] ?? m[3] ?? '').trim(), start: i, end: i, deleted: DELETED.test(rest), paras: [], glyphs: [] };
      collectParas(cur, rest, i, m[0].length);
      return;
    }
    if (cur) {
      cur.end = i;
      collectParas(cur, l.text, i, 0);
    }
  });
  close();
  return { ...base, articles, suppStart, annexStart, annexes, meta };
}

function collectParas(a: Article, text: string, line: number, offset: number) {
  const lead = text.length - text.trimStart().length;
  const c = text[lead];
  if (!c) return;
  const n = CIRCLED.indexOf(c);
  if (n >= 0) { a.paras.push(n + 1); return; }
  for (const set of LOOKALIKE) {
    const k = set.indexOf(c);
    if (k >= 0) { a.paras.push(k + 1); a.glyphs.push({ line, at: offset + lead, char: c, n: k + 1 }); return; }
  }
}

/** 그 줄이 든 조문 */
export function articleAt(reg: Regulation, line: number): Article | null {
  return reg.articles.find((a) => a.start <= line && line <= a.end) ?? null;
}

export const articleLabel = (a: Article | null) => (a ? `${a.no}${a.title ? `(${a.title})` : ''}` : '');

/** 조문 전문(머리 줄부터 끝 줄까지) */
export function articleText(reg: Regulation, a: Article): string {
  return reg.lines.slice(a.start, a.end + 1).map((l) => l.text.trim()).filter(Boolean).join('\n');
}
