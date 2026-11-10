// 도구 묶음이 함께 쓰는 것 — 응답 만들기, 숫자만 남기기, 자산 경로.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다. 자산은 dist/assets/ 에 복사된다.
const here = path.dirname(fileURLToPath(import.meta.url));

/** 서식·글꼴 경로. LLG_ROOT 를 주면 저장소의 public/ 에서, 아니면 패키지 안 dist/assets 에서 읽는다. */
export function assetPath(name) {
  const root = process.env.LLG_ROOT;
  if (root) {
    const sub = name.endsWith('.pdf') ? 'public/forms/nhis' : 'public/fonts/llg-forms';
    return path.join(root, sub, name);
  }
  return path.join(here, 'assets', name);
}

// 주민번호 모양은 어떤 응답에서도 가린다 — 13자리 숫자 덩어리, 또는 「6자리-뒷자리(일부라도)」.
// 전화번호(11자리 이하)·접수번호(18자리)는 앞뒤 숫자 경계로 걸러져 가려지지 않는다.
const RRN_FULL = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/g;
const RRN_DASH = /(?<!\d)\d{6}\s*-\s*[1-8]\d{0,6}(?!\d)/g;
// SHA-256 16진 문자열(64자)은 숫자가 13자리 이어질 수 있어 주민번호 모양으로 잘못 잡힌다 — 해시는 검사·가림에서 뺀다
const HEX64 = /^[0-9a-f]{64}$/i;
const HEX64_IN = /\b[0-9a-f]{64}\b/gi;
export const mask = (s) => (HEX64.test(s) ? s : s.replace(RRN_FULL, '******-*******').replace(RRN_DASH, '******-*******'));
/** 도구 입력 전체(JSON)에서 주민번호 모양을 찾는다. 파일 해시는 뺀다 */
export const argsLookLikeRrn = (a) => looksLikeRrn(JSON.stringify(a).replace(HEX64_IN, ''));
export const looksLikeRrn = (s) => /\d{6}\s*-?\s*[1-8]\d{6}/.test(s);

/** MCP 텍스트 응답. 나가기 전에 주민번호 모양을 가린다.
 * 객체는 글자 값만 가린다 — 직렬화한 JSON 전체에 정규식을 걸면 13자리 금액(숫자)이 「******-*******」로 바뀌어 JSON 이 깨진다
 * (적대 검토 261104 — 일용근로 원천세 milli·지연이자 금액). 주민번호는 모든 도구가 글자로만 받는다. */
export const text = (obj) => ({
  content: [{
    type: 'text',
    text: typeof obj === 'string' ? mask(obj) : JSON.stringify(obj, (_k, v) => (typeof v === 'string' ? mask(v) : v), 2),
  }],
});
export const digits = (s) => String(s ?? '').replace(/\D/g, '');
