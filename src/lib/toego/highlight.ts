// 퇴고 체험 — 엔진 걸림(줄·칸·길이, 칸·길이는 코드포인트)을 원문의 UTF-16 위치로 옮기고, 화면에 칠할 조각으로 나눈다.
// 판정은 하지 않는다(엔진 몫). 검사마다 줄 나누는 법이 엔진에서 다르므로 그대로 따른다:
//   · 문체(check.mjs) = 원문을 \r\n|\r|\n 으로 · 쉼표(norms.mjs) = \r\n?→\n 으로 맞춘 뒤 \n 으로(같은 결과)
//   · 띄어쓰기·문장 부호(norms.mjs) = \r\n?→\n 뒤 파이썬 splitlines(\n \v \f \x1c-\x1e \x85 U+2028 U+2029)
// 화면에는 엔진의 word(문체는 24자에서 잘리고, 문장 부호는 따옴표 안을 채운 글에서 나온다)가 아니라 원문 조각을 칠한다.

export const CHECKS = ['prose', 'spacing', 'punct', 'comma'] as const;
export type CheckKey = (typeof CHECKS)[number];
export type Grade = 'A' | 'B';

export interface EngineHit {
  line: number;
  col: number;
  len: number;
  grade: Grade;
  reason: string;
  word?: string;
  fix?: string;
  rule?: string;
  basis?: string;
}

export interface Mark {
  check: CheckKey;
  start: number;
  end: number;
  grade: Grade;
  line: number;
  col: number;
  reason: string;
  /** 원문 조각 */
  piece: string;
  fix?: string;
  rule?: string;
  basis?: string;
}

export interface Segment {
  start: number;
  text: string;
  /** 이 조각을 덮는 걸림(collectMarks 순번) */
  marks: number[];
}

const BREAK_PROSE = /\r\n|\r|\n/g;
// 파이썬 splitlines 의 줄 나눔(U+2028·U+2029 는 정규식 글자에 그대로 두면 줄 끝으로 읽혀 이스케이프로 쓴다)
const BREAK_SPLITLINES = /\r\n|\r|[\n\v\f\x1c-\x1e\x85\u2028\u2029]/g;

// 마지막으로 센 글 하나만 들고 있다 — 걸림마다 줄 머리를 다시 세지 않게
let last: { text: string; p?: number[]; s?: number[] } = { text: '' };

/** 줄 머리 위치(UTF-16) */
function lineStarts(text: string, splitlines: boolean): number[] {
  if (last.text !== text) last = { text };
  const kind = splitlines ? 's' : 'p';
  let out = last[kind];
  if (!out) {
    out = [0];
    const rx = splitlines ? BREAK_SPLITLINES : BREAK_PROSE;
    rx.lastIndex = 0;
    for (let m; (m = rx.exec(text)); ) out.push(m.index + m[0].length);
    last[kind] = out;
  }
  return out;
}

/** 줄 끝(UTF-16, 줄 나눔 글자 앞) */
function lineEnd(text: string, from: number, splitlines: boolean): number {
  const rx = splitlines ? BREAK_SPLITLINES : BREAK_PROSE;
  rx.lastIndex = from;
  const m = rx.exec(text);
  return m ? m.index : text.length;
}

/** from 에서 n 코드포인트 앞으로(limit 를 넘지 않는다) */
function forward(text: string, from: number, n: number, limit: number): number {
  let i = from;
  while (n > 0 && i < limit) {
    const c = text.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < limit && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
    n--;
  }
  return i;
}

/** 걸림 하나 → 원문 [start, end). 엔진이 원문 밖을 가리키면 줄·글 끝에서 자른다 */
export function hitRange(text: string, check: CheckKey, hit: Pick<EngineHit, 'line' | 'col' | 'len'>): { start: number; end: number } {
  const split = check === 'spacing' || check === 'punct';
  const ls = lineStarts(text, split);
  if (hit.line < 1 || hit.line > ls.length) return { start: text.length, end: text.length };
  const head = ls[hit.line - 1];
  const stop = lineEnd(text, head, split);
  const start = forward(text, head, Math.max(0, hit.col - 1), stop);
  const end = forward(text, start, Math.max(0, hit.len), stop);
  return { start, end };
}

type ResultLike = {
  ok?: boolean;
  prose?: { hits?: EngineHit[] };
  norms?: Partial<Record<Exclude<CheckKey, 'prose'>, { hits?: EngineHit[] }>>;
};

/** 응답의 걸림 전부를 원문 위치와 함께(문서 순서 · 같은 자리는 A 먼저) */
export function collectMarks(text: string, r: ResultLike): Mark[] {
  const out: Mark[] = [];
  for (const check of CHECKS) {
    const hits = check === 'prose' ? r.prose?.hits : r.norms?.[check]?.hits;
    for (const h of hits ?? []) {
      const { start, end } = hitRange(text, check, h);
      out.push({ check, start, end, grade: h.grade, line: h.line, col: h.col, reason: h.reason, piece: text.slice(start, end), fix: h.fix, rule: h.rule, basis: h.basis });
    }
  }
  return out.sort((a, b) => a.start - b.start || (a.grade === b.grade ? 0 : a.grade === 'A' ? -1 : 1) || CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check));
}

/** 원문을 칠할 조각으로 — 경계마다 끊고, 조각마다 덮는 걸림 순번. 이어 붙이면 원문 그대로 */
export function segments(text: string, marks: Pick<Mark, 'start' | 'end'>[]): Segment[] {
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    if (m.end <= m.start) continue;
    cuts.add(Math.min(m.start, text.length));
    cuts.add(Math.min(m.end, text.length));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  // 시작 위치 순으로 걸림을 훑으며 열린 것만 들고 간다(걸림 수 × 조각 수가 되지 않게)
  const order = marks.map((m, i) => i).filter((i) => marks[i].end > marks[i].start).sort((a, b) => marks[a].start - marks[b].start);
  const out: Segment[] = [];
  let open: number[] = [];
  let k = 0;
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j];
    const b = pts[j + 1];
    if (a === b) continue;
    while (k < order.length && marks[order[k]].start <= a) open.push(order[k++]);
    open = open.filter((i) => marks[i].end > a);
    out.push({ start: a, text: text.slice(a, b), marks: open.filter((i) => marks[i].start <= a && marks[i].end >= b).sort((x, y) => x - y) });
  }
  return out;
}
