// 퇴고 — 윤문 뒤 보존 대조(결정론). 윤문 전 글(before)과 윤문한 글(after)을 비교해, 윤문이 건드리면 안 되는 것이 바뀌었는지 찾는다.
//   항목 = 수치 · 인용(“ ” 「 」 『 』 ‘ ’ " ") · [관련 판결]·[관련 판례]·[관련 판정]·[관련 결정] 블록 · 노동 법령 용어
//          · 당위/추측 표현(문장 짝) · 대구 전멸, 그리고 글자 변경률(30% 이상 경고 · 50% 이상 중단)
// 발상은 im-not-ai(epoko77-ai, MIT, c07df14)의 scripts/checks.py·verify_gates.py·restore_modality.py·metrics_v2.py 에서 가져와
// 새로 썼다(THIRD_PARTY_NOTICES.md). 저쪽과 다른 곳: 수치는 추가·삭제·변경을 모두 개수까지 세고, 인용은 길이·발화 동사와 상관없이
// 전부 그대로여야 하며, [관련 …] 블록·법령 용어는 우리 것이다.
// 상태어는 셋뿐이다 — 보존됨(코드가 본 항목이 같다. 「뜻이 같다」가 아니다) · 훼손(무엇이 어떻게) · 변경률 초과(경고·중단).
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
// ★ 시간은 글 길이에 비례하게 — 같은 문장은 닻(양쪽에 한 번씩만 나오는 문장의 최장 증가 부분열)으로 먼저 맞추고, 바뀐 덩어리 안에서만
//   글자 대조(Myers, 걸음 예산)와 문장 짝 정렬(Needleman-Wunsch, 칸 상한)을 한다. 글자 대조가 예산을 넘으면 바이그램 근사로 내리고
//   changeRate.approximate 로 알린다. 변경률이 50% 이상이면 문장 짝 정렬을 하지 않는다(당위·추측은 덩어리 안 개수로만 본다).
import { rrnLines } from '../common.mjs';
import { PROSE_RRN_STOP } from './toego.mjs';

export const RATE_WARN = 0.3;
export const RATE_STOP = 0.5;
/** 항목마다 싣는 바뀐 곳 상한(넘으면 truncated·total) */
export const CHANGE_CAP = 100;
/** 대구 전멸 — 윤문 전에 이만큼 있었는데 0 이 되면 훼손(im-not-ai verify_gates.py ANNIHILATION_MIN_BEFORE) */
export const ANTITHESIS_MIN = 5;
/** 짝 문장 유사도(문자 바이그램 Dice) 하한 — 이보다 낮은 짝은 정렬이 어긋났을 수 있어 문장 짝 판정에 쓰지 않는다 */
export const MIN_PAIR_SIM = 0.35;
const GAP = -0.4;
const NW_CELLS = 40_000; // 덩어리 하나의 문장 짝 정렬 칸 상한(200 × 200)
const NW_TOTAL = 400_000; // 한 번 대조의 정렬 칸 합 상한
const LCS_BUDGET = 60_000_000; // 글자 대조 걸음 합 상한
const LCS_HUNK = 20_000_000; // 덩어리 하나의 글자 대조 걸음 상한
const SNIP = 18;
const SHOW_MAX = 80;
const RRN_LINES_MAX = 50;

const KEPT = '보존됨';
const DAMAGED = '훼손';
const OVER = '변경률 초과';
const LABELS = { numbers: '수치', quotes: '인용', blocks: '판례 블록', terms: '법령 용어', modality: '당위·추측 표현', antithesis: '대구' };

/** 변경률 → null(30% 미만) · '경고'(30% 이상) · '중단'(50% 이상) */
export function rateLevel(rate) {
  return rate >= RATE_STOP ? '중단' : rate >= RATE_WARN ? '경고' : null;
}

// ── 글자 도구
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const cpLen = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    n++;
  }
  return n;
};
function clip(s, max = SHOW_MAX) {
  const c = Array.from(s.length > max * 2 + 2 ? s.slice(0, max * 2 + 2) : s);
  return c.length > max ? `${c.slice(0, max).join('')}…` : c.join('');
}
/** raw 의 [start, start+len) 둘레 짧은 글(앞뒤 SNIP 글자, 줄인 쪽은 …) */
function around(raw, start, len) {
  const pre = Array.from(raw.slice(Math.max(0, start - 2 * SNIP), start)).slice(-SNIP).join('');
  const post = Array.from(raw.slice(start + len, start + len + 2 * SNIP)).slice(0, SNIP).join('');
  const head = start - pre.length > 0 ? '…' : '';
  const tail = start + len + post.length < raw.length ? '…' : '';
  return `${head}${pre}${clip(raw.slice(start, start + len))}${post}${tail}`.replace(/\s+/g, ' ').trim();
}
const countRx = (rx, s) => {
  rx.lastIndex = 0;
  let n = 0;
  for (let m; (m = rx.exec(s)) !== null; ) {
    n++;
    if (!m[0]) rx.lastIndex++;
  }
  rx.lastIndex = 0;
  return n;
};

// ── 글 나누기 — 줄, [관련 …] 블록, 문장(단위)
// 블록 범위는 lib/cite-check.mjs parseCitationBlocks 와 같다: 머리줄 + 이어지는 > 줄(빈 줄은 건너뜀), > 줄이 없으면 풍산식(빈 줄·○·#·[관련·|·- 앞까지 원문 줄)
const BLOCK_HEAD = /^\s*(?:>\s*)?(?:\*\*)?\[관련 (?:판결|판례|판정|결정)\]/;
const BODY_STOP = /^\s*(?:○|#|\[관련|\||-\s)/;
const isQuoteLine = (s) => s.trimStart().startsWith('>');
/** 블록 글 — 줄머리 > 와 굵게 표시(**)는 글자가 아니다 */
const blockText = (s) => s.replace(/^\s*(?:>\s*)+/, '').replace(/\*\*/g, '');
// 문장 끝 — 마침표·물음표·느낌표 뒤 공백. 앞 글자가 숫자면 날짜·번호(2026. 3. 2. · 1. 사실관계)라 자르지 않는다
const SENT_END = /[.!?。]+\s+/g;
const DIGIT = /\d/;

function parse(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const inBlock = new Uint8Array(lines.length);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (inBlock[i] || !BLOCK_HEAD.test(lines[i])) continue;
    const idx = [i];
    for (let k = i + 1; k < lines.length && (!lines[k].trim() || isQuoteLine(lines[k])) && !BLOCK_HEAD.test(lines[k]); k++) if (lines[k].trim()) idx.push(k);
    if (idx.length === 1) for (let j = i + 1; j < lines.length && lines[j].trim() && !BODY_STOP.test(lines[j]); j++) idx.push(j);
    for (const j of idx) inBlock[j] = 1;
    // 줄마다 다듬어 이으면 전체를 다듬은 것과 같다 — 줄이 key 의 어디서 시작하는지 적어 두고 처음 달라진 줄을 찾는다
    const parts = [];
    let at = 0;
    for (const j of idx) {
      const t = norm(blockText(lines[j]));
      if (!t) continue;
      parts.push({ line: j + 1, at, t });
      at += t.length + 1;
    }
    blocks.push({ line: i + 1, head: parts[0]?.t ?? '', key: parts.map((p) => p.t).join(' '), parts });
  }
  const units = [];
  const lineUnits = lines.map(() => []);
  const add = (i, raw, start, block) => {
    const key = norm(raw);
    if (!key) return;
    lineUnits[i].push(units.length);
    units.push({ key, n: cpLen(key), line: i + 1, raw, start, block });
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (inBlock[i]) {
      add(i, ln, 0, true);
      continue;
    }
    let from = 0;
    for (const m of ln.matchAll(SENT_END)) {
      if (m.index === 0 || DIGIT.test(ln[m.index - 1])) continue;
      const end = m.index + m[0].length;
      add(i, ln.slice(from, end), from, false);
      from = end;
    }
    if (from < ln.length) add(i, ln.slice(from), from, false);
  }
  return { lines, inBlock, blocks, units, lineUnits };
}

// ── 같은 문장 맞추기(닻) — 앞뒤 공통부를 떼고, 양쪽에 한 번씩만 나오는 문장의 최장 증가 부분열을 닻으로 삼아 사이를 다시 본다
function lisByJ(c) {
  const tails = [];
  const tailAt = [];
  const prev = new Int32Array(c.length);
  for (let k = 0; k < c.length; k++) {
    const j = c[k][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < j) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = j;
    tailAt[lo] = k;
    prev[k] = lo ? tailAt[lo - 1] : -1;
  }
  const out = [];
  for (let k = tails.length ? tailAt[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(c[k]);
  return out.reverse();
}

function anchorPairs(A, B) {
  const pairs = [];
  const stack = [[0, A.length, 0, B.length]];
  while (stack.length) {
    let [a0, a1, b0, b1] = stack.pop();
    while (a0 < a1 && b0 < b1 && A[a0] === B[b0]) pairs.push([a0++, b0++]);
    while (a1 > a0 && b1 > b0 && A[a1 - 1] === B[b1 - 1]) pairs.push([--a1, --b1]);
    if (a0 >= a1 || b0 >= b1) continue;
    const ca = new Map();
    for (let i = a0; i < a1; i++) ca.set(A[i], (ca.get(A[i]) ?? 0) + 1);
    const cb = new Map();
    for (let j = b0; j < b1; j++) {
      const e = cb.get(B[j]);
      if (e) e.n++;
      else cb.set(B[j], { n: 1, at: j });
    }
    const cand = [];
    for (let i = a0; i < a1; i++) {
      if (ca.get(A[i]) !== 1) continue;
      const e = cb.get(A[i]);
      if (e && e.n === 1) cand.push([i, e.at]);
    }
    const lis = lisByJ(cand);
    let pa = a0;
    let pb = b0;
    for (const [i, j] of lis) {
      pairs.push([i, j]);
      if (pa < i && pb < j) stack.push([pa, i, pb, j]);
      pa = i + 1;
      pb = j + 1;
    }
    if (lis.length && pa < a1 && pb < b1) stack.push([pa, a1, pb, b1]);
  }
  return pairs.sort((x, y) => x[0] - y[0]);
}

/** 닻 사이 = 바뀐 덩어리 { b0, b1, a0, a1 } */
function hunksOf(pairs, n, m) {
  const hunks = [];
  let pa = 0;
  let pb = 0;
  for (const [i, j] of [...pairs, [n, m]]) {
    if (i > pa || j > pb) hunks.push({ b0: pa, b1: i, a0: pb, a1: j });
    pa = i + 1;
    pb = j + 1;
  }
  return hunks;
}

// ── 글자 변경률 — 1 − 2 × 일치 글자 / 양쪽 글자 합(공백 덩어리는 한 칸). 닻 문장은 통째로 일치, 덩어리 안은 최장 공통 부분열
const codes = (units, lo, hi) => {
  const out = [];
  for (let i = lo; i < hi; i++) for (const ch of units[i].key) out.push(ch.codePointAt(0));
  return Int32Array.from(out);
};

/** 최장 공통 부분열 길이(Myers). 걸음이 budget 을 넘으면 null */
function lcsLen(a, b, budget) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const common = s + (a.length - ea);
  const n = ea - s;
  const m = eb - s;
  if (!n || !m) return { len: common, cost: a.length + b.length };
  const max = n + m;
  const maxD = Math.min(max, Math.floor(budget / max));
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= maxD; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[s + x] === b[s + y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return { len: common + (n + m - d) / 2, cost: max * (d + 1) };
    }
  }
  return null;
}

/** 걸음 예산을 넘은 덩어리 — 문자 바이그램 Dice 로 일치 글자 수를 어림한다 */
function approxMatch(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (x) => {
    const m = new Map();
    for (let i = 0; i + 1 < x.length; i++) {
      const k = x[i] * 0x110000 + x[i + 1];
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [k, v] of ga) {
    const w = gb.get(k);
    if (w) inter += Math.min(v, w);
  }
  const dice = (2 * inter) / (a.length - 1 + b.length - 1);
  return (dice * (a.length + b.length)) / 2;
}

function changeRate(bu, au, pairs, hunks) {
  let total = 0;
  for (const u of bu) total += u.n;
  for (const u of au) total += u.n;
  let matched = 0;
  for (const [i] of pairs) matched += bu[i].n;
  let budget = LCS_BUDGET;
  let approximate = false;
  for (const h of hunks) {
    if (h.b0 === h.b1 || h.a0 === h.a1) continue;
    const a = codes(bu, h.b0, h.b1);
    const b = codes(au, h.a0, h.a1);
    const r = budget > 0 ? lcsLen(a, b, Math.min(budget, LCS_HUNK)) : null;
    if (r) {
      matched += r.len;
      budget -= r.cost;
    } else {
      matched += approxMatch(a, b);
      approximate = true;
    }
  }
  return { rate: total ? Math.min(1, Math.max(0, 1 - (2 * matched) / total)) : 0, approximate };
}

// ── 문장 짝 정렬(Needleman-Wunsch) — 유사도 = 문자 바이그램 Dice(조사·어미 변화에 둔감), 간격 −0.4
const LETTER = /[\p{L}\p{N}]/u;
function bigramsOf(u) {
  if (u.grams) return u.grams;
  const c = Array.from(u.key).filter((ch) => LETTER.test(ch));
  const m = new Map();
  for (let i = 0; i + 1 < c.length; i++) {
    const k = c[i] + c[i + 1];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  u.grams = { m, n: Math.max(0, c.length - 1) };
  return u.grams;
}
function sim(x, y) {
  const A = bigramsOf(x);
  const B = bigramsOf(y);
  if (!A.n || !B.n) return 0;
  const [small, big] = A.m.size <= B.m.size ? [A.m, B.m] : [B.m, A.m];
  let inter = 0;
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w) inter += Math.min(v, w);
  }
  return (2 * inter) / (A.n + B.n);
}

/** bIdx·aIdx(단위 번호 목록) 정렬 → [[b, a, sim]] (짝 없는 쪽은 -1) */
function align(bu, au, bIdx, aIdx) {
  const n = bIdx.length;
  const m = aIdx.length;
  const W = m + 1;
  const S = new Float64Array((n + 1) * W);
  const R = new Float64Array(n * m);
  for (let i = 1; i <= n; i++) S[i * W] = i * GAP;
  for (let j = 1; j <= m; j++) S[j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const r = sim(bu[bIdx[i - 1]], au[aIdx[j - 1]]);
      R[(i - 1) * m + j - 1] = r;
      S[i * W + j] = Math.max(S[(i - 1) * W + j - 1] + r, S[(i - 1) * W + j] + GAP, S[i * W + j - 1] + GAP);
    }
  }
  const out = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(S[i * W + j] - (S[(i - 1) * W + j - 1] + R[(i - 1) * m + j - 1])) < 1e-9) {
      out.push([bIdx[i - 1], aIdx[j - 1], R[(i - 1) * m + j - 1]]);
      i--;
      j--;
    } else if (i > 0 && Math.abs(S[i * W + j] - (S[(i - 1) * W + j] + GAP)) < 1e-9) {
      out.push([bIdx[i - 1], -1, 0]);
      i--;
    } else {
      out.push([-1, aIdx[j - 1], 0]);
      j--;
    }
  }
  return out.reverse();
}

// ── 낱말 단위 항목(수치·인용·용어)의 바뀐 곳 — 양쪽 개수(값별)를 견주고, 차이가 난 값만 바뀐 덩어리에서 자리를 찾는다.
// 같은 덩어리의 빠짐·더해짐은 앞에서부터 짝지어 바뀜으로 낸다. occ = { key, u(단위 번호), raw, start, len }
function diffTokens(bOcc, aOcc, hb, ha) {
  const group = (occ) => {
    const m = new Map();
    for (const o of occ) {
      const l = m.get(o.key);
      if (l) l.push(o);
      else m.set(o.key, [o]);
    }
    return m;
  };
  const gb = group(bOcc);
  const ga = group(aOcc);
  const removed = [];
  const added = [];
  const pick = (list, other, hunkOf, otherHunk, need, out) => {
    const here = new Map();
    for (const o of list) if (hunkOf[o.u] >= 0) here.set(hunkOf[o.u], (here.get(hunkOf[o.u]) ?? 0) + 1);
    for (const o of other) if (otherHunk[o.u] >= 0 && here.has(otherHunk[o.u])) here.set(otherHunk[o.u], here.get(otherHunk[o.u]) - 1);
    const taken = new Set();
    let left = need;
    const take = (ok) => {
      for (const o of list) {
        if (!left) return;
        if (taken.has(o) || !ok(o)) continue;
        taken.add(o);
        left--;
      }
    };
    take((o) => {
      const h = hunkOf[o.u];
      if (h < 0 || !(here.get(h) > 0)) return false;
      here.set(h, here.get(h) - 1);
      return true;
    });
    take((o) => hunkOf[o.u] >= 0);
    take(() => true);
    for (const o of taken) out.push(o);
  };
  for (const k of new Set([...gb.keys(), ...ga.keys()])) {
    const lb = gb.get(k) ?? [];
    const la = ga.get(k) ?? [];
    if (lb.length > la.length) pick(lb, la, hb, ha, lb.length - la.length, removed);
    else if (la.length > lb.length) pick(la, lb, ha, hb, la.length - lb.length, added);
  }
  const byPos = (x, y) => x.u - y.u || x.start - y.start;
  removed.sort(byPos);
  added.sort(byPos);
  const addByHunk = new Map();
  for (const o of added) {
    const h = ha[o.u];
    if (h < 0) continue;
    if (!addByHunk.has(h)) addByHunk.set(h, { list: [], at: 0 });
    addByHunk.get(h).list.push(o);
  }
  const used = new Set();
  const out = [];
  for (const o of removed) {
    const q = hb[o.u] >= 0 ? addByHunk.get(hb[o.u]) : null;
    const x = q && q.at < q.list.length ? q.list[q.at++] : null;
    if (x) {
      used.add(x);
      out.push({ kind: 'changed', b: o, a: x });
    } else out.push({ kind: 'removed', b: o });
  }
  for (const o of added) if (!used.has(o)) out.push({ kind: 'added', a: o });
  return out;
}

const hunkIndex = (hunks, n, side) => {
  const h = new Int32Array(n).fill(-1);
  hunks.forEach((x, k) => {
    for (let i = side === 'b' ? x.b0 : x.a0; i < (side === 'b' ? x.b1 : x.a1); i++) h[i] = k;
  });
  return h;
};

/** 항목 결과 — changes 는 앞에서 CHANGE_CAP 건만 글로 만든다 */
function itemOf(name, changes, count, show) {
  const r = { label: LABELS[name], status: changes.length ? DAMAGED : KEPT, count, changes: changes.slice(0, CHANGE_CAP).map(show) };
  if (changes.length > CHANGE_CAP) Object.assign(r, { truncated: true, total: changes.length });
  return r;
}

const tokenShow = (B, A, extra) => (c) => {
  const e = { kind: c.kind, line: { before: c.b ? B.units[c.b.u].line : null, after: c.a ? A.units[c.a.u].line : null } };
  if (c.b) e.before = c.b.quote ? clip(c.b.raw.slice(c.b.start, c.b.start + c.b.len)) : around(c.b.raw, c.b.start, c.b.len);
  if (c.a) e.after = c.a.quote ? clip(c.a.raw.slice(c.a.start, c.a.start + c.a.len)) : around(c.a.raw, c.a.start, c.a.len);
  return Object.assign(e, extra(c));
};

// ── 수치 — 아라비아 숫자 덩어리. 천 단위 쉼표(1,000)는 떼고, 점이 둘 이상이면 날짜(2026.3.2)로 보아 나누고, 앞자리 0 은 뗀다.
// 만·억 같은 단위 환산은 하지 않는다(1만 ≠ 10,000 — 표기 변경도 바뀜으로 잡힌다)
const NUM = /\d+(?:[.,]\d+)*/g;
const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const unzero = (s) => s.replace(/^0+(?=\d)/, '');
function numbersOf(units) {
  const out = [];
  units.forEach((u, k) => {
    if (u.block) return;
    for (const m of u.raw.matchAll(NUM)) {
      const t = m[0];
      const parts = THOUSANDS.test(t) ? [t.replace(/,/g, '')] : t.split(',').flatMap((p) => ((p.match(/\./g) ?? []).length >= 2 ? p.split('.') : [p]));
      for (const p of parts) if (p) out.push({ key: unzero(p), u: k, raw: u.raw, start: m.index, len: t.length });
    }
  });
  return out;
}

// ── 인용 — 같은 줄 안의 여는 부호 ~ 가장 가까운 닫는 부호. 닫는 부호의 마지막 자리를 먼저 구해 한 번만 훑는다(닫히지 않는 부호가 많아도 선형)
const QUOTE_PAIRS = new Map([['“', '”'], ['「', '」'], ['『', '』'], ['‘', '’']]);
function quotesOf(P) {
  const out = [];
  P.lines.forEach((ln, i) => {
    if (P.inBlock[i] || !P.lineUnits[i].length) return;
    const last = new Map([...QUOTE_PAIRS].map(([o, c]) => [o, ln.lastIndexOf(c)]));
    const found = [];
    for (let k = 0; k < ln.length; k++) {
      const c = QUOTE_PAIRS.get(ln[k]);
      if (!c || !(last.get(ln[k]) > k)) continue;
      const j = ln.indexOf(c, k + 1);
      found.push([k, j + 1]);
      k = j;
    }
    // 곧은 큰따옴표 " " — 줄 안에서 짝이 맞을 때만(차례로 둘씩)
    const straight = [];
    for (let k = ln.indexOf('"'); k >= 0; k = ln.indexOf('"', k + 1)) straight.push(k);
    if (straight.length >= 2 && straight.length % 2 === 0) for (let k = 0; k < straight.length; k += 2) found.push([straight[k], straight[k + 1] + 1]);
    for (const [s, e] of found) {
      const key = norm(ln.slice(s + 1, e - 1));
      if (!key) continue;
      const us = P.lineUnits[i];
      let u = us[0];
      for (const x of us) if (P.units[x].start <= s) u = x;
      out.push({ key, u, raw: ln, start: s, len: e - s, quote: true });
    }
  });
  return out;
}

// ── 법령 용어 — 작은 공개 목록(일반 법령·노동법 용어). 법령 문장 꼴(하여야·할 수 있·아니하)은 legal 장르에서만 본다
// 어간으로 센다 — 「하여야 한다 → 하여야 하며」처럼 끝만 바뀐 것은 같다
const LAW_FORM_TERMS = [['하여야', /하여야/g], ['할 수 있', /할\s*수\s*있/g], ['아니하', /아니\s*하/g]];
const LABOR_TERMS = [
  ['근로자', /근로자/g], ['사용자', /사용자/g], ['근로계약', /근로\s*계약/g], ['취업규칙', /취업\s*규칙/g],
  ['임금', /임금/g], ['통상임금', /통상\s*임금/g], ['평균임금', /평균\s*임금/g], ['퇴직금', /퇴직금/g],
  ['해고', /해고/g], ['징계', /징계/g], ['견책', /견책/g], ['감봉', /감봉/g], ['정직', /정직(?!하)/g], ['해임', /해임/g],
  ['정당한 이유', /정당한\s*이유/g], ['직장 내 괴롭힘', /직장\s*내\s*괴롭힘/g], ['성희롱', /성희롱/g],
];
const LAW_FORM_GENRES = new Set(['legal']);
function termsOf(units, list) {
  const out = [];
  units.forEach((u, k) => {
    if (u.block) return;
    for (const [key, rx] of list) for (const m of u.raw.matchAll(rx)) out.push({ key, u: k, raw: u.raw, start: m.index, len: m[0].length });
  });
  return out;
}

// ── 당위·추측 표지 — im-not-ai verify_gates.py 의 DEONTIC_RE·HEDGE_RE 갈래를 옮기고 법령 글 꼴을 더했다.
// 당위 「-아/어/여야 하다」의 「야」 앞 음절은 받침 없는 열린 음절이고 가운데 소리가 ㅏㅐㅓㅔㅕㅘㅙㅚㅝㅞ 중 하나다(있어야·해야·하여야·되어야)
const OPEN_JUNG = new Set([0, 1, 4, 5, 6, 9, 10, 11, 14, 15]);
let OPEN = '';
for (let c = 0; c < 11172; c += 28) if (OPEN_JUNG.has(Math.floor(c / 28) % 21)) OPEN += String.fromCharCode(0xac00 + c);
const DEONTIC = new RegExp(
  `[${OPEN}]야\\s*(?:한다|합니다|했다|하였다|하며|하고|하는|할|함|했어요|했어|해요|해서|해도|하지요|하죠|해)|[${OPEN}]야만` +
    '|필요가\\s*있|필요하다|필요합니다|요구된다|요구됩니다|시급하다|시급합니다|바람직하다|바람직합니다|촉구한다|당부한다' +
    '|[가-힣]지\\s*않으면\\s*안\\s*(?:된다|됩니다|되며|돼|되)' +
    // 법령 글의 금지 — 「~하여서는 아니 된다」「~서는 안 된다」「~넘지 못한다」
    '|아니\\s*(?:된다|됩니다|되며|되고|됨)|서는\\s*안\\s*(?:된다|됩니다|되며|됨)|지\\s*못한다|지\\s*못합니다|지\\s*못하며|지\\s*못함',
  'g',
);
const HEDGE = new RegExp(
  '수\\s*있|수도\\s*있|것으로\\s*(?:보인다|보입니다|보임|전망|판단|추정|알려)|가능성[이도은을에]' +
    '|[로으]\\s*보인다|[로으]\\s*보입니다|[로으]\\s*보임|판단된다|판단됩니다|판단됨|여겨진다|여겨집니다' +
    '|해석된다|추정된다|기대된다|우려된다|듯하|듯\\s*싶|것\\s*같다' +
    '|전망(?:이다|된다|한다|했다|입니다|이며|하고)|예상(?:된다|이다|한다|했다|됩니다)|단정하기|여지(?:도|가)?\\s*있|배제할\\s*수\\s*없' +
    // 법령 글의 유보 — 「사료된다」「볼 여지」「보기 어렵다」
    '|사료된다|사료됩니다|볼\\s*여지|기\\s*어렵',
  'g',
);
const MODALITIES = [['당위', DEONTIC], ['추측', HEDGE]];

function modalityItem(B, A, hunks, canAlign) {
  const cnt = (units, rx) => Int32Array.from(units, (u) => (u.block ? 0 : countRx(rx, u.raw)));
  const cb = MODALITIES.map(([, rx]) => cnt(B.units, rx));
  const ca = MODALITIES.map(([, rx]) => cnt(A.units, rx));
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);
  const count = Object.fromEntries(MODALITIES.map(([name], k) => [name, { before: sum(cb[k]), after: sum(ca[k]) }]));
  // ②(개수로 찾은 사라짐)는 글 전체에서 줄어든 만큼까지만 — 문장을 다른 문단으로 옮기면 한 덩어리는 줄고 다른 덩어리는 늘어 있다
  const spare = MODALITIES.map((_, k) => Math.max(0, sum(cb[k]) - sum(ca[k])));
  const losses = [];
  let cells = NW_TOTAL;
  for (const h of hunks) {
    const bIdx = [];
    for (let i = h.b0; i < h.b1; i++) if (!B.units[i].block) bIdx.push(i);
    const aIdx = [];
    for (let j = h.a0; j < h.a1; j++) if (!A.units[j].block) aIdx.push(j);
    if (!bIdx.length) continue;
    let pairs = null;
    const size = bIdx.length * aIdx.length;
    if (canAlign && size && size <= NW_CELLS && size <= cells) {
      cells -= size;
      pairs = align(B.units, A.units, bIdx, aIdx);
    }
    const partner = new Map();
    if (pairs) for (const [i, j] of pairs) if (i >= 0 && j >= 0) partner.set(i, j);
    MODALITIES.forEach(([name], k) => {
      const found = new Set();
      // ① 짝 문장에서 사라짐 — 유사도가 하한 이상인 짝만. 옆의 짝 없는 문장이 같은 표현을 가져갔으면(문장 나눔) 사라짐이 아니다
      if (pairs) {
        pairs.forEach(([i, j, s], p) => {
          if (i < 0 || j < 0 || !cb[k][i] || ca[k][j] || s < MIN_PAIR_SIM) return;
          const moved = [p - 1, p + 1].some((q) => q >= 0 && q < pairs.length && pairs[q][0] < 0 && ca[k][pairs[q][1]] > 0);
          if (!moved) found.add(i);
        });
      }
      // ② 덩어리 안 개수가 줄었는데 ①로 다 설명되지 않음 — 표현이 든 문장을 앞에서부터(짝에서 줄어든 것 먼저)
      let left = bIdx.reduce((s, i) => s + cb[k][i], 0) - aIdx.reduce((s, j) => s + ca[k][j], 0);
      for (const i of found) {
        left -= cb[k][i];
        spare[k] = Math.max(0, spare[k] - cb[k][i]);
      }
      const lost = (i) => cb[k][i] - (partner.has(i) ? ca[k][partner.get(i)] : 0);
      for (const pass of [(i) => lost(i) > 0, () => true]) {
        for (const i of bIdx) {
          if (left <= 0 || spare[k] <= 0) break;
          if (!cb[k][i] || found.has(i) || !pass(i)) continue;
          found.add(i);
          const n = Math.max(1, lost(i));
          left -= n;
          spare[k] = Math.max(0, spare[k] - n);
        }
      }
      for (const i of found) losses.push({ i, j: partner.has(i) ? partner.get(i) : -1, name });
    });
  }
  losses.sort((x, y) => x.i - y.i);
  return itemOf('modality', losses, count, (l) => {
    const e = { kind: 'lost', modality: l.name, line: { before: B.units[l.i].line, after: l.j >= 0 ? A.units[l.j].line : null }, before: clip(B.units[l.i].key) };
    if (l.j >= 0) e.after = clip(A.units[l.j].key);
    return e;
  });
}

// ── 대구 — 「X가/이 아니라 Y」「~이기 이전에」「~이기보다」(im-not-ai metrics_v2.py C-8). 줄이는 것은 정상 윤문, 전멸만 훼손
const ANTITHESIS = /(?:가|이)\s*아니라|이기\s*이전에|되기\s*이전에|이기보다/g;
function antithesisItem(B, A) {
  const cnt = (units) => units.map((u) => (u.block ? 0 : countRx(ANTITHESIS, u.raw)));
  const cb = cnt(B.units);
  const before = cb.reduce((s, x) => s + x, 0);
  const after = cnt(A.units).reduce((s, x) => s + x, 0);
  const gone = before >= ANTITHESIS_MIN && after === 0;
  const changes = gone ? B.units.map((u, i) => ({ u, i })).filter((x) => cb[x.i] > 0) : [];
  return itemOf('antithesis', changes, { before, after }, ({ u }) => ({ kind: 'annihilated', line: { before: u.line, after: null }, before: clip(u.key) }));
}

// ── [관련 …] 블록 — 글자 그대로(줄머리 > · ** · 공백 폭은 보지 않는다). 같은 글끼리 먼저 맞추고, 남은 것은 머리줄이 같은 것 → 차례로 짝
function blocksItem(B, A) {
  const left = new Map();
  for (const b of A.blocks) {
    if (!left.has(b.key)) left.set(b.key, []);
    left.get(b.key).push(b);
  }
  const ub = [];
  for (const b of B.blocks) {
    const l = left.get(b.key);
    if (l?.length) l.shift();
    else ub.push(b);
  }
  const ua = A.blocks.filter((b) => left.get(b.key)?.includes(b));
  const changes = [];
  const free = new Set(ua);
  for (const b of ub) {
    const a = [...free].find((x) => x.head === b.head) ?? [...free][0];
    if (a) {
      free.delete(a);
      changes.push({ kind: 'changed', b, a });
    } else changes.push({ kind: 'removed', b });
  }
  for (const a of free) changes.push({ kind: 'added', a });
  const firstDiff = (x, y) => {
    let p = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    return p;
  };
  // 바뀐 블록은 처음 달라진 글자가 든 줄, 빠짐·더해짐은 머리줄
  const lineAt = (blk, p) => blk.parts.reduce((ln, x) => (x.at <= p ? x.line : ln), blk.line);
  return itemOf('blocks', changes, { before: B.blocks.length, after: A.blocks.length }, (c) => {
    const p = c.b && c.a ? firstDiff(c.b.key, c.a.key) : 0;
    const e = { kind: c.kind, line: { before: c.b ? lineAt(c.b, p) : null, after: c.a ? lineAt(c.a, p) : null } };
    const s = Math.max(0, p - SNIP);
    if (c.b) e.before = (s ? '…' : '') + clip(c.b.key.slice(s), SNIP * 3);
    if (c.a) e.after = (s ? '…' : '') + clip(c.a.key.slice(s), SNIP * 3);
    return e;
  });
}

/**
 * 윤문 전후 보존 대조.
 * @param {string} before 윤문 전 글
 * @param {string} after 윤문한 글
 * @param {{ genre?: string }} [o] legal(기본)이면 법령 문장 꼴(하여야·할 수 있·아니하)도 용어로 본다
 */
export function checkRewrite(before, after, o = {}) {
  const genre = o.genre ?? 'legal';
  const B = parse(before);
  const A = parse(after);
  const pairs = anchorPairs(B.units.map((u) => u.key), A.units.map((u) => u.key));
  const hunks = hunksOf(pairs, B.units.length, A.units.length);
  const hb = hunkIndex(hunks, B.units.length, 'b');
  const ha = hunkIndex(hunks, A.units.length, 'a');
  const cr = changeRate(B.units, A.units, pairs, hunks);
  const level = rateLevel(cr.rate);

  const numB = numbersOf(B.units);
  const numA = numbersOf(A.units);
  const numbers = itemOf('numbers', diffTokens(numB, numA, hb, ha), { before: numB.length, after: numA.length },
    tokenShow(B, A, (c) => ({ value: { ...(c.b ? { before: c.b.key } : {}), ...(c.a ? { after: c.a.key } : {}) } })));

  const qB = quotesOf(B);
  const qA = quotesOf(A);
  const flatAfter = norm(A.lines.join('\n'));
  // 인용 글이 부호 없이 남았으면 「부호 빠짐」 — 짝짓기 전에 가른다
  const qChanges = diffTokens(qB, qA, hb, ha).flatMap((c) => {
    if (c.kind !== 'removed' && !(c.kind === 'changed' && flatAfter.includes(c.b.key))) return [c];
    if (!flatAfter.includes(c.b.key)) return [c];
    return c.kind === 'changed' ? [{ kind: 'unquoted', b: c.b }, { kind: 'added', a: c.a }] : [{ kind: 'unquoted', b: c.b }];
  });
  const quotes = itemOf('quotes', qChanges, { before: qB.length, after: qA.length }, tokenShow(B, A, () => ({})));

  const termList = LAW_FORM_GENRES.has(genre) ? [...LAW_FORM_TERMS, ...LABOR_TERMS] : LABOR_TERMS;
  const tB = termsOf(B.units, termList);
  const tA = termsOf(A.units, termList);
  const termCount = {};
  for (const [key] of termList) {
    const b = tB.filter((x) => x.key === key).length;
    const a = tA.filter((x) => x.key === key).length;
    if (a || b) termCount[key] = { before: b, after: a };
  }
  const terms = itemOf('terms', diffTokens(tB, tA, hb, ha), termCount,
    tokenShow(B, A, (c) => (c.kind === 'changed' ? { term: c.b.key, ...(c.a.key !== c.b.key ? { to: c.a.key } : {}) } : { term: (c.b ?? c.a).key })));

  const items = {
    numbers,
    quotes,
    blocks: blocksItem(B, A),
    terms,
    modality: modalityItem(B, A, hunks, level !== '중단'),
    antithesis: antithesisItem(B, A),
  };
  const damaged = Object.keys(items).filter((k) => items[k].status === DAMAGED);
  const status = level === '중단' ? OVER : damaged.length ? DAMAGED : level ? OVER : KEPT;
  const rate = { rate: Math.round(cr.rate * 10_000) / 10_000, percent: Math.round(cr.rate * 1000) / 10 };
  if (level) rate.level = level;
  if (cr.approximate) rate.approximate = true;
  return { status, genre, changeRate: rate, damaged, items };
}

/** before·after 중 주민번호 모양이 있으면 멈춤 응답(어느 쪽 몇 줄인지, 줄마다 50줄까지), 없으면 null */
export function rewriteRrnStop(before, after) {
  const b = rrnLines(before);
  const a = rrnLines(after);
  if (!b.length && !a.length) return null;
  return { ok: false, error: PROSE_RRN_STOP, rrnLines: { before: b.slice(0, RRN_LINES_MAX), after: a.slice(0, RRN_LINES_MAX) } };
}

const stackOnly = (e) => (e instanceof Error ? `${e.name}\n${String(e.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).join('\n')}` : 'unknown');

/** check_rewrite 응답 객체(주민번호 검사 뒤). 오류 글에 문서 글이 실리지 않게 — 응답은 고정 코드, stderr 에는 오류 종류와 「at」 줄만 */
export function rewriteResult(a) {
  try {
    return { ok: true, ...checkRewrite(a.before, a.after, { genre: a.genre }) };
  } catch (e) {
    console.error('[check_rewrite]', stackOnly(e));
    return { ok: false, error: 'REWRITE_CHECK_FAILED' };
  }
}
