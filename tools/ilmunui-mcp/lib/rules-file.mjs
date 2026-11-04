// 취업규칙 파일 → 글자. 사이트 /laws 「취업규칙 점검」이 브라우저에서 쓰는 추출기를 그대로 부른다.
//   hwpx·docx: src/lib/laws/doc-io(readDocText) · hwp: src/lib/laws/hwp-read(rhwp WASM) · pdf: src/lib/rules-review/pdf(readPdf, pdf.js)
//   txt·md: UTF-8(아니면 EUC-KR)
// ★ 파일은 이 PC 안에서만 읽는다. 스캔(그림뿐인) pdf 쪽은 읽지 않고 알린다 — 사이트 화면과 같다(OCR 로 넘기지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_FILE_BYTES, readDocText } from '@/lib/laws/doc-io';
import { readHwpText } from '@/lib/laws/hwp-read';
import { readPdf, SCANNED_BELOW } from '@/lib/rules-review/pdf';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다
const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = 'rhwp_bg.wasm';

/** rhwp WASM — LLG_ROOT(개발)면 저장소 node_modules, 아니면 패키지 dist/assets */
function wasmPath() {
  const root = process.env.LLG_ROOT;
  return root ? path.join(root, 'node_modules/@rhwp/core', WASM) : path.join(here, 'assets', WASM);
}

export const RULES_FILE_KINDS = ['hwp', 'hwpx', 'docx', 'pdf', 'txt', 'md'];

function decodeText(buf) {
  const bytes = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

/** pdf 본문 — 사이트 RulesCheck.readPdfPlainText 와 같은 판단·문구 */
async function readPdfText(bytes) {
  // pdf.js 는 워커를 따로 띄우지 않고 같은 스레드에서 돈다(사이트 pdf-browser.ts 와 같은 방식)
  globalThis.pdfjsWorker ??= pdfWorker;
  const { lines, pages } = await readPdf(bytes, pdfjs);
  const text = lines.map((l) => l.text).join('\n');
  const scanned = pages.filter((p) => p.scanned).length;
  if (!text.trim()) {
    throw new Error(scanned ? `글자 없이 그림만 있는 쪽이 ${scanned}쪽입니다. 글자를 직접 붙여넣으세요` : '본문에서 읽을 수 있는 글자가 없습니다. 글자를 직접 붙여넣으세요');
  }
  if (scanned) throw new Error(`${pages.length}쪽 중 ${scanned}쪽은 읽힌 한글·숫자가 ${SCANNED_BELOW}자 미만입니다. 짧은 표지·빈 쪽·스캔 쪽이 포함될 수 있어 일부만 점검하지 않습니다. 본문 글자를 직접 붙여넣으세요.`);
  return text;
}

/** 파일을 읽어 글자를 돌려준다. 못 읽으면 사람이 읽을 수 있는 이유로 던진다 */
export async function readRulesFile(filePath) {
  const p = String(filePath ?? '').trim();
  if (!p) throw new Error('파일 경로가 비었습니다');
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error(`파일이 없습니다: ${p}`);
  const size = fs.statSync(p).size;
  if (size > MAX_FILE_BYTES) throw new Error('파일은 10MB 이하만 읽습니다');
  const kind = path.extname(p).toLowerCase().slice(1);
  if (!RULES_FILE_KINDS.includes(kind)) throw new Error(`${RULES_FILE_KINDS.join('·')} 파일만 읽습니다`);
  const bytes = new Uint8Array(fs.readFileSync(p));
  let text;
  if (kind === 'hwpx' || kind === 'docx') text = await readDocText(bytes, kind);
  else if (kind === 'hwp') {
    if (!fs.existsSync(wasmPath())) throw new Error('hwp 읽기 부품(rhwp)이 이 설치본에 없습니다. 한글에서 hwpx 로 저장해 다시 주세요');
    text = await readHwpText(bytes, fs.readFileSync(wasmPath()));
  } else if (kind === 'pdf') text = await readPdfText(bytes);
  else text = decodeText(Buffer.from(bytes));
  if (!text.trim()) throw new Error('본문에서 읽을 수 있는 글자가 없습니다. 이미지 문서는 글자를 직접 붙여넣으세요');
  return { text, kind, bytes: size };
}
