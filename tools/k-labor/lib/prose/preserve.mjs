// 퇴고 — 윤문 뒤 보존 대조(결정론). 윤문 전 글(before)과 윤문한 글(after)을 비교해, 윤문이 건드리면 안 되는 것이 바뀌었는지 찾는다.
//   항목 = 수치 · 인용 · [관련 판결/판례/판정/결정] 블록 · 노동 법령 용어 · 당위/추측 표현 · 부정 표현(극성) · 대구,
//          그리고 글자 변경률(30% 이상 경고 · 50% 이상 중단)
// 발상은 im-not-ai(epoko77-ai, MIT, c07df14)의 scripts/checks.py·verify_gates.py·restore_modality.py·metrics_v2.py 에서 가져와
// 새로 썼다(THIRD_PARTY_NOTICES.md).
// 상태어는 셋뿐이다 — 보존됨(코드가 본 항목이 같다. 「뜻이 같다」가 아니다) · 훼손(무엇이 어떻게) · 변경률 초과(경고·중단).
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
// 비교 단위(261124 G4 반영):
//   ① 같은 문장은 닻(양쪽에 한 번씩만 나오는 문장의 최장 증가 부분열)으로 먼저 맞춘다. 닻 맞추기는 총 작업량 상한이 있고, 짧은 닻이
//      양옆 긴 구간을 통째 삭제·삽입으로 갈라 놓으면 그 닻은 푼다.
//   ② 닻 사이(바뀐 덩어리)는 문장 짝 정렬(Needleman-Wunsch)로 짝을 짓고, 짝 문장 + 그 옆 짝 없는 문장을 한 「무리」로 묶는다.
//      다른 덩어리로 옮겨 간 문장은 같은 글 또는 유사도 0.5 이상으로 덩어리를 건너 짝짓는다.
//   ③ 수치·인용·용어는 무리 안 순서열로 견준다(값이 빠지거나 더해지면 빠짐·더해짐·바뀜, 값은 같은데 차례가 다르면 자리 바뀜).
//      무리 밖으로는 상쇄하지 않는다. 당위·추측·부정 표현은 무리 안 개수를 양방향으로 견준다(사라짐·생김).
//   ④ 글자 변경률 = 1 − 2 × 일치 글자 ÷ 양쪽 글자. 덩어리 대조가 계산 예산을 넘으면 짝 문장별 정확 대조의 합(순서를 지키는 일치의
//      하한)으로 센다 — 그때 변경률은 실제 값의 상한이라 changeRate.approximate 로 알리고, 30% 미만이면 실제도 30% 미만이다.
import { PROSE_RRN_STOP, RRN_LINES_MAX, rrnLines, stackOnly } from '../common.mjs';
import { citationBlockRanges } from '../cite-check.mjs';
import { cpLen } from './check.mjs';

export const RATE_WARN = 0.3;
export const RATE_STOP = 0.5;
/** 항목마다 싣는 바뀐 곳 상한(넘으면 truncated·total) */
export const CHANGE_CAP = 100;
/** 대구 전멸 — 윤문 전에 이만큼 있었는데 0 이 되면 훼손(im-not-ai verify_gates.py ANNIHILATION_MIN_BEFORE) */
export const ANTITHESIS_MIN = 5;
/** 짝 문장 유사도(문자 바이그램 Dice) 하한 — 이보다 낮으면 짝이 아니라 따로 바뀐 문장으로 본다 */
export const MIN_PAIR_SIM = 0.35;
/** 다른 덩어리로 옮겨 간 문장으로 볼 유사도 하한 */
export const MOVE_SIM = 0.5;
const GAP = -0.4;
const NW_CELLS = 250_000; // 덩어리 하나의 문장 짝 정렬 칸 상한(500 × 500)
const NW_TOTAL = 1_500_000; // 한 번 대조의 정렬 칸 합 상한
const MOVE_CELLS = 400_000; // 덩어리를 건너는 옮김 짝 찾기 칸 상한
const LCS_BUDGET = 100_000_000; // 글자 대조 걸음 합 상한
const LCS_HUNK = 20_000_000; // 덩어리 하나의 글자 대조 걸음 상한
const ANCHOR_WORK = 8; // 닻 맞추기 총 작업 = 8 × (양쪽 문장 수) + 10만
const QUOTE_SPAN = 300; // 여러 줄 인용 — 여는 부호 뒤 이 글자 수·QUOTE_LINES 줄 안에서 닫는 부호를 찾는다
const QUOTE_LINES = 3;
const SQUOTE_MAX = 200;
const SNIP = 18;
const SHOW_MAX = 80;
const CAND_MAX = 50;

const KEPT = '보존됨';
const DAMAGED = '훼손';
const OVER = '변경률 초과';
const LABELS = {
  numbers: '수치', quotes: '인용', blocks: '판례 블록', terms: '법령 용어', modality: '당위·추측 표현', polarity: '부정 표현', antithesis: '대구',
};

/** 변경률 → null(30% 미만) · '경고'(30% 이상) · '중단'(50% 이상) */
export function rateLevel(rate) {
  return rate >= RATE_STOP ? '중단' : rate >= RATE_WARN ? '경고' : null;
}

// ── 글자 도구
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// 입력은 NFC 로 맞추고 폭 없는 문자(ZWSP·ZWNJ·ZWJ·WJ·BOM)를 지운다 — 같은 글이 다른 코드로 들어와 바뀜·같음이 갈리지 않게
const ZW = /[​-‍⁠﻿]/g;
const DASHES = /[‐-―−﹘﹣－]/g;
const prep = (s) => String(s ?? '').replace(/\r\n?/g, '\n').normalize('NFC').replace(ZW, '');
// 보여 줄 글에서는 12자리 이상 이어진 숫자(구분 글자 하나씩 허용)를 같은 길이의 * 로 가린다 — 주민번호·계좌번호가 응답에 실리지 않게
const LONG_DIGITS = /\p{Nd}(?:[\s.\-‐-―−﹘﹣－]?\p{Nd}){11,}/gu;
const hide = (s) => s.replace(LONG_DIGITS, (m) => m.replace(/\p{Nd}/gu, (d) => '*'.repeat(d.length)));
function clip(s, max = SHOW_MAX) {
  const c = Array.from(s.length > max * 2 + 2 ? s.slice(0, max * 2 + 2) : s);
  return c.length > max ? `${c.slice(0, max).join('')}…` : c.join('');
}
/** safe(가린 글)의 [start, start+len) 둘레 짧은 글(앞뒤 SNIP 글자, 줄인 쪽은 …) */
function around(safe, start, len) {
  const pre = Array.from(safe.slice(Math.max(0, start - 2 * SNIP), start)).slice(-SNIP).join('');
  const post = Array.from(safe.slice(start + len, start + len + 2 * SNIP)).slice(0, SNIP).join('');
  const head = start - pre.length > 0 ? '…' : '';
  const tail = start + len + post.length < safe.length ? '…' : '';
  return `${head}${pre}${clip(safe.slice(start, start + len))}${post}${tail}`.replace(/\s+/g, ' ').trim();
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
// 블록 범위는 lib/cite-check.mjs citationBlockRanges 와 한 벌이다. 머리줄은 붙여 쓴 [관련판결] 도 받는다
const BLOCK_HEAD = /[[【]\s*관련\s*(?:판결|판례|판정|결정)\s*[\]】]\s*([^\n]*)/;
const BLOCK_CAND = /[[【]\s*관련/;
const CAND_PREC = /[[【]\s*관련\s*(?:판결|판례|판정|결정)/;
const CAND_LINES = 30;
/** 블록 글 — 줄머리 > · # 와 굵게 표시(**)는 글자가 아니다 */
const blockText = (s) => s.replace(/^\s*(?:>\s*)+/, '').replace(/^\s*#+\s+/, '').replace(/\*\*/g, '');
// 문장 끝 — 마침표·물음표·느낌표 뒤 공백. 앞 글자가 숫자면 날짜·번호(2026. 3. 2. · 1. 사실관계)라 자르지 않는다
const SENT_END = /[.!?。]+\s+/g;
const DIGIT = /\p{Nd}/u;

function parse(text) {
  const lines = prep(text).split('\n');
  const inBlock = new Uint8Array(lines.length);
  const blocks = [];
  for (const r of citationBlockRanges(lines, BLOCK_HEAD)) {
    if (inBlock[r.line]) continue;
    const idx = [r.line, ...r.body];
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
    blocks.push({ line: r.line + 1, head: parts[0]?.t ?? '', key: parts.map((p) => p.t).join(' '), parts });
  }
  // 블록으로 못 읽은 [관련 … 줄 — 응답에 줄 번호를 알린다
  const cand = [];
  for (let i = 0; i < lines.length && cand.length < CAND_MAX; i++) if (!inBlock[i] && BLOCK_CAND.test(lines[i])) cand.push(i + 1);
  // 그 가운데 판례 이름이 붙은 줄([관련 판결: …]·닫는 괄호 없음)은 빈 줄 앞까지를 블록처럼 글자 그대로 견준다(보수적으로)
  const candBlocks = [];
  for (const ln of cand) {
    if (!CAND_PREC.test(lines[ln - 1])) continue;
    const parts = [];
    let at = 0;
    for (let j = ln - 1; j < lines.length && j < ln - 1 + CAND_LINES; j++) {
      if (j > ln - 1 && (!lines[j].trim() || inBlock[j] || BLOCK_CAND.test(lines[j]))) break;
      const t = norm(blockText(lines[j]));
      parts.push({ line: j + 1, at, t });
      at += t.length + 1;
    }
    candBlocks.push({ line: ln, head: parts[0].t, key: parts.map((p) => p.t).join(' '), parts, cand: true });
  }
  const units = [];
  const lineUnits = lines.map(() => []);
  const add = (i, raw, start, block) => {
    const key = norm(raw);
    if (!key) return;
    lineUnits[i].push(units.length);
    units.push({ key, n: cpLen(key), line: i + 1, raw, start, block, tail: '' });
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
  // 줄 끝에서 문장이 끝나지 않고 다음 줄로 이어지면 다음 줄 앞머리(표지 세기용)
  for (let i = 0; i + 1 < lines.length; i++) {
    const us = lineUnits[i];
    if (!us.length || inBlock[i] || inBlock[i + 1] || !lines[i + 1].trim()) continue;
    const u = units[us[us.length - 1]];
    if (!/[.!?。]["'”’」』)\]]*\s*$/.test(u.raw)) u.tail = ` ${lines[i + 1].trimStart().slice(0, 24)}`;
  }
  return { lines, inBlock, blocks, cand, candBlocks, units, lineUnits };
}
const safeOf = (u) => (u.safe ??= hide(u.raw));

// ── 같은 문장 맞추기(닻) — 앞뒤 공통부를 떼고, 양쪽에 한 번씩만 나오는 문장의 최장 증가 부분열을 닻으로 삼아 사이를 다시 본다.
// 되짚는 구간이 많아져도(문장마다 두 번씩 엮은 글) 총 작업량 상한을 넘으면 남은 구간은 통째로 바뀐 덩어리로 둔다
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
  const limit = ANCHOR_WORK * (A.length + B.length) + 100_000;
  let work = 0;
  const stack = [[0, A.length, 0, B.length]];
  while (stack.length) {
    let [a0, a1, b0, b1] = stack.pop();
    while (a0 < a1 && b0 < b1 && A[a0] === B[b0]) pairs.push([a0++, b0++]);
    while (a1 > a0 && b1 > b0 && A[a1 - 1] === B[b1 - 1]) pairs.push([--a1, --b1]);
    if (a0 >= a1 || b0 >= b1) continue;
    work += a1 - a0 + (b1 - b0);
    if (work > limit) continue;
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

/** 짧은 닻 풀기 — 닻 한 줄기(이어진 닻)의 앞은 한쪽만 있는 구간, 뒤는 반대쪽만 있는 구간이고 닻 글자가 그 둘보다 짧으면
 *  닻이 긴 글을 통째 삭제·삽입으로 갈라 놓은 것이다(짧은 줄 하나가 긴 문단을 건너 옮겨 감) → 풀고 하나의 덩어리로 견준다 */
function dissolveShort(pairs, bu, au) {
  const pre = (units) => {
    const p = new Float64Array(units.length + 1);
    for (let k = 0; k < units.length; k++) p[k + 1] = p[k] + units[k].n;
    return p;
  };
  const pb = pre(bu);
  const pa = pre(au);
  for (let pass = 0; pass < 4; pass++) {
    const keep = new Uint8Array(pairs.length).fill(1);
    let dropped = false;
    for (let s = 0; s < pairs.length; ) {
      let e = s;
      while (e + 1 < pairs.length && pairs[e + 1][0] === pairs[e][0] + 1 && pairs[e + 1][1] === pairs[e][1] + 1) e++;
      const prev = s ? pairs[s - 1] : [-1, -1];
      const next = e + 1 < pairs.length ? pairs[e + 1] : [bu.length, au.length];
      const gb1 = pb[pairs[s][0]] - pb[prev[0] + 1];
      const ga1 = pa[pairs[s][1]] - pa[prev[1] + 1];
      const gb2 = pb[next[0]] - pb[pairs[e][0] + 1];
      const ga2 = pa[next[1]] - pa[pairs[e][1] + 1];
      const run = pb[pairs[e][0] + 1] - pb[pairs[s][0]];
      const cross = (gb1 > 0 && !ga1 && !gb2 && ga2 > 0) || (ga1 > 0 && !gb1 && !ga2 && gb2 > 0);
      if (cross && run < Math.min(gb1 + ga1, gb2 + ga2)) {
        for (let k = s; k <= e; k++) keep[k] = 0;
        dropped = true;
      }
      s = e + 1;
    }
    if (!dropped) break;
    pairs = pairs.filter((_, k) => keep[k]);
  }
  return pairs;
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

// ── 글자 대조 — 최장 공통 부분열 길이(Myers). 걸음이 budget 을 넘으면 { len: null, cost }
const codes = (units, list) => {
  const out = [];
  for (const i of list) for (const ch of units[i].key) out.push(ch.codePointAt(0));
  return Int32Array.from(out);
};
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
  return { len: null, cost: max * (maxD + 1) };
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
  if (x.key === y.key) return 1;
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

/**
 * 덩어리마다 문장 짝(정렬, 칸 상한을 넘으면 차례 짝) → 덩어리를 건너 옮긴 문장 짝 → 무리.
 * 무리 = { b: 단위 번호[], a: 단위 번호[] } — 짝 문장 하나와 그 옆 짝 없는 문장들(문장 나눔·합침·끼워 넣음).
 */
function pairUp(B, A, hunks) {
  const bu = B.units;
  const au = A.units;
  const entries = [];
  let cells = NW_TOTAL;
  let fallback = false;
  for (const h of hunks) {
    const bIdx = [];
    for (let i = h.b0; i < h.b1; i++) bIdx.push(i);
    const aIdx = [];
    for (let j = h.a0; j < h.a1; j++) aIdx.push(j);
    const size = bIdx.length * aIdx.length;
    let es;
    if (!size) es = [...bIdx.map((i) => [i, -1, 0]), ...aIdx.map((j) => [-1, j, 0])];
    else if (size <= NW_CELLS && size <= cells) {
      cells -= size;
      es = align(bu, au, bIdx, aIdx);
    } else {
      // 정렬 칸 상한 밖 — k 번째끼리 짝(순서를 지키는 짝이라 글자 일치의 하한 계산에 쓸 수 있다)
      fallback = true;
      es = [];
      for (let k = 0; k < Math.max(bIdx.length, aIdx.length); k++) {
        const i = k < bIdx.length ? bIdx[k] : -1;
        const j = k < aIdx.length ? aIdx[k] : -1;
        es.push([i, j, i >= 0 && j >= 0 ? sim(bu[i], au[j]) : 0]);
      }
    }
    entries.push(es);
  }
  // 짝 없는 문장끼리 덩어리를 건너 맞춘다 — 같은 글 먼저, 남은 것은 유사도 MOVE_SIM 이상(칸 상한 안에서)
  const strong = (i, j, s) => i >= 0 && j >= 0 && s >= MIN_PAIR_SIM && !bu[i].block && !au[j].block;
  const ub = [];
  const ua = [];
  for (const es of entries) {
    for (const [i, j, s] of es) {
      if (strong(i, j, s)) continue;
      if (i >= 0 && !bu[i].block) ub.push(i);
      if (j >= 0 && !au[j].block) ua.push(j);
    }
  }
  const moveB = new Map();
  const moveA = new Map();
  const byKey = new Map();
  for (const i of ub) {
    const q = byKey.get(bu[i].key);
    if (q) q.list.push(i);
    else byKey.set(bu[i].key, { list: [i], at: 0 });
  }
  for (const j of ua) {
    const q = byKey.get(au[j].key);
    if (q && q.at < q.list.length) {
      const i = q.list[q.at++];
      moveB.set(i, j);
      moveA.set(j, i);
    }
  }
  const lb = ub.filter((i) => !moveB.has(i));
  const la = ua.filter((j) => !moveA.has(j));
  if (lb.length && la.length && lb.length * la.length <= MOVE_CELLS) {
    for (const i of lb) {
      let best = -1;
      let bs = MOVE_SIM;
      for (const j of la) {
        if (moveA.has(j)) continue;
        const s = sim(bu[i], au[j]);
        if (s >= bs) {
          bs = s;
          best = j;
        }
      }
      if (best >= 0) {
        moveB.set(i, best);
        moveA.set(best, i);
      }
    }
  }
  const groups = [];
  const partnerB = new Map();
  const partnerA = new Map();
  for (const es of entries) {
    let cur = { b: [], a: [], paired: false };
    for (const [i, j, s] of es) {
      if (strong(i, j, s)) {
        if (cur.paired) {
          groups.push(cur);
          cur = { b: [], a: [], paired: false };
        }
        cur.paired = true;
        cur.b.push(i);
        cur.a.push(j);
        partnerB.set(i, j);
        partnerA.set(j, i);
        continue;
      }
      if (i >= 0 && !bu[i].block && !moveB.has(i)) cur.b.push(i);
      if (j >= 0 && !au[j].block && !moveA.has(j)) cur.a.push(j);
    }
    if (cur.b.length || cur.a.length) groups.push(cur);
  }
  for (const [i, j] of moveB) {
    groups.push({ b: [i], a: [j], paired: true, moved: true });
    partnerB.set(i, j);
    partnerA.set(j, i);
  }
  for (const g of groups) {
    g.b.sort((x, y) => x - y);
    g.a.sort((x, y) => x - y);
  }
  return { entries, groups, partnerB, partnerA, fallback };
}

// ── 글자 변경률 — 1 − 2 × 일치 글자 / 양쪽 글자 합(공백 덩어리는 한 칸). 닻 문장은 통째로 일치.
// 덩어리 대조가 예산을 넘으면 그 덩어리의 문장 짝(순서를 지킨다)마다 정확히 대조한 합 = 일치의 하한 → 변경률은 상한(approximate)
function changeRate(bu, au, pairs, hunks, entries) {
  let total = 0;
  for (const u of bu) total += u.n;
  for (const u of au) total += u.n;
  let matched = 0;
  for (const [i] of pairs) matched += bu[i].n;
  let budget = LCS_BUDGET;
  let approximate = false;
  hunks.forEach((h, k) => {
    if (h.b0 === h.b1 || h.a0 === h.a1) return;
    const bl = [];
    for (let i = h.b0; i < h.b1; i++) bl.push(i);
    const al = [];
    for (let j = h.a0; j < h.a1; j++) al.push(j);
    const r = budget > 0 ? lcsLen(codes(bu, bl), codes(au, al), Math.min(budget, LCS_HUNK)) : { len: null, cost: 0 };
    budget -= r.cost;
    if (r.len !== null) {
      matched += r.len;
      return;
    }
    approximate = true;
    if (bl.length === 1 && al.length === 1) return; // 문장 하나끼리 — 짝 대조도 같은 계산이라 하지 않는다(일치 0 = 상한)
    for (const [i, j] of entries[k]) {
      if (i < 0 || j < 0 || budget <= 0) continue;
      const p = lcsLen(codes(bu, [i]), codes(au, [j]), Math.min(budget, LCS_HUNK));
      budget -= p.cost;
      if (p.len !== null) matched += p.len;
    }
  });
  return { rate: total ? Math.min(1, Math.max(0, 1 - (2 * matched) / total)) : 0, approximate };
}

// ── 낱말 단위 항목(수치·인용·용어) — 무리 안 순서열을 견준다. tok = { key, u, start, len, disp?, quote? }
// 같은 값끼리 앞에서부터 맞추고, 남은 before = 빠짐, 남은 after = 더해짐, 같은 무리의 빠짐·더해짐은 차례로 짝지어 바뀜.
// 다 맞았는데 차례가 다르면 자리 바뀜(reordered) 하나
function seqDiff(groups, tokB, tokA, order = true) {
  const out = [];
  for (const g of groups) {
    const sb = g.b.flatMap((i) => tokB[i] ?? []);
    const sa = g.a.flatMap((j) => tokA[j] ?? []);
    if (!sb.length && !sa.length) continue;
    const q = new Map();
    sb.forEach((t, k) => {
      const l = q.get(t.key);
      if (l) l.push(k);
      else q.set(t.key, [k]);
    });
    const usedB = new Uint8Array(sb.length);
    const added = [];
    for (const t of sa) {
      const l = q.get(t.key);
      if (l?.length) usedB[l.shift()] = 1;
      else added.push(t);
    }
    const removed = sb.filter((_, k) => !usedB[k]);
    const n = Math.max(removed.length, added.length);
    for (let k = 0; k < n; k++) {
      if (k < removed.length && k < added.length) out.push({ kind: 'changed', b: removed[k], a: added[k] });
      else if (k < removed.length) out.push({ kind: 'removed', b: removed[k] });
      else out.push({ kind: 'added', a: added[k] });
    }
    if (order && !removed.length && !added.length && sb.some((t, k) => t.key !== sa[k].key)) out.push({ kind: 'reordered', g, sb, sa });
  }
  return out;
}

/** 항목 결과 — changes 는 앞에서 CHANGE_CAP 건만 글로 만든다 */
function itemOf(name, changes, count, show, extra) {
  const r = { label: LABELS[name], status: changes.length ? DAMAGED : KEPT, count, changes: changes.slice(0, CHANGE_CAP).map(show) };
  if (changes.length > CHANGE_CAP) Object.assign(r, { truncated: true, total: changes.length });
  return Object.assign(r, extra ?? {});
}
const groupText = (P, list) => clip(list.map((u) => safeOf(P.units[u])).join(' ').replace(/\s+/g, ' ').trim());

const tokenShow = (B, A, extra) => (c) => {
  if (c.kind === 'reordered') {
    return {
      kind: 'reordered',
      line: { before: B.units[c.sb[0].u].line, after: A.units[c.sa[0].u].line },
      before: groupText(B, c.g.b),
      after: groupText(A, c.g.a),
      ...extra(c),
    };
  }
  const e = { kind: c.kind, line: { before: c.b ? B.units[c.b.u].line : null, after: c.a ? A.units[c.a.u].line : null } };
  if (c.b) e.before = c.b.quote ? c.b.disp : around(safeOf(B.units[c.b.u]), c.b.start, c.b.len);
  if (c.a) e.after = c.a.quote ? c.a.disp : around(safeOf(A.units[c.a.u]), c.a.start, c.a.len);
  return Object.assign(e, extra(c));
};

// ── 수치 — 한 값을 「부호 + 수 + 만·억 + 단위 + 비교어」 한 덩이로 센다(NFKC 로 전각·수학 숫자도 아라비아 숫자로 본다).
// 날짜(2026. 3. 2. · 2026.3.12 · 2026년 3월 2일)·조문(제3조 제2항 · 제43조의2)·시각은 한 키로 묶는다.
// 천 단위 쉼표·앞자리 0·날짜 표기는 같은 값, 만·억 환산은 하지 않는다(1만 ≠ 10,000)
const N = '\\p{Nd}';
const UNITS = ['퍼센트포인트', '퍼센트', '%p', '%', '％', '‰', '개월', '개년', '주일', '주간', '시간', '년도', '년', '월', '주', '일', '시', '분', '초',
  '원', '달러', '엔', '유로', '명', '인', '개', '건', '회', '번', '차', '배', '세', '살', '점', '장', '쪽', '면', '호', '항', '조', '절', '관', '편', '층', '평',
  '㎡', 'km', 'kg', 'cm', 'mm', '톤', '위', '등', '급', '단계', '곳', '군데', '가지'];
const AFTER_WORD = '(?=[에의은는도로까부]|\\s|$|[^\\p{L}])';
const CMP = `이상|이하|미만|초과|이내|이후|이전|안(?=에|으로)|뒤${AFTER_WORD}|후${AFTER_WORD}|전${AFTER_WORD}`;
const CMP_CANON = { 안: '이내', 뒤: '이후', 후: '이후', 전: '이전' };
const NUM_RX = new RegExp(
  [
    `(?<art>제\\s*(?<a1>${N}+)\\s*조(?:\\s*의\\s*(?<a2>${N}+))?(?:\\s*(?:제\\s*)?(?<a3>${N}+)\\s*항)?(?:\\s*(?:제\\s*)?(?<a4>${N}+)\\s*호)?)`,
    `(?<date>(?<!${N})(?<y>${N}{4})\\s*(?:\\.|년)\\s*(?<mo>${N}{1,2})(?!${N})\\s*(?:\\.|월)(?:\\s*(?<d>${N}{1,2})(?!${N})\\s*(?:\\.|일)?)?)`,
    `(?<md>(?<!${N})(?<mo2>${N}{1,2})\\s*월\\s*(?<d2>${N}{1,2})\\s*일)`,
    `(?<time>(?<!${N})(?<h>${N}{1,2}):(?<mi>${N}{2})(?!${N}))`,
    // 사건번호(2019다12345) — 연도·사건부호·번호를 한 덩이로
    `(?<cs>(?<!${N})${N}{2}(?:${N}{2})?[가-힣]{1,3}${N}{1,7}(?!${N}))`,
    // 원문자·로마 숫자(① · Ⅱ)
    `(?<circ>[\\u2460-\\u2473\\u2160-\\u217F])`,
    // 요일 표기(월) · （화）
    `(?<dow>[(（][월화수목금토일][)）])`,
    `(?<num>(?<sign>(?<![\\p{L}\\p{N}])[+\\-−＋－﹢﹣△])?(?<v>${N}+(?:[.,]${N}+)*)(?<mag>\\s?[십백천만억조경]+)?(?<unit>\\s?(?:${UNITS.join('|')}))?(?<cmp>\\s?(?:${CMP}))?)`,
  ].join('|'),
  'gu',
);
const toAscii = (s) => s.normalize('NFKC');
const int = (s) => String(Number(toAscii(s)));
function numKey(g) {
  if (g.art) return `§${int(g.a1)}${g.a2 ? `의${int(g.a2)}` : ''}${g.a3 ? `-${int(g.a3)}항` : ''}${g.a4 ? `-${int(g.a4)}호` : ''}`;
  if (g.date) return `D${int(g.y)}-${int(g.mo)}${g.d ? `-${int(g.d)}` : ''}`;
  if (g.md) return `M${int(g.mo2)}-${int(g.d2)}`;
  if (g.time) return `T${int(g.h)}:${toAscii(g.mi)}`;
  if (g.cs) return `#${toAscii(g.cs)}`;
  if (g.circ) return `○${g.circ}`;
  if (g.dow) return `W${g.dow[1]}`;
  const v = toAscii(g.v);
  const canon = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(v) ? v.replace(/,/g, '') : v;
  const val = canon.split(/([.,])/).map((p) => (/^\d+$/.test(p) ? p.replace(/^0+(?=\d)/, '') : p)).join('');
  // △ 는 회계 표기의 음수
  const sign = g.sign ? (/[+＋﹢]/.test(g.sign) ? '+' : '-') : '';
  const cmp = g.cmp ? g.cmp.trim() : '';
  return `${sign}${val}${(g.mag ?? '').trim()}${toAscii((g.unit ?? '').trim())}${CMP_CANON[cmp] ?? cmp}`;
}
// 문장 머리의 번호(1. · 1) · (1) · ① · Ⅱ.)는 목록 꼴이라 수치로 세지 않는다 — 번호 안에 다 들어가는 덩이만 뺀다(「3. 2. 면담」 날짜는 남는다)
const ENUM_HEAD = /^[\s>#*-]*(?:\(?\d{1,2}[.)]|[①-⑳Ⅰ-ⅿ]\.?)\s/;
function numbersOf(units) {
  return units.map((u) => {
    if (u.block) return null;
    const out = [];
    const head = ENUM_HEAD.exec(u.raw)?.[0].length ?? 0;
    for (const m of u.raw.matchAll(NUM_RX)) {
      const len = m[0].trimEnd().length;
      if (len && m.index + len > head) out.push({ key: numKey(m.groups), u: -1, start: m.index, len });
    }
    return out;
  });
}

// ── 인용 — 둥근·낫표·겹낫표·작은따옴표·홑화살괄호·겹화살괄호(“” 「」 『』 ‘’ 〈〉 《》 ｢｣), 줄 안에서 짝이 맞는 곧은 큰따옴표 " "
// (홀수 개면 숫자 뒤 " 를 인치 표시로 빼고 차례로 둘씩), 곧은 작은따옴표 ' '(앞뒤가 영문·숫자가 아닌 것), 그리고 블록 밖 > 줄 전체.
// 둥근·낫표류는 닫는 부호가 같은 줄에 없으면 다음 QUOTE_LINES 줄·QUOTE_SPAN 글자 안에서 찾는다(여러 줄 인용)
const QUOTE_PAIRS = new Map([['“', '”'], ['「', '」'], ['『', '』'], ['‘', '’'], ['〈', '〉'], ['《', '》'], ['｢', '｣']]);
const ALNUM = /[A-Za-z0-9]/;
function quotesOf(P) {
  const tok = P.units.map((u) => (u.block ? null : []));
  const unitAt = (i, col) => {
    const us = P.lineUnits[i];
    let lo = 0;
    let hi = us.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (P.units[us[mid]].start <= col) lo = mid;
      else hi = mid - 1;
    }
    return us[lo];
  };
  const push = (i, col, text, disp) => {
    const key = norm(text);
    if (!key || !P.lineUnits[i].length) return;
    const u = unitAt(i, col);
    tok[u].push({ key, u, start: col, len: 0, quote: true, disp: clip(hide(norm(disp))) });
  };
  const memo = new Map();
  const cont = (i, c) => {
    const k = `${i}|${c}`;
    if (memo.has(k)) return memo.get(k);
    let r = null;
    let size = 0;
    for (let t = i + 1; t <= i + QUOTE_LINES && t < P.lines.length; t++) {
      const ln = P.lines[t];
      if (P.inBlock[t] || !ln.trim()) break;
      const j = ln.indexOf(c);
      if (j >= 0 && size + j <= QUOTE_SPAN) {
        r = { line: t, col: j };
        break;
      }
      size += ln.length;
      if (size > QUOTE_SPAN) break;
    }
    memo.set(k, r);
    return r;
  };
  // 곧은 큰따옴표 — 홀수 개면 숫자 바로 뒤 " (인치·초 표시)를 빼고, 그래도 홀수면 마지막 하나를 뺀다.
  // 곧은 작은따옴표 — 여는 것은 앞이, 닫는 것은 뒤가 영문·숫자가 아니어야 하고(don't·'90년 같은 것은 빠진다) SQUOTE_MAX 글자 안에서 닫힌다
  const straight = (i, ln, from) => {
    let dq = [];
    for (let k = ln.indexOf('"', from); k >= 0; k = ln.indexOf('"', k + 1)) dq.push(k);
    if (dq.length % 2) dq = dq.filter((k) => !(k > 0 && DIGIT.test(ln[k - 1])));
    if (dq.length % 2) dq.pop();
    for (let k = 0; k + 1 < dq.length; k += 2) push(i, dq[k], ln.slice(dq[k] + 1, dq[k + 1]), ln.slice(dq[k], dq[k + 1] + 1));
    for (let k = ln.indexOf("'", from); k >= 0; k = ln.indexOf("'", k + 1)) {
      if (k > 0 && ALNUM.test(ln[k - 1])) continue;
      const lim = k + 2 + SQUOTE_MAX;
      let j = ln.indexOf("'", k + 1);
      while (j >= 0 && j < lim && j + 1 < ln.length && ALNUM.test(ln[j + 1])) j = ln.indexOf("'", j + 1);
      if (j < 0 || j >= lim) continue;
      if (j > k + 1) push(i, k, ln.slice(k + 1, j), ln.slice(k, j + 1));
      k = j;
    }
  };
  // 둥근·낫표류 — 같은 줄에서 닫히면 그 안, 다음 줄들에서 닫히면 여러 줄 인용(닫는 줄의 나머지부터 다시 본다),
  // 끝내 닫히지 않으면 그 줄 끝까지를 인용 글로 본다(그 뒤 여는 부호는 같은 글 안이라 더 보지 않는다)
  let i = 0;
  let from = 0;
  while (i < P.lines.length) {
    const ln = P.lines[i];
    if (from === 0) {
      if (P.inBlock[i] || !P.lineUnits[i].length) {
        i++;
        continue;
      }
      if (ln.trimStart().startsWith('>')) push(i, 0, ln.replace(/^\s*(?:>\s*)+/, ''), ln.trim());
    }
    straight(i, ln, from);
    const last = new Map([...QUOTE_PAIRS.values()].map((c) => [c, ln.lastIndexOf(c)]));
    let next = null;
    for (let k = from; k < ln.length; k++) {
      const c = QUOTE_PAIRS.get(ln[k]);
      if (!c) continue;
      if (last.get(c) > k) {
        const j = ln.indexOf(c, k + 1);
        push(i, k, ln.slice(k + 1, j), ln.slice(k, j + 1));
        k = j;
        continue;
      }
      const hit = cont(i, c);
      if (hit) {
        const inner = [ln.slice(k + 1), ...P.lines.slice(i + 1, hit.line), P.lines[hit.line].slice(0, hit.col)].join(' ');
        push(i, k, inner, `${ln[k]}${inner}${c}`);
        next = hit;
      } else push(i, k, ln.slice(k + 1), ln.slice(k));
      break;
    }
    if (next) {
      i = next.line;
      from = next.col + 1;
    } else {
      i++;
      from = 0;
    }
  }
  return tok;
}

// ── 법령 용어 — 작은 공개 목록(일반 법령·노동법 용어). 법령 문장 꼴(하여야·할 수 있·아니하)은 legal 장르에서만 본다.
// 어간으로 센다 — 「하여야 한다 → 하여야 하며」처럼 끝만 바뀐 것은 같다. 한글은 완성형이라 「하」 뒤 받침이 붙은 한·할·함·합·했 은
// 다른 글자다 — 하·해 줄 음절 전체([하-햏])로 받는다. 줄임·뜻이 같은 꼴은 한 키: 하여야 = 해야, 아니하 = 않 = 못하
const LAW_FORM_TERMS = [
  ['하여야', /하여야|해야(?=\s*[하-햏]|만)/g],
  ['할 수 있', /할\s*수\s*있/g],
  ['아니하', /아니\s*[하-햏]|않|못\s*[하-햏]/g],
];
const LABOR_TERMS = [
  ['근로자대표', /근로자\s*대표/g], ['근로자', /근로자(?!\s*대표)/g], ['사용자', /사용자/g], ['근로계약', /근로\s*계약/g], ['취업규칙', /취업\s*규칙/g],
  ['임금', /임금/g], ['통상임금', /통상\s*임금/g], ['평균임금', /평균\s*임금/g], ['퇴직금', /퇴직금/g],
  ['해고', /해고/g], ['징계', /징계/g], ['견책', /견책/g], ['감봉', /감봉/g], ['정직', /정직(?![하-햏])/g], ['해임', /해임/g],
  ['정당한 이유', /정당한\s*이유/g], ['직장 내 괴롭힘', /직장\s*내\s*괴롭힘/g], ['성희롱', /성희롱/g],
  // 겹친 말은 따로 센다(바탕 말도 그대로 센다) — 「해고 → 해고예고」「임금 → 최저임금」이 같은 개수로 상쇄되지 않게
  ['해고예고', /해고\s*예고/g], ['최저임금', /최저\s*임금/g], ['징계위원회', /징계\s*위원회/g],
  ['신청인', /(?<!피)신청인/g], ['피신청인', /피신청인/g],
];
const LAW_FORM_GENRES = new Set(['legal']);
// 당사자 용어는 바로 뒤 조사로 자리(주어·목적어·여격 등)를 적어 둔다 — 「근로자가 사용자에게 → 사용자가 근로자에게」처럼
// 용어 개수는 같은데 자리가 맞바뀐 것을 잡으려고. 조사가 함께 옮겨 간 어순 바꿈(사용자는 근로자에게 → 근로자에게 사용자는)은 같다
// 징계 수위(견책·감봉·정직·해임·해고)도 누구에게 붙었는지가 뜻이라 같은 방식으로 본다
// 사람 쪽과 징계 수위 쪽은 따로 본다 — 「정직 3개월」처럼 조사 없이 쓴 수위가 사람 쪽 맞바꿈 검사를 끄지 않게
const PARTY_CLASSES = [new Set(['근로자', '사용자', '근로자대표', '신청인', '피신청인']), new Set(['견책', '감봉', '정직', '해임', '해고'])];
const PARTY = new Set(PARTY_CLASSES.flatMap((c) => [...c]));
const ROLE = { 이: 'S', 가: 'S', 은: 'S', 는: 'S', 께서: 'S', 을: 'O', 를: 'O', 에게: 'D', 에게서: 'D', 한테: 'D', 께: 'D' };
const LIST_ROLE = new Set(['', '와', '과', '나', '이나', '및', '랑', '이랑', '도']);
function termsOf(units, list) {
  return units.map((u) => {
    if (u.block) return null;
    const out = [];
    for (const [key, rx] of list) {
      for (const m of u.raw.matchAll(rx)) {
        const t = { key, u: -1, start: m.index, len: m[0].length };
        if (PARTY.has(key)) {
          const suf = /^[가-힣]*/.exec(u.raw.slice(m.index + m[0].length, m.index + m[0].length + 8))[0];
          t.role = ROLE[suf] ?? suf;
        }
        out.push(t);
      }
    }
    return out.sort((x, y) => x.start - y.start);
  });
}
/** 무리마다 당사자 용어의 자리 맞바꿈 — 용어 차례는 다르고 자리(조사) 차례는 같으면 값이 자리를 바꾼 것 */
function partySwaps(groups, tB, tA) {
  const out = [];
  for (const g of groups) {
    for (const cls of PARTY_CLASSES) {
      const pb = g.b.flatMap((i) => (tB[i] ?? []).filter((t) => t.role !== undefined && cls.has(t.key)));
      const pa = g.a.flatMap((j) => (tA[j] ?? []).filter((t) => t.role !== undefined && cls.has(t.key)));
      if (pb.length < 2 || pb.length !== pa.length || pb.length > 50) continue;
      if ([...pb, ...pa].some((t) => LIST_ROLE.has(t.role))) continue;
      const kb = pb.map((t) => t.key);
      const ka = pa.map((t) => t.key);
      if (kb.join('|') === ka.join('|') || [...kb].sort().join('|') !== [...ka].sort().join('|')) continue;
      if (pb.map((t) => t.role).join('|') === pa.map((t) => t.role).join('|')) out.push({ kind: 'reordered', g, sb: pb, sa: pa });
    }
  }
  return out;
}

// ── 당위·추측 표지 — im-not-ai verify_gates.py 의 DEONTIC_RE·HEDGE_RE 갈래를 옮기고 법령 글 꼴을 더했다.
// 당위 「-아/어/여야 하다」의 「야」 앞 음절은 받침 없는 열린 음절이고 가운데 소리가 ㅏㅐㅓㅔㅕㅘㅙㅚㅝㅞ 중 하나다(있어야·해야·하여야·되어야)
const OPEN_JUNG = new Set([0, 1, 4, 5, 6, 9, 10, 11, 14, 15]);
let OPEN = '';
for (let c = 0; c < 11172; c += 28) if (OPEN_JUNG.has(Math.floor(c / 28) % 21)) OPEN += String.fromCharCode(0xac00 + c);
const DEONTIC = new RegExp(
  `[${OPEN}]야\\s*(?:한다|합니다|했다|하였다|하며|하고|하는|할|함|했어요|했어|해요|해서|해도|하지요|하죠|해)|[${OPEN}]야만` +
    '|필요가\\s*있|필요하다|필요합니다|요구된다|요구됩니다|시급하다|시급합니다|촉구한다|당부한다' +
    '|[가-힣]지\\s*않으면\\s*안\\s*(?:된다|됩니다|되며|돼|되)' +
    // 법령 글의 금지 — 「~하여서는 아니 된다」「~서는 안 된다」「~넘지 못한다」
    '|아니\\s*(?:된다|됩니다|되며|되고|됨)|서는\\s*안\\s*(?:된다|됩니다|되며|됨)|지\\s*못한다|지\\s*못합니다|지\\s*못하며|지\\s*못함',
  'g',
);
const HEDGE = new RegExp(
  '수\\s*있|수도\\s*있|것으로\\s*(?:보인다|보입니다|보임|전망|판단|추정|알려)|가능성[이도은을에]' +
    '|[로으]\\s*보인다|[로으]\\s*보입니다|[로으]\\s*보임|판단된다|판단됩니다|판단됨|여겨진다|여겨집니다' +
    // 「듯하」는 활용형(듯한·듯합니다·듯했다)까지 — 완성형이라 하·해 줄 음절 전체로 받는다
    '|해석된다|추정된다|기대된다|우려된다|듯[하-햏]|듯\\s*싶|것\\s*같다' +
    '|전망(?:이다|된다|한다|했다|입니다|이며|하고)|예상(?:된다|이다|한다|했다|됩니다)|단정하기|여지(?:도|가)?\\s*있|배제할\\s*수\\s*없' +
    // 법령 글의 유보 — 「사료된다」「볼 여지」「보기 어렵다」
    '|사료된다|사료됩니다|볼\\s*여지|기\\s*어렵|[고로]\\s*(?:본다|봅니다|판단한다|판단합니다)',
  'g',
);
// 권고 — 당위보다 약한 꼴(바람직하다·권장한다). 「하여야 한다 → 하는 것이 바람직하다」는 당위 사라짐 + 권고 생김
const RECOMMEND = /바람직(?:하다|합니다|하며|하고|한|함)|권장(?:한다|합니다|된다|됩니다)|권고(?:한다|합니다|된다|됩니다)/g;
const MODALITIES = [['당위', DEONTIC], ['추측', HEDGE], ['권고', RECOMMEND]];

// ── 부정 표현(극성) — 않·못·아니·없·안 + 「보기 어렵다」 + 뜻이 뒤집히는 법률 낱말(부당·위법·무효·불가 등).
// 이중 부정 당위(~지 않으면 안 된다)와 대구(~가 아니라)는 극성이 아니라 각자 항목에서 본다
const NEG = /않|못\s*[하-햏]|(?<![가-힣])못\s+(?=[가-힣])|아니|아닌|아님|없|모[르른를릅]|몰[라랐]|(?<![가-힣])안\s+(?=[가-힣])|기\s*(?:는\s*)?(?:어렵|힘들)|부당|불법|위법|무효|불가|불리[하한함할해]|불인정|불승인|불허|부적법|부적절|미지급|미달|미충족|미흡|비정상/g;
// 극성이 아닌 꼴 — 이중 부정 당위(~지 않으면 안 된다), 대구(~가 아니라), 덧붙임(~뿐만 아니라)
const NOT_POLARITY = /지\s*않으면\s*(?:안|아니)\s*(?:된다|됩니다|되며|되고|돼|되|됨)|(?:가|이)\s*아니라|이기\s*이전에|되기\s*이전에|이기보다|뿐(?:만)?\s*(?:아니라|아니고)/g;

// ── 대구 — 「X가/이 아니라 Y」「~이기 이전에」「~이기보다」(im-not-ai metrics_v2.py C-8). 줄이는 것은 정상 윤문, 전멸만 훼손.
// 남은 대구는 짝 문장에서 두 항(X·Y)이 맞바뀌었는지 본다
const ANTITHESIS = /(?:가|이)\s*아니라|이기\s*이전에|되기\s*이전에|이기보다/g;

// 표지가 붙은 말(어절 앞 두 글자) — 표지가 같은 어절 안에서 시작할 때만 본다(어절 첫머리 표지는 붙은 말이 없다 → '').
// 가벼운 동사(하·해·되·돼)에 붙었으면 그 앞 어절(조사를 뗀 것) — 「통지하여야 → 통지를 하여야」는 같은 말
const PARTICLE = /(?:이다|이며|이고|에게|으로|은|는|이|가|을|를|의|에|도|만|와|과|로)$/;
const stem = (w) => Array.from(w).slice(0, 2).join('');
function hostOf(raw, at) {
  let s = at;
  while (s > 0 && !/\s/.test(raw[s - 1])) s--;
  if (s === at) return '';
  const pre = raw.slice(s, at);
  if (!/^[하해되돼]$/.test(pre)) return stem(pre);
  let e = s;
  while (e > 0 && /\s/.test(raw[e - 1])) e--;
  let b = e;
  while (b > 0 && !/\s/.test(raw[b - 1])) b--;
  const w = raw.slice(b, e).replace(PARTICLE, '');
  return w ? stem(w) : '';
}
function nextWord(raw, from) {
  let s = from;
  while (s < raw.length && /\s/.test(raw[s])) s++;
  let e = s;
  while (e < raw.length && !/\s/.test(raw[e])) e++;
  const w = raw.slice(s, e).replace(/[.,!?。]+$/, '');
  return stem(w.length > 1 ? w.replace(PARTICLE, '') || w : w);
}
const wordsOf = (raw) => raw.split(/\s+/).filter(Boolean).map((w) => stem(w));

/** 무리마다 표지 개수(양방향)와, 개수는 같은데 표지가 다른 절(문장 안에 원래 있던 다른 말)로 옮겨 붙었는지 */
function markerItem(name, B, A, groups, partnerB, partnerA, kinds, strip) {
  // 문장이 줄바꿈으로 이어지면(지급해야⏎한다) 다음 줄 앞머리를 붙여 보고, 이 문장 안에서 시작한 표지만 센다
  const cnt = (P, rx) => P.units.map((u) => {
    if (u.block) return 0;
    const s = strip ? strip(u.raw + u.tail) : u.raw + u.tail;
    rx.lastIndex = 0;
    let n = 0;
    for (let m; (m = rx.exec(s)) !== null && m.index < u.raw.length; ) {
      n++;
      if (!m[0]) rx.lastIndex++;
    }
    rx.lastIndex = 0;
    return n;
  });
  const cb = kinds.map(([, rx]) => cnt(B, rx));
  const ca = kinds.map(([, rx]) => cnt(A, rx));
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);
  const count = Object.fromEntries(kinds.map(([kind], k) => [kind, { before: sum(cb[k]), after: sum(ca[k]) }]));
  const hosts = (P, list, rx) => {
    const h = [];
    for (const u of list) for (const m of P.units[u].raw.matchAll(rx)) h.push(hostOf(P.units[u].raw, m.index));
    return h;
  };
  const changes = [];
  for (const g of groups) {
    kinds.forEach(([kind, rx], k) => {
      const nb = g.b.reduce((s, i) => s + cb[k][i], 0);
      const na = g.a.reduce((s, j) => s + ca[k][j], 0);
      if (nb > na) {
        let left = nb - na;
        const order = [...g.b.filter((i) => cb[k][i] > (partnerB.has(i) ? ca[k][partnerB.get(i)] : 0)), ...g.b];
        for (const i of new Set(order)) {
          if (left <= 0) break;
          if (!cb[k][i]) continue;
          changes.push({ kind: 'lost', name: kind, i, j: partnerB.has(i) ? partnerB.get(i) : -1 });
          left -= Math.max(1, cb[k][i] - (partnerB.has(i) ? ca[k][partnerB.get(i)] : 0));
        }
      } else if (na > nb) {
        let left = na - nb;
        const order = [...g.a.filter((j) => ca[k][j] > (partnerA.has(j) ? cb[k][partnerA.get(j)] : 0)), ...g.a];
        for (const j of new Set(order)) {
          if (left <= 0) break;
          if (!ca[k][j]) continue;
          changes.push({ kind: 'gained', name: kind, i: partnerA.has(j) ? partnerA.get(j) : -1, j });
          left -= Math.max(1, ca[k][j] - (partnerA.has(j) ? cb[k][partnerA.get(j)] : 0));
        }
      } else if (nb && g.b.length && g.a.length && name === 'modality') {
        // 개수는 같다 — 표지가 붙은 말이 바뀌었고, 새로 붙은 말이 윤문 전에도 (표지 없이) 있었거나 표지를 잃은 말이 윤문 뒤에도
        // (표지 없이) 남아 있으면 표지가 다른 절로 옮겨 붙은 것. 붙은 말을 통째로 바꾼 것(통지하여야 → 알려야)은 여기서 보지 않는다
        const hb = hosts(B, g.b, rx).filter(Boolean);
        const ha = hosts(A, g.a, rx).filter(Boolean);
        const hbSet = new Set(hb);
        const haSet = new Set(ha);
        const gainedH = ha.filter((h) => !hbSet.has(h));
        const lostH = hb.filter((h) => !haSet.has(h));
        if (gainedH.length && lostH.length) {
          const wb = new Set(g.b.flatMap((i) => wordsOf(B.units[i].raw)));
          const wa = new Set(g.a.flatMap((j) => wordsOf(A.units[j].raw)));
          if (gainedH.some((h) => wb.has(h)) || lostH.some((h) => wa.has(h))) changes.push({ kind: 'moved', name: kind, i: g.b[0], j: g.a[0] });
        }
      }
    });
  }
  changes.sort((x, y) => (x.i < 0 ? 1e9 : x.i) - (y.i < 0 ? 1e9 : y.i) || x.j - y.j);
  return itemOf(name, changes, count, (l) => {
    const e = { kind: l.kind, [name === 'modality' ? 'modality' : 'form']: l.name, line: { before: l.i >= 0 ? B.units[l.i].line : null, after: l.j >= 0 ? A.units[l.j].line : null } };
    if (l.i >= 0) e.before = clip(safeOf(B.units[l.i]).replace(/\s+/g, ' ').trim());
    if (l.j >= 0) e.after = clip(safeOf(A.units[l.j]).replace(/\s+/g, ' ').trim());
    return e;
  });
}

function antithesisItem(B, A, groups) {
  const cnt = (P) => P.units.map((u) => (u.block ? 0 : countRx(ANTITHESIS, u.raw)));
  const cb = cnt(B);
  const before = cb.reduce((s, x) => s + x, 0);
  const after = cnt(A).reduce((s, x) => s + x, 0);
  const changes = [];
  if (before >= ANTITHESIS_MIN && after === 0) {
    B.units.forEach((u, i) => {
      if (cb[i] > 0) changes.push({ kind: 'annihilated', i, j: -1 });
    });
  }
  // 두 항 맞바꿈 — 「갑이 아니라 을」 → 「을이 아니라 갑」
  const terms = (P, list) => list.flatMap((u) => [...P.units[u].raw.matchAll(ANTITHESIS)].map((m) => `${hostOf(P.units[u].raw, m.index)}\u0000${nextWord(P.units[u].raw, m.index + m[0].length)}`));
  for (const g of groups) {
    if (!g.b.length || !g.a.length) continue;
    const tb = terms(B, g.b);
    if (!tb.length) continue;
    const ta = new Set(terms(A, g.a));
    const sb = new Set(tb);
    for (const t of tb) {
      const [x, y] = t.split('\u0000');
      const flip = `${y}\u0000${x}`;
      if (x !== y && ta.has(flip) && !ta.has(t) && !sb.has(flip)) {
        changes.push({ kind: 'reordered', i: g.b[0], j: g.a[0] });
        break;
      }
    }
  }
  return itemOf('antithesis', changes, { before, after }, (c) => {
    const e = { kind: c.kind, line: { before: B.units[c.i].line, after: c.j >= 0 ? A.units[c.j].line : null }, before: clip(safeOf(B.units[c.i]).replace(/\s+/g, ' ').trim()) };
    if (c.j >= 0) e.after = clip(safeOf(A.units[c.j]).replace(/\s+/g, ' ').trim());
    return e;
  });
}

// ── [관련 …] 블록 — 글자 그대로(줄머리 > · # · ** · 공백 폭은 보지 않는다). 같은 글끼리 먼저 맞추고, 남은 것은 머리줄이 같은 것 → 차례로 짝
function blocksItem(B, A) {
  // 줄 세우기 — 값마다 차례 목록과 다음 자리(at). 쓴 것은 taken 에 넣고 건너뛴다(블록이 많아도 선형)
  const queues = (list, keyOf) => {
    const m = new Map();
    for (const x of list) {
      const q = m.get(keyOf(x));
      if (q) q.list.push(x);
      else m.set(keyOf(x), { list: [x], at: 0 });
    }
    return m;
  };
  const taken = new Set();
  const nextOf = (q) => {
    if (!q) return null;
    while (q.at < q.list.length && taken.has(q.list[q.at])) q.at++;
    return q.at < q.list.length ? q.list[q.at] : null;
  };
  const byKey = queues(A.blocks, (b) => b.key);
  const ub = [];
  // 글자가 같은 블록끼리의 차례 — 쟁점 1 판결과 쟁점 2 판결의 자리를 맞바꾸면 블록은 그대로여도 어느 판단을 받치는지가 바뀐다
  const order = [];
  for (const b of B.blocks) {
    const a = nextOf(byKey.get(b.key));
    if (a) {
      taken.add(a);
      order.push([b, a]);
    } else ub.push(b);
  }
  const swapped = order.find(([, a], k) => k > 0 && a.line < order[k - 1][1].line);
  const ua = A.blocks.filter((b) => !taken.has(b));
  const byHead = queues(ua, (b) => b.head);
  const all = { list: ua, at: 0 };
  const changes = [];
  for (const b of ub) {
    const a = nextOf(byHead.get(b.head)) ?? nextOf(all);
    if (a) {
      taken.add(a);
      changes.push({ kind: 'changed', b, a });
    } else changes.push({ kind: 'removed', b });
  }
  for (const a of ua) if (!taken.has(a)) changes.push({ kind: 'added', a });
  if (swapped) changes.push({ kind: 'reordered', b: swapped[0], a: swapped[1] });
  // 못 읽은 판례 머리줄 아래 — 같은 글끼리 맞추고, 남은 것은 차례대로 바뀜·빠짐·더해짐
  const cq = queues(A.candBlocks, (b) => b.key);
  const cb = B.candBlocks.filter((b) => {
    const a = nextOf(cq.get(b.key));
    if (a) taken.add(a);
    return !a;
  });
  const ca = A.candBlocks.filter((a) => !taken.has(a));
  for (let k = 0; k < Math.max(cb.length, ca.length); k++) {
    changes.push({ kind: cb[k] && ca[k] ? 'changed' : cb[k] ? 'removed' : 'added', b: cb[k], a: ca[k] });
  }
  const firstDiff = (x, y) => {
    let p = 0;
    while (p < x.length && p < y.length && x[p] === y[p]) p++;
    return p;
  };
  // 바뀐 블록은 처음 달라진 글자가 든 줄, 빠짐·더해짐은 머리줄
  const lineAt = (blk, p) => blk.parts.reduce((ln, x) => (x.at <= p ? x.line : ln), blk.line);
  const extra = B.cand.length || A.cand.length ? { unrecognized: { before: B.cand, after: A.cand } } : undefined;
  return itemOf('blocks', changes, { before: B.blocks.length, after: A.blocks.length }, (c) => {
    const p = c.kind === 'changed' ? firstDiff(c.b.key, c.a.key) : 0;
    const e = { kind: c.kind, line: { before: c.b ? lineAt(c.b, p) : null, after: c.a ? lineAt(c.a, p) : null } };
    if ((c.b ?? c.a).cand) e.unrecognized = true;
    const s = Math.max(0, p - SNIP);
    if (c.b) e.before = (s ? '…' : '') + clip(hide(c.b.key.slice(s)), SNIP * 3);
    if (c.a) e.after = (s ? '…' : '') + clip(hide(c.a.key.slice(s)), SNIP * 3);
    return e;
  }, extra);
}

const place = (tok) => tok.map((list, u) => list?.map((t) => Object.assign(t, { u })) ?? null);

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
  const anchors = dissolveShort(anchorPairs(B.units.map((u) => u.key), A.units.map((u) => u.key)), B.units, A.units);
  const hunks = hunksOf(anchors, B.units.length, A.units.length);
  const { entries, groups, partnerB, partnerA } = pairUp(B, A, hunks);
  const cr = changeRate(B.units, A.units, anchors, hunks, entries);
  const level = rateLevel(cr.rate);

  const numB = place(numbersOf(B.units));
  const numA = place(numbersOf(A.units));
  const flatCount = (tok) => tok.reduce((s, l) => s + (l?.length ?? 0), 0);
  const dispOf = (P, t) => norm(safeOf(P.units[t.u]).slice(t.start, t.start + t.len));
  const numbers = itemOf('numbers', seqDiff(groups, numB, numA), { before: flatCount(numB), after: flatCount(numA) },
    tokenShow(B, A, (c) => (c.kind === 'reordered'
      ? { value: { before: c.sb.map((t) => dispOf(B, t)).join(', '), after: c.sa.map((t) => dispOf(A, t)).join(', ') } }
      : { value: { ...(c.b ? { before: dispOf(B, c.b) } : {}), ...(c.a ? { after: dispOf(A, c.a) } : {}) } })));

  const qB = quotesOf(B);
  const qA = quotesOf(A);
  const flatAfter = norm(A.lines.join('\n'));
  // 인용 글이 부호 없이 남았으면 「부호 빠짐」. 글 전체에서 찾는 일은 같은 글마다 한 번, 실을 건수(CHANGE_CAP)를 채울 때까지만 한다
  // (그 뒤 것은 total 에만 들어가므로 바뀜·빠짐 그대로 센다)
  const inAfter = new Map();
  const remains = (k) => {
    if (!inAfter.has(k)) inAfter.set(k, flatAfter.includes(k));
    return inAfter.get(k);
  };
  const qChanges = [];
  // 여러 줄 인용은 여는 줄 문장에 붙는다 — 여는 줄이 같아도(닻) 닫는 줄까지 글이 바뀌었을 수 있어 닻 짝도 견준다
  const anchorGroups = anchors.filter(([i, j]) => qB[i]?.length || qA[j]?.length).map(([i, j]) => ({ b: [i], a: [j] }));
  for (const c of seqDiff([...groups, ...anchorGroups], qB, qA)) {
    if (qChanges.length > CHANGE_CAP || !c.b || c.kind === 'reordered' || !remains(c.b.key)) qChanges.push(c);
    else if (c.kind === 'changed') qChanges.push({ kind: 'unquoted', b: c.b }, { kind: 'added', a: c.a });
    else qChanges.push({ kind: 'unquoted', b: c.b });
  }
  const quotes = itemOf('quotes', qChanges, { before: flatCount(qB), after: flatCount(qA) }, tokenShow(B, A, () => ({})));

  const termList = LAW_FORM_GENRES.has(genre) ? [...LAW_FORM_TERMS, ...LABOR_TERMS] : LABOR_TERMS;
  const tB = place(termsOf(B.units, termList));
  const tA = place(termsOf(A.units, termList));
  const termCount = {};
  for (const [key] of termList) {
    let b = 0;
    let a = 0;
    for (const l of tB) for (const t of l ?? []) if (t.key === key) b++;
    for (const l of tA) for (const t of l ?? []) if (t.key === key) a++;
    if (a || b) termCount[key] = { before: b, after: a };
  }
  // 용어는 차례를 보지 않는다(어순 바꿈은 윤문) — 당사자 용어의 자리 맞바꿈만 따로 본다
  const terms = itemOf('terms', [...seqDiff(groups, tB, tA, false), ...partySwaps(groups, tB, tA)], termCount,
    tokenShow(B, A, (c) => {
      if (c.kind === 'reordered') return { term: c.sb.map((t) => t.key).join(', '), to: c.sa.map((t) => t.key).join(', ') };
      if (c.kind === 'changed') return { term: c.b.key, ...(c.a.key !== c.b.key ? { to: c.a.key } : {}) };
      return { term: (c.b ?? c.a).key };
    }));

  const items = {
    numbers,
    quotes,
    blocks: blocksItem(B, A),
    terms,
    modality: markerItem('modality', B, A, groups, partnerB, partnerA, MODALITIES),
    polarity: markerItem('polarity', B, A, groups, partnerB, partnerA, [['부정', NEG]], (s) => s.replace(NOT_POLARITY, (m) => ' '.repeat(m.length))),
    antithesis: antithesisItem(B, A, groups),
  };
  const damaged = Object.keys(items).filter((k) => items[k].status === DAMAGED);
  const status = level === '중단' ? OVER : damaged.length ? DAMAGED : level ? OVER : KEPT;
  // 보여 주는 값은 내림 — 「30%」인데 경고가 없는 일이 없게(문턱은 내리지 않은 값으로 본다)
  const rate = { rate: Math.floor(cr.rate * 10_000 + 1e-9) / 10_000, percent: Math.floor(cr.rate * 1000 + 1e-9) / 10 };
  if (level) rate.level = level;
  if (cr.approximate) rate.approximate = true;
  return { status, genre, changeRate: rate, damaged, items };
}

/** 주민번호 모양 찾기 전 — NFKC(전각 숫자)·폭 없는 문자 지움·대시류를 - 로. 줄 번호는 바뀌지 않는다 */
const rrnView = (s) => String(s ?? '').normalize('NFKC').replace(ZW, '').replace(DASHES, '-');

/** before·after 중 주민번호 모양이 있으면 멈춤 응답(어느 쪽 몇 줄인지, 줄마다 50줄까지), 없으면 null */
export function rewriteRrnStop(before, after) {
  const b = rrnLines(rrnView(before));
  const a = rrnLines(rrnView(after));
  if (!b.length && !a.length) return null;
  return { ok: false, error: PROSE_RRN_STOP, rrnLines: { before: b.slice(0, RRN_LINES_MAX), after: a.slice(0, RRN_LINES_MAX) } };
}

/** check_rewrite 응답 객체(주민번호 검사 뒤). 오류 글에 문서 글이 실리지 않게 — 응답은 고정 코드, stderr 에는 오류 종류와 「at」 줄만 */
export function rewriteResult(a) {
  try {
    return { ok: true, ...checkRewrite(a.before, a.after, { genre: a.genre }) };
  } catch (e) {
    console.error('[check_rewrite]', stackOnly(e));
    return { ok: false, error: 'REWRITE_CHECK_FAILED' };
  }
}
