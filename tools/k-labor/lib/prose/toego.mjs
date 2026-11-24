// 퇴고 점검 공용부 — MCP 도구 check_prose·check_norms 와 가벼운 실행 파일(dist/toego.mjs)이 같은 함수를 쓴다(261124).
// 발송 게이트는 문서마다 문체와 공개 규범(띄어쓰기·문장 부호·쉼표)을 한 번에 받아야 엔진을 한 번만 띄운다.
// 서버 번들(dist/server.mjs, 약 18MB)은 다른 묶음의 무거운 의존성까지 읽어 뜨는 데 2초가 넘는다 →
// 이 파일과 check·norms·common 만 묶은 dist/toego.mjs 가 같은 판정을 0.3초 안팎에 낸다.
import { z } from 'zod';
import { rrnLines } from '../common.mjs';
import { checkProse, foldGenre, loadPackSet } from './check.mjs';
import { checkNorms, NORM_CHECKS } from './norms.mjs';

export const PROSE_RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 가린 뒤 다시 점검해 주세요.';
const RRN_LINES_MAX = 50;

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

const stackOnly = (e) => (e instanceof Error ? `${e.name}\n${String(e.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).join('\n')}` : 'unknown');

/** check_prose 응답 객체(주민번호 검사 뒤). 오류 글에 팩 내용이 실리지 않게 — 응답은 고정 코드, stderr 에는 오류 종류와 「at」 줄만 */
export function proseResult(a) {
  try {
    const set = loadPackSet();
    // 부른 장르 이름 그대로 넘긴다 — check 가 official 을 general 로 접되, 규칙의 skipGenres 는 official 을 따로 본다.
    // 응답 genre 는 접은 장르(종전 그대로), requestedGenre 는 부른 이름 — 다시 부를 때는 requestedGenre 를 쓴다
    const requestedGenre = a.genre ?? 'legal';
    const r = checkProse(a.text, { packs: set.packs, skipped: set.skipped, genre: requestedGenre, detail: a.detail });
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
}).strict();

/**
 * 문체와 공개 규범을 한 번에. { ok, prose, norms } — ok 는 둘 다 ok 일 때만 참.
 * 입력이 틀리면 { ok:false, error:'INVALID_ARGS', reason? }(reason = 빈 글 / 40만 자 초과),
 * 주민번호 모양이면 { ok:false, error: PROSE_RRN_STOP, rrnLines }(둘 다 돌지 않는다).
 * @returns {{ ok: boolean, error?: string, reason?: string, rrnLines?: number[], prose?: any, norms?: any }}
 */
export function runToego(raw) {
  const p = TOEGO_INPUT.safeParse(raw);
  if (!p.success) {
    const why = p.error.issues.find((i) => i.path[0] === 'text' && (i.message === TEXT_EMPTY || i.message === TEXT_LONG));
    return why ? { ok: false, error: 'INVALID_ARGS', reason: why.message } : { ok: false, error: 'INVALID_ARGS' };
  }
  const a = p.data;
  const stop = rrnStop(a.text);
  if (stop) return stop;
  const prose = proseResult({ text: a.text, genre: a.genre, detail: a.detail });
  const norms = normsResult({ text: a.text, ...(a.norms ?? {}) });
  return { ok: Boolean(prose.ok && norms.ok), prose, norms };
}
