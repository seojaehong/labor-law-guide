// 퇴고 AI 수사 검사(check_rhetoric) — 발송 게이트의 파이썬 검사기(AI 수사)를 옮긴 것.
// 이 공개 코드는 틀(줄 준비·쪽 번호 건너뛰기·문장 단위 잇기·적중 조립·겹침 정리·승격 기준)과 작은 해석기만 갖는다.
// 식·낱말·규칙(id·계열·트랙별 등급·교정문)·규칙마다의 판정 단계·결정표·가림 식은 전부 비공개 팩의 rhetoric 절(format 2)에서 온다.
// 칸 이름은 뜻 없는 번호다 — 식 r01…, 낱말 w01…. 코드가 직접 쓰는 칸(r01~r45, w01~w11)의 번호는 팩 내보내기와 맞춘 계약이다.
// 판정은 옛 파이썬과 같아야 한다(게이트 출력 줄 단위 대조 차이 0).
// 위치는 UTF-16 코드 단위로 통일하고, 글자 수(len)·n 글자 자르기만 코드포인트로 센다(pyre.mjs).
import { cpBack, toJsSource } from './check.mjs';
import {
  cpAhead,
  cpHead,
  cpLast,
  cpLen,
  cpTail,
  isWs,
  lstripChars,
  pyCompile,
  pyIsspace,
  pySplit,
  rstrip,
  rstripChars,
  strip,
  universalNewlines,
} from './pyre.mjs';

export const RHETORIC_TRACKS = ['legal', 'blog', 'consult', 'lecture'];
export const RHETORIC_FORMAT = 2;

const num2 = (p, n) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, '0')}`);
/** 코드가 직접 쓰는 식 칸·낱말 칸(번호만 — 무엇인지는 팩이 정한다) */
export const RHETORIC_CODE_RE = num2('r', 45);
export const RHETORIC_CODE_WORDS = num2('w', 11);
// 코드가 되풀이(finditer·sub·findall)로 쓰는 식 칸 — 빈 글자에 맞을 수 있는 식은 받지 않는다
const CODE_ITER = new Set(['r01', 'r02', 'r03', 'r05', 'r29', 'r32', 'r35', 'r36', 'r39', 'r40', 'r45']);
const GRADES = new Set(['A', 'B', null]);
const BIG = 10 ** 6; // 파이썬이 「문단 끝까지」로 쓴 끝 위치

/** 파이썬 int() — \d(유니코드 Nd) 숫자 글자도 값으로 */
const ND1 = new RegExp(`^${toJsSource(String.raw`\d`)}$`, 'u');
function pyInt(s) {
  let v = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    let k = cp;
    while (k > 0 && ND1.test(String.fromCodePoint(k - 1))) k--;
    v = v * 10 + ((cp - k) % 10);
  }
  return v;
}

/** 공백(파이썬 \s)을 뺀 코드포인트 수 */
function nonWsCp(s) {
  let n = 0;
  for (const ch of s) if (!isWs(ch)) n++;
  return n;
}

// ── 작은 해석기 — 팩의 조건식(cond)·보기(view)·결정표를 푼다
// 조건: ['1'] · ['and'|'or', 조건…] · ['not', 조건] · ['s'|'m'|'f', 식칸, 보기](search·match·fullmatch)
//       ['w', 식칸, 이름](줄잇기 공백을 넣은 판·뺀 판 어느 쪽이든) · ['l', 식칸, 이름](뺀 판만)
//       ['eq'|'ew'|'sw'|'has', 보기, 보기] · ['in', 보기, 목록 낱말칸] · ['nz', 보기](비지 않음) · ['M', 보기, n](끝 글자가 받침 번호 n 인 한글 음절)
//       ['<'|'<='|'>'|'>=', 수, 수] · ['?', 참거짓 이름] · ['g', 등급](지금 등급) · ['tr', [트랙…]] · ['P', 술어, 보기…]
// 보기: 이름 · ['q', 글] · ['w', 낱말칸] · ['t'|'h', 보기, n](뒤·앞 n 글자) · ['st', 보기] · ['rw', 보기](오른쪽 공백 걷기)
//       ['rs', 보기, 글자들] · ['j', 보기, 보기](공백으로 잇기) · ['b', 보기, 식칸](첫 일치 앞) · ['l1', 보기](첫 줄)
//       ['bef'|'aft'|'aftk', 보기, 보기](앞 보기 안에서 뒤 보기를 찾은 자리 앞·뒤) · ['ct0'|'ct1', 보기](끝 장식 걷은 본문·꼬리)
//       규칙 단계 전용 — ['grp', n] · ['ah'|'ahs', n](일치·문장 끝 뒤 n 글자) · ['bkw', 낱말칸] · ['kl'|'kr', 목록 낱말칸]
// 수: 숫자 · ['n', 보기](코드포인트 수) · '#이름'
// 보기가 null(찾지 못함)이면 그 원자 조건은 거짓이다.

const VIEW_OPS = {
  q: 1, w: 1, t: 2, h: 2, st: 1, rw: 1, rs: 2, j: 2, b: 2, l1: 1, bef: 2, aft: 2, aftk: 2, ct0: 1, ct1: 1,
  grp: 1, ah: 1, ahs: 1, bkw: 1, kl: 1, kr: 1,
};
const RULE_VIEW_OPS = new Set(['grp', 'ah', 'ahs', 'bkw', 'kl', 'kr']);
const CMP = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };

/** 앞에서 n 코드포인트 지난 위치(n <= 0 이면 0) */
function cpFwdFrom(s, n) {
  return n <= 0 ? 0 : cpHead(s, n).length;
}

function view(x, e) {
  if (typeof e === 'string') return x.v(e);
  const { c } = x;
  const a = (i) => view(x, e[i]);
  switch (e[0]) {
    case 'q': return e[1];
    case 'w': return c.W[e[1]];
    case 't': { const s = a(1); return s === null ? null : cpTail(s, e[2]); }
    case 'h': { const s = a(1); return s === null ? null : cpHead(s, e[2]); }
    case 'st': { const s = a(1); return s === null ? null : strip(s); }
    case 'rw': { const s = a(1); return s === null ? null : rstrip(s); }
    case 'rs': { const s = a(1); return s === null ? null : rstripChars(s, e[2]); }
    case 'j': { const s = a(1); const t = a(2); return s === null || t === null ? null : `${s} ${t}`; }
    case 'b': {
      const s = a(1);
      if (s === null) return null;
      const m = c.R[e[2]].search(s);
      return m ? s.slice(0, m.start()) : null;
    }
    case 'l1': { const s = a(1); return s === null ? null : s.split('\n')[0]; }
    case 'bef': case 'aft': case 'aftk': {
      const s = a(1);
      const t = a(2);
      if (s === null || t === null) return null;
      const k = s.indexOf(t);
      if (e[0] === 'bef') return s.slice(0, Math.max(0, k));
      if (e[0] === 'aftk') return k >= 0 ? s.slice(k + t.length) : null;
      // 파이썬 s[s.find(t) + len(t):] — 못 찾으면 -1 + 길이(코드포인트)에서 자른다
      return s.slice(k >= 0 ? k + t.length : cpFwdFrom(s, cpLen(t) - 1));
    }
    case 'ct0': case 'ct1': { const s = a(1); return s === null ? null : trimTail(c, s)[e[0] === 'ct0' ? 0 : 1]; }
    case 'grp': return x.m.group(e[1]) ?? '';
    case 'ah': return cpAhead(x.text, x.m.end(), e[1]);
    case 'ahs': return cpAhead(x.text, x.se, e[1]);
    case 'bkw': return x.text.slice(0, cpBack(x.text, x.m.end(), cpLen(c.W[e[1]])));
    case 'kl': case 'kr': {
      const g0 = x.m.group(0);
      const k = x.m.start() + Math.max(...c.W[e[1]].map((w) => g0.indexOf(w)));
      return e[0] === 'kl' ? x.text.slice(x.sb, k) : x.text.slice(k, x.se);
    }
    default: throw new Error('view');
  }
}

function numOf(x, e) {
  if (typeof e === 'number') return e;
  if (typeof e === 'string') return x.n(e.slice(1));
  const s = view(x, e[1]);
  return s === null ? NaN : cpLen(s);
}

function cond(x, e) {
  const { c } = x;
  switch (e[0]) {
    case '1': return true;
    case 'and': for (let i = 1; i < e.length; i++) if (!cond(x, e[i])) return false; return true;
    case 'or': for (let i = 1; i < e.length; i++) if (cond(x, e[i])) return true; return false;
    case 'not': return !cond(x, e[1]);
    case 's': case 'm': case 'f': {
      const s = view(x, e[2]);
      if (s === null) return false;
      const r = c.R[e[1]];
      return (e[0] === 's' ? r.search(s) : e[0] === 'm' ? r.match(s) : r.fullmatch(s)) !== null;
    }
    case 'w': case 'l': {
      const s = x.v(e[2]);
      if (s === null) return false;
      const r = c.R[e[1]];
      if (e[0] === 'w' && r.search(s)) return true;
      if (e[0] === 'w' && !x.wr.size) return false;
      return r.search(drop(s, x.o(e[2]), x.wr)) !== null;
    }
    case 'eq': case 'ew': case 'sw': case 'has': {
      const s = view(x, e[1]);
      const t = view(x, e[2]);
      if (s === null || t === null) return false;
      return e[0] === 'eq' ? s === t : e[0] === 'ew' ? s.endsWith(t) : e[0] === 'sw' ? s.startsWith(t) : s.includes(t);
    }
    case 'in': { const s = view(x, e[1]); return s !== null && c.W[e[2]].includes(s); }
    case 'nz': { const s = view(x, e[1]); return s !== null && s !== ''; }
    case 'M': { const s = view(x, e[1]); return s !== null && codaIs(cpLast(s), e[2]); }
    case '<': case '<=': case '>': case '>=': return CMP[e[0]](numOf(x, e[1]), numOf(x, e[2]));
    case '?': return x.b(e[1]);
    case 'g': return x.grade === e[1];
    case 'tr': return e[1].includes(x.track);
    case 'P': {
      const args = e.slice(2).map((v) => view(x, v));
      return !args.includes(null) && pred(c, e[1], args, x.track);
    }
    default: throw new Error('cond');
  }
}

/** 이름 보기만 있는 문맥(술어·결정표용) */
function simpleCtx(c, views, track, extra = {}) {
  return {
    c, track, wr: new Set(),
    v: (k) => (Object.hasOwn(views, k) ? views[k] : null),
    o: () => 0,
    b: (k) => !!extra.bools?.[k],
    n: () => NaN,
  };
}

/** 팩 술어(pred) 하나 — 인자는 술어의 args 이름으로 묶는다 */
function pred(c, name, args, track) {
  const p = c.P.pred[name];
  const views = {};
  p.args.forEach((k, i) => { views[k] = args[i]; });
  return cond(simpleCtx(c, views, track), p.cond);
}

/** 결정표 — 처음 참인 행의 결과, 없으면 undefined */
function firstRow(x, rows) {
  for (const [cnd, out] of rows) if (cond(x, cnd)) return out;
  return undefined;
}

// ── 팩 검증·컴파일

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isStr = (s) => typeof s === 'string' && s.length > 0;
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);

// 문맥마다 쓸 수 있는 이름 — 뜻 없는 번호다. 무엇을 셈하는지는 아래 문맥 함수(unitHits·ruleCtx·t1Grade·t2Row)가,
// 어디에 쓰는지는 팩이 정한다. v: 보기, o: 줄잇기 위치를 아는 보기('w'·'l'), b: 참거짓, n: 수
const CTX = {
  unit: { v: ['u1'], o: [], b: ['u2'], n: [] },
  rule: { v: num2('v', 12), o: ['v01', 'v04', 'v05', 'v06', 'v07'], b: ['v13', 'v14'], n: [] },
  t1: {
    v: num2('k', 16), o: ['k01', 'k04', 'k05', 'k06', 'k07', 'k08', 'k09', 'k10', 'k11', 'k12', 'k13'], b: ['k17'], n: ['k18', 'k19'],
  },
  pair: { v: ['e1', 'e2'], o: [], b: [], n: [] },
  t4: { v: ['f1', 'f2', 'f3', 'f4'], o: [], b: ['f5'], n: [] },
};

/** 표·식 검사기 — refs 에 쓴 칸을 모으고, 모양이 틀리면 false */
function checker(refs, preds) {
  const reRef = (k, iter = false) => {
    if (!isStr(k)) return false;
    refs.re.set(k, (refs.re.get(k) ?? false) || iter);
    return true;
  };
  const wRef = (k, kind) => {
    if (!isStr(k)) return false;
    const prev = refs.w.get(k);
    if (prev && prev !== kind) refs.bad.add(k);
    refs.w.set(k, kind);
    return true;
  };
  const v = (e, ctx) => {
    if (typeof e === 'string') return ctx.v.includes(e);
    if (!Array.isArray(e) || !Object.hasOwn(VIEW_OPS, e[0]) || e.length !== VIEW_OPS[e[0]] + 1) return false;
    if (RULE_VIEW_OPS.has(e[0]) && ctx !== CTX.rule) return false;
    switch (e[0]) {
      case 'q': return typeof e[1] === 'string';
      case 'w': case 'bkw': return wRef(e[1], 'str');
      case 'kl': case 'kr': return wRef(e[1], 'list');
      case 't': case 'h': return v(e[1], ctx) && Number.isInteger(e[2]) && e[2] >= 0;
      case 'rs': return v(e[1], ctx) && isStr(e[2]);
      case 'b': return v(e[1], ctx) && reRef(e[2]);
      case 'j': case 'bef': case 'aft': case 'aftk': return v(e[1], ctx) && v(e[2], ctx);
      case 'grp': case 'ah': case 'ahs': return Number.isInteger(e[1]) && e[1] >= 0;
      default: return v(e[1], ctx);
    }
  };
  const n = (e, ctx) => typeof e === 'number' ? Number.isFinite(e)
    : typeof e === 'string' ? e.startsWith('#') && ctx.n.includes(e.slice(1))
      : Array.isArray(e) && e.length === 2 && e[0] === 'n' && v(e[1], ctx);
  const cnd = (e, ctx, grade = false) => {
    if (!Array.isArray(e) || !e.length) return false;
    switch (e[0]) {
      case '1': return e.length === 1;
      case 'and': case 'or': return e.length >= 2 && e.slice(1).every((x) => cnd(x, ctx, grade));
      case 'not': return e.length === 2 && cnd(e[1], ctx, grade);
      case 's': case 'm': case 'f': return e.length === 3 && reRef(e[1]) && v(e[2], ctx);
      case 'w': case 'l': return e.length === 3 && reRef(e[1]) && ctx.o.includes(e[2]);
      case 'eq': case 'ew': case 'sw': case 'has': return e.length === 3 && v(e[1], ctx) && v(e[2], ctx);
      case 'in': return e.length === 3 && v(e[1], ctx) && wRef(e[2], 'list');
      case 'nz': return e.length === 2 && v(e[1], ctx);
      case 'M': return e.length === 3 && v(e[1], ctx) && Number.isInteger(e[2]) && e[2] >= 0 && e[2] < 28;
      case '<': case '<=': case '>': case '>=': return e.length === 3 && n(e[1], ctx) && n(e[2], ctx);
      case '?': return e.length === 2 && ctx.b.includes(e[1]);
      case 'g': return grade && e.length === 2 && (e[1] === 'A' || e[1] === 'B');
      case 'tr': return e.length === 2 && Array.isArray(e[1]) && e[1].length > 0 && e[1].every((t) => RHETORIC_TRACKS.includes(t));
      case 'P': {
        const p = preds[e[1]];
        return !!p && e.length === p.args.length + 2 && e.slice(2).every((x) => v(x, ctx));
      }
      default: return false;
    }
  };
  return { cnd, v, reRef, wRef };
}

/**
 * 팩 rhetoric 절 검증·컴파일. 오류는 고정 코드만(식·낱말·규칙 id 원문을 싣지 않는다 — id 는 칸 번호나 rule#순번).
 * 빈 절·빈 규칙·등급 없는 규칙·쓰지 않는 칸·없는 칸·겹치는 규칙 id·나올 수 없는 승격 id 는 모두 불완전(오류)이다.
 * @returns {{ pack: any } | { errors: { code: string, id?: string }[] }}
 */
export function compileRhetoricPack(section) {
  if (!isObj(section) || section.format !== RHETORIC_FORMAT || !isStr(section.version) || !isObj(section.re) || !isObj(section.words)) {
    return { errors: [{ code: 'RHETORIC_FORMAT' }] };
  }
  const errors = [];
  const refs = { re: new Map(), w: new Map(), bad: new Set() };
  for (const k of RHETORIC_CODE_RE) refs.re.set(k, CODE_ITER.has(k));
  for (const k of RHETORIC_CODE_WORDS) refs.w.set(k, 'str');
  // 술어 — 이름은 코드가 부르는 p1~p3 만
  const preds = {};
  const predOk = isObj(section.pred) && ['p1', 'p2', 'p3'].every((k) => own(section.pred, k))
    && Object.keys(section.pred).length === 3;
  if (!predOk) errors.push({ code: 'RHETORIC_TABLE', id: 'pred' });
  else {
    for (const [k, p] of Object.entries(section.pred)) {
      if (!isObj(p) || !Array.isArray(p.args) || !p.args.length || !p.args.every(isStr)) errors.push({ code: 'RHETORIC_TABLE', id: k });
      else preds[k] = { args: [...p.args], cond: p.cond };
    }
  }
  const ck = checker(refs, preds);
  for (const [k, p] of Object.entries(preds)) {
    if (!ck.cnd(p.cond, { v: p.args, o: [], b: [], n: [] })) errors.push({ code: 'RHETORIC_TABLE', id: k });
  }
  // 가림 식 차례 — [식칸, 'grp', n] 또는 [식칸, 'keep', 상한]
  const mask = Array.isArray(section.mask) ? section.mask : null;
  if (!mask || !mask.length || !mask.every((s) => Array.isArray(s) && s.length === 3 && ck.reRef(s[0], true)
    && ((s[1] === 'grp' && Number.isInteger(s[2]) && s[2] >= 0) || (s[1] === 'keep' && Number.isInteger(s[2]) && s[2] > 0)))) {
    errors.push({ code: 'RHETORIC_TABLE', id: 'mask' });
  }
  // t1 단계 — 결정표·묶음 번호·글자 모음
  const t1 = section.t1;
  const t1Ok = isObj(t1) && Array.isArray(t1.groups) && t1.groups.length === 3 && t1.groups.every((g) => Number.isInteger(g) && g > 0)
    && Array.isArray(t1.chars) && t1.chars.length === 2 && t1.chars.every(isStr)
    && Array.isArray(t1.chain) && t1.chain.length > 0
    && t1.chain.every((r) => Array.isArray(r) && r.length === 2 && ['x', 'A', 'B'].includes(r[1]) && ck.cnd(r[0], CTX.t1));
  if (!t1Ok) errors.push({ code: 'RHETORIC_TABLE', id: 't1' });
  // 끝 장식 걷기 — [꼬리 식, 틀 식, 걷을 글자]
  const tail = section.tail;
  if (!(Array.isArray(tail) && tail.length === 3 && ck.reRef(tail[0]) && ck.reRef(tail[1]) && isStr(tail[2]))) {
    errors.push({ code: 'RHETORIC_TABLE', id: 'tail' });
  }
  // 이웃 두 조각 결정표 t2·t3, 앞 조각 붙이기 조건 t4
  const gradeSpec = (g, ctx) => g === 'A' || g === 'B' || (Array.isArray(g) && g.length === 3 && ck.cnd(g[0], ctx) && GRADES.has(g[1]) && GRADES.has(g[2]) && g[1] && g[2]);
  const outIds = new Set();
  const t2 = section.t2;
  const t2Ok = Array.isArray(t2) && t2.length > 0 && t2.every((r) => Array.isArray(r) && r.length === 2 && ck.cnd(r[0], CTX.pair)
    && (r[1] === 'x' || (isObj(r[1]) && ck.wRef(r[1].id, 'str') && ck.wRef(r[1].alt, 'str')
      && (r[1].comma === null || ck.wRef(r[1].comma, 'str')) && gradeSpec(r[1].g, CTX.pair))));
  if (!t2Ok) errors.push({ code: 'RHETORIC_TABLE', id: 't2' });
  const t3 = section.t3;
  const t3Ok = Array.isArray(t3) && t3.length > 0 && t3.every((r) => Array.isArray(r) && r.length === 2 && ck.cnd(r[0], CTX.pair)
    && (r[1] === 'c' || (isObj(r[1]) && (r[1].g === 'A' || r[1].g === 'B') && ck.wRef(r[1].alt, 'str') && ck.wRef(r[1].id, 'str'))));
  if (!t3Ok) errors.push({ code: 'RHETORIC_TABLE', id: 't3' });
  if (!ck.cnd(section.t4, CTX.t4)) errors.push({ code: 'RHETORIC_TABLE', id: 't4' });
  const t5 = section.t5;
  if (!(Number.isInteger(t5) && t5 > 0)) errors.push({ code: 'RHETORIC_TABLE', id: 't5' });
  // 규칙
  const rules = [];
  const ruleIds = new Set();
  if (!Array.isArray(section.rules) || !section.rules.length) errors.push({ code: 'RULE_SHAPE' });
  else {
    section.rules.forEach((r, i) => {
      const id = `rule#${i + 1}`;
      const gradesOk = isObj(r?.grades) && Object.keys(r.grades).length > 0
        && Object.entries(r.grades).every(([t, g]) => RHETORIC_TRACKS.includes(t) && GRADES.has(g))
        && Object.values(r.grades).some((g) => g !== null);
      const stepsOk = Array.isArray(r?.steps) && r.steps.every((st) => (st === 't1' && t1Ok) || (Array.isArray(st) && st.length > 0
        && st.every((row) => Array.isArray(row) && row.length === 2 && ck.cnd(row[0], CTX.rule, true)
          && (row[1] === 'x' || row[1] === 'A' || row[1] === 'B'
            || (Array.isArray(row[1]) && row[1].length === 2 && (row[1][0] === 'A' || row[1][0] === 'B') && ck.wRef(row[1][1], 'str'))))));
      const ok = isObj(r) && isStr(r.id) && isStr(r.family) && isStr(r.re) && (r.flags === '' || r.flags === 'm')
        && gradesOk && typeof r.alt === 'string' && (r.unit === null || ck.cnd(r.unit, CTX.unit)) && stepsOk;
      if (!ok) {
        errors.push({ code: 'RULE_SHAPE', id });
        return;
      }
      if (ruleIds.has(r.id)) errors.push({ code: 'RULE_DUP', id });
      ruleIds.add(r.id);
      for (const st of r.steps) if (Array.isArray(st)) for (const row of st) if (Array.isArray(row[1])) outIds.add(row[1][1]);
      try {
        const rx = pyCompile(r.re, { multiline: r.flags === 'm' });
        if (rx.canEmpty) errors.push({ code: 'RE_EMPTY', id });
        else rules.push(Object.freeze({ id: r.id, family: r.family, rx, grades: Object.freeze({ ...r.grades }), alt: r.alt, unit: r.unit, steps: r.steps }));
      } catch {
        errors.push({ code: 'RE_COMPILE', id });
      }
    });
  }
  // 칸 — 쓴 칸만 있어야 하고 쓴 칸은 다 있어야 한다
  const R = {};
  for (const k of new Set([...Object.keys(section.re), ...refs.re.keys()])) {
    const e = section.re[k];
    if (!refs.re.has(k)) { errors.push({ code: 'RHETORIC_SLOT_UNUSED', id: k }); continue; }
    if (!own(section.re, k) || !Array.isArray(e) || e.length !== 2 || !isStr(e[0]) || (e[1] !== '' && e[1] !== 'm')) {
      errors.push({ code: 'RHETORIC_SLOT', id: k });
      continue;
    }
    try {
      R[k] = pyCompile(e[0], { multiline: e[1] === 'm' });
      if (refs.re.get(k) && R[k].canEmpty) errors.push({ code: 'RE_EMPTY', id: k });
    } catch {
      errors.push({ code: 'RE_COMPILE', id: k });
    }
  }
  const W = {};
  for (const k of new Set([...Object.keys(section.words), ...refs.w.keys()])) {
    const v = section.words[k];
    const kind = refs.w.get(k);
    if (!kind) { errors.push({ code: 'RHETORIC_WORD_UNUSED', id: k }); continue; }
    const ok = !refs.bad.has(k) && own(section.words, k) && (kind === 'list'
      ? Array.isArray(v) && v.length > 0 && v.every(isStr)
      : isStr(v));
    if (!ok) { errors.push({ code: 'RHETORIC_WORD', id: k }); continue; }
    W[k] = kind === 'list' ? Object.freeze([...v]) : v;
  }
  // 승격 기준 — 나올 수 있는 id(규칙 id·표가 내는 id·코드가 내는 id)만
  const promote = [];
  if (!errors.length) {
    for (const k of ['w07', 'w08', 'w11']) outIds.add(k);
    for (const r of t2) if (isObj(r[1])) outIds.add(r[1].id);
    for (const r of t3) if (isObj(r[1])) outIds.add(r[1].id);
    const known = new Set([...ruleIds, ...[...outIds].map((k) => W[k])]);
    const promoteOk = Array.isArray(section.promote) && section.promote.every((x) => Array.isArray(x) && x.length === 2
      && Array.isArray(x[0]) && x[0].length > 0 && x[0].every((s) => isStr(s) && known.has(s)) && Number.isInteger(x[1]) && x[1] > 0);
    if (!promoteOk) errors.push({ code: 'PROMOTE_SHAPE' });
    else for (const [ids, need] of section.promote) promote.push(Object.freeze({ ids: new Set(ids), need }));
  }
  if (errors.length) return { errors };
  return {
    pack: Object.freeze({
      R: Object.freeze(R), W: Object.freeze(W), rules: Object.freeze(rules), promote: Object.freeze(promote),
      pred: preds, mask, tail, t1, t2, t3, t4: section.t4, t5, version: section.version,
    }),
  };
}

// ── 줄 준비

function keepNl(m, lim) {
  const g = m.group(0);
  if (nonWsCp(g) > lim) return g; // 상한은 공백·줄바꿈을 빼고 센다
  let out = '';
  for (const ch of g) out += ch === '\n' ? '\n' : '·';
  return out;
}

/** 팩이 정한 차례대로 가린다 — 'grp' 는 그 묶음만 남기고, 'keep' 은 줄바꿈만 남기고 같은 글자 수의 가운뎃점으로 */
function maskText(c, txt) {
  let t = txt;
  for (const [k, op, n] of c.P.mask) {
    t = c.R[k].sub((m) => (op === 'grp' ? m.group(n) ?? '' : keepNl(m, n)), t);
  }
  return t;
}

/** 검사용 줄 목록 — 빼는 줄(머리말 블록·코드 블록·인용 블록·팩이 정한 머리로 시작하는 줄)은 빈 줄로 두어 행 번호를 지킨다 */
function prepare(c, txt) {
  const { R, W } = c;
  const lines = txt.split('\n');
  const out = [];
  let inFm = lines[0] === '---';
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const s = strip(l);
    if (inFm) {
      out.push('');
      if (i > 0 && s === '---') inFm = false;
      continue;
    }
    if (s.startsWith('```')) {
      inCode = !inCode;
      out.push('');
      continue;
    }
    if (inCode || s.startsWith('>') || s.startsWith(W.w01)) {
      out.push('');
      continue;
    }
    l = R.r01.sub('', l);
    l = R.r02.sub('', l);
    if (R.r05.findall(l).length >= 15 && !R.r06.search(l)) l = R.r03.sub((m) => `${m.group(1) ?? ''} `, l);
    if (l.includes('**') && !R.r04.match(l)) l = l.replaceAll('**', '');
    out.push(l);
  }
  return maskText(c, out.join('\n')).split('\n');
}

function isCell(R, s) {
  if (strip(s).includes(' ') && R.r07.search(s)) return false;
  return cpLen(s) < 15 && !R.r08.search(s) && !R.r09.fullmatch(s);
}

/** 쪽 번호 줄과 그 앞뒤 빈 줄·장식 줄·반복 머리말의 행 번호(0부터) */
function pageSkip(R, lines) {
  const skip = new Set();
  const cnt = new Map();
  for (const l of lines) {
    const s = strip(l);
    if (s) cnt.set(s, (cnt.get(s) ?? 0) + 1);
  }
  let pnums = [];
  lines.forEach((l, i) => {
    if (R.r10.match(l)) pnums.push(i);
  });
  const bare = [];
  lines.forEach((l, i) => {
    const m = R.r11.match(l);
    if (m && (i + 1 >= lines.length || !strip(lines[i + 1]))) bare.push([i, pyInt(m.group(1) || m.group(2) || '')]);
  });
  if (bare.length >= 2 && bare.every((b, k) => k === 0 || b[1] === bare[k - 1][1] + 1)) {
    pnums = [...new Set([...pnums, ...bare.map((b) => b[0])])].sort((a, b) => a - b);
  }
  lines.forEach((l, i) => {
    const s = strip(l);
    if (!s || (cnt.get(s) ?? 0) < 2 || cpLen(s) >= 40 || R.r08.search(s) || R.r12.match(l) || i === 0) return;
    if (strip(lines[i - 1])) return;
    let j = i - 1;
    while (j >= 0 && !strip(lines[j])) j--;
    let k = i + 1;
    while (k < lines.length && !strip(lines[k])) k++;
    if (j >= 0 && k < lines.length && cpLen(strip(lines[j])) >= 15 && !R.r08.search(lines[j]) && R.r13.match(lines[k])) {
      for (let x = j + 1; x < k; x++) skip.add(x);
    }
  });
  if (!pnums.length) return skip;
  const lim = Math.max(2, Math.floor(pnums.length / 2));
  for (const i of pnums) {
    skip.add(i);
    for (const d of [-1, 1]) {
      let j = i + d;
      while (j >= 0 && j < lines.length) {
        const s = strip(lines[j]);
        if (!s || R.r14.fullmatch(s) || R.r10.match(s) || ((cnt.get(s) ?? 0) >= lim && cpLen(s) < 40 && !R.r08.search(s))) {
          skip.add(j);
          j += d;
        } else break;
      }
    }
  }
  return skip;
}

/** 줄을 문장 단위(unit)로 잇는다 — { text, offs: [[unit 안 위치, 행]], wraps: 줄잇기 공백 위치, cont: 앞 unit 과 같은 문단, gap: 앞에 빈 줄 } */
function buildUnits(c, lines) {
  const { R } = c;
  const units = [];
  let cur = '';
  let offs = [];
  let wraps = new Set();
  let prev = '';
  let cont = false;
  let gap = true;
  let gapNext = true;
  let pageBreak = false;
  const skip = pageSkip(R, lines);
  const flush = (nextCont) => {
    if (strip(cur)) {
      units.push({ text: cur, offs, wraps, cont, gap });
      cont = nextCont;
    } else cont = false;
    cur = '';
    offs = [];
    wraps = new Set();
  };
  for (let n = 1; n <= lines.length; n++) {
    const line = lines[n - 1];
    if (skip.has(n - 1)) {
      pageBreak = true;
      continue;
    }
    const s = strip(line);
    if (!s) {
      flush(false);
      prev = '';
      gapNext = true;
      continue;
    }
    const ps = strip(prev);
    const punctOnly = !!R.r09.fullmatch(s);
    const struct = !!R.r12.match(line);
    const psLen = cpLen(ps);
    const label = strip(cur) === ps && psLen >= 15 && psLen < 30 && !R.r08.search(ps) && !R.r07.search(ps)
      && !R.r15.search(ps) && !R.r16.search(ps) && !!R.r08.search(s)
      && !R.r17.match(line) && !R.r18.match(s) && !pageBreak
      && !R.r19.match(ps) && !R.r20.search(ps);
    let isNew = !cur || struct || !!(R.r12.match(prev) && R.r21.match(prev))
      || !!(R.r08.search(prev) && !punctOnly)
      || !!(R.r22.search(prev) && struct)
      || label
      || (isCell(R, ps) && cpLen(s) > 2 && !(prev.endsWith(' ') || prev.endsWith('\t')) && !pageBreak
        && !(cpLen(strip(cur)) > psLen + 15 && !R.r12.match(prev)));
    if (punctOnly && cur) isNew = false;
    else if (isNew && cur && !R.r08.search(prev) && !R.r21.match(line) && !R.r21.match(prev)) {
      const tail80 = cpTail(cur, 80);
      const nxt = n < lines.length ? lines[n] : '';
      if (tail80.lastIndexOf('(') > tail80.lastIndexOf(')') || tail80.lastIndexOf('[') > tail80.lastIndexOf(']')
        || (R.r23.search(rstrip(cur)) && R.r24.match(line) && !R.r12.match(prev))
        || R.r17.match(line) || (R.r25.match(line) && R.r17.match(nxt))) {
        isNew = false; // 닫히지 않은 괄호·이어지는 머리로 시작하는 줄 = 끊긴 문장의 뒤
      }
    }
    if (isNew) flush(!!strip(cur) && !struct && !isCell(R, ps));
    else if (cur && !punctOnly && !pyIsspace(cpLast(cur)) && !pyIsspace(cpHead(line, 1)) && R.r05.match(s)) {
      if (R.r26.search(cur)) cur = cur.slice(0, -1); // 줄 끝 하이픈으로 낱말을 나눈 추출본
      else if (R.r18.match(s)) {
        // 낱말 중간에서 끊긴 것(공백 없이 잇는다)
      } else if (R.r27.search(cur) || R.r28.match(s)) cur += ' ';
      else if (R.r15.search(cur) || pageBreak) {
        wraps.add(cur.length);
        cur += ' ';
      }
    }
    if (!cur) {
      gap = gapNext;
      gapNext = false;
    }
    offs.push([cur.length, n]);
    cur += line;
    prev = line;
    pageBreak = false;
  }
  flush(false);
  return units;
}

/** bisect_right 로 위치의 행 번호 */
function lineOf(offs, pos) {
  let lo = 0;
  let hi = offs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pos < offs[mid][0]) hi = mid;
    else lo = mid + 1;
  }
  return offs[Math.max(lo - 1, 0)][1];
}

function sentenceSpan(c, text, pos) {
  let ends = c.sent.get(text);
  if (!ends) {
    ends = c.R.r29.finditer(text).map((m) => [m.start(), m.end()]);
    c.sent.set(text, ends);
  }
  let b = 0;
  for (const [s, e] of ends) {
    if (e <= pos) b = e;
    else if (s >= pos) return [b, e];
  }
  return [b, text.length];
}

/** 뒤에서부터 r31 에 걸리는 어절과, w02·w03 으로 그 앞에 이어 붙는 어절들 */
function runBack(c, pre) {
  const { R, W } = c;
  const w = pySplit(pre).filter((x) => !R.r30.fullmatch(x));
  if (!w.length) return '';
  let k = w.length - 1;
  while (k >= 0 && !R.r31.search(w[k])) k--;
  if (k < 0) return '';
  const np = [w[k]];
  if (w[k] === W.w02 && k > 0) np.unshift(w[k - 1]);
  let j = w[k] !== W.w02 ? k - 1 : k - 2;
  while (j >= 0 && w[j].endsWith(W.w03)) {
    np.unshift(w[j]);
    j--;
  }
  return np.join(' ');
}

/** 문장 끝 장식을 걷는다 → [본문, 걷은 꼬리] */
function trimTail(c, s) {
  const [t, frame, chars] = c.P.tail;
  const m = c.R[t].search(s);
  if (!m || !strip(m.group(0))) return [s, ''];
  const tl = m.group(0);
  if (c.R[frame].search(tl)) {
    const k = rstripChars(s, chars).length;
    return [s.slice(0, k), s.slice(k)];
  }
  return [s.slice(0, m.start()), tl];
}

/** 받침 번호가 n 인 한글 음절인가(0 = 받침 없음) */
function codaIs(ch, n) {
  if (!ch) return false;
  const o = ch.codePointAt(0);
  return o >= 0xac00 && o <= 0xd7a3 && (o - 0xac00) % 28 === n;
}

/** 줄잇기 공백(wr: 문장 기준 위치)을 뺀 판 */
function drop(s, off, wr) {
  if (!wr.size) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) if (!wr.has(off + i)) out += s[i];
  return out;
}

/** 거꾸로 맞춘 공통 꼬리 길이(코드포인트) */
function commonSuffixCp(a, b) {
  const x = [...a];
  const y = [...b];
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}

/** t1 단계 한 건의 등급 — 보기(k01…k19)는 여기서 셈하고, 판정은 팩 결정표(t1.chain) 차례대로. null = 보지 않는다 */
function t1Grade(c, sent0, ms, me, g1, g2, g3, wr, track) {
  const { R, W, P } = c;
  const [ch1, ch2] = P.t1.chars;
  const sent = R.r32.sub((x) => W.w04.repeat(cpLen(x.group(0))), sent0);
  const memo = new Map();
  const once = (k, f) => {
    if (!memo.has(k)) memo.set(k, f());
    return memo.get(k);
  };
  const k05 = () => sent.slice(0, ms);
  const k06 = () => once('k06', () => trimTail(c, sent.slice(me))[0]);
  const h1 = () => once('h1', () => k06().length - lstripChars(k06(), ch1).length);
  const k08 = () => once('k08', () => k06().slice(h1()));
  const h2 = () => me + h1();
  const h3 = () => once('h3', () => pySplit(k08()));
  const k10 = () => once('k10', () => (h3().length ? h3()[0] : ''));
  const h4 = () => (k10() ? k08().indexOf(k10()) + k10().length : 0);
  const h5 = () => once('h5', () => R.r33.search(k08()));
  const k17 = () => once('k17', () => !!(h5() && !R.r34.search(k08().slice(h5().end()))));
  const h6 = () => (k17() ? h5().end() : k08().length);
  const h7 = () => once('h7', () => {
    const ms5 = R.r35.finditer(k05());
    return ms5.length ? ms5[ms5.length - 1].end() : 0;
  });
  const k13 = () => once('k13', () => rstripChars(k08().slice(0, h6()), ch2));
  const k16 = () => once('k16', () => R.r36.sub('', k10()));
  const views = {
    k01: [() => g1, () => ms], k02: [() => g2, null], k03: [() => g3, null], k04: [() => sent, () => 0],
    k05: [k05, () => 0], k06: [k06, () => me], k07: [() => sent.slice(0, me) + k06(), () => 0],
    k08: [k08, h2], k09: [() => k08().slice(0, h6()), h2], k10: [k10, h2],
    k11: [() => k08().slice(h4(), Math.max(h4(), h6())), () => h2() + h4()], k12: [() => k05().slice(h7()), h7],
    k13: [k13, h2], k14: [() => once('k14', () => runBack(c, k05())), null],
    k15: [() => once('k15', () => {
      const pw = pySplit(k05());
      let ti = -1;
      pw.forEach((w, i) => {
        if (R.r37.search(w)) ti = i;
      });
      return cpTail(pw.slice(ti + 1).join(' '), 20);
    }), null],
    k16: [k16, null],
  };
  const nums = {
    k18: () => commonSuffixCp(g1, k16()),
    k19: () => Math.min((k17() ? pySplit(k13()) : h3()).length, pySplit(drop(k13(), h2(), wr)).length),
  };
  const x = {
    c, track, wr,
    v: (n) => views[n][0](),
    o: (n) => views[n][1](),
    b: () => k17(),
    n: (n) => nums[n](),
  };
  const out = firstRow(x, P.t1.chain);
  return out === 'x' ? null : (out ?? 'A');
}

/** [시작, 다듬은 문장] 목록 */
function segs(c, text) {
  const out = [];
  for (const m of c.R.r39.finditer(text)) {
    const g = strip(m.group(0));
    if (g) out.push([m.start(), g]);
  }
  return out;
}

/** 이웃한 두 조각 결정표 t2 → { id, alt, comma, g } 또는 null */
function t2Row(c, s0, nx0, track) {
  const x = simpleCtx(c, { e1: strip(s0), e2: strip(nx0) }, track);
  const out = firstRow(x, c.P.t2);
  if (!out || out === 'x') return null;
  const g = Array.isArray(out.g) ? (cond(x, out.g[0]) ? out.g[1] : out.g[2]) : out.g;
  return { id: c.W[out.id], alt: c.W[out.alt], comma: out.comma === null ? null : c.W[out.comma], g };
}

function pairHit(c, s, nx, line, p, ui, track) {
  const { W } = c;
  const va = pred(c, 'p2', [s, nx], track) && pred(c, 'p3', [nx], track);
  return [line, va ? 'A' : 'B', cpTail(s, 30), W.w06, W.w05, va ? W.w08 : W.w07, p, p + s.length, ui];
}

/** 규칙 단계의 문맥 — 보기(v01…v14)는 그때그때 셈한다(t1 단계가 문장을 좁히면 v04·v11·v12 가 따라 바뀐다) */
function ruleCtx(c, o) {
  const x = { c, ...o, sent: o.text.slice(o.sb, o.se), cb: o.sb, wr: o.wraps };
  const prevSent = () => (x.sb > 1 ? x.text.slice(sentenceSpan(c, x.text, x.sb - 2)[0], x.sb) : x.prevUnit);
  const V = {
    v01: [() => x.text, () => 0],
    v02: [() => strip(x.text), null],
    v03: [() => x.m.group(0), null],
    v04: [() => x.sent, () => x.cb],
    v05: [() => x.text.slice(x.sb, x.se), () => x.sb],
    v06: [() => x.text.slice(x.sb, x.m.start()), () => x.sb],
    v07: [() => x.text.slice(x.m.end(), x.se), () => x.m.end()],
    v08: [() => x.text.slice(x.sb > 1 ? sentenceSpan(c, x.text, x.sb - 2)[0] : x.sb, x.se), null],
    v09: [prevSent, null],
    v10: [() => prevSent() || x.prevItem, null],
    v11: [() => x.sent.slice(0, x.m.end() - x.cb), null],
    v12: [() => x.sent.slice(x.m.end() - x.cb), null],
  };
  x.v = (n) => V[n][0]();
  x.o = (n) => V[n][1]();
  x.b = (n) => (n === 'v14' ? x.isHead : x.wraps.has(x.m.end()));
  x.n = () => NaN;
  return x;
}

/** t1 단계 — 표 칸(|)이면 그 칸으로 좁히고(r38 에 걸리면 버림) 결정표로 등급. false = 버린다 */
function t1Stage(x) {
  const { c, text, m, sb, se } = x;
  const [n1, n2, n3] = c.P.t1.groups;
  const g1 = m.group(n1) ?? '';
  const g2 = m.group(n2) ?? '';
  const g3 = m.group(n3) ?? '';
  let cb = sb;
  let ce = se;
  let sent = text.slice(sb, se);
  if (sent.includes('|')) {
    const end = m.start() - sb;
    cb = sb + (end > 0 ? sent.lastIndexOf('|', end - 1) : -1) + 1;
    const k = sent.indexOf('|', m.end() - sb);
    ce = k >= 0 ? sb + k : se;
    if (c.R.r38.search(`${text.slice(sb, cb)} | ${text.slice(ce, se)}`)) return false;
    sent = text.slice(cb, ce);
  }
  x.sent = sent;
  x.cb = cb;
  const wr = new Set();
  for (const p of x.wraps) if (cb <= p && p < ce) wr.add(p - cb);
  const gr = t1Grade(c, sent, m.start() - cb, m.end() - cb, g1, g2, g3, wr, x.track);
  if (gr === null) return false;
  x.grade = gr;
  return true;
}

function runSteps(x, steps) {
  for (const stage of steps) {
    if (stage === 't1') {
      if (!t1Stage(x)) return false;
      continue;
    }
    const out = firstRow(x, stage);
    if (out === undefined) continue;
    if (out === 'x') return false;
    if (Array.isArray(out)) {
      x.grade = out[0];
      x.rid = x.c.W[out[1]];
    } else x.grade = out;
  }
  return true;
}

const gradeFor = (grades, track) => {
  const has = (t) => Object.hasOwn(grades, t);
  return track === 'lecture' ? (has('lecture') ? grades.lecture : (has('legal') ? grades.legal : null)) : (has(track) ? grades[track] : null);
};

/** unit 하나의 적중 — [행, 등급, 조각, 교정, 계열, 규칙 id, 시작, 끝, unit] */
function unitHits(c, text, offs, track, ui, isHead, wraps, prevUnit, prevItem) {
  const { R, W, P } = c;
  const hits = [];
  const st = strip(text);
  const unitX = simpleCtx(c, { u1: st }, track, { bools: { u2: isHead } });
  for (const rule of P.rules) {
    const g = gradeFor(rule.grades, track);
    if (!g) continue;
    if (rule.unit && cond(unitX, rule.unit)) continue;
    for (const m of rule.rx.finditer(text)) {
      const [sb, se] = sentenceSpan(c, text, m.start());
      const x = ruleCtx(c, { text, m, sb, se, wraps, prevUnit, prevItem, track, isHead, grade: g, rid: rule.id });
      if (!runSteps(x, rule.steps)) continue;
      hits.push([lineOf(offs, m.start()), x.grade, cpHead(strip(m.group(0)), 30), rule.alt, rule.family, x.rid, m.start(), m.end(), ui]);
    }
  }
  // 이웃한 두 조각 — 팩 결정표 t3(c = 코드가 짓는 적중, 앞 조각 붙이기는 t4)
  const sg = segs(c, text);
  for (let i = 0; i < sg.length - 1; i++) {
    const [p, s] = sg[i];
    const nx = sg[i + 1][1];
    const out = firstRow(simpleCtx(c, { e1: s, e2: nx }, track), P.t3);
    if (out === 'c') {
      const q = i > 0 ? sg[i - 1][1] : (prevUnit || '');
      const qx = simpleCtx(c, { f1: s, f2: q, f3: st, f4: `${text.slice(0, p)} ${prevUnit || ''}` }, track, { bools: { f5: isHead } });
      if (cond(qx, P.t4)) {
        const h = pairHit(c, `${q} ${s}`, nx, lineOf(offs, p), p, ui, track);
        h[2] = cpTail(s, 30);
        h[7] = p + s.length;
        hits.push(h);
      } else hits.push(pairHit(c, s, nx, lineOf(offs, p), p, ui, track));
    } else if (out) {
      hits.push([lineOf(offs, p), out.g, cpTail(s, 30), W[out.alt], W.w05, W[out.id], p, p + s.length, ui]);
    }
  }
  // 한 문장 안에 이어 쓴 꼴
  for (const mm of R.r40.finditer(text)) {
    const sb = sentenceSpan(c, text, mm.start())[0];
    const se = sentenceSpan(c, text, mm.end())[1];
    const va = pred(c, 'p2', [text.slice(sb, mm.start()), text.slice(mm.end(), se)], track) && pred(c, 'p3', [text.slice(mm.end(), se)], track);
    hits.push([lineOf(offs, mm.start()), va ? 'A' : 'B', cpHead(strip(text.slice(cpBack(text, mm.start(), 20), mm.end())), 30),
      W.w06, W.w05, va ? W.w08 : W.w07, mm.start(), mm.end(), ui]);
  }
  // 이웃한 두 조각 — 결정표 t2
  for (let i = 0; i < sg.length - 1; i++) {
    const [p, s] = sg[i];
    const [p2, nx] = sg[i + 1];
    const r = t2Row(c, s, nx, track);
    if (r) hits.push([lineOf(offs, p), r.g, cpHead(`${cpTail(s, 15)} ${nx}`, 30), r.alt, W.w05, r.id, p, p2 + nx.length, ui]);
  }
  // 쉼표 뒤 꼬리를 뒤 문장으로 본다(쉼표 교정문이 있는 결과만)
  for (const [p, s] of sg) {
    const mc = R.r41.search(s);
    const r = mc ? t2Row(c, rstripChars(s.slice(0, mc.start(P.t5)), ', '), mc.group(P.t5) ?? '', track) : null;
    if (r && r.comma) hits.push([lineOf(offs, p), r.g, cpTail(s, 30), r.comma, W.w05, r.id, p, p + s.length, ui]);
  }
  return hits;
}

const gradeCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * AI 수사 검사. pack = compileRhetoricPack(...).pack, track ∈ RHETORIC_TRACKS(부르는 쪽이 거른다).
 * 글은 파이썬이 파일을 읽을 때처럼 \r\n·\r 을 \n 으로 바꿔 본다(BOM 은 남긴다).
 * @returns {{ hits: { line: number, grade: 'A'|'B', frag: string, alt: string, family: string, rule: string }[], chars: number }}
 */
export function checkRhetoric(text, { pack, track }) {
  const c = { R: pack.R, W: pack.W, P: pack, sent: new Map() };
  const { R, W } = c;
  const lines = prepare(c, universalNewlines(String(text)));
  const body = lines.join('\n');
  const units = buildUnits(c, lines);
  const hits = [];
  let prevText = '';
  let quoteRun = 0;
  units.forEach((u, ui) => {
    const { text: t, offs, wraps, cont, gap } = u;
    const first = strip(lines[offs[0][1] - 1]);
    let isHead = !!R.r42.match(first) || (first.startsWith('**') && first.endsWith('**'));
    const st = strip(t);
    if (!isHead && !gap && ui > 0 && offs.length === 1 && st.endsWith('?') && cpLen(st) < 60
      && !R.r29.search(st.slice(0, -1)) && !R.r19.match(st)) {
      isHead = true; // 표지가 사라진 질문형 소제목
    }
    let pu = '';
    let pb = '';
    if (ui > 0 && (cont || !gap)) {
      const pseg = segs(c, units[ui - 1].text);
      const last = pseg.length ? pseg[pseg.length - 1][1] : '';
      if (cont) pu = last;
      else pb = last;
    }
    const uh = unitHits(c, t, offs, track, ui, isHead, wraps, pu, pb);
    if (cont && ui > 0) {
      const { text: pt, offs: poffs } = units[ui - 1];
      const ps = segs(c, pt);
      const ns = segs(c, t);
      if (ps.length && ns.length && pred(c, 'p1', [ps[ps.length - 1][1], ns[0][1]], track)) {
        const p = ps[ps.length - 1][0];
        hits.push(pairHit(c, ps[ps.length - 1][1], ns[0][1], lineOf(poffs, p), p, ui - 1, track));
      }
      const r = ps.length && ns.length ? t2Row(c, ps[ps.length - 1][1], ns[0][1], track) : null;
      if (r) {
        const p = ps[ps.length - 1][0];
        hits.push([lineOf(poffs, p), r.g, cpHead(`${cpTail(ps[ps.length - 1][1], 15)} ${ns[0][1]}`, 30), r.alt, W.w05, r.id, p, BIG, ui - 1]);
      }
    }
    if (R.r43.search(strip(prevText))) quoteRun = 3;
    else if (gap || R.r19.match(st) || isHead || R.r44.search(st)) quoteRun = 0;
    if (quoteRun && !R.r19.match(st) && !isHead) {
      quoteRun -= 1;
      for (const h of uh) if (h[4] === W.w05 && h[1] === 'A') h[1] = 'B';
    } else quoteRun = 0;
    for (const h of uh) hits.push(h);
    prevText = t;
  });
  // 여러 줄에 걸친 꼴(본문 전체에 한 번)
  for (const m of R.r45.finditer(body)) {
    let n = 1;
    for (let i = body.indexOf('\n'); i >= 0 && i < m.start(); i = body.indexOf('\n', i + 1)) n++;
    const qline = m.group(0).split('\n')[0];
    hits.push([n, 'B', cpHead(strip(qline), 30), W.w09, W.w10, W.w11, 0, BIG, -1 - n]);
  }
  // 같은 단위에서 겹치는 적중은 높은 등급 하나만
  hits.sort((a, b) => a[8] - b[8] || gradeCmp(a[1], b[1]) || a[6] - b[6]);
  const kept = [];
  for (const h of hits) {
    if (kept.some((k) => k[8] === h[8] && !(h[7] <= k[6] || h[6] >= k[7]))) continue;
    kept.push(h);
  }
  kept.sort((a, b) => a[0] - b[0] || a[6] - b[6]);
  // 승격 기준 — 묶음 합계가 기준에 못 미치면 A 를 B 로
  for (const { ids, need } of pack.promote) {
    const aa = kept.filter((h) => ids.has(h[5]) && h[1] === 'A');
    if (aa.length < need) for (const h of aa) h[1] = 'B';
  }
  return {
    hits: kept.map((h) => ({ line: h[0], grade: h[1], frag: h[2], alt: h[3], family: h[4], rule: h[5] })),
    chars: nonWsCp(body),
  };
}
