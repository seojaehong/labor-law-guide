// 한글(hwp·hwpx) 읽기·서식 채우기·마크다운 되쓰기 — kordoc(MIT, chrisryugj/kordoc) 라이브러리를 부른다.
//   readHangul   hwp·hwpx → 마크다운(표 병합 colspan·rowspan 은 HTML 표로 남는다)
//   fillHangul   서식의 라벨 옆 칸·괄호 빈칸 채우기 → hwp 또는 hwpx(원본 서식 그대로 채운 뒤 필요하면 HWP 5.x 로 저장)
//   patchHangul  readHangul(layout 'keep') 로 뽑은 마크다운을 고친 것을 원본에 되쓰기(바뀐 글자만, 서식 그대로)
// ★ 바이트를 받아 바이트를 돌려준다. 파일·네트워크를 만지지 않는다(파일은 groups/docs.mjs 가 읽고 쓴다) —
//   고객 파일을 여는 파서가 이 모듈 안에만 있어, 나중에 DB 키 없는 작업자로 옮길 때 이 파일만 옮기면 된다.
// ★ kordoc 은 묶지 않는다(build.mjs external). 안에서 cfb 를 createRequire 로, @rhwp/core(HWP 저장)를 동적 import 로 읽어
//   묶으면 깨진다. 도구를 부를 때만 불러 서버 기동은 무겁게 하지 않는다.

let kordocP = null;
/** kordoc 을 처음 쓸 때 한 번만 불러온다 */
export function loadKordoc() {
  kordocP ??= import('kordoc');
  return kordocP;
}

export const HWP_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // OLE2(CFB) — HWP 5.x
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (b, m) => m.every((x, i) => b[i] === x);

const toAb = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

/** 바이트로 종류를 판정한다 — 'hwp'(HWP 5.x) · 'hwpx' · null. 확장자는 믿지 않는다 */
export async function hangulKind(bytes) {
  const k = await loadKordoc();
  if (startsWith(bytes, HWP_MAGIC)) return k.detectFormat(toAb(bytes)) === 'hwp' ? 'hwp' : null;
  if (startsWith(bytes, ZIP_MAGIC)) return (await k.detectZipFormat(toAb(bytes))) === 'hwpx' ? 'hwpx' : null;
  return null;
}

const NOT_HANGUL = '한글 문서(HWP 5.x 또는 hwpx)가 아닙니다. 옛 HWP 3.x·배포용·암호 문서는 한글에서 hwpx 로 저장해 다시 주세요.';

/**
 * 읽기. layout = 'visual'(보이는 대로 — 테두리 없는 틀 표는 글로 푼다, 읽기용) · 'keep'(원본 표 구조 그대로 — patch 로 되쓸 원고는 이것으로)
 * OCR 은 끈다(모델이 캐시에 있는 PC 에서만 결과가 달라지지 않게).
 */
export async function readHangul(bytes, { layout = 'visual' } = {}) {
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  const k = await loadKordoc();
  const r = await k.parse(toAb(bytes), { ocr: false, ...(layout === 'keep' ? { layoutTables: 'keep' } : {}) });
  if (!r.success) throw new Error(`읽지 못했습니다: ${r.error}${r.code ? ` (${r.code})` : ''}`);
  return {
    kind,
    layout,
    markdown: r.markdown,
    warnings: (r.warnings ?? []).map((w) => ({ code: w.code, message: w.message, ...(w.page ? { page: w.page } : {}) })),
  };
}

/**
 * 서식 채우기. values = 라벨 → 값(배열이면 같은 라벨이 나오는 순서대로 하나씩).
 * hwp 서식은 서식 그대로 hwpx 로 바꿔 채운다(kordoc CLI 와 같은 길). 바꾸지 못하면 서식을 버리는 「새로 짓기」로 내려가지 않고 멈춘다.
 * out = 'hwpx' | 'hwp'(채운 hwpx 를 HWP 5.x 로 저장). requireUnique = 라벨이 두 곳 이상에 맞으면 채우지 않고 rejected 로.
 */
export async function fillHangul(bytes, values, { out, requireUnique = false } = {}) {
  if (out !== 'hwp' && out !== 'hwpx') throw new Error("출력 형식은 'hwp' 또는 'hwpx' 입니다");
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  const k = await loadKordoc();
  let src = toAb(bytes);
  if (kind === 'hwp') {
    let hx;
    try {
      hx = await k.hwpToHwpx(bytes);
    } catch (e) {
      throw new Error(`hwp 서식을 서식 그대로 hwpx 로 바꾸지 못해 채우지 않았습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
    src = toAb(hx);
  }
  const r = requireUnique
    ? await k.fillWithUniqueGuard(values, (vals, blocked) => k.fillHwpx(src, vals, blocked))
    : { ...(await k.fillHwpx(src, values)), rejected: [] };
  const warnings = [...(r.warnings ?? [])];
  let outBytes = new Uint8Array(r.buffer);
  if (out === 'hwp') outBytes = await k.hwpxToHwp(outBytes, { warnings });
  return {
    kind,
    out,
    bytes: outBytes,
    filled: r.filled.map((f) => f.label),
    unmatched: [...r.unmatched],
    rejected: [...(r.rejected ?? [])],
    warnings,
  };
}

/**
 * 되쓰기. 원본이 hwp 면 hwp, hwpx 면 hwpx 를 돌려준다(형식을 바꾸지 않는다).
 * kordoc 이 못 바꾼 편집은 skipped(이유·전후 80자, partial = 적용은 됐으나 편집 그대로는 아님)로,
 * 되읽어 대조한 잔차는 verification 으로 그대로 돌려준다 — 숨기지 않는다.
 * structure(hwpx 만) = 문단 추가·삭제 반영(기본 true). HWP 5.x 는 문단 추가·삭제를 늘 건너뛴다.
 */
export async function patchHangul(bytes, markdown, { structure = true } = {}) {
  const kind = await hangulKind(bytes);
  if (!kind) throw new Error(NOT_HANGUL);
  const k = await loadKordoc();
  // 읽기(parse)는 LF 로 내는데 윈도우 편집기는 CRLF 로 저장한다 — 그대로 넘기면 kordoc 대조가 문단마다 어긋나 잔차로 잡힌다(261123 실서식)
  markdown = String(markdown).replace(/\r\n?/g, '\n');
  const r = kind === 'hwp'
    ? await k.patchHwp(bytes, markdown, { verify: true })
    : await k.patchHwpx(bytes, markdown, { verify: true, structure });
  const skipped = (r.skipped ?? []).map((s) => ({ reason: s.reason, ...(s.before ? { before: s.before } : {}), ...(s.after ? { after: s.after } : {}), ...(s.partial ? { partial: true } : {}) }));
  const v = r.verification?.stats;
  return {
    kind,
    success: Boolean(r.success && r.data),
    error: r.success ? undefined : (r.error ?? '알 수 없는 오류'),
    bytes: r.success && r.data ? new Uint8Array(r.data) : null,
    applied: r.applied ?? 0,
    skipped,
    warnings: [...(r.warnings ?? [])],
    verification: v ? { added: v.added, removed: v.removed, modified: v.modified, unchanged: v.unchanged } : null,
  };
}
