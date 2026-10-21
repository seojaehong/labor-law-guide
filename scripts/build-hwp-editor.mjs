// /hwp-editor 의 한글 편집기(rhwp-studio)를 정적 앱으로 빌드해 public/hwp-editor/ 에 둔다.
//
// rhwp 는 엔진(@rhwp/core)과 iframe SDK(@rhwp/editor)는 npm 에 올리지만 편집기 화면(rhwp-studio)은
// 올리지 않는다. SDK 기본값은 rhwp 공개 사이트의 편집기를 띄우는 것이라, 우리 도메인에서 문서를
// 다루려면 편집기를 직접 빌드해 같은 출처로 내보내야 한다.
//
// 빌드 방식은 이음오피스(pblsketch/openoffice, Apache-2.0) apps/hwp/scripts/build-studio.mjs
// (commit 284f3b394f385efbc8278b4fc4880cba3d277072)를 참고했다 — 고정 태그를 얕게 받아 고정 커밋을
// 확인하고, 소스를 node_modules/.cache 아래에 둬 편집기 소스의 의존(canvaskit-wasm·@noble/hashes)을
// 이 저장소 node_modules 에서 찾게 한다. 그래서 rhwp-studio 안에서 따로 npm 설치를 하지 않는다.
//
// 산출물(약 23MB)은 저장소에 올리지 않는다(.gitignore). 같은 입력이면 다시 빌드하지 않는다:
//   1) public/hwp-editor/.stamp 가 같으면 건너뜀
//   2) .next/cache/hwp-editor/<stamp>/ 에 있으면 복사(Vercel 은 .next/cache 를 빌드 사이에 보존한다)
//   3) 없으면 받아서 빌드하고 위 캐시에도 남긴다
// Rust 는 필요 없다 — WASM 은 @rhwp/core 의 미리 빌드된 것을 쓴다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rhwpPatches } from './hwp-editor/rhwp-patches.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS, '..');
const require = createRequire(join(ROOT, 'package.json'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const REPO = 'https://github.com/edwardkim/rhwp.git';
/** 편집기는 같은 판의 엔진과 함께 빌드한다 */
const VERSION = manifest.dependencies['@rhwp/core'];
const TAG = `v${VERSION}`;
/** 태그가 옮겨졌으면 빌드를 멈춘다(이음오피스 PINNED_COMMITS 와 같은 값) */
const PINNED_COMMITS = { 'v0.8.7': '1a76570e833917d15817415a53c09ad61ab3203f' };
/**
 * 편집기가 쪽을 그릴 때 받아 가는 글꼴. 전부 SIL OFL 1.1(rhwp assets/fonts/FONTS.md 「오픈 라이선스 폰트」).
 * 그 밖의 글꼴 요청은 브라우저 기본 글꼴로 대신 그린다.
 */
const FONTS = ['NotoSansKR-Regular.woff2', 'NotoSansKR-Bold.woff2', 'NotoSerifKR-Regular.woff2'];
/** 빌드가 읽는 것만 받는다. 저장소의 표본 문서·비OFL 글꼴은 받지 않는다 */
const SPARSE_PATTERNS = [
  '/LICENSE',
  '/THIRD_PARTY_LICENSES.md',
  '/rhwp-studio/index.html',
  '/rhwp-studio/tsconfig.json',
  '/rhwp-studio/src/',
  '/rhwp-studio/public/',
  '!/rhwp-studio/public/fonts',
  '!/rhwp-studio/public/samples',
  '/npm/hwpctrl-ocx/src/',
  '/assets/fonts/FONTS.md',
  ...FONTS.map((f) => `/assets/fonts/${f}`),
];

const CACHE = join(ROOT, 'node_modules', '.cache', 'rhwp-studio', TAG);
const OUT = join(ROOT, 'public', 'hwp-editor');
const STAMP = join(OUT, '.stamp');
const OFL = join(ROOT, 'third_party', 'noto-fonts');

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

function stampValue() {
  const hash = createHash('sha256');
  hash.update(`${TAG}\n${PINNED_COMMITS[TAG]}\n${FONTS.join(',')}\n`);
  hash.update(readFileSync(fileURLToPath(import.meta.url)));
  hash.update(readFileSync(join(SCRIPTS, 'hwp-editor', 'rhwp-patches.mjs')));
  return hash.digest('hex').slice(0, 16);
}

function fetchSource() {
  const pinned = PINNED_COMMITS[TAG];
  if (!pinned) throw new Error(`hwp-editor: ${TAG} 의 고정 커밋이 없습니다. 릴리스를 검토한 뒤 PINNED_COMMITS 에 넣으세요`);
  if (existsSync(join(CACHE, '.git')) && git(['rev-parse', 'HEAD'], CACHE) === pinned) {
    git(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], CACHE);
    return;
  }
  rmSync(CACHE, { recursive: true, force: true });
  mkdirSync(dirname(CACHE), { recursive: true });
  console.log(`hwp-editor: fetching rhwp ${TAG}`);
  git(['clone', '--depth', '1', '--branch', TAG, '--filter=blob:none', '--no-checkout', REPO, CACHE], dirname(CACHE));
  git(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], CACHE);
  git(['checkout', '--quiet', TAG], CACHE);
  const head = git(['rev-parse', 'HEAD'], CACHE);
  if (head !== pinned) {
    rmSync(CACHE, { recursive: true, force: true });
    throw new Error(`hwp-editor: ${TAG} 가 ${head} 를 가리킵니다. 기대값 ${pinned}`);
  }
}

async function buildStudio() {
  const { build } = await import('vite');
  const studio = join(CACHE, 'rhwp-studio');
  const wasmPkg = dirname(require.resolve('@rhwp/core'));
  await build({
    configFile: false,
    root: studio,
    base: '/hwp-editor/',
    logLevel: 'warn',
    define: {
      __APP_VERSION__: JSON.stringify(VERSION),
      // 외부(CDN) 웹글꼴을 받지 않는다 — 사용자가 요청하지 않은 바깥 요청을 만들지 않는다
      __RHWP_DISABLE_EXTERNAL_WEBFONTS__: 'true',
      // 한컴 HwpCtrl 호환 플러그인은 싣지 않는다
      __RHWP_HWPCTRL__: 'false',
    },
    resolve: {
      alias: {
        '@': join(studio, 'src'),
        '@wasm': wasmPkg,
        '@rhwp/hwpctrl/studio-plugin': join(CACHE, 'npm', 'hwpctrl-ocx', 'src', 'studio-plugin.mjs'),
      },
    },
    // 원 vite.config 의 PWA(서비스 워커) 플러그인은 넣지 않는다 — configFile:false 라 플러그인은 이것뿐이다
    plugins: [rhwpPatches('studio-password-flag')],
    build: { outDir: OUT, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  });
  // 라이선스는 산출물과 함께 간다
  copyFileSync(join(CACHE, 'LICENSE'), join(OUT, 'LICENSE-rhwp.txt'));
  copyFileSync(join(CACHE, 'THIRD_PARTY_LICENSES.md'), join(OUT, 'THIRD-PARTY-LICENSES-rhwp.md'));
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  for (const f of FONTS) copyFileSync(join(CACHE, 'assets', 'fonts', f), join(OUT, 'fonts', f));
  copyFileSync(join(CACHE, 'assets', 'fonts', 'FONTS.md'), join(OUT, 'fonts', 'FONTS-rhwp.md'));
  copyFileSync(join(OFL, 'OFL-NotoSansKR.txt'), join(OUT, 'fonts', 'OFL-NotoSansKR.txt'));
  copyFileSync(join(OFL, 'OFL-NotoSerifKR.txt'), join(OUT, 'fonts', 'OFL-NotoSerifKR.txt'));
}

const force = process.argv.includes('--force');
const stamp = stampValue();
const saved = join(ROOT, '.next', 'cache', 'hwp-editor', stamp);
const t0 = Date.now();
if (!force && existsSync(join(OUT, 'index.html')) && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === stamp) {
  console.log(`hwp-editor: ${TAG} up to date (${stamp})`);
} else if (!force && existsSync(join(saved, 'index.html'))) {
  rmSync(OUT, { recursive: true, force: true });
  cpSync(saved, OUT, { recursive: true });
  writeFileSync(STAMP, stamp);
  console.log(`hwp-editor: restored ${TAG} from .next/cache (${stamp}) in ${Date.now() - t0}ms`);
} else {
  // GitHub 장애·태그 이동으로 편집기를 못 만들어도 사이트 배포는 막지 않는다 — 편집기만 빠진다.
  // 엄격하게 멈추려면 HWP_EDITOR_STRICT=1
  try {
    fetchSource();
    await buildStudio();
    writeFileSync(STAMP, stamp);
    rmSync(dirname(saved), { recursive: true, force: true });
    cpSync(OUT, saved, { recursive: true });
    console.log(`hwp-editor: built ${TAG} into public/hwp-editor (${stamp}) in ${Date.now() - t0}ms`);
  } catch (e) {
    if (process.env.HWP_EDITOR_STRICT === '1') throw e;
    rmSync(OUT, { recursive: true, force: true });
    console.warn(`hwp-editor: ⚠ 편집기 빌드를 건너뜁니다(사이트 빌드는 계속) — ${e instanceof Error ? e.message : e}`);
  }
}
