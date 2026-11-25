// 파이썬 re·str 의 뜻을 JS 로 옮긴 도움 함수 — 의미범주(semantic.mjs)·AI 수사(rhetoric.mjs)가 함께 쓴다.
// 두 검사는 파이썬 검사기(발송 게이트)를 옮긴 것이라 줄 단위로 같은 결과를 내야 한다(대조 = 게이트 출력 줄 차이 0).
// 위치는 모두 UTF-16 코드 단위다(파이썬은 코드포인트). 위치끼리 비교·자르기만 하면 같고,
// 글자 수를 세거나(len) n 글자를 떼어 낼 때(s[:n] s[-n:] s[i:i+n])만 cp* 함수를 쓴다.
import { cpBack, cpFwd, cpHead, cpLen, isWs, lstrip, minLen, strip, toJsSource, WS_CLASS } from './check.mjs';

export { cpHead, cpLen, isWs, lstrip, strip, WS_CLASS };

const isHi = (c) => c >= 0xd800 && c <= 0xdbff;
const isLo = (c) => c >= 0xdc00 && c <= 0xdfff;
const stepAt = (s, i) => (isHi(s.charCodeAt(i)) && isLo(s.charCodeAt(i + 1)) ? 2 : 1);
const midPair = (s, i) => i > 0 && isLo(s.charCodeAt(i)) && isHi(s.charCodeAt(i - 1));

/** 파이썬 일치 객체(re.Match)의 쓰는 부분만 — 지나지 않은 묶음은 group = null, start·end = -1 */
export class PyMatch {
  constructor(m) {
    this.m = m;
  }
  #range(g) {
    const ix = this.m.indices;
    if (typeof g === 'string') {
      if (!ix.groups || !Object.hasOwn(ix.groups, g)) throw new Error('no such group');
      return ix.groups[g];
    }
    if (!Number.isInteger(g) || g < 0 || g >= this.m.length) throw new Error('no such group');
    return ix[g];
  }
  /** @param {number|string} [g] 번호 또는 이름 */
  group(g = 0) {
    this.#range(g);
    const v = typeof g === 'string' ? this.m.groups[g] : this.m[g];
    return v === undefined ? null : v;
  }
  /** @param {number|string} [g] */
  start(g = 0) {
    const r = this.#range(g);
    return r ? r[0] : -1;
  }
  /** @param {number|string} [g] */
  end(g = 0) {
    const r = this.#range(g);
    return r ? r[1] : -1;
  }
  groups() {
    return Array.from(this.m).slice(1).map((v) => (v === undefined ? null : v));
  }
  groupdict() {
    const o = {};
    for (const k of Object.keys(this.m.groups ?? {})) o[k] = this.m.groups[k] ?? null;
    return o;
  }
}

/**
 * 파이썬 식 하나(re.compile). src 는 파이썬 문법 — toJsSource 로 옮기고(\b·\B 받음) 옮길 수 없으면 던진다.
 * 위치 인자 pos 는 파이썬과 같이 ^·\A 를 글 처음에만 맞춘다(옮긴 ^ 가 뒤돌아보기라 그대로 맞는다).
 */
export class PyRe {
  constructor(src, { multiline = false } = {}) {
    this.src = src;
    this.js = toJsSource(src, { multiline, word: true });
    this.g = new RegExp(this.js, 'gud');
    this.y = new RegExp(this.js, 'yud');
    this.full = null;
    this.canEmpty = minLen(this.js) === 0;
  }
  // 서로게이트 쌍 가운데(앞 반쪽 뒤)는 파이썬(코드포인트)에 없는 자리다. V8 은 u 플래그에서도 둘러보기로 시작하는 식을
  // 그 자리에서 맞출 때가 있어, 거기서 시작한 일치는 버리고 다음 코드포인트부터 다시 찾는다(y 는 그 자리 하나뿐이라 없음)
  static #at(rx, s, pos) {
    let p = pos;
    for (;;) {
      rx.lastIndex = p;
      const m = rx.exec(s);
      rx.lastIndex = 0;
      if (!m || !midPair(s, m.index)) return m;
      if (rx.sticky) return null;
      p = m.index + 1;
    }
  }
  /** pattern.search(s, pos, endpos) */
  search(s, pos = 0, endpos = undefined) {
    const t = endpos === undefined || endpos >= s.length ? s : s.slice(0, Math.max(0, endpos));
    const p = Math.max(0, pos);
    if (p > t.length) return null;
    const m = PyRe.#at(this.g, t, p);
    return m ? new PyMatch(m) : null;
  }
  /** pattern.match(s, pos) — 그 자리에서만 */
  match(s, pos = 0) {
    if (pos > s.length) return null;
    const m = PyRe.#at(this.y, s, Math.max(0, pos));
    return m ? new PyMatch(m) : null;
  }
  /** pattern.fullmatch(s) — 갈래가 앞에서 끝나도 끝까지 가는 갈래를 찾는다 */
  fullmatch(s) {
    this.full ??= new RegExp(`(?:${this.js})(?![\\s\\S])`, 'yud');
    const m = PyRe.#at(this.full, s, 0);
    return m ? new PyMatch(m) : null;
  }
  test(s) {
    return this.search(s) !== null;
  }
  /**
   * pattern.finditer(s) — 빈 글자에 맞을 수 있는 식은 받지 않는다(파이썬 3.7+ 의 빈 일치 규칙을 옮기지 않는다.
   * 팩 검증이 되풀이하는 칸에 그런 식을 두지 못하게 막는다)
   */
  finditer(s) {
    if (this.canEmpty) throw new Error('empty-match pattern');
    const out = [];
    let pos = 0;
    for (;;) {
      const m = PyRe.#at(this.g, s, pos);
      if (!m) break;
      if (m[0] === '') throw new Error('empty match');
      out.push(new PyMatch(m));
      pos = m.index + m[0].length;
    }
    return out;
  }
  /** pattern.findall(s) — 묶음이 없으면 전체, 하나면 그 묶음(지나지 않았으면 ''), 여럿이면 배열 */
  findall(s) {
    return this.finditer(s).map((m) => {
      const gs = m.groups();
      if (!gs.length) return m.group(0);
      if (gs.length === 1) return gs[0] ?? '';
      return gs.map((v) => v ?? '');
    });
  }
  /**
   * pattern.sub(repl, s, count) — repl 은 함수(PyMatch → 글) 또는 \ 없는 글
   * @param {string | ((m: PyMatch) => string)} repl
   * @param {string} s
   * @param {number} [count]
   */
  sub(repl, s, count = 0) {
    if (typeof repl === 'string' && repl.includes('\\')) throw new Error('unsupported');
    let out = '';
    let last = 0;
    let k = 0;
    for (const m of this.finditer(s)) {
      if (count && k >= count) break;
      out += s.slice(last, m.start()) + (typeof repl === 'function' ? repl(m) : repl);
      last = m.end();
      k++;
    }
    return out + s.slice(last);
  }
}

/** re.compile 과 같다(옮길 수 없는 식이면 던진다) */
export const pyCompile = (src, o) => new PyRe(src, o);

/** str.split() — 파이썬 공백 덩어리로 나누고 빈 조각은 버린다 */
export function pySplit(s) {
  const out = [];
  let cur = '';
  for (const ch of s) {
    if (isWs(ch)) {
      if (cur) { out.push(cur); cur = ''; }
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// str.splitlines() 의 줄 경계
const LINE_SEP = new RegExp(`\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85${String.fromCharCode(0x2028, 0x2029)}]`);
/** str.splitlines() — 끝 줄바꿈은 빈 줄을 만들지 않는다 */
export function splitlines(s) {
  if (s === '') return [];
  const parts = s.split(LINE_SEP);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** 파이썬이 글 파일을 읽을 때(보편 줄바꿈)처럼 \r\n·\r 을 \n 으로 */
export const universalNewlines = (s) => s.replace(/\r\n?/g, '\n');

/** str.isspace() */
export const pyIsspace = (s) => s.length > 0 && [...s].every(isWs);

const charSet = (chars) => new Set([...chars]);
/** str.strip(chars)·lstrip(chars)·rstrip(chars) — chars 는 코드포인트 모음 */
export function lstripChars(s, chars) {
  const set = charSet(chars);
  let a = 0;
  while (a < s.length) {
    const w = stepAt(s, a);
    if (!set.has(s.slice(a, a + w))) break;
    a += w;
  }
  return s.slice(a);
}
export function rstripChars(s, chars) {
  const set = charSet(chars);
  let b = s.length;
  while (b > 0) {
    const a = cpBack(s, b, 1);
    if (!set.has(s.slice(a, b))) break;
    b = a;
  }
  return s.slice(0, b);
}
export const stripChars = (s, chars) => rstripChars(lstripChars(s, chars), chars);
/** str.rstrip() — 파이썬 공백 */
export function rstrip(s) {
  let b = s.length;
  while (b > 0 && isWs(s[b - 1])) b--;
  return s.slice(0, b);
}

/** s[-n:] (n 은 코드포인트, n = 0 이면 파이썬처럼 글 전체) */
export const cpTail = (s, n) => (n <= 0 ? s : s.slice(cpBack(s, s.length, n)));
/** s[i:i+n] — i 는 코드 단위 위치, n 은 코드포인트 */
export const cpAhead = (s, i, n) => s.slice(i, cpFwd(s, i, n));
/** s[i-n:i] — i 는 코드 단위 위치, n 은 코드포인트(앞이 모자라면 처음부터) */
export const cpBehind = (s, i, n) => s.slice(cpBack(s, i, n), i);
/** 마지막 코드포인트(s[-1:]) */
export const cpLast = (s) => cpTail(s, 1);
