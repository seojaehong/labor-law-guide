// 도구 묶음이 함께 쓰는 것 — 응답 만들기, 숫자만 남기기, 자산 경로, 새 파일 쓰기.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다. 자산은 dist/assets/ 에 복사된다.
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 새 파일만 쓴다(flag 'wx'). 이미 있으면 쓰지 않고 false.
 * 있는지 먼저 보는 것만으로는 같은 이름으로 동시에 부른 두 호출이 둘 다 통과해 한쪽이 덮인다(261120 적대 검토).
 * 여러 파일을 쓰는 도구는 false 를 받으면 거기서 멈춘다 — 같은 순서로 쓰므로 첫 파일을 먼저 쓴 호출이 전부 쓰고,
 * 늦은 호출은 아무것도 쓰지 않은 채 거절된다. 덧붙이는 기록(.jsonl)은 이것을 쓰지 않는다.
 */
export function writeNew(file, bytes) {
  try {
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    return true;
  } catch (e) {
    if (e?.code === 'EEXIST') return false;
    throw e;
  }
}

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
// 사이 공백 길이는 따지지 않는다. 다만 \s*-?\s* 꼴은 긴 공백 덩어리에서 덩어리 길이의 제곱으로 되짚으므로(261123 적대 검토, 12만 칸 19초)
// 같은 뜻의 \s*(?:-\s*)? 로 쓴다 — 공백 덩어리를 두 몫으로 나눠 맞춰 보는 길이 없어 덩어리 길이에 비례해 끝난다
const RRN_FULL = /(?<!\d)\d{6}\s*(?:-\s*)?[1-8]\d{6}(?!\d)/g;
const RRN_DASH = /(?<!\d)\d{6}\s*-\s*[1-8]\d{0,6}(?!\d)/g;
// SHA-256 16진 문자열(64자)은 숫자가 13자리 이어질 수 있어 주민번호 모양으로 잘못 잡힌다 — 해시는 검사·가림에서 뺀다
const HEX64 = /^[0-9a-f]{64}$/i;
const HEX64_IN = /\b[0-9a-f]{64}\b/gi;
export const mask = (s) => (HEX64.test(s) ? s : s.replace(RRN_FULL, '******-*******').replace(RRN_DASH, '******-*******'));
/** 도구 입력 전체(JSON)에서 주민번호 모양을 찾는다. 파일 해시는 뺀다 */
export const argsLookLikeRrn = (a) => looksLikeRrn(JSON.stringify(a).replace(HEX64_IN, ''));
// 입력 거름 — 앞뒤가 숫자가 아니고(14자리 접수번호·더 긴 숫자 줄 속 13자리·「6자리-시행일 8자리」 법령 판 번호를 빼려고)
// 앞 6자리가 있을 법한 생년월일(월 01~12, 일 01~31)인 것만 잡는다(261120 적대 검토).
// ★ 끝자리 검증(체크섬)으로 거르지 않는다 — 2020. 10. 부터 새로 주는 주민번호는 끝자리 공식을 따르지 않아,
//   체크섬으로 거르면 진짜 번호가 그대로 통과한다. 법인등록번호(예: 110111-1234567)도 잡히지만 멈추는 쪽이 안전하므로 둔다.
// 응답 가림(mask)은 이 날짜 조건 없이 넓게 가린다.
const RRN_LIKE = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\s*(?:-\s*)?[1-8]\d{6}(?!\d)/;
export const looksLikeRrn = (s) => RRN_LIKE.test(s);
const RRN_LIKE_G = new RegExp(RRN_LIKE.source, 'g');
/**
 * 문서 글(원문)에서 주민번호 모양이 시작하는 줄 번호(1부터, 겹치지 않게). 숫자는 돌려주지 않는다.
 * argsLookLikeRrn 은 입력 전체를 JSON 으로 감싸 보므로 글 안의 탭·줄바꿈이 「\t」「\n」 글자로 바뀌어 그 사이로 나눈 번호를 놓친다(261124 G4) —
 * 글 하나를 받는 도구는 이것으로 원문을 본다. 64자 16진 해시는 같은 길이의 「_」로 바꿔 줄 위치를 지킨다.
 */
export function rrnLines(s) {
  const t = String(s ?? '').replace(HEX64_IN, (h) => '_'.repeat(h.length));
  const lines = [];
  let line = 1;
  let at = 0;
  for (const m of t.matchAll(RRN_LIKE_G)) {
    for (; at < m.index; at++) {
      const c = t.charCodeAt(at);
      if (c === 10 || (c === 13 && t.charCodeAt(at + 1) !== 10)) line++;
    }
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  return lines;
}

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
