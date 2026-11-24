// 퇴고 — 문서 문체 점검(결정론). 규칙·검출식·기준값은 코드가 아니라 「팩」(JSON)에 있다.
//   · 범용 팩 = 이 폴더 generic-pack.json(im-not-ai lexicon 유래, MIT — THIRD_PARTY_NOTICES.md)
//   · 그 밖의 팩 = env PROSE_PACK_DIR(절대 경로)의 *.json. 저장소에 두지 않는 팩은 이 길로만 읽는다.
// ★ 출력 정책 — 공개 팩은 걸린 글자·고칠 말·규칙 id 까지(full) 낸다. 비공개 팩(private: true, 그리고 PROSE_PACK_DIR 에서 읽은
//   팩 중 private: false 라고 적지 않은 것)은 줄·칸·길이·등급·짧은 사유·응답별 참조값만(brief) 내고,
//   env PROSE_ALLOW_FULL=1 일 때만 full 로 낸다. detail 'brief' 를 주면 모든 팩을 brief 로 낸다.
//   brief 는 「한 번 호출로 규칙 원문이 보이지 않게」 하는 장치다. 위치·길이를 모으면 걸린 글자는 원고에서 보이므로,
//   여러 번 호출해 규칙을 좁히는 것까지 막지는 못한다(그 방어는 비공개 팩을 원격판에 싣지 않는 것).
// ★ 팩 정규식은 파이썬 re 문법으로 쓴다 — 컴파일할 때 파이썬 뜻으로 옮기고(toJsSource), 같은 뜻으로 옮길 수 없는 것은 받지 않는다.
// ★ 팩 하나가 깨지거나 돌다 멈추면 그 팩만 빼고 incomplete 로 알린다. 오류 글에는 팩 내용(식·이름·규칙 id)을 싣지 않는다.
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import GENERIC from './generic-pack.json';

export const GENERIC_PACK = GENERIC;
export const GENRES = ['legal', 'consulting', 'lecture', 'general'];
// 다른 이름으로 부르는 장르(공문 = general)
export const GENRE_ALIAS = { official: 'general' };
export const HIT_CAP = 500;
// 후보 앞뒤 몇 글자(코드포인트) 안에서 제외어를 찾는가 — im-not-ai lexical_layer.py EXCLUDE_WINDOW 와 같다(단 줄 안에서만)
export const EXCLUDE_WINDOW = 12;
// 이 길이(UTF-16) 이하인 줄만 합친 식으로 먼저 거른다
const MERGE_MAX_LINE = 2000;
// PROSE_PACK_DIR 에서 읽은 팩(private 표시가 없으면 비공개로 본다)
const FROM_DIR = new WeakSet();

// 파이썬 str.isspace 와 같은 공백(JS \s 와 달리 BOM 을 넣지 않고 U+0085·U+001C~1F 를 넣는다). 모두 BMP 글자다
const WS_CLASS = '\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
// 파이썬 re 의 \d(str 패턴) = 유니코드 Nd. JS 의 \p{Nd} 는 Node 판마다 Unicode 판이 달라(Node 24 = 17.0) 판정이 갈린다 —
// 파이썬 3.13(Unicode 15.1) 범위로 고정한다(261124). 다시 만들 때는 파이썬에서 re.fullmatch(r"\d", chr(c)) 인 코드포인트를 묶는다. 64개 범위·680자
const ND = '\\u{30}-\\u{39}\\u{660}-\\u{669}\\u{6F0}-\\u{6F9}\\u{7C0}-\\u{7C9}\\u{966}-\\u{96F}\\u{9E6}-\\u{9EF}\\u{A66}-\\u{A6F}\\u{AE6}-\\u{AEF}\\u{B66}-\\u{B6F}\\u{BE6}-\\u{BEF}\\u{C66}-\\u{C6F}\\u{CE6}-\\u{CEF}\\u{D66}-\\u{D6F}\\u{DE6}-\\u{DEF}\\u{E50}-\\u{E59}\\u{ED0}-\\u{ED9}\\u{F20}-\\u{F29}\\u{1040}-\\u{1049}\\u{1090}-\\u{1099}\\u{17E0}-\\u{17E9}\\u{1810}-\\u{1819}\\u{1946}-\\u{194F}\\u{19D0}-\\u{19D9}\\u{1A80}-\\u{1A89}\\u{1A90}-\\u{1A99}\\u{1B50}-\\u{1B59}\\u{1BB0}-\\u{1BB9}\\u{1C40}-\\u{1C49}\\u{1C50}-\\u{1C59}\\u{A620}-\\u{A629}\\u{A8D0}-\\u{A8D9}\\u{A900}-\\u{A909}\\u{A9D0}-\\u{A9D9}\\u{A9F0}-\\u{A9F9}\\u{AA50}-\\u{AA59}\\u{ABF0}-\\u{ABF9}\\u{FF10}-\\u{FF19}\\u{104A0}-\\u{104A9}\\u{10D30}-\\u{10D39}\\u{11066}-\\u{1106F}\\u{110F0}-\\u{110F9}\\u{11136}-\\u{1113F}\\u{111D0}-\\u{111D9}\\u{112F0}-\\u{112F9}\\u{11450}-\\u{11459}\\u{114D0}-\\u{114D9}\\u{11650}-\\u{11659}\\u{116C0}-\\u{116C9}\\u{11730}-\\u{11739}\\u{118E0}-\\u{118E9}\\u{11950}-\\u{11959}\\u{11C50}-\\u{11C59}\\u{11D50}-\\u{11D59}\\u{11DA0}-\\u{11DA9}\\u{11F50}-\\u{11F59}\\u{16A60}-\\u{16A69}\\u{16AC0}-\\u{16AC9}\\u{16B50}-\\u{16B59}\\u{1D7CE}-\\u{1D7FF}\\u{1E140}-\\u{1E149}\\u{1E2F0}-\\u{1E2F9}\\u{1E4F0}-\\u{1E4F9}\\u{1E950}-\\u{1E959}\\u{1FBF0}-\\u{1FBF9}';
const WS_SET = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000].map((c) => String.fromCharCode(c)));
for (let c = 0x2000; c <= 0x200a; c++) WS_SET.add(String.fromCharCode(c));
const isWs = (ch) => WS_SET.has(ch);

function strip(s) {
  let a = 0;
  let b = s.length;
  while (a < b && isWs(s[a])) a++;
  while (b > a && isWs(s[b - 1])) b--;
  return a === 0 && b === s.length ? s : s.slice(a, b);
}
function lstrip(s) {
  let a = 0;
  while (a < s.length && isWs(s[a])) a++;
  return a ? s.slice(a) : s;
}
/** 앞 공백 길이(코드 단위 = 코드포인트, 공백은 모두 BMP) */
function leadWs(s) {
  let a = 0;
  while (a < s.length && isWs(s[a])) a++;
  return a;
}
/** 공백으로 나눈 낱말 수(파이썬 str.split()) */
function wordCount(s) {
  let n = 0;
  let inWord = false;
  for (const ch of s) {
    const w = !isWs(ch);
    if (w && !inWord) n++;
    inWord = w;
  }
  return n;
}
/** 공백을 뺀 코드포인트 수 */
function nonWsLen(s) {
  let n = 0;
  for (const ch of s) if (!isWs(ch)) n++;
  return n;
}
/** 공백 덩어리를 한 칸으로(파이썬 re.sub(r"\s+", " ", s)). map 을 달라면 줄인 글의 위치 → 원래 위치 표도 준다 */
function collapseWs(s, withMap = false) {
  let out = '';
  let run = false;
  let from = 0;
  const map = withMap ? [] : null;
  for (let i = 0; i < s.length; i++) {
    if (isWs(s[i])) {
      if (!run) {
        if (map) for (let k = from; k < i; k++) map.push(k);
        out += s.slice(from, i) + ' ';
        if (map) map.push(i);
        run = true;
      }
    } else if (run) { from = i; run = false; }
  }
  if (!run) {
    if (map) for (let k = from; k < s.length; k++) map.push(k);
    out += s.slice(from);
  }
  if (!map) return out;
  // map[j] = 줄인 글 j 번째 글자의 원래 위치(줄인 공백 칸은 덩어리 첫머리, 그 다음 칸은 덩어리 끝 뒤 글자)
  map.push(s.length);
  return { out, map };
}
const HAS_SURROGATE = /[\uD800-\uDFFF]/;
const LONG_WS_RUN = new RegExp(`[${WS_CLASS}]{64}`, 'u');
const cpLen = (s) => (HAS_SURROGATE.test(s) ? [...s].length : s.length);
const isHi = (c) => c >= 0xd800 && c <= 0xdbff;
const isLo = (c) => c >= 0xdc00 && c <= 0xdfff;
/** UTF-16 위치 i 의 글자가 짝 맞는 서로게이트면 2 */
const stepAt = (s, i) => (isHi(s.charCodeAt(i)) && isLo(s.charCodeAt(i + 1)) ? 2 : 1);
/** 앞에서 n 코드포인트 */
function cpHead(s, n) {
  let i = 0;
  let k = 0;
  while (i < s.length && k < n) { i += stepAt(s, i); k++; }
  return s.slice(0, i);
}
/** UTF-16 위치 i 에서 n 코드포인트 앞·뒤 위치 */
function cpBack(s, i, n) {
  while (i > 0 && n > 0) {
    i -= i > 1 && isLo(s.charCodeAt(i - 1)) && isHi(s.charCodeAt(i - 2)) ? 2 : 1;
    n--;
  }
  return i;
}
function cpFwd(s, i, n) {
  while (i < s.length && n > 0) { i += stepAt(s, i); n--; }
  return i;
}
/** UTF-16 위치 → 1부터 세는 코드포인트 칸. 서로게이트 없는 줄은 그대로, 있으면 한 번만 표를 만든다 */
function colMapper(s) {
  if (!HAS_SURROGATE.test(s)) return (i) => i + 1;
  const map = new Uint32Array(s.length + 1);
  let k = 0;
  for (let i = 0; i < s.length; i++) {
    map[i] = k;
    if (stepAt(s, i) === 2) { map[i + 1] = k; i++; }
    k++;
  }
  map[s.length] = k;
  return (i) => map[i] + 1;
}

/**
 * s.matchAll(rx) 와 같은 일치 목록(g 식만 · 빈 일치 뒤는 u 이면 코드포인트 하나만큼 건너뛴다).
 * matchAll 은 부를 때마다 식을 복제한다 — 원문이 긴 식(\d 를 옮긴 숫자 범위)을 줄마다 부르면 그 값이 검사 시간을 차지한다
 */
export function execAll(rx, s) {
  if (!rx.global) throw new TypeError('execAll: g 식만');
  const out = [];
  rx.lastIndex = 0;
  for (let m; (m = rx.exec(s)) !== null; ) {
    out.push(m);
    if (m[0] === '') {
      const i = rx.lastIndex;
      const pair = (rx.unicode || rx.unicodeSets) && i + 1 < s.length && /[\ud800-\udbff]/.test(s[i]) && /[\udc00-\udfff]/.test(s[i + 1]);
      rx.lastIndex = i + (pair ? 2 : 1);
    }
  }
  rx.lastIndex = 0;
  return out;
}

/** 파이썬 '%.Nf' — 정확히 반인 값은 짝수 쪽으로(파이썬은 이진값 그대로 반올림, JS toFixed 는 반이면 큰 쪽) */
export function fmtFixed(x, p) {
  const v = Number(x);
  if (!Number.isFinite(v)) return String(v);
  // 이진값을 그대로 펼친 십진 전개에서 p 자리 뒤가 정확히 「5000…」이면 반이다
  const exact = Math.abs(v).toFixed(Math.min(100, p + 60));
  const dot = exact.indexOf('.');
  if (!/^50*$/.test(exact.slice(dot + 1 + p))) return v.toFixed(p);
  const kept = exact.slice(0, p ? dot + 1 + p : dot);
  const even = Number(kept[kept.length - 1]) % 2 === 0;
  const r = even ? kept : Math.abs(v).toFixed(p);
  return (v < 0 ? '-' : '') + r;
}

/** 파이썬 % 서식(%s %d %.Nf %%)만 */
function pyfmt(f, args) {
  let i = 0;
  return String(f).replace(/%(%|s|d|\.(\d)f)/g, (m, k, p) => {
    if (k === '%') return '%';
    const v = args[i++];
    if (k === 's') return String(v);
    if (k === 'd') return String(Math.trunc(v));
    return fmtFixed(v, Number(p));
  });
}

// JS u 플래그에서 \ 를 붙여도 되는 문장부호(그 밖의 \X 는 글자 X 로 옮긴다 — 파이썬 re.escape 가 내는 「\ 」「\-」 등)
const SYNTAX = '^$\\.*+?()[]{}|/';
const unsupported = () => { throw new Error('unsupported'); };

/**
 * 파이썬 re 문법 → JS(u 플래그) 소스. 같은 뜻으로 옮길 수 없는 것은 던진다(팩 검증에서 RE_COMPILE).
 *   옮기는 것: \s \S \d \D(파이썬 3.13 의 유니코드 숫자 범위 ND) · 밖의 . (줄바꿈만 빼고) · ^ $(m 이면 \n 앞뒤만, 아니면 글 처음·끝 — $ 는 끝 줄바꿈 앞도)
 *   · \A \Z · \a \UXXXXXXXX · 글자 묶음 밖 홀로 선 { } ] · {,n} · (?P<이름> · 문장부호 이스케이프(\  \- \# …)
 *   · (?P=이름) — 늘 지나가는 이름 묶음(맨 바깥·둘러보기 밖·0번 반복 없음, 맨 바깥에 | 없음, 되참조보다 앞에서 닫힘)일 때만 \k<이름>
 *   받지 않는 것: \w \W \b \B(유니코드 뜻이 다르다) · 숫자 되참조(\1)·\k · 그 밖의 (?P=) · \N{} · 인라인 플래그 (?i) (?s:) · (?#) ·
 *   글자 묶음 안의 \S 와 \s·\d·\D 를 끝으로 하는 범위 · 알 수 없는 영문자 이스케이프
 */
export function toJsSource(src, { multiline = false } = {}) {
  let out = '';
  let cls = false;
  let clsFirst = -1; // 글자 묶음 첫 원소의 src 위치
  let clsDash = -1; // 글자 묶음 안에서 이스케이프하지 않은 - 의 마지막 src 위치
  let clsOut = -1; // 글자 묶음 [ 의 out 위치
  let clsNeg = false; // [^ 인가
  let clsNotDigit = false; // 묶음 안에 \D 가 있었나
  // 묶음(괄호) — (?P=이름) 되참조는 「반드시 지나간」 이름 묶음일 때만 옮긴다(파이썬은 지나지 않은 묶음의 되참조가 실패하고 JS 는 빈 글자로 맞는다)
  const stack = [];
  const named = new Map(); // 이름 → { sure: 늘 지나가는가, closed: 닫혔는가 }
  const refs = []; // [이름, 그때 닫혀 있었나]
  let topAlt = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const b = i;
      const n = src[i + 1];
      i++;
      if (n === undefined) unsupported();
      if ('wWbBkN'.includes(n) || /[1-9]/.test(n)) unsupported();
      if (n === '0' && /[0-7]/.test(src[i + 1] ?? '')) unsupported();
      if (n === 's') {
        if (cls) {
          // 범위의 끝(가-\s)이거나 시작(\s-가)이면 파이썬은 받지 않는다(이스케이프한 \- 는 글자라 범위가 아니다)
          if (clsDash === b - 1 && b - 1 > clsFirst) unsupported();
          if (src[i + 1] === '-' && src[i + 2] !== undefined && src[i + 2] !== ']') unsupported();
          out += WS_CLASS;
        } else out += `[${WS_CLASS}]`;
      } else if (n === 'S') {
        if (cls) unsupported();
        out += `[^${WS_CLASS}]`;
      } else if (n === 'd') {
        if (cls) {
          // \s 와 같이 범위 끝·시작이면 파이썬이 받지 않는다
          if (clsDash === b - 1 && b - 1 > clsFirst) unsupported();
          if (src[i + 1] === '-' && src[i + 2] !== undefined && src[i + 2] !== ']') unsupported();
          out += ND;
        } else out += `[${ND}]`;
      } else if (n === 'D') {
        if (cls) {
          // 묶음 안에 부정 범위를 둘 수 없다 — 표시만 하고 묶음을 닫을 때 (?:[^ND]|[나머지]) 로 바꾼다
          if (clsDash === b - 1 && b - 1 > clsFirst) unsupported();
          if (src[i + 1] === '-' && src[i + 2] !== undefined && src[i + 2] !== ']') unsupported();
          clsNotDigit = true;
        } else out += `[^${ND}]`;
      } else if (n === 'A' || n === 'Z') {
        if (cls) unsupported();
        out += n === 'A' ? '(?<![\\s\\S])' : '(?![\\s\\S])';
      } else if (n === 'a') out += '\\x07';
      else if (n === 'U') {
        const h = src.slice(i + 1, i + 9);
        if (!/^[0-9a-fA-F]{8}$/.test(h)) unsupported();
        out += `\\u{${h.replace(/^0+(?=.)/, '')}}`;
        i += 8;
      } else if ('xutnrfv0'.includes(n)) out += `\\${n}`;
      else if (/[A-Za-z0-9]/.test(n)) unsupported();
      else if (SYNTAX.includes(n) || (cls && n === '-')) out += `\\${n}`;
      else out += n;
      continue;
    }
    if (cls) {
      if (c === ']') {
        cls = false;
        if (clsNotDigit) {
          // [가\D] = 숫자가 아니거나 가 · [^가\D] = 숫자이면서 가가 아님
          const inner = out.slice(clsOut + (clsNeg ? 2 : 1));
          out = out.slice(0, clsOut);
          if (clsNeg) out += inner ? `(?:(?![${inner}])[${ND}])` : `[${ND}]`;
          else out += inner ? `(?:[^${ND}]|[${inner}])` : `[^${ND}]`;
          continue;
        }
      } else if (c === '-') clsDash = i;
      out += c;
      continue;
    }
    if (c === '[') {
      cls = true;
      clsDash = -1;
      clsOut = out.length;
      clsNeg = src[i + 1] === '^';
      clsNotDigit = false;
      out += c;
      if (src[i + 1] === '^') { out += '^'; i++; }
      clsFirst = i + 1;
      if (src[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '|' && !stack.length) topAlt = true;
    if (c === '(') {
      const rest = src[i + 1] === '?' ? src.slice(i + 2) : '';
      const ref = /^P=([A-Za-z_][A-Za-z0-9_]*)\)/.exec(rest);
      if (ref) {
        const g = named.get(ref[1]);
        refs.push([ref[1], !!g?.closed]);
        out += `\\k<${ref[1]}>`;
        i += 2 + ref[0].length - 1;
        continue;
      }
      if (src[i + 1] === '?' && /^(?:P=|#|[aiLmsux-]+[:)])/.test(rest)) unsupported();
      const look = /^(?:=|!|<=|<!)/.test(rest);
      const inLook = look || stack.some((x) => x.look);
      const nm = /^P<([A-Za-z_][A-Za-z0-9_]*)>/.exec(rest);
      stack.push({ name: nm?.[1], look: inLook, depth: stack.length });
      if (nm) {
        named.set(nm[1], { sure: false, closed: false });
        out += `(?<${nm[1]}>`;
        i += 1 + nm[0].length;
        continue;
      }
      out += c;
      continue;
    }
    if (c === ')') {
      const g = stack.pop();
      if (g?.name) {
        // 늘 지나가는 묶음 = 맨 바깥(다른 묶음 안이 아님)·둘러보기 밖·0번 반복을 허락하는 수량자가 뒤에 없음
        const optional = /^(?:[?*]|\{0*(?:,\d*)?\}|\{,\d*\})/.test(src.slice(i + 1));
        named.set(g.name, { sure: g.depth === 0 && !g.look && !optional, closed: true });
      }
      out += c;
      continue;
    }
    if (c === '{') {
      const m = /^\{(\d*)(?:(,)(\d*))?\}/.exec(src.slice(i));
      if (!m || (!m[2] && m[1] === '')) { out += '\\{'; continue; }
      out += m[2] ? `{${m[1] || '0'},${m[3]}}` : `{${m[1]}}`;
      i += m[0].length - 1;
      continue;
    }
    if (c === '}' || c === ']') out += `\\${c}`;
    else if (c === '.') out += '[^\\n]';
    else if (c === '^') out += multiline ? '(?<![^\\n])' : '(?<![\\s\\S])';
    else if (c === '$') out += multiline ? '(?![^\\n])' : '(?=\\n?(?![\\s\\S]))';
    else out += c;
  }
  // 되참조는 앞에서 이미 닫힌, 늘 지나가는 이름 묶음만(맨 바깥에 | 가 있으면 어느 묶음도 늘 지나가지 않는다)
  for (const [name, closedThen] of refs) if (!closedThen || topAlt || !named.get(name)?.sure) unsupported();
  return out;
}

/**
 * JS 정규식 소스(toJsSource 결과)의 최소 소비 길이 — 둘러보기는 0 으로, 되참조도 0 으로 본다(넉넉하게 0 쪽으로).
 * 0 이면 어떤 자리에서 빈 글자로 맞을 수 있다고 보고 받지 않는다(파이썬은 길이 0 일치도 세는데 JS 는 그 뜻을 옮길 수 없다).
 */
export function minLen(js) {
  let i = 0;
  const alt = () => {
    let best = seq();
    while (js[i] === '|') { i++; best = Math.min(best, seq()); }
    return best;
  };
  const seq = () => {
    let sum = 0;
    while (i < js.length && js[i] !== '|' && js[i] !== ')') {
      let a = atom();
      const q = /^(?:([*?])|(\+)|\{(\d+)(?:,(\d*))?\})\??/.exec(js.slice(i));
      if (q) {
        if (q[1]) a = 0;
        else if (q[3] !== undefined) a *= Number(q[3]);
        i += q[0].length;
      }
      sum += a;
    }
    return sum;
  };
  const atom = () => {
    const c = js[i];
    if (c === '(') {
      i++;
      let look = false;
      if (js[i] === '?') {
        const m = /^\?(?::|=|!|<=|<!|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(js.slice(i));
        if (!m) throw new Error('unsupported');
        look = /^\?(?:=|!|<=|<!)$/.test(m[0]);
        i += m[0].length;
      }
      const v = alt();
      if (js[i] !== ')') throw new Error('unsupported');
      i++;
      return look ? 0 : v;
    }
    if (c === '[') {
      i++;
      if (js[i] === '^') i++;
      while (i < js.length && js[i] !== ']') i += js[i] === '\\' ? 2 : 1;
      i++;
      return 1;
    }
    if (c === '\\') {
      const n = js[i + 1];
      if (n === 'k') { i = js.indexOf('>', i) + 1; return 0; }
      if ((n === 'p' || n === 'P') && js[i + 2] === '{') { i = js.indexOf('}', i) + 1; return 1; }
      if (n === 'u' && js[i + 2] === '{') { i = js.indexOf('}', i) + 1; return 1; }
      if (n === 'u') { i += 6; return 1; }
      if (n === 'x') { i += 4; return 1; }
      if (n === 'b' || n === 'B') { i += 2; return 0; }
      i += 2;
      return 1;
    }
    if (c === '^' || c === '$') { i++; return 0; }
    i += stepAt(js, i);
    return 1;
  };
  return alt();
}

// ── 팩 검증 — 고정 코드만 돌려준다(정규식·사유 글을 오류에 싣지 않는다)
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isGenres = (g) => g === undefined || (Array.isArray(g) && g.every((x) => GENRES.includes(x)));
const optStr = (x) => x === undefined || typeof x === 'string';
const isBmp = (s) => [...s].every((ch) => ch.length === 1);

/** @returns {{ id?: string, code: string }[]} 비었으면 통과 */
export function validatePack(pack) {
  const errs = [];
  const bad = (code, id) => errs.push(id ? { id, code } : { code });
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return [{ code: 'PACK_NOT_OBJECT' }];
  if (!isStr(pack.pack)) bad('PACK_NAME');
  if (pack.private !== undefined && typeof pack.private !== 'boolean') bad('PACK_PRIVATE');
  if (!(pack.version === undefined || typeof pack.version === 'string' || isNum(pack.version))) bad('PACK_VERSION');
  if (pack.rules !== undefined && !Array.isArray(pack.rules)) bad('RULES_NOT_ARRAY');
  // 규칙 id 는 rules·density 를 통틀어 하나뿐이어야 한다(brief 참조값이 겹치지 않게)
  const ids = new Set();
  for (const r of Array.isArray(pack.rules) ? pack.rules : []) {
    if (!r || typeof r !== 'object') { bad('RULE_NOT_OBJECT'); continue; }
    const id = isStr(r.id) ? r.id : undefined;
    if (!id) bad('RULE_ID');
    else if (ids.has(id)) bad('RULE_ID_DUP', id);
    else ids.add(id);
    if (!isStr(r.re)) bad('RULE_RE', id);
    if (r.grade !== 'A' && r.grade !== 'B') bad('RULE_GRADE', id);
    if (!isStr(r.reason)) bad('RULE_REASON', id);
    if (!optStr(r.fix)) bad('RULE_FIX', id);
    if (r.scope !== undefined && r.scope !== 'quote') bad('RULE_SCOPE', id);
    if (r.target !== undefined && (r.scope !== 'quote' || !['line', 'trim'].includes(r.target))) bad('RULE_TARGET', id);
    if (r.once !== undefined && (r.scope !== 'quote' || typeof r.once !== 'boolean')) bad('RULE_ONCE', id);
    // i 플래그는 받지 않는다 — 파이썬 re.I 와 JS 의 유니코드 대소문자 대응이 다르다(K·ſ·İ·ı)
    if (r.flags !== undefined && !(typeof r.flags === 'string' && /^m?$/.test(r.flags))) bad('RULE_FLAGS', id);
    if (r.exclude !== undefined && !isStr(r.exclude)) bad('RULE_EXCLUDE', id);
    if (r.resume !== undefined && !(isStr(r.resume) && r.scope === undefined)) bad('RULE_RESUME', id);
    if (!isGenres(r.genres)) bad('RULE_GENRES', id);
  }
  if (pack.freq !== undefined) {
    const f = pack.freq;
    if (!f || !Array.isArray(f.items) || !f.items.every((x) => isStr(x?.word) && isNum(x?.avg))) bad('FREQ_ITEMS');
    if (!isNum(f?.floor) || !isNum(f?.factor)) bad('FREQ_LIMIT');
    if (!isStr(f?.brief) || !optStr(f?.msg)) bad('FREQ_BRIEF');
  }
  if (pack.density !== undefined && !Array.isArray(pack.density)) bad('DENSITY_NOT_ARRAY');
  for (const d of Array.isArray(pack.density) ? pack.density : []) {
    const id = isStr(d?.id) ? d.id : undefined;
    if (!id) bad('DENSITY_ID');
    else if (ids.has(id)) bad('DENSITY_ID_DUP', id);
    else ids.add(id);
    if (!isStr(d?.re)) bad('DENSITY_RE', id);
    if (!isNum(d?.limit) || !isNum(d?.min)) bad('DENSITY_LIMIT', id);
    if (!isStr(d?.brief) || !optStr(d?.reason)) bad('DENSITY_BRIEF', id);
    if (!isGenres(d?.genres)) bad('DENSITY_GENRES', id);
  }
  if (pack.table !== undefined) {
    const t = pack.table;
    // 표 인용부호는 BMP 글자만(줄을 UTF-16 단위로 훑는다)
    if (!isStr(t?.open) || !isStr(t?.close) || !isBmp(t.open) || !isBmp(t.close) || !(t.skip === undefined || (Array.isArray(t.skip) && t.skip.every((g) => g === 'A' || g === 'B')))) bad('TABLE');
  }
  if (pack.checks !== undefined && (!pack.checks || typeof pack.checks !== 'object' || Array.isArray(pack.checks))) return [...errs, { code: 'CHECKS' }];
  const ck = pack.checks ?? {};
  if (ck.utterQuotes !== undefined) {
    const U = ck.utterQuotes;
    if (!(U && isStr(U.re) && isStr(U.curly) && isNum(U.min) && isStr(U.brief) && optStr(U.msg) && isGenres(U.genres))) bad('CHECK_UTTER');
  }
  if (ck.heads !== undefined) {
    const H = ck.heads;
    if (!(H && isStr(H.line) && isStr(H.re) && isNum(H.maxWords) && isStr(H.brief) && optStr(H.msg) && isGenres(H.genres) && (H.collapseWs === undefined || typeof H.collapseWs === 'boolean'))) bad('CHECK_HEADS');
  }
  if (ck.sentences !== undefined) {
    const S = ck.sentences;
    if (!(S && isStr(S.end) && ['minSents', 'minChars', 'maxLen', 'ratio', 'run', 'tail'].every((k) => isNum(S[k])) && isStr(S.briefLong) && isStr(S.briefRun) && optStr(S.msgLong) && optStr(S.msgRun) && isGenres(S.genres))) bad('CHECK_SENTENCES');
  }
  return errs;
}

/** 검증 + 컴파일. 실패하면 { errors }(id·고정 코드만) — 팩 내보내기 스크립트가 미리 돌려 본다 */
export function compilePack(pack) {
  const errors = validatePack(pack);
  if (errors.length) return { errors };
  const re = (src, id, { multiline = false, global = false, sticky = false, indices = false, nonEmpty = false } = {}) => {
    try {
      const js = toJsSource(src, { multiline });
      const rx = new RegExp(js, `${global ? 'g' : ''}${sticky ? 'y' : ''}${indices ? 'd' : ''}u`);
      // 빈 글자로 맞을 수 있는 식(최소 소비 길이 0 — 조건부 빈 일치 포함)은 받지 않는다
      if (nonEmpty && minLen(js) === 0) { errors.push({ id, code: 'RE_EMPTY' }); return null; }
      return rx;
    } catch {
      errors.push({ id, code: 'RE_COMPILE' });
      return null;
    }
  };
  const ck = pack.checks ?? {};
  // 팩 글의 알 수 없는 키가 컴파일 결과(rx·anyRx 등)와 섞이지 않게 쓰는 칸만 옮긴다
  const c = {
    pack: pack.pack,
    version: pack.version,
    private: pack.private,
    table: pack.table,
    freq: pack.freq,
    checks: ck,
    rules: (pack.rules ?? []).map((r) => ({
      id: r.id,
      re: r.re,
      grade: r.grade,
      reason: r.reason,
      fix: r.fix,
      scope: r.scope,
      target: r.target,
      once: r.once,
      genres: r.genres,
      rx: re(r.re, r.id, { multiline: (r.flags ?? '').includes('m'), global: !r.once, nonEmpty: true }),
      ex: r.exclude ? re(r.exclude, r.id) : null,
      // 앞 경계를 붙여 빠르게 만든 식이 「바로 앞 일치가 끝난 자리」에서 놓치는 일치를 원래 식으로 그 자리에서만 다시 본다
      resumeRx: r.resume ? re(r.resume, r.id, { multiline: (r.flags ?? '').includes('m'), sticky: true, nonEmpty: true }) : null,
      merged: false,
    })),
    density: (pack.density ?? []).map((d) => ({ ...d, rx: re(d.re, d.id, { multiline: true, global: true, nonEmpty: true }) })),
  };
  if (!errors.length) {
    // 줄 거르기 — 본문 규칙을 하나로 합친 식. 이 식이 줄에서 아무것도 못 찾으면 그 규칙들 중 어느 것도 걸리지 않는다
    // (갈래 하나라도 어느 자리에서 맞으면 합친 식도 맞는다)
    const merge = [];
    for (const r of c.rules) {
      r.merged = r.scope !== 'quote';
      if (r.merged) merge.push(`(?:${r.rx.source})`);
    }
    if (merge.length > 1) {
      try {
        c.anyRx = new RegExp(merge.join('|'), 'u');
      } catch {
        // 캡처 이름이 겹치는 등 합칠 수 없으면 거르지 않는다
        for (const r of c.rules) r.merged = false;
      }
    } else for (const r of c.rules) r.merged = false;
    c.bodyRules = c.rules.filter((r) => r.scope !== 'quote');
    c.loneRules = c.bodyRules.filter((r) => !r.merged);
  }
  if (ck.utterQuotes) c.utterRx = re(ck.utterQuotes.re, 'checks.utterQuotes', { global: true, nonEmpty: true });
  if (ck.utterQuotes) c.curlyRx = re(ck.utterQuotes.curly, 'checks.utterQuotes', { global: true, nonEmpty: true });
  // 파이썬 re.match — 줄 첫머리(0열)에서만
  if (ck.heads) c.headLineRx = re(ck.heads.line, 'checks.heads', { sticky: true });
  if (ck.heads?.collapseWs) c.headLineRxD = re(ck.heads.line, 'checks.heads', { sticky: true, indices: true });
  if (ck.heads) c.headBadRx = re(ck.heads.re, 'checks.heads');
  if (pack.table) c.tableOpen = new Set([...pack.table.open]);
  if (pack.table) c.tableClose = new Set([...pack.table.close]);
  return errors.length ? { errors } : { pack: c };
}

// 컴파일 결과를 되쓰는 것은 로더가 만들고 얼린 팩(범용 팩·PROSE_PACK_DIR 파일)뿐이다.
// 팩 파일은 호출마다 바이트를 읽어 앞서 읽은 바이트와 같을 때만 앞의 팩(규칙·공개 설정·컴파일 결과 한 덩어리)을 쓴다 —
// 경로·크기·수정 시각이 같아도 내용이 바뀌면 다시 읽는다. 부르는 쪽이 넘긴 팩 객체는 고칠 수 있으므로 호출마다 컴파일한다.
const FILE_CACHE = new Map();
const COMPILED = new WeakMap();
const OWNED = new WeakSet();
function deepFreeze(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
deepFreeze(GENERIC);
OWNED.add(GENERIC);
function readPackFile(file) {
  const buf = fs.readFileSync(file);
  const hit = FILE_CACHE.get(file);
  if (hit && hit.buf.equals(buf)) return hit.obj;
  const obj = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  if (obj && typeof obj === 'object') {
    deepFreeze(obj);
    OWNED.add(obj);
  }
  FILE_CACHE.set(file, { buf, obj });
  return obj;
}
function compileCached(raw) {
  if (!raw || typeof raw !== 'object' || !OWNED.has(raw)) return compilePack(raw);
  let r = COMPILED.get(raw);
  if (!r) { r = compilePack(raw); COMPILED.set(raw, r); }
  return r;
}

/**
 * 팩 읽기 — 범용 팩 + dir(기본 env PROSE_PACK_DIR, 절대 경로만)의 *.json(이름순).
 * 읽지 못한 팩은 건너뛰고 skipped 에 고정 코드만 남긴다(stderr 에도 순번·위치만).
 * @returns {{ packs: any[], skipped: { code: string }[] }}
 */
export function loadPackSet({ dir = process.env.PROSE_PACK_DIR } = {}) {
  const packs = [GENERIC_PACK];
  const skipped = [];
  if (!dir) return { packs, skipped };
  if (!path.isAbsolute(dir)) {
    skipped.push({ code: 'PACK_DIR_NOT_ABSOLUTE' });
    console.error('[check_prose] PROSE_PACK_DIR 는 절대 경로여야 합니다 — 범용 팩만 씁니다');
    return { packs, skipped };
  }
  if (!fs.existsSync(dir)) {
    skipped.push({ code: 'PACK_DIR_MISSING' });
    console.error('[check_prose] PROSE_PACK_DIR 폴더가 없습니다 — 범용 팩만 씁니다');
    return { packs, skipped };
  }
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort();
  } catch {
    skipped.push({ code: 'PACK_DIR_UNREADABLE' });
    console.error('[check_prose] PROSE_PACK_DIR 폴더를 읽지 못했습니다');
    return { packs, skipped };
  }
  names.forEach((f, k) => {
    try {
      const p = readPackFile(path.join(dir, f));
      if (p && typeof p === 'object') FROM_DIR.add(p);
      packs.push(p);
    } catch (e) {
      skipped.push({ code: 'PACK_UNREADABLE' });
      // 오류 글은 싣지 않는다(파서 오류 글에는 원문 조각·위치가 실린다) — 순번과 오류 갈래만
      console.error(`[check_prose] 팩 파일 ${k + 1}번째를 읽지 못했습니다(${e instanceof SyntaxError ? 'JSON' : 'IO'})`);
    }
  });
  if (packs.length === 1 && !skipped.length) {
    skipped.push({ code: 'PACK_DIR_EMPTY' });
    console.error('[check_prose] PROSE_PACK_DIR 에서 읽은 팩이 없습니다 — 범용 팩만 씁니다');
  }
  return { packs, skipped };
}

/** 팩 목록만(옛 호출 모양) */
export const loadPacks = (o) => loadPackSet(o).packs;

const inGenre = (x, genre) => !x.genres || x.genres.includes(genre);
const QUOTE_PREFIXES = ['>', '[관련 판결]'];
const BODY_SKIP = ['>', '[관련'];
const startsWithAny = (s, ps) => ps.some((p) => s.startsWith(p));

/** 표 줄 가리기 — 여는 부호에서 가장 가까운 닫는 부호까지를 같은 코드포인트 수의 '·' 로(한 번 훑기, 부호는 BMP) */
function maskQuotes(line, open, close) {
  let out = '';
  let i = 0;
  let from = 0;
  // 닫는 부호가 뒤에 하나도 없으면 더 볼 것이 없다
  let lastClose = -1;
  for (let k = line.length - 1; k >= 0; k--) if (close.has(line[k])) { lastClose = k; break; }
  while (i < line.length && i < lastClose) {
    if (open.has(line[i])) {
      let j = i + 1;
      while (j < line.length && !close.has(line[j])) j++;
      if (j >= line.length) break;
      out += line.slice(from, i) + '·'.repeat(cpLen(line.slice(i, j + 1)));
      i = j + 1;
      from = i;
    } else i++;
  }
  return from ? out + line.slice(from) : line;
}

/** 파이썬 re.findall(r"[^.]*?<end>\.", flat) 와 같은 문장 목록 — 마침표로 자른 조각이 end 로 끝나면 문장 */
function sentencesOf(flat, end) {
  const segs = flat.split('.');
  const out = [];
  for (let k = 0; k < segs.length - 1; k++) if (segs[k].endsWith(end)) out.push(`${segs[k]}.`);
  return out;
}

/** 규칙 하나를 줄 하나에 — resumeRx 가 있으면 앞 일치가 끝난 자리에서 원래 식을 한 번 더 본다 */
function scan(probe, r, onMatch) {
  if (!r.resumeRx) {
    for (const m of execAll(r.rx, probe)) onMatch(m);
    return;
  }
  const rx = r.rx;
  rx.lastIndex = 0;
  let m;
  while ((m = rx.exec(probe))) {
    onMatch(m);
    if (!m[0]) { rx.lastIndex = m.index + stepAt(probe, m.index); continue; }
    let e = m.index + m[0].length;
    for (;;) {
      r.resumeRx.lastIndex = e;
      const k = r.resumeRx.exec(probe);
      if (!k || !k[0]) break;
      onMatch(k);
      e = k.index + k[0].length;
    }
    rx.lastIndex = e;
  }
}

const byPos = (a, b) => a.n - b.n || a.col - b.col || a.ord - b.ord;

/**
 * @param {string} text
 * @param {{ packs?: any[], genre?: string, detail?: 'brief'|'full', allowFull?: boolean, cap?: number, skipped?: { code: string }[] }} [o]
 * @returns {{ counts: { A: number, B: number }, hits: any[], notes: { kind: string, text: string }[], packCount: number, truncated?: boolean, incomplete?: boolean, withheld?: boolean, skipped?: { code: string }[], packs?: string[] }}
 */
export function checkProse(text, o = {}) {
  const set = o.packs ? { packs: o.packs, skipped: [] } : loadPackSet();
  const skipped = [...(o.skipped ?? []), ...set.skipped];
  const genre = GENRE_ALIAS[o.genre] ?? o.genre ?? 'legal';
  const allowFull = o.allowFull ?? process.env.PROSE_ALLOW_FULL === '1';
  const cap = o.cap ?? HIT_CAP;
  const P = [];
  const names = new Set();
  set.packs.forEach((raw, k) => {
    let r;
    try {
      r = compileCached(raw);
    } catch {
      r = { errors: [{ code: 'PACK_THROWN' }] };
    }
    if (r.errors) {
      skipped.push({ code: 'PACK_INVALID' });
      console.error(`[check_prose] ${k + 1}번째 팩 건너뜀: 오류 ${r.errors.length}건(${[...new Set(r.errors.map((e) => e.code))].join(',')})`);
      return;
    }
    if (names.has(r.pack.pack)) {
      skipped.push({ code: 'PACK_DUP' });
      console.error(`[check_prose] ${k + 1}번째 팩 건너뜀: 같은 이름의 팩이 앞에 있습니다`);
      return;
    }
    names.add(r.pack.pack);
    // 공개 여부는 컴파일한 그 팩에서 읽는다(규칙과 공개 설정이 같은 시점의 값)
    const priv = r.pack.private === true || (FROM_DIR.has(raw) && r.pack.private !== false);
    const canFull = !priv || allowFull;
    P.push({ ...r.pack, full: o.detail !== 'brief' && canFull, held: o.detail === 'full' && !canFull, cnt: { A: 0, B: 0 }, got: { A: [], B: [] }, dead: false, ord: P.length });
  });
  // 참조값 소금은 brief 걸림이 처음 나올 때 만든다
  let salt;
  const refs = new Map();
  const ref = (p, id) => {
    const k = `${p.pack}|${id}`;
    if (!refs.has(k)) {
      salt ??= crypto.randomBytes(8).toString('hex');
      refs.set(k, crypto.createHash('sha256').update(`${salt}|${k}`).digest('hex').slice(0, 8));
    }
    return refs.get(k);
  };
  const flag = (p, code) => {
    if (p.flags?.has(code)) return;
    (p.flags ??= new Set()).add(code);
    skipped.push({ code });
  };
  const kill = (p) => {
    if (p.dead) return;
    p.dead = true;
    skipped.push({ code: 'PACK_RUNTIME' });
    console.error(`[check_prose] ${p.ord + 1}번째로 읽은 팩이 점검 중 멈춰 뺐습니다`);
  };

  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  const txt = lines.join('\n');
  // 걸림은 팩마다·등급마다 문서 앞의 것부터 상한만큼 남긴다(멈춘 팩이 칸을 차지해도 다른 팩 몫이 줄지 않게).
  // 상한의 두 배가 차면 문서 순서로 줄여 상한만 남긴다 — 한 줄에 걸림이 아주 많아도 들고 있는 수가 늘지 않는다
  let seq = 0;
  const push = (p, r, n, word, col, ctxOf) => {
    p.cnt[r.grade]++;
    const arr = p.got[r.grade];
    arr.push({ p, r, n, col, ord: seq++, word, ctx: p.full ? ctxOf() : undefined });
    if (arr.length >= 2 * cap) { arr.sort(byPos); arr.length = cap; }
  };

  lines.forEach((line, i) => {
    if (!line) return;
    const n = i + 1;
    const t = strip(line);
    let ctx;
    const ctxOf = () => (ctx ??= cpHead(t, 58));
    if (startsWithAny(t, QUOTE_PREFIXES)) {
      const lead = leadWs(line);
      const lineCol = colMapper(line);
      for (const p of P) {
        if (p.dead) continue;
        try {
          for (const r of p.rules) {
            if (r.scope !== 'quote' || !inGenre(r, genre)) continue;
            const trim = r.target === 'trim';
            const s = trim ? t : line;
            const col = (idx) => (trim ? lineCol(idx + lead) : lineCol(idx));
            const hit = (m) => {
              if (!m[0]) { flag(p, 'RULE_EMPTY_MATCH'); return; }
              if (r.ex) {
                const w = s.slice(cpBack(s, m.index, EXCLUDE_WINDOW), cpFwd(s, m.index + m[0].length, EXCLUDE_WINDOW));
                if (r.ex.test(w)) return;
              }
              push(p, r, n, m[0], col(m.index), ctxOf);
            };
            if (r.once) {
              const m = r.rx.exec(s);
              if (m) hit(m);
            } else for (const m of execAll(r.rx, s)) hit(m);
          }
        } catch {
          kill(p);
        }
      }
      return;
    }
    const inTable = t.startsWith('|');
    for (const p of P) {
      if (p.dead) continue;
      try {
        const probe = inTable && p.tableOpen ? maskQuotes(line, p.tableOpen, p.tableClose) : line;
        const skip = inTable ? (p.table?.skip ?? []) : [];
        // 합친 식은 짧은 줄에서만 쓴다 — 긴 줄에서는 규칙마다 글자 찾기가 더 빠르다
        const none = p.anyRx && probe.length <= MERGE_MAX_LINE ? !p.anyRx.test(probe) : false;
        let col;
        for (const r of none ? p.loneRules : p.bodyRules) {
          if (!inGenre(r, genre) || skip.includes(r.grade)) continue;
          scan(probe, r, (m) => {
            if (!m[0]) { flag(p, 'RULE_EMPTY_MATCH'); return; }
            if (r.ex) {
              const w = probe.slice(cpBack(probe, m.index, EXCLUDE_WINDOW), cpFwd(probe, m.index + m[0].length, EXCLUDE_WINDOW));
              if (r.ex.test(w)) return;
            }
            col ??= colMapper(probe);
            push(p, r, n, m[0], col(m.index), ctxOf);
          });
        }
      } catch {
        kill(p);
      }
    }
  });

  // ── 알림(빈도·밀도·발언 인용·제목·문장) — 검출식·기준값은 팩에서 읽는다
  const notes = [];
  let body;
  let nch;
  const bodyText = () => (body ??= txt.split('\n').filter((l) => !startsWithAny(lstrip(l), BODY_SKIP)).join('\n'));
  for (const p of P) {
    if (p.dead) continue;
    const mine = [];
    const note = (kind, fullText, brief) => mine.push({ kind, text: p.full ? fullText : brief });
    try {
      if (p.freq?.items?.length) {
        for (const x of p.freq.items) {
          const c = txt.split(x.word).length - 1;
          if (c > Math.max(p.freq.floor, x.avg * p.freq.factor)) note('freq', pyfmt(p.freq.msg ?? '%s %d', [x.word, c, x.avg]), p.freq.brief);
        }
      }
      for (const d of p.density) {
        if (!inGenre(d, genre)) continue;
        const b = bodyText();
        nch ??= nonWsLen(b) || 1;
        let c = 0;
        for (const m of b.matchAll(d.rx)) if (m[0] !== undefined) c++;
        const v = (c / nch) * 1e4;
        if (v > d.limit && c >= d.min) note('density', `${d.reason ?? d.brief} ${c}회(만자당 ${fmtFixed(v, 1)} · 문턱 ${fmtFixed(d.limit, 1)})`, d.brief);
      }
      const ck = p.checks;
      if (ck.utterQuotes && inGenre(ck.utterQuotes, genre)) {
        const b = bodyText();
        const u = (b.match(p.utterRx) ?? []).length;
        const c = (b.match(p.curlyRx) ?? []).length;
        if (u >= ck.utterQuotes.min && c < u) note('utterQuotes', pyfmt(ck.utterQuotes.msg ?? '%d %d', [u, c]), `${ck.utterQuotes.brief} ${u}회`);
      }
      if (ck.heads && inGenre(ck.heads, genre)) {
        const heads = [];
        for (const l of txt.split('\n')) {
          const s = strip(l);
          if (!s) continue;
          let h;
          // 팩이 허락하면(collapseWs) 아주 긴 공백 덩어리가 있는 줄은 한 칸으로 줄여 맞춰 본다 — 「(.+?)…\s*$」 꼴이
          // 덩어리 길이의 제곱으로 느려진다. 제목 글은 줄인 글의 위치를 원래 줄로 되돌려 원문 그대로 꺼낸다
          if (p.headLineRxD && LONG_WS_RUN.test(s)) {
            const { out, map } = collapseWs(s, true);
            p.headLineRxD.lastIndex = 0;
            const m = p.headLineRxD.exec(out);
            if (!m) continue;
            const ix = m.indices?.[1];
            h = ix ? s.slice(map[ix[0]], map[ix[1]]) : '';
          } else {
            p.headLineRx.lastIndex = 0;
            const m = p.headLineRx.exec(s);
            if (!m) continue;
            h = m[1] ?? '';
          }
          if (wordCount(h) > ck.heads.maxWords || p.headBadRx.test(h)) heads.push(cpHead(h, 30));
        }
        if (heads.length) note('heads', pyfmt(ck.heads.msg ?? '%d %s', [heads.length, heads.slice(0, 4).join(' / ')]), `${ck.heads.brief} ${heads.length}개`);
      }
      if (ck.sentences && inGenre(ck.sentences, genre)) {
        const S = ck.sentences;
        const flat = collapseWs(bodyText().split('\n').filter((l) => !startsWithAny(lstrip(l), ['|', '#'])).join('\n'));
        const sents = sentencesOf(flat, S.end).map(strip).filter((s) => cpLen(s) > S.minChars);
        if (sents.length >= S.minSents) {
          const over = sents.filter((s) => nonWsLen(s) > S.maxLen).length;
          if (over / sents.length > S.ratio) note('sentences.long', pyfmt(S.msgLong ?? '%d/%d %.0f', [over, sents.length, (over / sents.length) * 100]), `${S.briefLong} ${over}/${sents.length}`);
          const ends = sents.map((s) => { const a = [...s]; return a.slice(Math.max(0, a.length - S.tail), a.length - 1).join(''); });
          let run = 1;
          let runs = 0;
          for (let k = 1; k < ends.length; k++) {
            run = ends[k] === ends[k - 1] ? run + 1 : 1;
            if (run === S.run) runs++;
          }
          if (runs) note('sentences.run', pyfmt(S.msgRun ?? '%d', [runs]), `${S.briefRun} ${runs}곳`);
        }
      }
      notes.push(...mine);
    } catch {
      kill(p);
    }
  }

  // ── 걸림 고르기 — 멈춘 팩의 걸림은 빼고, A 를 먼저 채운 뒤 남는 칸에 B. 실을 때는 문서 순서로
  const live = P.filter((p) => !p.dead);
  const counts = { A: 0, B: 0 };
  for (const p of live) { counts.A += p.cnt.A; counts.B += p.cnt.B; }
  const pick = (g, room) => (room > 0 ? live.flatMap((p) => p.got[g]).sort(byPos).slice(0, room) : []);
  const a = pick('A', cap);
  const chosen = [...a, ...pick('B', cap - a.length)].sort((x, y) => x.n - y.n || x.col - y.col || (x.r.grade < y.r.grade ? -1 : x.r.grade > y.r.grade ? 1 : x.ord - y.ord));
  const hits = chosen.map(({ p, r, n, col, word, ctx }) => {
    const h = { line: n, col, len: cpLen(word), grade: r.grade, reason: r.reason };
    if (p.full) Object.assign(h, { word: cpHead(word, 24), fix: r.fix ?? '', rule: r.id, pack: p.pack, ctx });
    else h.ref = ref(p, r.id);
    return h;
  });

  const out = { counts, hits, notes, packCount: live.length };
  if (counts.A + counts.B > hits.length) out.truncated = true;
  if (skipped.length) {
    out.skipped = skipped;
    out.incomplete = true;
  }
  if (live.some((p) => p.held)) out.withheld = true;
  const shown = live.filter((p) => p.full);
  if (shown.length) out.packs = shown.map((p) => `${p.pack}@${p.version ?? ''}`);
  return out;
}
