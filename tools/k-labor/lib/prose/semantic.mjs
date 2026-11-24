// 퇴고 의미범주 검사(check_semantic) — 발송 게이트의 파이썬 검사기를 옮긴 것이라 걸림(행·태그·조각)이 줄 단위로 같아야 한다.
// 이 파일은 차례와 거르는 틀만 안다. 식·낱말·태그·장르별 허용 낱말·칸 이름·묶음 이름·길이 상한은 전부 비공개 팩의 semantic 절에서 온다.
//   semantic = { format: 2, version,
//                re: { <칸>: [파이썬식, 'm'|''] },
//                rules: [[칸, 태그], …](검사 순서),
//                skip: 칸(줄 머리에서 맞으면 그 줄을 보지 않는다) · span: 칸(그 안에서 시작한 걸림은 버린다) ·
//                except: 칸 | null(그 안에 기준 자리가 들면 버린다),
//                anchor: [묶음 이름…](처음 값이 있는 묶음의 시작이 기준 자리, 없으면 마지막) ·
//                allowBy: [묶음 이름…](처음 값이 있는 묶음 글이 허용 낱말이면 버린다) · fragMax: 조각 길이 상한,
//                allow: { 장르: [낱말…] }(빈 목록 가능) }
import { cpLen, pyCompile, splitlines, strip, universalNewlines } from './pyre.mjs';

export const SEMANTIC_FORMAT = 2;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isStr = (s) => typeof s === 'string' && s.length > 0;
const isPair = (x) => Array.isArray(x) && x.length === 2 && isStr(x[0]) && (x[1] === '' || x[1] === 'm');
const isNames = (a) => Array.isArray(a) && a.length > 0 && a.every((s) => typeof s === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

/**
 * 팩의 semantic 절 → { pack } | { errors: [{ code, id? }] } (오류에는 식·낱말 원문을 싣지 않는다).
 * 빈 규칙·없는 칸·쓰지 않는 칸·허용 목록 없음·빈 글자에 맞을 수 있는 되풀이 식은 모두 불완전(오류)이다.
 */
export function compileSemanticPack(sec) {
  if (!isObj(sec) || sec.format !== SEMANTIC_FORMAT || !isStr(sec.version) || !isObj(sec.re) || !Array.isArray(sec.rules) || !sec.rules.length) {
    return { errors: [{ code: 'SEMANTIC_FORMAT' }] };
  }
  const errors = [];
  const used = new Map(); // 칸 → 되풀이로 쓰나
  const mark = (k, iter) => {
    if (!isStr(k)) return false;
    used.set(k, (used.get(k) ?? false) || iter);
    return true;
  };
  const ruleKeys = [];
  sec.rules.forEach((r, k) => {
    if (!Array.isArray(r) || r.length !== 2 || !mark(r[0], true) || !isStr(r[1])) errors.push({ code: 'SEMANTIC_RULE', id: `rule#${k + 1}` });
    else ruleKeys.push(r);
  });
  if (!mark(sec.skip, false)) errors.push({ code: 'SEMANTIC_SLOT', id: 'skip' });
  if (!mark(sec.span, true)) errors.push({ code: 'SEMANTIC_SLOT', id: 'span' });
  if (!Object.hasOwn(sec, 'except') || (sec.except !== null && !mark(sec.except, true))) errors.push({ code: 'SEMANTIC_SLOT', id: 'except' });
  if (!isNames(sec.anchor) || !isNames(sec.allowBy)) errors.push({ code: 'SEMANTIC_GROUPS' });
  if (!(Number.isInteger(sec.fragMax) && sec.fragMax > 0)) errors.push({ code: 'SEMANTIC_FRAG' });
  const rx = {};
  for (const k of new Set([...Object.keys(sec.re), ...used.keys()])) {
    if (!used.has(k)) { errors.push({ code: 'SEMANTIC_SLOT_UNUSED', id: k }); continue; }
    if (!Object.hasOwn(sec.re, k) || !isPair(sec.re[k])) { errors.push({ code: 'SEMANTIC_SLOT', id: k }); continue; }
    try {
      rx[k] = pyCompile(sec.re[k][0], { multiline: sec.re[k][1] === 'm' });
      if (used.get(k) && rx[k].canEmpty) errors.push({ code: 'RE_EMPTY', id: k });
    } catch {
      errors.push({ code: 'RE_COMPILE', id: k });
    }
  }
  const allow = {};
  if (!isObj(sec.allow)) errors.push({ code: 'SEMANTIC_ALLOW' });
  else {
    for (const [g, words] of Object.entries(sec.allow)) {
      if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) errors.push({ code: 'SEMANTIC_ALLOW', id: g });
      else allow[g] = new Set(words);
    }
  }
  if (errors.length) return { errors };
  return {
    pack: {
      rules: ruleKeys.map(([k, tag]) => ({ rx: rx[k], tag })),
      skip: rx[sec.skip], span: rx[sec.span], ex: sec.except === null ? null : rx[sec.except],
      anchor: [...sec.anchor], allowBy: [...sec.allowBy], fragMax: sec.fragMax, allow, version: sec.version,
    },
  };
}

/** 묶음 이름 목록에서 처음 값이 있는 것(없으면 마지막 이름) */
const firstGroup = (gd, names) => names.find((k) => gd[k]) ?? names[names.length - 1];

// 예외구 안에 기준 자리가 들어 있으면 버린다
function inException(pack, line, m) {
  if (!pack.ex) return false;
  let s;
  try {
    s = m.start(firstGroup(m.groupdict(), pack.anchor));
  } catch {
    return false;
  }
  return pack.ex.finditer(line).some((e) => e.start() <= s && s < e.end());
}

/**
 * @param {string} text
 * @param {{ pack: any, genre?: string }} o  pack = compileSemanticPack 의 pack
 * @returns {{ hits: { line: number, tag: string, frag: string }[] }}  파이썬 검사기의 걸림 순서 그대로(행 → 긴 조각 먼저)
 */
export function checkSemantic(text, { pack, genre = 'legal' }) {
  const allow = Object.hasOwn(pack.allow, genre) ? pack.allow[genre] : new Set();
  const hits = [];
  splitlines(universalNewlines(String(text ?? ''))).forEach((line, k) => {
    if (!strip(line) || pack.skip.match(line)) return;
    const qs = pack.span.finditer(line).map((q) => [q.start(), q.end()]);
    for (const { rx, tag } of pack.rules) {
      for (const m of rx.finditer(line)) {
        const gd = m.groupdict();
        // 파이썬 gd.get(a) or gd.get(b, "") — 묶음이 없으면 빈 글, 지나지 않은 묶음이면 None(허용 낱말일 수 없다)
        const key = firstGroup(gd, pack.allowBy);
        const v = Object.hasOwn(gd, key) ? gd[key] : '';
        if (v !== null && allow.has(v)) continue;
        if (inException(pack, line, m)) continue;
        const st = m.start();
        if (qs.some(([a, b]) => a <= st && st < b)) continue;
        const frag = strip(m.group(0));
        if (cpLen(frag) > pack.fragMax) continue;
        hits.push({ line: k + 1, tag, frag, len: cpLen(frag), ord: hits.length });
      }
    }
  });
  // 같은 줄에서 겹치는 조각은 긴 쪽만(파이썬 sorted 는 안정 정렬 — 같은 키는 나온 순서대로)
  hits.sort((a, b) => a.line - b.line || b.len - a.len || a.ord - b.ord);
  const taken = new Map();
  const out = [];
  for (const h of hits) {
    const spans = taken.get(h.line) ?? [];
    taken.set(h.line, spans);
    if (spans.some((s0) => h.frag.includes(s0) || s0.includes(h.frag))) continue;
    spans.push(h.frag);
    out.push({ line: h.line, tag: h.tag, frag: h.frag });
  }
  return { hits: out };
}
