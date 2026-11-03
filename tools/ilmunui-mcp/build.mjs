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
  external: ['popbill'],
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
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
for (const rel of assets) {
  const src = path.join(repo, rel);
  if (!fs.existsSync(src)) { console.error(`자산이 없습니다: ${rel}`); process.exit(1); }
  fs.copyFileSync(src, path.join(dist, 'assets', path.basename(rel)));
}
console.error(`built dist/server.mjs + ${assets.length} assets`);
