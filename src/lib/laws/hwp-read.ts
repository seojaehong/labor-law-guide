// hwp(한글 바이너리) 본문 읽기. rhwp(MIT, https://github.com/edwardkim/rhwp) WASM 을 .hwp 를 고를 때만 불러온다.
// 파일은 브라우저 밖으로 나가지 않는다. 쪽 나눔·렌더는 쓰지 않고 글자만 뽑는다.
import type { InitInput } from '@rhwp/core';
import { MAX_FILE_BYTES, readableText } from './doc-io';

/** public/rhwp/ 에 빌드 때 복사한다(scripts/copy-rhwp-wasm.mjs) */
export const RHWP_WASM_URL = '/rhwp/rhwp_bg.wasm';

let ready: Promise<typeof import('@rhwp/core')> | null = null;

/** rhwp 모듈을 한 번만 초기화한다. 쪽 그리기(/tools/hwp)도 이것을 쓴다 */
export function loadRhwp(wasm: InitInput = RHWP_WASM_URL) {
  ready ??= import('@rhwp/core').then(async (m) => {
    // 조판 계산이 글자 폭을 묻는다. 브라우저는 캔버스로 재고, 그 밖(테스트)은 어림값을 쓴다
    const g = globalThis as { measureTextWidth?: (font: string, text: string) => number };
    if (!g.measureTextWidth && typeof document !== 'undefined') {
      const ctx = document.createElement('canvas').getContext('2d');
      // ctx.font 지정은 비싸다 — 같은 글꼴이면 다시 지정하지 않는다(rhwp README 권장)
      let last = '';
      if (ctx) g.measureTextWidth = (font, text) => { if (font !== last) { ctx.font = font; last = font; } return ctx.measureText(text).width; };
    }
    g.measureTextWidth ??= (font, text) => (Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 16) * text.length;
    await m.default({ module_or_path: wasm });
    return m;
  }).catch((e) => { ready = null; throw e; });
  return ready;
}

/** HWP 5.0 은 복합 문서(CFB) 형식이라 머리 8바이트가 정해져 있다 */
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export async function readHwpText(data: ArrayBuffer | Uint8Array, wasm: InitInput = RHWP_WASM_URL): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  if (!CFB.every((b, i) => bytes[i] === b)) throw new Error('한글(hwp) 파일 형식이 아닙니다');
  const { HwpDocument } = await loadRhwp(wasm);
  let doc: InstanceType<typeof HwpDocument> | null = null;
  let text: string;
  try {
    doc = new HwpDocument(bytes);
    // 0.8.7 은 글자를 JSON 문자열(따옴표·\r\n 이스케이프)로 감싸 돌려준다
    const raw = doc.getTextFileText();
    text = raw.startsWith('"') ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('hwp 본문을 읽지 못했습니다. 암호가 걸렸거나 손상된 파일일 수 있습니다. hwpx로 저장하거나 본문을 붙여넣으세요');
  } finally {
    doc?.free();
  }
  return readableText(text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean).join('\n'));
}
