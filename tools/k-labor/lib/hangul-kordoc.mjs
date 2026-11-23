// 한글(hwp·hwpx) 읽기·서식 채우기·마크다운 되쓰기 — kordoc(MIT, chrisryugj/kordoc) 라이브러리를 부른다.
//   readHangul   hwp·hwpx → 마크다운(표 병합 colspan·rowspan 은 HTML 표로 남는다)
//   fillHangul   서식의 라벨 옆 칸·괄호 빈칸 채우기 → hwp 또는 hwpx(원본 서식 그대로 채운 뒤 필요하면 HWP 5.x 로 저장)
//   patchHangul  readHangul(layout 'keep') 로 뽑은 마크다운을 고친 것을 원본에 되쓰기(바뀐 글자만, 서식 그대로)
// ★ 바이트를 받아 바이트를 돌려준다. 파일·네트워크를 만지지 않는다(파일은 groups/docs.mjs 가 읽고 쓴다) —
//   고객 파일을 여는 파서가 이 모듈 안에만 있어, 나중에 DB 키 없는 작업자로 옮길 때 이 파일만 옮기면 된다.
// ★ kordoc 은 묶지 않는다(build.mjs external). 안에서 cfb 를 createRequire 로, @rhwp/core(HWP 저장)를 동적 import 로 읽어
//   묶으면 깨진다. 도구를 부를 때만 불러 서버 기동은 무겁게 하지 않는다.
// ★ 원칙(G4 261123): 덜 된 것을 ok 로 내지 않는다. 못 채운 값·못 되쓴 편집·변환 손실·대조 잔차는 전부 돌려준다.

let kordocP = null;
/** kordoc 을 처음 쓸 때 한 번만 불러온다. 실패하면 다음 호출에서 다시 시도한다(실패한 약속을 붙잡아 두지 않는다) */
export function loadKordoc() {
  kordocP ??= import('kordoc').catch((e) => {
    kordocP = null;
    throw new Error(`한글 문서 부품(kordoc)을 불러오지 못했습니다. k-labor 설치본에서 npm ci 로 의존성을 설치해 주세요 (${e?.code || 'import error'})`);
  });
  return kordocP;
}

export const HWP_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // OLE2(CFB) — HWP 5.x
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (b, m) => m.every((x, i) => b[i] === x);

const toAb = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

/** 읽기가 쓰는 마크다운 = 되쓰기가 받는 마크다운 한도(왕복이 맞도록 같게, A20) */
export const MAX_MARKDOWN_BYTES = 30 * 1024 * 1024;

/** 바이트로 종류를 판정한다 — 'hwp'(HWP 5.x) · 'hwpx' · null. 확장자는 믿지 않는다. OLE 안이 엑셀이면 null(A13) */
export async function hangulKind(bytes) {
  const k = await loadKordoc();
  if (startsWith(bytes, HWP_MAGIC)) return k.detectOle2Format(toAb(bytes)) === 'hwp' ? 'hwp' : null;
  if (startsWith(bytes, ZIP_MAGIC)) return (await k.detectZipFormat(toAb(bytes))) === 'hwpx' ? 'hwpx' : null;
  return null;
}

const NOT_HANGUL = '한글 문서(HWP 5.x 또는 hwpx)가 아닙니다. 옛 HWP 3.x·암호 문서는 한글에서 hwpx 로 저장해 다시 주세요.';

// ── 판정·정리 도우미(순수 함수, 시험에서 직접 부른다) ──

/** kordoc 라벨 정규화와 같은 규칙(form/match.ts normalizeLabel — 공개 API 가 아니라 같은 식을 둔다) */
export const normalizeLabel = (label) => String(label).trim().replace(/<\/?su[bp]>/g, '').replace(/[:：\s()（）·]/g, '');

/** 정규화하면 같아지는 입력 라벨 묶음(A2). kordoc 은 뒤 값으로 앞 값을 덮는다 */
export function labelCollisions(values) {
  const by = new Map();
  for (const label of Object.keys(values)) {
    const n = normalizeLabel(label);
    by.set(n, [...(by.get(n) ?? []), label]);
  }
  return [...by.values()].filter((xs) => xs.length > 1);
}

/** 단일 값인데 누름틀 두 곳 이상에 맞은 라벨(A3) — kordoc 의 fillWithUniqueGuard 는 누름틀을 집계에서 뺀다 */
export function clickhereDuplicates(filled, values) {
  const count = new Map();
  for (const f of filled) if (f.source === 'clickhere' && f.key) count.set(f.key, (count.get(f.key) ?? 0) + 1);
  const out = [];
  for (const [label, raw] of Object.entries(values)) {
    const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value : raw;
    if (Array.isArray(v)) continue;
    if ((count.get(normalizeLabel(label)) ?? 0) >= 2) out.push(label);
  }
  return out;
}

const LOSS_PREFIX = 'HWP 로 옮기며 빠진 내용';
/** hwpxToHwp 경고 중 내용 손실 보고를 따로 뗀다(A4) */
export function splitLosses(warnings) {
  return { losses: warnings.filter((w) => w.startsWith(LOSS_PREFIX)), warnings: warnings.filter((w) => !w.startsWith(LOSS_PREFIX)) };
}

const BAD_PARSE = new Set(['PARTIAL_PARSE', 'LENIENT_CFB_RECOVERY', 'TRUNCATED_TABLE', 'MALFORMED_XML', 'BROKEN_ZIP_RECOVERY']);
/** 일부만 읽었거나 손상을 복구하며 읽었다는 경고(A5) */
export const badParseWarnings = (ws) => ws.filter((w) => BAD_PARSE.has(w.code));

// 배포용 HWP 의 고정 안내문(kordoc hwp5/sentinel.ts 와 같은 기준 — 공개 API 가 아니라 같은 식을 둔다)
const SENTINEL = [/상위\s*버전의\s*배포용\s*문서/, /최신\s*버전의\s*한글.*뷰어/, /문서를\s*읽으려면/];
/** 본문이 배포용 안내문뿐인가(A5) */
export function isDistributionSentinel(md) {
  if (!md || !SENTINEL.some((r) => r.test(md))) return false;
  return md.split(/\r?\n/).filter((l) => !SENTINEL.some((r) => r.test(l))).join('').replace(/\s+/g, '').length < 120;
}

/** 발췌 가림(A9) — 잘린 주민번호 조각이 남지 않게 6자리 이상 숫자열과 「6자리-숫자」를 모두 가린다 */
export const maskExcerpt = (s) => String(s ?? '').replace(/\d{6}\s*-\s*\d{1,7}/g, '******-*******').replace(/\d{6,}/g, (m) => '*'.repeat(m.length));

/** kordoc 사유문 정리(A17) — 이 도구에 없는 CLI 안내를 도구 안내로, em dash·「대신」을 걷는다 */
export function sanitizeReason(s) {
  return String(s ?? '')
    .replace(/`?kordoc <원본> --keep-layout-tables`?\s*\(API: parse\(원본, \{ layoutTables: "keep" \}\)\)/g, "read_hwp_as_markdown(layout 'keep')")
    .replace(/\s*—\s*/g, '. ')
    .replace(/대신/g, '말고');
}

const SKIP_CAP = 20;
/** 건너뜀 목록을 앞 20건으로 줄이고 총수를 단다(A9) */
export function capSkipped(skipped) {
  return { skipped: skipped.slice(0, SKIP_CAP), skippedTotal: skipped.length };
}

/** CRLF 만 LF 로(A16). 홀로 있는 CR 은 글자로 두어 kordoc 에 그대로 넘긴다 */
export const normalizeEol = (s) => String(s).replace(/\r\n/g, '\n');

/** 되쓰기 판정(A6·A15) — partial 도 미완, 되읽어 대조한 결과가 없으면 미완 */
export function patchVerdict({ skipped, verification }) {
  const partialCount = skipped.filter((s) => s.partial).length;
  const missedCount = skipped.length - partialCount;
  const residual = verification ? verification.added + verification.removed + verification.modified : null;
  return { incomplete: skipped.length > 0 || residual === null || residual > 0, partialCount, missedCount, residual };
}

/** 마크다운 바이트 → 글자(A11). UTF-8(엄격) 먼저, 아니면 EUC-KR. 깨진 글자(U+FFFD)가 남으면 null */
export function decodeMarkdown(bytes) {
  const b = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  let s;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    try {
      s = new TextDecoder('euc-kr', { fatal: true }).decode(b);
    } catch {
      return null;
    }
  }
  return s.includes('�') ? null : s;
}

/** 행 끝 공백 두 칸(마크다운 강제 줄바꿈)을 새로 단 줄 — kordoc 은 줄마다 trim 해 이 편집을 버린다(C2) */
// 원본·결과 마크다운의 줄 차이(중복 줄은 개수로) — removedLines = 원본에서 빠진 줄, addedLines = 결과에 새로 생긴 줄
export function lineChanges(beforeMd, afterMd) {
  const count = new Map();
  for (const l of String(beforeMd).split('\n')) count.set(l, (count.get(l) ?? 0) + 1);
  let addedLines = 0;
  for (const l of String(afterMd).split('\n')) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1);
    else addedLines += 1;
  }
  let removedLines = 0;
  for (const n of count.values()) removedLines += n;
  return { removedLines, addedLines };
}

export function forcedBreakEdits(original, edited) {
  const orig = new Set(original.split('\n'));
  return edited.split('\n').filter((l) => / {2,}$/.test(l) && l.trim() && !orig.has(l));
}

// 주민번호 모양(입력 거름과 같은 날짜 조건 없이 넓게) · 응답 가림 표시
const RRN_ANY = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/g;
const MASK_MARK = /\*{6}-\*{7}/g;
/** 원본 원고에 없던 주민번호 모양·가림 표시가 편집본에 생겼나(A8) */
export function newSensitive(originalMd, editedMd) {
  const count = (s, re) => (s.match(re) ?? []).length;
  return count(editedMd, RRN_ANY) > count(originalMd, RRN_ANY) || count(editedMd, MASK_MARK) > count(originalMd, MASK_MARK);
}

const PARSE_OPTS = { ocr: false, images: false };

/**
 * 읽기. layout = 'visual'(보이는 대로 — 테두리 없는 틀 표는 글로 푼다, 읽기용) · 'keep'(원본 표 구조 그대로 — patch 로 되쓸 원고는 이것으로)
 * OCR·그림 추출은 끈다(모델 캐시·sharp 설치 여부로 결과가 달라지지 않게, A12).
 * incomplete = 일부만 읽음·손상 복구 경고, 빈 본문, 배포용 안내문뿐(A5).
 */
export async function readHangul(bytes, { layout = 'visual' } = {}) {
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  const k = await loadKordoc();
  const r = await k.parse(toAb(bytes), { ...PARSE_OPTS, ...(layout === 'keep' ? { layoutTables: 'keep' } : {}) });
  if (!r.success) throw new Error(`읽지 못했습니다: ${sanitizeReason(r.error)}${r.code ? ` (${r.code})` : ''}`);
  const warnings = (r.warnings ?? []).map((w) => ({ code: w.code, message: sanitizeReason(w.message), ...(w.page ? { page: w.page } : {}) }));
  const problems = [
    ...badParseWarnings(warnings).map((w) => `${w.code}: ${w.message}`),
    ...(!r.markdown.trim() ? ['본문에서 읽은 글자가 없습니다'] : []),
    ...(isDistributionSentinel(r.markdown) ? ['배포용 문서 안내문만 읽혔습니다(본문은 한글에서 열어 hwpx 로 저장해 다시 주세요)'] : []),
  ];
  return { kind, layout, markdown: r.markdown, warnings, problems };
}

/** fillHwpx·fillWithUniqueGuard 를 한 번 돌린다. requireUnique 면 누름틀 중복까지 거절(A3) */
async function fillOnce(k, src, values, requireUnique) {
  if (!requireUnique) return { ...(await k.fillHwpx(src, values)), rejected: [] };
  const first = await k.fillWithUniqueGuard(values, (vals, blocked) => k.fillHwpx(src, vals, blocked));
  const dupClick = clickhereDuplicates(first.filled, values);
  if (!dupClick.length) return first;
  const rest = Object.fromEntries(Object.entries(values).filter(([l]) => !dupClick.includes(l)));
  const second = Object.keys(rest).length
    ? await k.fillWithUniqueGuard(rest, (vals, blocked) => k.fillHwpx(src, vals, blocked))
    : { buffer: src, filled: [], unmatched: [], rejected: [] };
  return { ...second, rejected: [...new Set([...first.rejected, ...dupClick])] };
}

/**
 * 서식 채우기. values = 라벨 → 값(배열이면 같은 라벨이 나오는 순서대로 하나씩).
 * hwp 서식은 서식 그대로 hwpx 로 바꿔 채운다(kordoc CLI 와 같은 길). 바꾸지 못하거나 원본을 일부만 읽었으면 멈춘다(A5) —
 *   서식을 버리는 「새로 짓기」로 내려가지 않는다.
 * out = 'hwpx' | 'hwp'(채운 hwpx 를 HWP 5.x 로 저장 → 되읽어 채운 값 대조, A4). requireUnique 기본 true(A3).
 */
export async function fillHangul(bytes, values, { out, requireUnique = true } = {}) {
  if (out !== 'hwp' && out !== 'hwpx') throw new Error("출력 형식은 'hwp' 또는 'hwpx' 입니다");
  const collisions = labelCollisions(values);
  if (collisions.length) return { refused: '띄어쓰기·괄호·쌍점을 빼면 같아지는 라벨이 있어 채우지 않았습니다(뒤 값이 앞 값을 덮습니다). 하나로 합쳐 주세요.', collisions };
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  const k = await loadKordoc();
  const pre = await k.parse(toAb(bytes), PARSE_OPTS);
  if (!pre.success) throw new Error(`서식을 읽지 못했습니다: ${sanitizeReason(pre.error)}`);
  const bad = badParseWarnings(pre.warnings ?? []);
  if (bad.length) throw new Error(`서식을 일부만 읽었거나 손상을 복구하며 읽어 채우지 않았습니다: ${bad.map((w) => w.code).join(', ')}`);
  let src = toAb(bytes);
  const warnings = [];
  if (kind === 'hwp') {
    let c;
    try {
      c = await k.convertToHwpx(bytes, { engine: 'kordoc' });
    } catch (e) {
      throw new Error(`hwp 서식을 서식 그대로 hwpx 로 바꾸지 못해 채우지 않았습니다: ${sanitizeReason(e instanceof Error ? e.message : String(e))}`);
    }
    if (c.mode !== 'preserve') throw new Error('hwp 서식을 서식 그대로 옮기지 못해 채우지 않았습니다(글·표만 옮겨짐). 한글에서 hwpx 로 저장해 다시 주세요.');
    warnings.push(...(c.warnings ?? []).map(sanitizeReason));
    src = toAb(c.data);
  }
  const r = await fillOnce(k, src, values, requireUnique);
  warnings.push(...(r.warnings ?? []).map(sanitizeReason));
  // 배열 값 — 요청 수보다 적게 들어갔으면 남은 값(A1)
  const leftover = [];
  for (const [label, raw] of Object.entries(values)) {
    const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.value : raw;
    if (!Array.isArray(v) || r.rejected.includes(label)) continue;
    const n = r.filled.filter((f) => f.key === normalizeLabel(label)).length;
    if (n < v.length) leftover.push({ label, requested: v.length, filled: n });
  }
  let outBytes = new Uint8Array(r.buffer);
  let losses = [];
  let verified = null;
  if (out === 'hwp') {
    const w = [];
    outBytes = await k.hwpxToHwp(outBytes, { warnings: w });
    const s = splitLosses(w);
    losses = s.losses;
    warnings.push(...s.warnings);
    // 되읽어 채운 값이 HWP 에 남았는지(A4)
    const back = await k.parse(toAb(outBytes), PARSE_OPTS);
    const text = back.success ? back.markdown.replace(/\s+/g, '') : '';
    const vals = r.filled.map((f) => String(f.value ?? '')).filter((x) => x.trim());
    const missing = [...new Set(vals.filter((x) => !text.includes(x.replace(/\s+/g, ''))))];
    verified = { checked: vals.length, missing };
  }
  return {
    kind,
    out,
    bytes: outBytes,
    filled: r.filled.map((f) => ({ label: f.label, ...(f.target ? { target: f.target } : {}), ...(f.source === 'clickhere' ? { clickhere: f.key } : {}) })),
    unmatched: [...r.unmatched],
    rejected: [...(r.rejected ?? [])],
    leftover,
    losses,
    verified,
    warnings,
  };
}

/**
 * 되쓰기. 원본이 hwp 면 hwp, hwpx 면 hwpx 를 돌려준다(형식을 바꾸지 않는다).
 * kordoc 이 못 바꾼 편집은 skipped(이유·전후 80자, partial = 적용은 됐으나 편집 그대로는 아님)로,
 * 되읽어 대조한 잔차는 verification 으로 그대로 돌려준다 — 숨기지 않는다.
 * structure(hwpx 만) = 문단 추가·삭제 반영(기본 false, A7 — 원고에 빠진 문단을 지우지 않는다). HWP 5.x 는 늘 건너뛴다.
 * changes = 원본과 결과를 다시 읽어 비교한 수정·추가·삭제 블록 수.
 */
export async function patchHangul(bytes, markdown, { structure = false } = {}) {
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  // 읽기(parse)는 LF 로 내는데 윈도우 편집기는 CRLF 로 저장한다 — 그대로 넘기면 kordoc 대조가 문단마다 어긋나 잔차로 잡힌다(261123 실서식)
  markdown = normalizeEol(markdown);
  if (!markdown.trim()) return { refused: '빈 원고는 되쓰지 않습니다.' };
  const k = await loadKordoc();
  const orig = await k.parse(toAb(bytes), { ...PARSE_OPTS, layoutTables: 'keep' });
  if (orig.success && newSensitive(orig.markdown, markdown)) {
    return { refused: '원본에 없던 주민등록번호 모양이나 가림 표시(******-*******)가 원고에 있어 되쓰지 않았습니다. 응답 글을 붙여 넣지 말고 read_hwp_as_markdown 이 쓴 파일을 고쳐 주세요.' };
  }
  const r = kind === 'hwp'
    ? await k.patchHwp(bytes, markdown, { verify: true })
    : await k.patchHwpx(bytes, markdown, { verify: true, structure });
  const skipped = (r.skipped ?? []).map((s) => ({ reason: sanitizeReason(s.reason), ...(s.before ? { before: maskExcerpt(s.before) } : {}), ...(s.after ? { after: maskExcerpt(s.after) } : {}), ...(s.partial ? { partial: true } : {}) }));
  // C2 — 행 끝 공백 두 칸만 단 줄은 kordoc 이 버린다. 건너뜀으로 알린다
  if (orig.success) {
    for (const l of forcedBreakEdits(orig.markdown, markdown)) skipped.push({ reason: '행 끝 공백 두 칸(강제 줄바꿈)은 되쓰지 않습니다. 줄을 나누려면 한글에서 고쳐 주세요.', after: maskExcerpt(l.trim().slice(0, 80)) });
  }
  const v = r.verification?.stats;
  const verification = v ? { added: v.added, removed: v.removed, modified: v.modified, unchanged: v.unchanged } : null;
  const ok = Boolean(r.success && r.data);
  // kordoc compare 는 겹친 틀 표 안 칸의 글자 변경을 못 본다(실서식 hwp_yoyang 에서 되쓴 1칸이 modified 0) — 다시 읽은 마크다운을 줄 단위로 센다
  let changes = null;
  if (ok && orig.success) {
    try {
      const back = await k.parse(toAb(new Uint8Array(r.data)), { ...PARSE_OPTS, layoutTables: 'keep' });
      if (back.success) changes = lineChanges(orig.markdown, back.markdown);
    } catch {
      changes = null;
    }
  }
  return {
    kind,
    success: ok,
    error: ok ? undefined : sanitizeReason(r.error ?? '알 수 없는 오류'),
    bytes: ok ? new Uint8Array(r.data) : null,
    applied: r.applied ?? 0,
    skipped,
    warnings: [...(r.warnings ?? [])].map(sanitizeReason),
    verification,
    changes,
  };
}
