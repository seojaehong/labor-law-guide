// 사이트 엔진(src/lib/nhis-forms, src/lib/branch-directory)을 MCP 서버 하나로 묶고,
// 서식 PDF·글꼴·글꼴 라이선스를 dist/assets/ 에 복사해 설치본만으로 돌게 한다.
// 서식이 사이트와 한 벌로 유지되도록 엔진을 복사하지 않고 그대로 불러온다.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dist = path.join(here, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: [path.join(here, 'server.mjs')],
  outfile: path.join(dist, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  alias: { '@': path.join(repo, 'src') },
  // popbill 은 CJS 이고 내부에서 require 를 쓴다 — 묶지 않고 node_modules 에서 읽는다
  // 문자 인식(스캔 회의록) — 네이티브(@napi-rs/canvas)·워커 스크립트·언어 자료가 있어 묶지 않고 설치본 node_modules 에서 읽는다(optionalDependencies)
  external: ['popbill', '@napi-rs/canvas', 'tesseract.js', '@tesseract.js-data/kor'],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __llgCreateRequire } from 'node:module'; const require = __llgCreateRequire(import.meta.url);" },
  logLevel: 'warning',
});

const assets = [
  'public/forms/nhis/NHIS_8_LOSS.pdf',
  'public/forms/nhis/NHIS_6_ACQ.pdf',
  'public/fonts/llg-forms/LLGFormsSans-Regular.ttf',
  'public/fonts/llg-forms/OFL.txt', // 글꼴(나눔고딕 축소·개명본) SIL OFL 1.1 — 글꼴과 함께 배포해야 한다
  // contract 묶음 — 근로계약서 PDF 는 사이트와 같이 나눔고딕 전체를 쓴다(서브셋은 글자가 빠진다)
  'public/fonts/NanumGothic-Regular.ttf',
  'public/fonts/NanumGothic-OFL.txt',
];
// 있으면 넣고 없으면 건너뛰는 자산 — work-rules 묶음의 hwp 읽기(rhwp WASM, MIT, 약 12MB).
// 없으면 hwp 파일만 「hwpx 로 저장해 다시」로 안내하고 나머지는 그대로 돈다.
const optional = [
  'node_modules/@rhwp/core/rhwp_bg.wasm',
  'node_modules/@rhwp/core/LICENSE',
];
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
for (const rel of assets) {
  const src = path.join(repo, rel);
  if (!fs.existsSync(src)) { console.error(`자산이 없습니다: ${rel}`); process.exit(1); }
  fs.copyFileSync(src, path.join(dist, 'assets', path.basename(rel)));
}
let extra = 0;
for (const rel of optional) {
  const src = path.join(repo, rel);
  if (!fs.existsSync(src)) { console.error(`(선택 자산 없음, 건너뜀) ${rel}`); continue; }
  const name = rel.endsWith('LICENSE') ? 'rhwp-LICENSE.txt' : path.basename(rel);
  fs.copyFileSync(src, path.join(dist, 'assets', name));
  extra += 1;
}
console.error(`built dist/server.mjs + ${assets.length + extra} assets`);
