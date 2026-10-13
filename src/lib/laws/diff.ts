// 조문 개정 전·후 비교 — 줄(항·호) 단위로 먼저 맞추고, 바뀐 줄 안에서만 글자 단위로 칠한다.
// 「<개정 2026.6.9>」 같은 꼬리표는 비교에서 뺀다(안 빼면 개정된 모든 항이 바뀐 것으로 칠해진다).
// 복사·내려받기는 원문 그대로 쓰고, 이 모듈은 화면 비교에만 쓴다.

export interface Seg {
  text: string;
  hl: boolean;
}

export type RowType = 'same' | 'mod' | 'add' | 'del';

export interface Row {
  type: RowType;
  depth: number;
  before?: Seg[];
  after?: Seg[];
}

const ANNOT = /\s*<(?:개정|신설|전문개정|제목개정|타법개정|종전)[^>]*>/g;
const BRACKET = /\s*\[(?:본조신설|전문개정|종전|제목개정)[^\]]*\]/g;

export function stripAnnotations(s: string): string {
  return s.replace(ANNOT, '').replace(BRACKET, '').trimEnd();
}

interface Line {
  depth: number;
  text: string;
}

function toLines(s: string | null): Line[] {
  if (!s) return [];
  return s
    .split('\n')
    .map((raw) => {
      const indent = raw.length - raw.trimStart().length;
      return { depth: Math.floor(indent / 2), text: stripAnnotations(raw.trim()) };
    })
    .filter((l) => l.text.length > 0);
}

/** LCS 표 → 같은 원소 짝 목록 */
function lcsPairs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.hl === s.hl) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** 두 줄의 글자 비교. 공통 비율이 낮으면 null(통째로 바뀐 줄) */
function charDiff(a: string, b: string): { before: Seg[]; after: Seg[] } | null {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const pairs = lcsPairs(ac, bc, (x, y) => x === y);
  if (pairs.length / Math.max(ac.length, bc.length, 1) < 0.4) return null;
  const before: Seg[] = [];
  const after: Seg[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [ac.length, bc.length] as [number, number]]) {
    if (i < pi) before.push({ text: ac.slice(i, pi).join(''), hl: true });
    if (j < pj) after.push({ text: bc.slice(j, pj).join(''), hl: true });
    if (pi < ac.length) {
      before.push({ text: ac[pi], hl: false });
      after.push({ text: bc[pj], hl: false });
    }
    i = pi + 1;
    j = pj + 1;
  }
  return { before: merge(before), after: merge(after) };
}

export function diffArticle(before: string | null, after: string | null): Row[] {
  const a = toLines(before);
  const b = toLines(after);
  const pairs = lcsPairs(a, b, (x, y) => x.text === y.text);
  const rows: Row[] = [];
  let i = 0;
  let j = 0;

  const flush = (ie: number, je: number) => {
    const dels = a.slice(i, ie);
    const adds = b.slice(j, je);
    // 사이에 낀 삭제·추가 줄을 순서대로 짝지어 「바뀐 줄」로 본다
    const k = Math.min(dels.length, adds.length);
    for (let x = 0; x < Math.max(dels.length, adds.length); x++) {
      const d = dels[x];
      const ad = adds[x];
      if (x < k) {
        const cd = charDiff(d.text, ad.text);
        if (cd) {
          rows.push({ type: 'mod', depth: ad.depth, ...cd });
          continue;
        }
        rows.push({ type: 'del', depth: d.depth, before: [{ text: d.text, hl: true }] });
        rows.push({ type: 'add', depth: ad.depth, after: [{ text: ad.text, hl: true }] });
        continue;
      }
      if (d) rows.push({ type: 'del', depth: d.depth, before: [{ text: d.text, hl: true }] });
      if (ad) rows.push({ type: 'add', depth: ad.depth, after: [{ text: ad.text, hl: true }] });
    }
  };

  for (const [pi, pj] of pairs) {
    flush(pi, pj);
    const t = [{ text: b[pj].text, hl: false }];
    rows.push({ type: 'same', depth: b[pj].depth, before: [{ text: a[pi].text, hl: false }], after: t });
    i = pi + 1;
    j = pj + 1;
  }
  flush(a.length, b.length);
  return rows;
}
