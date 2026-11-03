// 사이트 엔진(src/lib/nhis-forms, src/lib/branch-directory)을 MCP 서버 하나로 묶는다.
// 서식이 사이트와 한 벌로 유지되도록 엔진을 복사하지 않고 그대로 불러온다.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'server.mjs')],
  outfile: path.join(here, 'dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  alias: { '@': path.join(here, '../../src') },
  // popbill 은 CJS 이고 내부에서 require 를 쓴다 — 묶지 않고 node_modules 에서 읽는다
  external: ['popbill'],
  banner: { js: "import { createRequire as __llgCreateRequire } from 'node:module'; const require = __llgCreateRequire(import.meta.url);" },
  logLevel: 'warning',
});
console.error('built dist/server.mjs');
