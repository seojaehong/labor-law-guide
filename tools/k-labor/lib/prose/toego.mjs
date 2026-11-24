// 퇴고 점검 공용부 — MCP 도구 check_prose·check_norms·check_semantic·check_rhetoric 와 가벼운 실행 파일(dist/toego.mjs)이 같은 함수를 쓴다(261124).
// 발송 게이트는 문서마다 문체·공개 규범(띄어쓰기·문장 부호·쉼표)·의미범주·AI 수사를 한 번에 받아야 엔진을 한 번만 띄운다.
// 서버 번들(dist/server.mjs, 약 18MB)은 다른 묶음의 무거운 의존성까지 읽어 뜨는 데 2초가 넘는다 →
// 이 파일과 check·norms·semantic·rhetoric·common 만 묶은 dist/toego.mjs 가 같은 판정을 짧게 낸다.
import crypto from 'node:crypto';
import { z } from 'zod';
import { PROSE_RRN_STOP, RRN_LINES_MAX, rrnLines, stackOnly } from '../common.mjs';
import { checkProse, foldGenre, HIT_CAP, loadPackSet } from './check.mjs';
import { checkNorms, NORM_CHECKS } from './norms.mjs';
import { checkRhetoric, compileRhetoricPack, RHETORIC_TRACKS } from './rhetoric.mjs';
import { checkSemantic, compileSemanticPack } from './semantic.mjs';

export { PROSE_RRN_STOP };

/** 글에 주민번호 모양이 있으면 멈춤 응답(줄 번호만, 50줄까지), 없으면 null. 띄어쓰기 등 공개 규범도 함께 멈춘다 — 글을 받지 않는다 */
export function rrnStop(text) {
  const lines = rrnLines(text);
  return lines.length ? { ok: false, error: PROSE_RRN_STOP, rrnLines: lines.slice(0, RRN_LINES_MAX) } : null;
}

// MCP 입력 검사와 같은 모양 — 도구(docs.mjs)도 이것을 inputSchema 로 쓴다
const TEXT_EMPTY = '빈 글';
const TEXT_LONG = '40만 자 초과';
export const TEXT_SCHEMA = z.string().min(1, TEXT_EMPTY)
  .refine((s) => s.length <= 400_000 || (s.length <= 800_000 && [...s].length <= 400_000), TEXT_LONG);
export const GENRE_SCHEMA = z.enum(['legal', 'consulting', 'lecture', 'general', 'official']);
export const DETAIL_SCHEMA = z.enum(['brief', 'full']);
export const NORM_CHECKS_SCHEMA = z.array(z.enum(NORM_CHECKS));
// 의미범주 장르·AI 수사 트랙은 원 검사기처럼 아무 이름이나 받는다(의미범주는 팩에 허용 낱말이 없는 장르면 허용 없이, AI 수사는 모르는 트랙이면 legal)
export const LABEL_SCHEMA = z.string().min(1).max(32);

/** check_prose 응답 객체(주민번호 검사 뒤). 오류 글에 팩 내용이 실리지 않게 — 응답은 고정 코드, stderr 에는 오류 종류와 「at」 줄만 */
export function proseResult(a, set = undefined) {
  try {
    const s = set ?? loadPackSet();
    // 부른 장르 이름 그대로 넘긴다 — check 가 official 을 general 로 접되, 규칙의 skipGenres 는 official 을 따로 본다.
    // 응답 genre 는 접은 장르(종전 그대로), requestedGenre 는 부른 이름 — 다시 부를 때는 requestedGenre 를 쓴다
    const requestedGenre = a.genre ?? 'legal';
    const r = checkProse(a.text, { packs: s.packs, skipped: s.skipped, genre: requestedGenre, detail: a.detail });
    return { ok: !r.incomplete, genre: foldGenre(requestedGenre), requestedGenre, ...r };
  } catch (e) {
    console.error('[check_prose]', stackOnly(e));
    return { ok: false, error: 'PROSE_CHECK_FAILED' };
  }
}

/** check_norms 응답 객체(주민번호 검사 뒤) */
export function normsResult(a) {
  try {
    return { ok: true, ...checkNorms(a.text, { checks: a.checks, quote: a.quote, warnOnly: a.warnOnly }) };
  } catch (e) {
    console.error('[check_norms]', stackOnly(e));
    return { ok: false, error: 'NORMS_CHECK_FAILED' };
  }
}

// ── 의미범주·AI 수사 — 식·낱말·규칙은 비공개 팩(PROSE_PACK_DIR)의 `semantic`·`rhetoric` 절에만 있다.
// 그 절이 없으면(팩 폴더 없음·절 없음·읽지 못한 팩 있음) 검사하지 않고 ok:false·incomplete:true 로 알린다 — 조용히 통과하지 않는다.
const SECTION_CACHE = new WeakMap(); // 팩 객체(파일 바이트가 같으면 같은 객체) → 절별 컴파일 결과

function pickSection(set, key) {
  // 읽지 못한 팩이 있으면 그 팩에 절이 있었을 수 있다 — 고른 결과를 믿지 않는다
  if (set.skipped.length) return { code: 'PACK_SKIPPED', skipped: set.skipped };
  const found = set.packs.slice(1).filter((p) => p && typeof p === 'object' && Object.hasOwn(p, key));
  if (!found.length) return { code: 'NO_PRIVATE_PACK' };
  if (found.length > 1) return { code: 'PACK_SECTION_DUP' };
  return { raw: found[0] };
}

function compileSection(raw, key, fn) {
  let byKey = SECTION_CACHE.get(raw);
  if (!byKey) {
    byKey = {};
    SECTION_CACHE.set(raw, byKey);
  }
  if (!byKey[key]) {
    try {
      byKey[key] = fn(raw[key]);
    } catch {
      byKey[key] = { errors: [{ code: 'SECTION_THROWN' }] };
    }
  }
  return byKey[key];
}

// 비공개 팩(폴더 팩은 private:false 라고 적지 않은 한 비공개)의 걸림은 PROSE_ALLOW_FULL=1 인 PC 에서만 전부 싣는다 — check_prose 와 같은 정책
function policy(raw, detail) {
  const canFull = raw.private === false || process.env.PROSE_ALLOW_FULL === '1';
  return { full: detail !== 'brief' && canFull, withheld: detail === 'full' && !canFull };
}

// 전부 싣는 응답에만 붙는 팩 이름@판(check_prose 의 packs 와 같은 꼴) — 게이트가 어느 팩으로 돌았는지 확인한다
// 판은 절마다 따로(절의 version — 그 절의 원천만 바뀌어도 달라진다)
const packLabel = (raw, key) => `${raw.pack}@${raw[key]?.version ?? ''}`;

// brief 참조값 — 같은 규칙이면 같은 값, 호출마다 소금이 달라 규칙 이름을 거꾸로 찾을 수 없다
function refMaker(pack) {
  const salt = crypto.randomBytes(8).toString('hex');
  return (id) => crypto.createHash('sha256').update(`${salt}|${pack}|${id}`).digest('hex').slice(0, 8);
}

function sectionOr(set, key, compile, label) {
  const s = pickSection(set, key);
  if (!s.raw) return { fail: { ok: false, incomplete: true, code: s.code, ...(s.skipped ? { skipped: s.skipped } : {}) } };
  const c = compileSection(s.raw, key, compile);
  if (c.errors) {
    console.error(`[${label}] 팩의 ${key} 절을 쓰지 못했습니다: 오류 ${c.errors.length}건(${[...new Set(c.errors.map((e) => e.code))].join(',')})`);
    return { fail: { ok: false, incomplete: true, code: `${key.toUpperCase()}_PACK_INVALID` } };
  }
  return { raw: s.raw, pack: c.pack };
}

/** check_semantic 응답 객체(주민번호 검사 뒤). a = { text, genre?, detail? } */
export function semanticResult(a, set = undefined) {
  const genre = a.genre ?? 'legal';
  try {
    const sec = sectionOr(set ?? loadPackSet(), 'semantic', compileSemanticPack, 'check_semantic');
    if (sec.fail) return { ...sec.fail, genre };
    const r = checkSemantic(a.text, { pack: sec.pack, genre });
    const pol = policy(sec.raw, a.detail);
    const ref = refMaker(sec.raw.pack);
    const hits = r.hits.slice(0, HIT_CAP).map((h) => (pol.full ? { line: h.line, tag: h.tag, frag: h.frag } : { line: h.line, ref: ref(h.tag) }));
    const out = { ok: true, genre, count: r.hits.length, hits };
    if (r.hits.length > hits.length) out.truncated = true;
    if (pol.withheld) out.withheld = true;
    if (pol.full) out.pack = packLabel(sec.raw, 'semantic');
    return out;
  } catch (e) {
    console.error('[check_semantic]', stackOnly(e));
    return { ok: false, error: 'SEMANTIC_CHECK_FAILED' };
  }
}

/**
 * check_rhetoric 응답 객체(주민번호 검사 뒤). a = { text, track?, detail?, allA? }
 * 트랙은 legal·blog·consult·lecture — 그 밖의 이름(빈 값 포함)은 legal 로 보고, 부른 이름은 requestedTrack 에 남긴다.
 * allA = 발송 게이트 경로 — A 는 상한 없이 전부 싣는다(게이트가 A 행마다 경고·차단을 가린다). 화면(MCP)은 500건 상한.
 */
export function rhetoricResult(a, set = undefined) {
  const track = RHETORIC_TRACKS.includes(a.track) ? a.track : 'legal';
  const named = a.track === undefined || a.track === track ? {} : { requestedTrack: a.track };
  try {
    const sec = sectionOr(set ?? loadPackSet(), 'rhetoric', compileRhetoricPack, 'check_rhetoric');
    if (sec.fail) return { ...sec.fail, track, ...named };
    const r = checkRhetoric(a.text, { pack: sec.pack, track });
    const counts = { A: 0, B: 0 };
    for (const h of r.hits) counts[h.grade === 'A' ? 'A' : 'B']++;
    // 500건을 넘으면 A 를 먼저 채우고 남는 칸에 B — 싣는 순서는 검사기가 낸 순서 그대로
    const idx = r.hits.map((h, i) => ({ h, i }));
    const as = idx.filter((x) => x.h.grade === 'A').slice(0, a.allA ? Infinity : HIT_CAP);
    const chosen = [...as, ...idx.filter((x) => x.h.grade !== 'A').slice(0, Math.max(0, HIT_CAP - as.length))].sort((x, y) => x.i - y.i).map((x) => x.h);
    const pol = policy(sec.raw, a.detail);
    const ref = refMaker(sec.raw.pack);
    const hits = chosen.map((h) => (pol.full
      ? { line: h.line, grade: h.grade, frag: h.frag, alt: h.alt, family: h.family, rule: h.rule }
      : { line: h.line, grade: h.grade, ref: ref(h.rule) }));
    const out = { ok: true, track, ...named, counts, chars: r.chars, hits };
    if (r.hits.length > hits.length) out.truncated = true;
    if (pol.withheld) out.withheld = true;
    if (pol.full) out.pack = packLabel(sec.raw, 'rhetoric');
    return out;
  } catch (e) {
    console.error('[check_rhetoric]', stackOnly(e));
    return { ok: false, error: 'RHETORIC_CHECK_FAILED' };
  }
}

// 모르는 키는 받지 않는다(strict) — 「qoute」 같은 오타가 조용히 기본값으로 돌지 않게
const TOEGO_INPUT = z.object({
  text: TEXT_SCHEMA,
  genre: GENRE_SCHEMA.optional(),
  detail: DETAIL_SCHEMA.optional(),
  norms: z.object({
    checks: NORM_CHECKS_SCHEMA.optional(),
    quote: z.boolean().optional(),
    warnOnly: z.boolean().optional(),
  }).strict().optional(),
  // 의미범주는 글을 따로 받을 수 있다(HTML 원고 — 게이트가 말풍선 메모와 태그 뺀 글을 만들어 넘긴다)
  semantic: z.object({ genre: LABEL_SCHEMA.optional(), text: TEXT_SCHEMA.optional() }).strict().optional(),
  rhetoric: z.object({ track: LABEL_SCHEMA.optional(), allA: z.boolean().optional() }).strict().optional(),
}).strict();

/**
 * 문체·공개 규범은 늘, 의미범주·AI 수사는 그 키를 줄 때만(비공개 팩이 있어야 도는 검사라 부르는 쪽이 고른다).
 * { ok, prose, norms, semantic?, rhetoric? } — ok 는 돌린 검사가 모두 ok 일 때만 참.
 * 입력이 틀리면 { ok:false, error:'INVALID_ARGS', reason? }(reason = 빈 글 / 40만 자 초과),
 * 주민번호 모양이면 { ok:false, error: PROSE_RRN_STOP, rrnLines }(아무 검사도 돌지 않는다).
 * 두 키의 값은 따로 선다 — 의미범주 장르는 semantic.genre(없으면 legal), AI 수사 트랙은 rhetoric.track(없으면 legal,
 * legal·blog·consult·lecture 밖이면 legal 로 보고 requestedTrack 에 부른 이름). 문체 genre 를 물려받지 않는다.
 * @returns {{ ok: boolean, error?: string, reason?: string, rrnLines?: number[], prose?: any, norms?: any, semantic?: any, rhetoric?: any }}
 */
export function runToego(raw) {
  const p = TOEGO_INPUT.safeParse(raw);
  if (!p.success) {
    const why = p.error.issues.find((i) => (i.path[0] === 'text' || (i.path[0] === 'semantic' && i.path[1] === 'text')) && (i.message === TEXT_EMPTY || i.message === TEXT_LONG));
    return why ? { ok: false, error: 'INVALID_ARGS', reason: why.message } : { ok: false, error: 'INVALID_ARGS' };
  }
  const a = p.data;
  const stop = rrnStop(a.text) ?? (a.semantic?.text !== undefined ? rrnStop(a.semantic.text) : null);
  if (stop) return stop;
  const set = loadPackSet();
  const prose = proseResult({ text: a.text, genre: a.genre, detail: a.detail }, set);
  const norms = normsResult({ text: a.text, ...(a.norms ?? {}) });
  const out = { ok: false, prose, norms };
  if (a.semantic) out.semantic = semanticResult({ text: a.semantic.text ?? a.text, genre: a.semantic.genre, detail: a.detail }, set);
  if (a.rhetoric) out.rhetoric = rhetoricResult({ text: a.text, track: a.rhetoric.track, detail: a.detail, allA: a.rhetoric.allA }, set);
  out.ok = Boolean(prose.ok && norms.ok && (out.semantic?.ok ?? true) && (out.rhetoric?.ok ?? true));
  return out;
}
