// 퇴고 체험(/tools/toego)이 브라우저에서 부를 엔진 묶음을 만든다.
//
//   node scripts/build-toego-browser.mjs [--out <파일>]
//   기본 출력: src/lib/toego/engine.bundle.mjs (.gitignore — 저장소에 올리지 않는다. 타입은 engine.bundle.d.mts)
//
// 왜 따로 묶나 — 엔진 판정 모듈(tools/k-labor/lib/prose/check.mjs·lib/common.mjs)은 머리에서 node:fs·node:path·node:url·node:crypto 를
// 들여온다(팩 폴더 읽기·자산 경로·참조값 소금). 체험은 그 기능을 쓰지 않지만, 화면 번들러(Turbopack)는 브라우저 쪽에서 node:fs 를 받지 않고
// node:crypto·node:url 은 자기 대체본(crypto-browserify 약 0.8MB·native-url)으로 바꿔 끼워 next.config 별칭이 먹지 않는다(261124 실측).
// 그래서 엔진 파일은 그대로 두고, 진입점(src/lib/toego/entry.mjs)만 vite(저장소 직접 의존, build-contract-check-offline.mjs 와 같은 방식)로
// 묶으면서 node: 모듈 넷을 src/lib/toego/node-stub.mjs(불리면 던진다)로 바꿔 끼운다. 결과는 들여오기가 하나도 없는 ES 모듈 한 파일이다.
// predev·prebuild 에 걸려 있다. 묶음에 node: 가져오기나 네트워크 통로가 남으면 쓰지 않고 멈춘다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src', 'lib', 'toego', 'entry.mjs');
const STUB = join(ROOT, 'src', 'lib', 'toego', 'node-stub.mjs');
export const DEFAULT_OUT = join(ROOT, 'src', 'lib', 'toego', 'engine.bundle.mjs');
const NODE_MODULES = /^node:(fs|path|url|crypto)$/;

/** node: 모듈 넷을 스텁으로. 그 밖의 node: 모듈이 나오면 멈춘다(브라우저에서 돌 수 없다) */
function nodeStub() {
  return {
    name: 'toego-node-stub',
    enforce: 'pre',
    resolveId(id) {
      if (NODE_MODULES.test(id)) return STUB;
      if (id.startsWith('node:')) throw new Error(`퇴고 묶음: 브라우저에 실을 수 없는 모듈 ${id}`);
      return null;
    },
  };
}

/** 묶음에 남으면 안 되는 것 — 들여오기(node: 포함)와 네트워크 통로 */
export function forbiddenIn(code) {
  const bad = [];
  if (/^\s*import\s/m.test(code) || /\bimport\s*\(\s*["']/.test(code)) bad.push('import');
  if (/\brequire\s*\(/.test(code)) bad.push('require');
  for (const w of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts']) if (code.includes(w)) bad.push(w);
  return bad;
}

export async function buildToegoBrowser({ out = DEFAULT_OUT } = {}) {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    plugins: [nodeStub()],
    build: {
      write: false,
      emptyOutDir: false,
      sourcemap: false,
      // 화면 번들러가 다시 줄인다. 여기서는 읽을 수 있게 둔다(묶음 검사·시험이 글자를 본다)
      minify: false,
      target: 'es2022',
      modulePreload: false,
      lib: { entry: ENTRY, formats: ['es'], fileName: () => 'engine.bundle.mjs' },
      rollupOptions: { output: { comments: { legal: false } } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`퇴고 묶음 조각이 1개가 아닙니다: ${chunks.map((c) => c.fileName).join(', ')}`);
  const code = chunks[0].code;
  const bad = forbiddenIn(code);
  if (bad.length) throw new Error(`퇴고 묶음에 남으면 안 되는 것이 있습니다: ${bad.join(', ')}`);
  const head = '// 자동 생성 — scripts/build-toego-browser.mjs 가 src/lib/toego/entry.mjs 와 엔진(tools/k-labor/lib/prose)을 묶은 것. 고치지 말 것.\n/* eslint-disable */\n';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, head + code, 'utf8');
  return { out, bytes: Buffer.byteLength(head + code) };
}

/** 명령줄 → 출력 경로. --out 뒤에 경로가 없으면 오류 */
export function parseOut(args) {
  const i = args.indexOf('--out');
  if (i < 0) return DEFAULT_OUT;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) throw new Error('--out 뒤에 출력 파일 경로를 적어 주세요');
  return resolve(v);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let out;
  try {
    out = parseOut(process.argv.slice(2));
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(2);
  }
  const r = await buildToegoBrowser({ out });
  console.log(`toego browser engine: ${r.out} (${r.bytes} bytes)`);
}
