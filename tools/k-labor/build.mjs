// 사이트 엔진(src/lib/nhis-forms, src/lib/branch-directory)을 MCP 서버 하나로 묶고,
// 서식 PDF·글꼴·글꼴 라이선스를 dist/assets/ 에 복사해 설치본만으로 돌게 한다.
// 서식이 사이트와 한 벌로 유지되도록 엔진을 복사하지 않고 그대로 불러온다.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dist = path.join(here, 'dist');
// dist 를 지우고 그 자리에 빌드하면, 다시 빌드하는 동안 부른 쪽이 빈 dist·반쯤 쓴 server.mjs 를 본다(261120 적대 검토).
// dist 옆 임시 폴더에 다 만든 뒤 끝에 이름을 바꿔 넣는다. 실패하면 옛 dist 는 그대로 둔다.
// 이름은 .gitignore 의 dist.tmp-* · dist.old-* 와 맞춘다
const tag = `${process.pid}-${Date.now()}`;
const tmp = path.join(here, `dist.tmp-${tag}`);
const old = path.join(here, `dist.old-${tag}`);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null; // git 이 없거나 저장소 밖(묶음 파일에서 빌드) — 출처 칸을 null 로 둔다
  }
};

// 빌드 출처(dist/build-info.json) — 어느 커밋·어느 잠금파일로 만든 어떤 server.mjs 인가. 임시 폴더를 만들기 전에 잰다
const head = git(['rev-parse', 'HEAD']);
const commit = head && /^[0-9a-f]{40}$/.test(head) ? head : null;
const status = commit ? git(['status', '--porcelain', '--', 'tools/k-labor', 'src']) : null;
const lockPath = path.join(repo, 'package-lock.json');
const info = {
  version: JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version,
  commit,
  dirty: status === null ? null : status.length > 0, // tools/k-labor·src 아래 커밋 안 된 변경(추적 안 된 파일 포함)
  lockfileSha256: fs.existsSync(lockPath) ? sha256(fs.readFileSync(lockPath)) : null,
  node: process.version,
  serverSha256: null,
  officeSha256: null,
  builtAt: null,
};

// k-labor/office 라이브러리 출처 — 빌드 때 상수로 박는다(결과 meta.engine 에 그대로 실린다). builtAt 은 넣지 않는다(같은 커밋이면 같은 값)
const engine = { name: 'k-labor/office', version: info.version, commit: info.commit, dirty: info.dirty };
const ENGINE_DEFINE = { __K_LABOR_OFFICE_ENGINE__: JSON.stringify(engine) };
// npm pack·publish 는 커밋된 깨끗한 트리에서만 — 출처가 거짓이 되지 않게(dirty 이거나 git 을 못 읽으면 멈춘다)
if (['prepack', 'prepublishOnly'].includes(process.env.npm_lifecycle_event ?? '') && info.dirty !== false) {
  console.error(`pack 거부: tools/k-labor·src 아래 커밋 안 된 변경이 있습니다(dirty=${info.dirty}). 커밋한 뒤 다시 pack 하세요.`);
  process.exit(1);
}
// 라이브러리 묶음에 들어오면 안 되는 의존(MCP·발송·문자 인식·스키마)
const OFFICE_FORBIDDEN = /node_modules[\\/](@modelcontextprotocol|popbill|tesseract\.js|@tesseract\.js-data|@napi-rs|zod)[\\/]/;

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

class BuildError extends Error {}

// 윈도에서는 백신·탐색기가 폴더를 잠깐 잡으면 이름 바꾸기가 EPERM/EBUSY 로 실패한다 — 조금씩 기다리며 몇 번 더 해 본다
const renameRetry = (from, to) => {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i >= 9 || !['EPERM', 'EBUSY', 'EACCES'].includes(e?.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (i + 1));
    }
  }
};

// 비어 있지 않은 폴더 위로는 이름을 바꿀 수 없다 → 옛 dist 를 비켜 두고, 새 것을 넣고, 옛 것을 지운다. 넣기에 실패하면 옛 것을 되돌린다
function swapIn() {
  const had = fs.existsSync(dist);
  if (had) renameRetry(dist, old);
  try {
    renameRetry(tmp, dist);
  } catch (e) {
    if (had) renameRetry(old, dist);
    throw e;
  }
  if (!had) return;
  try {
    fs.rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (e) {
    console.error(`(옛 dist 를 지우지 못했습니다 — 새 dist 는 들어갔습니다. 손으로 지워 주세요) ${old}: ${e?.code || e}`);
  }
}

let extra = 0;
try {
  await build({
    entryPoints: [path.join(here, 'server.mjs')],
    outfile: path.join(tmp, 'server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    alias: { '@': path.join(repo, 'src') },
    // popbill 은 CJS 이고 내부에서 require 를 쓴다 — 묶지 않고 node_modules 에서 읽는다
    // 문자 인식(스캔 회의록) — 네이티브(@napi-rs/canvas)·워커 스크립트·언어 자료가 있어 묶지 않고 설치본 node_modules 에서 읽는다(optionalDependencies)
    external: ['popbill', '@napi-rs/canvas', 'tesseract.js', '@tesseract.js-data/kor'],
    banner: { js: "#!/usr/bin/env node\nimport { createRequire as __llgCreateRequire } from 'node:module'; const require = __llgCreateRequire(import.meta.url);" },
    define: ENGINE_DEFINE,
    logLevel: 'warning',
  });

  // ── 라이브러리 입구 k-labor/office — 별도 번들(ESM). exceljs·jszip·pptxgenjs 를 안에 묶고 MCP SDK·popbill·tesseract 는 들이지 않는다
  const officeOut = path.join(tmp, 'office', 'index.mjs');
  const om = await build({
    entryPoints: [path.join(repo, 'src/lib/office/index.ts')],
    outfile: officeOut,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    alias: { '@': path.join(repo, 'src') },
    banner: { js: "import { createRequire as __llgCreateRequire } from 'node:module'; const require = __llgCreateRequire(import.meta.url);" },
    define: ENGINE_DEFINE,
    metafile: true,
    logLevel: 'warning',
  });
  const leaked = Object.keys(om.metafile.inputs).filter((p) => OFFICE_FORBIDDEN.test(p));
  if (leaked.length) throw new BuildError(`k-labor/office 묶음에 들어오면 안 되는 의존이 있습니다: ${leaked.slice(0, 5).join(', ')}`);
  // 타입 선언 — tsc 로 뽑고(내부용 @internal 은 뺀다), ESM(nodenext) 소비자를 위해 상대 경로에 .js 를 붙인다
  const typesDir = path.join(tmp, 'office', 'types');
  try {
    execFileSync(process.execPath, [path.join(repo, 'node_modules/typescript/bin/tsc'), '-p', path.join(here, 'tsconfig.office.json'), '--outDir', typesDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new BuildError(`k-labor/office 타입 선언을 만들지 못했습니다:\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
  }
  const addJs = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) addJs(p);
      else if (ent.name.endsWith('.d.ts')) {
        const src = fs.readFileSync(p, 'utf8');
        const out = src.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+?)(?<!\.js)\2/g, '$1$2$3.js$2');
        if (/from\s+['"](exceljs|jszip|pptxgenjs)['"]/.test(out)) throw new BuildError(`타입 선언이 묶은 라이브러리 타입을 드러냅니다: ${path.relative(tmp, p)}`);
        fs.writeFileSync(p, out);
      }
    }
  };
  addJs(typesDir);
  info.officeSha256 = sha256(fs.readFileSync(officeOut));

  fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });
  for (const rel of assets) {
    const src = path.join(repo, rel);
    if (!fs.existsSync(src)) throw new BuildError(`자산이 없습니다: ${rel}`);
    fs.copyFileSync(src, path.join(tmp, 'assets', path.basename(rel)));
  }
  for (const rel of optional) {
    const src = path.join(repo, rel);
    if (!fs.existsSync(src)) { console.error(`(선택 자산 없음, 건너뜀) ${rel}`); continue; }
    const name = rel.endsWith('LICENSE') ? 'rhwp-LICENSE.txt' : path.basename(rel);
    fs.copyFileSync(src, path.join(tmp, 'assets', name));
    extra += 1;
  }

  info.serverSha256 = sha256(fs.readFileSync(path.join(tmp, 'server.mjs')));
  info.builtAt = new Date().toISOString();
  fs.writeFileSync(path.join(tmp, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
  swapIn();
} catch (e) {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.error(e instanceof BuildError ? e.message : e);
  console.error(fs.existsSync(dist) ? '빌드 실패 — 옛 dist 는 그대로 둡니다.' : '빌드 실패 — dist 가 없습니다.');
  process.exit(1);
}
console.error(`built dist/server.mjs + dist/office(index.mjs·d.ts) + ${assets.length + extra} assets · build-info ${info.commit ? info.commit.slice(0, 12) : 'no-git'}${info.dirty ? '+dirty' : ''}`);
