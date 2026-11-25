// 퇴고 체험(/tools/toego) 브라우저 진입점 — 판정은 엔진(tools/k-labor/lib/prose) 함수를 그대로 부른다.
//   · 문체 = checkProse(범용 팩 하나만 넘긴다 — 비공개 팩 폴더 PROSE_PACK_DIR 를 읽는 loadPackSet 을 부르지 않는다)
//   · 띄어쓰기·문장 부호·쉼표 = checkNorms, 주민등록번호 모양 = rrnLines
// 응답 모양은 엔진 runToego(MCP 도구 check_prose·check_norms, dist/toego.mjs)와 같다. 시험(tests/unit/toego-browser.test.ts)이
// 같은 글을 runToego 와 이 함수에 넣어 응답 전체를 맞춰 본다. 아래 입력 검사·멈춤 문구는 엔진 toego.mjs 의 값이다 —
// toego.mjs 를 그대로 들여오면 zod 와 팩 폴더 읽기가 브라우저 번들에 딸려 와서 값만 옮겼다(바뀌면 그 시험이 먼저 붉어진다).
// 이 파일은 scripts/build-toego-browser.mjs 가 engine.bundle.mjs 로 묶어 화면이 싣는다. 글은 이 함수 밖으로 나가지 않는다.
import { checkProse, foldGenre, GENERIC_PACK } from '../../../tools/k-labor/lib/prose/check.mjs';
import { checkNorms } from '../../../tools/k-labor/lib/prose/norms.mjs';
import { rrnLines } from '../../../tools/k-labor/lib/common.mjs';

export const TOEGO_GENRES = ['legal', 'consulting', 'lecture', 'general', 'official'];

/** 범용 팩 머리 정보(화면에 출처·항목 수를 적는다) */
export const GENERIC_INFO = {
  pack: GENERIC_PACK.pack,
  version: GENERIC_PACK.version,
  ruleCount: GENERIC_PACK.rules.length,
  grades: [...new Set(GENERIC_PACK.rules.map((r) => r.grade))].sort(),
};

// toego.mjs 와 같은 값 — TEXT_SCHEMA(빈 글 / 40만 자 초과)·PROSE_RRN_STOP·RRN_LINES_MAX
const TEXT_EMPTY = '빈 글';
const TEXT_LONG = '40만 자 초과';
const RRN_STOP = '입력에 주민등록번호 모양의 숫자가 있어 멈췄습니다. 가린 뒤 다시 점검해 주세요.';
const RRN_LINES_MAX = 50;
const textFits = (s) => s.length <= 400_000 || (s.length <= 800_000 && [...s].length <= 400_000);

/**
 * 문체와 공개 규범을 한 번에 — runToego 와 같은 응답.
 * @param {{ text: string, genre?: string }} raw
 * @returns {{ ok: boolean, error?: string, reason?: string, rrnLines?: number[], prose?: any, norms?: any }}
 */
export function runToegoBrowser(raw) {
  const text = raw?.text;
  const genre = raw?.genre;
  if (typeof text !== 'string') return { ok: false, error: 'INVALID_ARGS' };
  if (genre !== undefined && !TOEGO_GENRES.includes(genre)) {
    // 엔진은 글 칸 오류(빈 글·40만 자 초과)를 장르 오류보다 앞세워 알린다
    if (!text) return { ok: false, error: 'INVALID_ARGS', reason: TEXT_EMPTY };
    if (!textFits(text)) return { ok: false, error: 'INVALID_ARGS', reason: TEXT_LONG };
    return { ok: false, error: 'INVALID_ARGS' };
  }
  if (!text) return { ok: false, error: 'INVALID_ARGS', reason: TEXT_EMPTY };
  if (!textFits(text)) return { ok: false, error: 'INVALID_ARGS', reason: TEXT_LONG };
  const lines = rrnLines(text);
  if (lines.length) return { ok: false, error: RRN_STOP, rrnLines: lines.slice(0, RRN_LINES_MAX) };

  const requestedGenre = genre ?? 'legal';
  let prose;
  try {
    // 부른 장르 이름 그대로 넘긴다 — 규칙의 skipGenres 는 official 을 따로 본다(proseResult 와 같다)
    const r = checkProse(text, { packs: [GENERIC_PACK], genre: requestedGenre, allowFull: false });
    prose = { ok: !r.incomplete, genre: foldGenre(requestedGenre), requestedGenre, ...r };
  } catch {
    prose = { ok: false, error: 'PROSE_CHECK_FAILED' };
  }
  let norms;
  try {
    norms = { ok: true, ...checkNorms(text, {}) };
  } catch {
    norms = { ok: false, error: 'NORMS_CHECK_FAILED' };
  }
  return { ok: Boolean(prose.ok && norms.ok), prose, norms };
}
