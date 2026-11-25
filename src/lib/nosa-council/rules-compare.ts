// 협의회규정 신·구조문대비표 — 현행 규정 전문과 개정 규정 전문을 받아 바뀐 곳만 「현 행 | 개 정 안」 행으로 만든다.
// 시행규칙 제3조제1항제2호(2023. 6. 8. 개정): 협의회규정을 변경해 제출할 때 신·구조문대비표를 붙인다.
// 나누기는 점검(rules-check.ts)의 splitRules·parseArticles 를 그대로 쓴다(표지·본문 조·항·호·부칙·별지).
// 표기 관례는 규정 정비 결재 묶음(rules-review/outputs.ts)과 같다: 안 바뀐 항·호는 현행 쪽 「(생략)」·개정안 쪽 「(현행과 같음)」,
//   새로 생긴 것은 현행 쪽 「<신 설>」, 없앤 것은 개정안 쪽 「<삭 제>」. 바뀐 글자는 양쪽 모두 밑줄(UL_OPEN…UL_CLOSE)로 감싼다.
// 밑줄 범위: 글자 단위로 다른 곳을 찾은 뒤 어절(띄어쓰기 단위) 경계까지 넓힌다. 띄어쓰기만 바뀐 곳은 그 공백 앞뒤 어절에 긋는다.
// 짝 맞추기: 조·항·호·부칙·별지 모두 글자가 비슷한 것끼리 순서대로 짝짓는다(번호가 밀린 호도 내용으로 맞는다 — 옛 16호 ↔ 새 17호).
// ★ 결과 글은 사용자 글을 그대로 옮긴다. 이 파일의 고정 문구에 공개 문구 금지어와 긴 줄표를 쓰지 않는다.
import { UL_CLOSE, UL_OPEN, unmarkUnderline } from '@/lib/laws/underline';
import type { FormDoc } from '@/lib/work-rules-report/render';
import { CIRCLED, normalizeLines, parseArticles, splitRules, type Article, type Item, type Para } from './rules-check';

export interface ComparisonRow {
  /** 어디 — 「표지」·「제7조」·「부칙」·「별지: 위촉장」 */
  where: string;
  /** 바뀐 종류 */
  kind: '개정' | '신설' | '삭제';
  /** 현행 칸(줄바꿈 \n, 밑줄 표시 포함) */
  old: string;
  /** 개정안 칸 */
  neu: string;
}

export interface RulesComparison {
  rows: ComparisonRow[];
  workplaceName?: string;
  parsed: { current: { articles: number; addenda: number; forms: number }; amended: { articles: number; addenda: number; forms: number } };
}

export const NEW_MARK = '<신 설>';
export const DEL_MARK = '<삭 제>';
const OMIT = '(생략)';
const SAME = '(현행과 같음)';

const sq = (s: string) => s.replace(/\s+/g, '');
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const u = (s: string) => (s ? `${UL_OPEN}${s}${UL_CLOSE}` : s);

// ── 글자 비슷한 정도 · 순서 짝 맞추기 ──

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}
/** 공백 뺀 글자 두 글자 묶음 겹침(Dice) 0~1 */
export function similarity(a: string, b: string): number {
  const x = sq(a), y = sq(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const A = bigrams(x), B = bigrams(y);
  let hit = 0;
  for (const [k, n] of A) hit += Math.min(n, B.get(k) ?? 0);
  return (2 * hit) / (x.length - 1 + y.length - 1);
}

/** 두 목록을 순서를 지키며 짝짓는다(점수 합 최대). score 가 0 이하면 짝짓지 않는다. [옛 번호|null, 새 번호|null] 순서 목록 */
export function align<T>(A: T[], B: T[], score: (a: T, b: T) => number): [number | null, number | null][] {
  const n = A.length, m = B.length;
  const S = Array.from({ length: n }, (_, i) => B.map((b) => score(A[i], b)));
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], S[i][j] > 0 ? S[i][j] + dp[i + 1][j + 1] : -1);
  }
  const out: [number | null, number | null][] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && S[i][j] > 0 && dp[i][j] === S[i][j] + dp[i + 1][j + 1]) out.push([i++, j++]);
    else if (i < n && (j >= m || dp[i][j] === dp[i + 1][j])) out.push([i++, null]);
    else out.push([null, j++]);
  }
  return out;
}

const pairScore = (a: string, b: string, floor = 0.45) => {
  if (a === b) return 3;
  const s = similarity(a, b);
  return s >= floor ? 1 + s : 0;
};

// ── 글자 대조 + 어절 밑줄 ──

/** 바뀐 글자를 어절까지 넓혀 밑줄 표시로 감싼 [현행, 개정안] */
export function markChanges(a: string, b: string): [string, string] {
  if (a === b) return [a, b];
  const n = a.length, m = b.length;
  if (!n || !m || n * m > 4_000_000) return [u(a), u(b)];
  // 뒤에서부터 LCS 길이
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  }
  const aDel = new Uint8Array(n), bDel = new Uint8Array(m), aTouch = new Uint8Array(n + 1), bTouch = new Uint8Array(m + 1);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; } else if (i < n && (j >= m || dp[(i + 1) * w + j] >= dp[i * w + j + 1])) { bTouch[j] |= isWs(a[i]) ? 2 : 1; aDel[i++] = 1; } else { aTouch[i] |= isWs(b[j]) ? 2 : 1; bDel[j++] = 1; }
  }
  return [wrapMarks(a, snap(a, aDel, aTouch)), wrapMarks(b, snap(b, bDel, bTouch))];
}

const isWs = (c: string | undefined) => c !== undefined && /\s/.test(c);

function snap(s: string, del: Uint8Array, touch: Uint8Array): Uint8Array {
  const n = s.length;
  const mark = new Uint8Array(n);
  const word = (k: number) => {
    if (k < 0 || k >= n || isWs(s[k])) return;
    let l = k, r = k;
    while (l > 0 && !isWs(s[l - 1])) l--;
    while (r < n - 1 && !isWs(s[r + 1])) r++;
    for (let x = l; x <= r; x++) mark[x] = 1;
  };
  for (let k = 0; k < n; k++) {
    if (!del[k]) continue;
    if (!isWs(s[k])) { word(k); continue; }
    let l = k, r = k;
    while (l > 0 && isWs(s[l - 1])) l--;
    while (r < n - 1 && isWs(s[r + 1])) r++;
    for (let x = l; x <= r; x++) mark[x] = 1;
    word(l - 1);
    word(r + 1);
  }
  // 맞은편에서 글자가 빠진 자리 — 붙은 어절에. 빠진 것이 공백뿐이면(겹공백을 한 칸으로 줄인 곳) 공백 너머 어절까지
  for (let k = 0; k <= n; k++) {
    if (!touch[k]) continue;
    word(k - 1);
    word(k);
    if (touch[k] === 2 && isWs(s[k - 1])) { let l = k - 1; while (l > 0 && isWs(s[l - 1])) l--; word(l - 1); }
    if (touch[k] === 2 && isWs(s[k])) { let r = k; while (r < n - 1 && isWs(s[r + 1])) r++; word(r + 1); }
  }
  // 밑줄 끝의 안 바뀐 문장부호는 뺀다(「안된다.」 → 「안된다」., 「위원)」 → 「위원」))
  for (let k = n - 1; k >= 0; k--) {
    if (mark[k] && (/[,)]/.test(s[k]) || (s[k] === '.' && k === n - 1)) && !del[k] && !touch[k + 1] && (k === n - 1 || !mark[k + 1])) mark[k] = 0;
  }
  // 밑줄 사이가 공백뿐이면 이어 긋는다
  let last = -1;
  for (let k = 0; k < n; k++) {
    if (!mark[k]) continue;
    if (last >= 0 && k - last > 1 && /^\s+$/.test(s.slice(last + 1, k))) for (let x = last + 1; x < k; x++) mark[x] = 1;
    last = k;
  }
  return mark;
}

function wrapMarks(s: string, mark: Uint8Array): string {
  let out = '', on = false;
  for (let k = 0; k < s.length; k++) {
    if (mark[k] && !on) { out += UL_OPEN; on = true; }
    if (!mark[k] && on) { out += UL_CLOSE; on = false; }
    out += s[k];
  }
  return on ? out + UL_CLOSE : out;
}

// ── 글 준비 ──

/** 줄 정리 — 마크다운 머리(#)·표 구분 줄을 지우고 표 줄은 칸을 「 | 」로 잇는다. 글자는 그대로 */
function prepare(text: string): string[] {
  return normalizeLines(text).split('\n').flatMap((l) => {
    const t = l.trim();
    if (!t.startsWith('|')) return [l];
    if (/^\|[\s|:-]+\|?$/.test(t)) return [];
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    return [cells.join(' | ')];
  });
}

const nonEmpty = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);

// ── 별지 서식 나누기 ──

interface Section { key: string; lines: string[] }
const FORM_TITLE = /^(위원등명부|위촉장|공고|추천서|예시\)?|.*입후보신청서|.*처리대장|.*근로자위원투표용지\d*)$/;
const isFormHead = (line: string) => {
  const s = sq(line).replace(/^[[［〔<(]+|[\]］〕>)]+$/g, '');
  if (/^[[［〔]별지/.test(sq(line))) return true;
  if (/^<표>$/.test(sq(line))) return false;
  return FORM_TITLE.test(s);
};
const isAnnexMark = (line: string) => /^[[［〔]?별지/.test(sq(line));

function splitForms(lines: string[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  let onlyHeads = false;
  for (const l of nonEmpty(lines)) {
    if (isFormHead(l)) {
      // 「[별지 제N호 서식]」 바로 다음의 서식 이름은 같은 서식이다
      if (cur && onlyHeads && cur.lines.every(isAnnexMark)) { cur.lines.push(l); if (!cur.key) cur.key = formKey(l); continue; }
      cur = { key: isAnnexMark(l) ? '' : formKey(l), lines: [l] };
      out.push(cur);
      onlyHeads = true;
      continue;
    }
    if (!cur) { cur = { key: '', lines: [] }; out.push(cur); }
    cur.lines.push(l);
    onlyHeads = false;
  }
  return out;
}
const formKey = (l: string) => sq(l).replace(/^[[［〔<(]+|[\]］〕>)]+$/g, '');
const sectionName = (s: Section) => (s.key ? s.lines.find((l) => !isAnnexMark(l)) ?? s.lines[0] : s.lines[0] ?? '').replace(/^[[<]\s*|\s*[\]>]$/g, '').trim();

// ── 칸 만들기 ──

interface Cells { old: string[]; neu: string[] }

const paraLine = (p: Para) => (p.no ? `${CIRCLED[p.no - 1]} ${p.text}` : p.text);
const itemLine = (i: Item) => `${i.no}. ${i.text}`;
const paraKey = (p: Para) => [p.text, ...p.items.map((i) => i.text)].join(' ');
const paraSame = (a: Para, b: Para) => paraLine(a) === paraLine(b) && a.items.length === b.items.length && a.items.every((x, k) => itemLine(x) === itemLine(b.items[k]));
const artText = (a: Article) => [a.head, ...a.paras.flatMap((p) => [paraLine(p), ...p.items.map(itemLine)])].join('\n');

/** 안 바뀐 것을 묶어 「①~③ (생략)」 */
function omitted(labels: string[]): string {
  const ls = labels.filter(Boolean);
  if (!ls.length) return '';
  if (ls.length === 1) return ls[0];
  if (ls.length === 2) return `${ls[0]}·${ls[1]}`;
  return `${ls[0]}~${ls[ls.length - 1]}`;
}

class Collector {
  old: string[] = [];
  neu: string[] = [];
  private gapO: string[] = [];
  private gapN: string[] = [];
  private gap = false;
  keep(oLabel: string, nLabel: string) { this.gap = true; this.gapO.push(oLabel); this.gapN.push(nLabel); }
  flush() {
    if (!this.gap) return;
    const o = omitted(this.gapO), n = omitted(this.gapN);
    this.old.push(o ? `${o} ${OMIT}` : OMIT);
    this.neu.push(n ? `${n} ${SAME}` : SAME);
    this.gapO = []; this.gapN = []; this.gap = false;
  }
  /** 짝지은 두 줄 — 거의 다른 글이면(비슷한 정도 0.3 미만) 줄 전체에 밑줄 */
  pair(o: string, n: string) { this.flush(); const [a, b] = similarity(o, n) < 0.3 ? [u(o), u(n)] : markChanges(o, n); this.old.push(a); this.neu.push(b); }
  added(n: string) { this.flush(); this.old.push(NEW_MARK); this.neu.push(u(n)); }
  removed(o: string) { this.flush(); this.old.push(u(o)); this.neu.push(DEL_MARK); }
  done(): Cells { this.flush(); return { old: this.old, neu: this.neu }; }
}

const label = (p: Para) => (p.no ? CIRCLED[p.no - 1] : '');

function itemsInto(c: Collector, A: Item[], B: Item[]) {
  for (const [i, j] of align(A, B, (a, b) => pairScore(a.text, b.text))) {
    const a = i === null ? null : A[i], b = j === null ? null : B[j];
    if (a && b) {
      if (itemLine(a) === itemLine(b)) c.keep(`${a.no}.`, `${b.no}.`);
      else c.pair(itemLine(a), itemLine(b));
    } else if (b) c.added(itemLine(b));
    else if (a) c.removed(itemLine(a));
  }
}

/** 조 하나 — 바뀐 것이 없으면 null */
function articleCells(a: Article, b: Article): Cells | null {
  if (artText(a) === artText(b)) return null;
  const pairs = align(a.paras, b.paras, (x, y) => pairScore(paraKey(x), paraKey(y), 0.35));
  // 항 절반 이상이 짝을 못 지으면(조를 새로 씀) 항마다 <삭 제>·<신 설>을 섞지 않고 조 통째로 대비한다
  const matched = pairs.filter(([i, j]) => i !== null && j !== null).length;
  if (a.paras.length && b.paras.length && matched * 2 < Math.max(a.paras.length, b.paras.length)) return { old: wholeArticle(a), neu: wholeArticle(b) };
  const c = new Collector();
  for (const [i, j] of pairs) {
    const p = i === null ? null : a.paras[i], q = j === null ? null : b.paras[j];
    if (p && q) {
      if (paraSame(p, q)) { c.keep(label(p), label(q)); continue; }
      if (paraLine(p) === paraLine(q)) { c.flush(); c.old.push(paraLine(p)); c.neu.push(paraLine(q)); } else c.pair(paraLine(p), paraLine(q));
      itemsInto(c, p.items, q.items);
    } else if (q) { c.added(paraLine(q)); for (const it of q.items) c.added(itemLine(it)); }
    else if (p) { c.removed(paraLine(p)); for (const it of p.items) c.removed(itemLine(it)); }
  }
  const cells = c.done();
  const [ho, hn] = markChanges(a.head, b.head);
  return { old: withHead(ho, cells.old), neu: withHead(hn, cells.neu) };
}
/** 조 머리 뒤에 첫 줄을 붙인다 — 첫 줄이 <삭 제>·<신 설> 표시면 조 전체 삭제·신설로 읽히므로 따로 둔다 */
const withHead = (head: string, lines: string[]) =>
  !lines.length ? [head] : lines[0] === NEW_MARK || lines[0] === DEL_MARK ? [head, ...lines] : [`${head} ${lines[0]}`, ...lines.slice(1)];
const wholeArticle = (a: Article) => withHead(a.head, a.paras.flatMap((p) => [paraLine(p), ...p.items.map(itemLine)])).map(u);

/** 줄 목록 대조 — collapse 면 안 바뀐 줄을 「(생략)」으로 묶고(첫 줄은 이름이라 그대로 둔다), 아니면 그대로 싣는다 */
function lineCells(A: string[], B: string[], collapse: boolean): Cells | null {
  if (A.join('\n') === B.join('\n')) return null;
  const c = new Collector();
  for (const [i, j] of align(A, B, (a, b) => pairScore(a, b))) {
    const a = i === null ? null : A[i], b = j === null ? null : B[j];
    if (a !== null && b !== null) {
      if (a !== b) c.pair(a, b);
      else if (collapse && i !== 0) c.keep('', '');
      else { c.flush(); c.old.push(a); c.neu.push(b); }
    } else if (b !== null) c.added(b);
    else if (a !== null) c.removed(a);
  }
  return c.done();
}

// ── 부칙 ──

interface Addendum { head: string; arts: Article[]; lines: string[] }
const addendumOf = (x: { head: string; lines: string[] }): Addendum => ({ head: x.head, arts: parseArticles(x.lines, ''), lines: nonEmpty(x.lines) });
const addendumText = (x: Addendum) => [x.head, ...x.lines].join('\n');

function addendumCells(a: Addendum, b: Addendum): Cells | null {
  if (addendumText(a) === addendumText(b)) return null;
  const [ho, hn] = markChanges(a.head, b.head);
  const old = [ho], neu = [hn];
  if (a.arts.length || b.arts.length) {
    for (const [i, j] of align(a.arts, b.arts, (x, y) => pairScore(artText(x), artText(y), 0.35))) {
      const p = i === null ? null : a.arts[i], q = j === null ? null : b.arts[j];
      if (p && q) {
        const cells = articleCells(p, q);
        if (cells) { old.push(...cells.old); neu.push(...cells.neu); } else { old.push(`${p.head} ${OMIT}`); neu.push(`${q.head} ${SAME}`); }
      } else if (q) { old.push(NEW_MARK); neu.push(...wholeArticle(q)); }
      else if (p) { old.push(...wholeArticle(p)); neu.push(DEL_MARK); }
    }
  } else {
    const cells = lineCells(a.lines, b.lines, false);
    if (cells) { old.push(...cells.old); neu.push(...cells.neu); }
  }
  return { old, neu };
}

// ── 전체 ──

interface Parsed { cover: string[]; arts: Article[]; addenda: Addendum[]; forms: Section[]; workplaceName?: string }

function parse(text: string): Parsed {
  const lines = prepare(text);
  const parts = splitRules(lines);
  const name = lines.map((l) => /사업장명\s*[:：]\s*(\S.*)$/.exec(l.trim())).find(Boolean);
  return {
    cover: nonEmpty(parts.cover),
    arts: parseArticles(parts.body, ''),
    addenda: parts.addenda.map(addendumOf),
    forms: splitForms(parts.tail),
    ...(name ? { workplaceName: name[1].trim() } : {}),
  };
}

const where = (a: Article) => `제${a.no}조${a.sub ? `의${a.sub}` : ''}`;

export function compareCouncilRules(current: string, amended: string): RulesComparison {
  const A = parse(current), B = parse(amended);
  const rows: ComparisonRow[] = [];
  const push = (w: string, kind: ComparisonRow['kind'], c: Cells) => rows.push({ where: w, kind, old: c.old.join('\n'), neu: c.neu.join('\n') });

  const cover = lineCells(A.cover, B.cover, false);
  if (cover) push('표지', '개정', cover);

  // 같은 번호 가점은 제목이 비슷할 때만(띄어쓰기·조사만 바뀐 제목 포함). 번호만 같고 제목이 다르면 주지 않는다 — 조를 끼워 넣어 번호가 밀린 경우를 잘못 짝짓지 않게
  const sameArticle = (x: Article, y: Article) => x.no === y.no && x.sub === y.sub && (x.title === y.title || similarity(x.title, y.title) >= 0.5);
  for (const [i, j] of align(A.arts, B.arts, (x, y) => (sameArticle(x, y) ? 3 : 0) + pairScore(artText(x), artText(y), 0.4))) {
    const a = i === null ? null : A.arts[i], b = j === null ? null : B.arts[j];
    if (a && b) { const c = articleCells(a, b); if (c) push(where(b), '개정', c); }
    else if (b) push(where(b), '신설', { old: [NEW_MARK], neu: wholeArticle(b) });
    else if (a) push(where(a), '삭제', { old: wholeArticle(a), neu: [DEL_MARK] });
  }

  for (const [i, j] of align(A.addenda, B.addenda, (x, y) => pairScore(addendumText(x), addendumText(y), 0.35))) {
    const a = i === null ? null : A.addenda[i], b = j === null ? null : B.addenda[j];
    if (a && b) { const c = addendumCells(a, b); if (c) push('부칙', '개정', c); }
    else if (b) push('부칙', '신설', { old: [NEW_MARK], neu: [b.head, ...b.lines].map(u) });
    else if (a) push('부칙', '삭제', { old: [a.head, ...a.lines].map(u), neu: [DEL_MARK] });
  }

  const formScore = (x: Section, y: Section) => (x.key && x.key === y.key ? 3 : 0) + pairScore(x.lines.join('\n'), y.lines.join('\n'), 0.5);
  for (const [i, j] of align(A.forms, B.forms, formScore)) {
    const a = i === null ? null : A.forms[i], b = j === null ? null : B.forms[j];
    if (a && b) { const c = lineCells(a.lines, b.lines, true); if (c) push(`별지: ${sectionName(b)}`, '개정', c); }
    else if (b) push(`별지: ${sectionName(b)}`, '신설', { old: [NEW_MARK], neu: b.lines.map(u) });
    else if (a) push(`별지: ${sectionName(a)}`, '삭제', { old: a.lines.map(u), neu: [DEL_MARK] });
  }

  const count = (p: Parsed) => ({ articles: p.arts.length, addenda: p.addenda.length, forms: p.forms.length });
  const workplaceName = B.workplaceName ?? A.workplaceName;
  return { rows, ...(workplaceName ? { workplaceName } : {}), parsed: { current: count(A), amended: count(B) } };
}

// ── 내보내기 ──

export interface ComparisonMeta {
  workplaceName?: string;
  /** 개정일(예: 2026. 12. 1.) — 비우면 적지 않는다 */
  amendDate?: string;
  /** 규정 이름(예: 인사규정) — 비우면 노사협의회규정 */
  ruleName?: string;
}

export const comparisonTitle = (meta: ComparisonMeta) => `${meta.workplaceName ? `${meta.workplaceName} ` : ''}${meta.ruleName?.trim() || '노사협의회규정'} 신·구조문대비표`;
const introLines = (meta: ComparisonMeta) => [meta.amendDate ? `개정일: ${meta.amendDate}` : '', '밑줄은 바뀐 곳입니다. 안 바뀐 항·호는 현행 쪽 「(생략)」, 개정안 쪽 「(현행과 같음)」으로 줄였습니다.'].filter(Boolean);

const mdCell = (s: string) => s.split('\n').map((l) => l.replace(/\|/g, '\\|').replace(//g, '<u>').replace(//g, '</u>')).join('<br>');

export function comparisonMarkdown(rows: ComparisonRow[], meta: ComparisonMeta): string {
  return [
    `# ${comparisonTitle(meta)}`, '', ...introLines(meta).map((l) => `- ${l}`), '',
    '| 현 행 | 개 정 안 |', '|---|---|',
    ...rows.map((r) => `| ${mdCell(r.old)} | ${mdCell(r.neu)} |`),
  ].join('\n');
}

/** 한글(hwpx)·PDF 서식 모델 — work-rules-report/render.ts formHwpx 로 쓴다(가로 용지 권장) */
export function comparisonFormDoc(rows: ComparisonRow[], meta: ComparisonMeta): FormDoc {
  return {
    title: comparisonTitle(meta),
    blocks: [
      { kind: 'title', text: comparisonTitle(meta) },
      { kind: 'text', text: introLines(meta).join('\n'), size: 'small' },
      { kind: 'space', pt: 4 },
      { kind: 'table', widths: [1, 1], headerRows: 1, split: true, rows: [[{ text: '현 행', head: true }, { text: '개 정 안', head: true }], ...rows.map((r) => [{ text: r.old }, { text: r.neu }])] },
    ],
  };
}

/** docx(doc-io compareDocx)·xlsx(comparison-xlsx) 표 입력 — xlsx 는 밑줄을 싣지 못해 표시를 지운다 */
export function comparisonSheet(rows: ComparisonRow[], meta: ComparisonMeta, opts: { plain?: boolean } = {}) {
  const t = (s: string) => (opts.plain ? unmarkUnderline(s) : s);
  return {
    title: comparisonTitle(meta),
    intro: introLines(meta),
    head: ['현 행', '개 정 안'],
    rows: rows.map((r) => [t(r.old), t(r.neu)]),
    foot: opts.plain ? ['이 엑셀 파일에는 밑줄이 없습니다. 바뀐 곳은 docx·hwpx 파일의 밑줄로 확인합니다.'] : [],
  };
}
