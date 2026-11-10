// 퇴사 자료 대조 엔진(~/dev/exit-check) 사본 동기화.
//
//   node scripts/exit-check/sync-engine.mjs
//   (환경 변수) EXIT_CHECK_ENGINE_DIR  엔진 저장소 폴더. 기본 ~/dev/exit-check
//               EXIT_CHECK_ENGINE_COMMIT 고정 커밋. 기본 cab1cce(엔진 태그 site-pin-261110)
//
// 하는 일
//   1) 엔진 작업 폴더가 아니라 `git -C <엔진> show <커밋>:<경로>` 로 읽는다(미추적 scratch·CRLF 로 풀린 파일이 끼지 않게).
//   2) src/config.ts 에서 시작해 상대 경로 가져오기(타입 가져오기 포함)를 따라가 닫힘 집합을 구한다. src/cli.ts·src/report/** 는 들지 않는다.
//   3) 그 파일들을 src/lib/exit-check/ 에 하위 폴더째 옮긴다. 첫 줄에 「// 원본: ~/dev/exit-check @<짧은 해시>」,
//      상대 경로 가져오기 지정자의 .js 를 뺀다(한 줄·여러 줄 문장 모두. 문자열 안의 ".js" 는 건드리지 않는다).
//      rules/deadline-rules.json 은 src/lib/exit-check/deadline-rules.json 으로 그대로 옮긴다.
//   4) 원본(사본 아님)을 node_modules/.cache/exit-check-engine/ 에 꺼내 사이트의 typescript 로 빌드하고,
//      합성 fixture 를 prepareFromManifest → runCore 로 돌려 동작 지문의 기준값을 잰다.
//   5) tests/fixtures/exit-check/engine-fingerprint.json 과 tests/fixtures/exit-check/scenarios.ts 를 쓴다.
// 같은 커밋으로 두 번 돌리면 결과 파일이 바이트 단위로 같다(git diff 0).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_DIR = process.env.EXIT_CHECK_ENGINE_DIR ?? join(homedir(), 'dev', 'exit-check');
const COMMIT_ARG = process.env.EXIT_CHECK_ENGINE_COMMIT ?? 'cab1cce';
const SOURCE_LABEL = '~/dev/exit-check';
const ENTRY = 'src/config.ts';
const RULES_SOURCE = 'rules/deadline-rules.json';
const RULES_COPY = 'deadline-rules.json';
const COPY_DIR = join(SITE, 'src', 'lib', 'exit-check');
const FIXTURE_OUT = join(SITE, 'tests', 'fixtures', 'exit-check');
const CACHE_DIR = join(SITE, 'node_modules', '.cache', 'exit-check-engine');

// 싣지 않는 fixture. 계획(조각 1)에 적힌 두 개이고, 아래 내용 검사로 같은 집합인지 매번 다시 확인한다.
const SKIPPED = {
  S08: '가짜 이름 열(worker_name 「홍길동」)이 있다. 사람 이름 형태 값은 사이트 저장소에 싣지 않는다(계획 조각 1).',
  S11: '메모 칸에 주민등록번호 형태 시험값이 있다. 그 형태 값은 사이트 저장소에 싣지 않는다(계획 조각 1).',
};

function git(args) {
  return execFileSync('git', ['-C', ENGINE_DIR, ...args], { maxBuffer: 64 << 20 });
}
function fail(msg) {
  console.error(`sync-engine: ${msg}`);
  process.exit(1);
}

// ---- 지정자 다루기 ----

// 가져오기·내보내기 문장의 지정자. 문장 시작(파일 처음, 줄바꿈, ; 뒤)에서 import/export 로 시작하고 from 까지 따옴표가 없는 꼴.
const STATEMENT = /(?:^|[\n;])[ \t]*(?:import|export)\b[^;'"`]*?\bfrom[ \t]*(['"])([^'"\n]+)\1/g;
const SIDE_EFFECT = /(?:^|[\n;])[ \t]*import[ \t]*(['"])([^'"\n]+)\1/g;
const DYNAMIC = /\bimport[ \t]*\([ \t\n]*(['"`])([^'"`$\n]+)\1/g;

function specifiers(text) {
  const out = [];
  for (const re of [STATEMENT, SIDE_EFFECT, DYNAMIC]) for (const m of text.matchAll(re)) out.push(m[2]);
  return out;
}

// .js 를 빼는 자리는 「from "./…js"」「import "./…js"」「import("./…js")」뿐이다. 상대 경로(./ ../)만.
const REL_JS = /(\bfrom[ \t]*|(?:^|[\n;])[ \t]*import[ \t]*|\bimport[ \t]*\([ \t\n]*)(['"])(\.{1,2}\/[^'"\n]*?)\.js\2/g;

export function stripRelativeJs(text) {
  return text.replace(REL_JS, (_all, lead, q, path) => `${lead}${q}${path}${q}`);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])]));
  return v;
}

function writeIfChanged(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (existsSync(path) && readFileSync(path).equals(buf)) return false;
  writeFileSync(path, buf);
  return true;
}

function listFiles(root, dir = root) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(root, p));
    else out.push(relative(root, p).split('\\').join('/'));
  }
  return out;
}

// ---- 1. 커밋과 닫힘 집합 ----

if (!existsSync(ENGINE_DIR)) fail(`엔진 폴더가 없다: ${ENGINE_DIR} (EXIT_CHECK_ENGINE_DIR 로 지정)`);
let commit;
try {
  commit = git(['rev-parse', '--verify', `${COMMIT_ARG}^{commit}`]).toString('utf8').trim();
} catch {
  fail(`엔진 저장소에 커밋 ${COMMIT_ARG} 이 없다`);
}
const short = commit.slice(0, 7);
const show = (path) => git(['show', `${commit}:${path}`]);

function engineText(path) {
  const buf = show(path);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(`${path}: BOM 이 있다`);
  return buf.toString('utf8').replace(/\r/g, '');
}

const originals = new Map();
{
  const queue = [ENTRY];
  while (queue.length > 0) {
    const p = queue.shift();
    if (originals.has(p)) continue;
    const text = engineText(p);
    originals.set(p, text);
    for (const spec of specifiers(text)) {
      if (!spec.startsWith('.')) continue;
      if (!spec.endsWith('.js')) fail(`${p}: 상대 경로 지정자에 .js 가 없다 — ${spec}`);
      queue.push(posix.normalize(posix.join(posix.dirname(p), spec)).replace(/\.js$/, '.ts'));
    }
  }
}
const closure = [...originals.keys()].sort();
if (closure.includes('src/cli.ts') || closure.some((p) => p.startsWith('src/report/'))) {
  fail(`닫힘 집합에 cli.ts 나 report/ 가 들어왔다: ${closure.join(', ')}`);
}
if (closure.some((p) => !p.startsWith('src/') || !p.endsWith('.ts'))) fail(`닫힘 집합에 src/*.ts 밖의 파일: ${closure.join(', ')}`);

// ---- 2. 사본 쓰기 ----

const fileHashes = {};
const wanted = new Set([RULES_COPY]);
let changed = 0;
for (const p of closure) {
  const rel = p.replace(/^src\//, '');
  const body = stripRelativeJs(originals.get(p));
  const left = specifiers(body).filter((s) => s.startsWith('.') && s.endsWith('.js'));
  if (left.length > 0) fail(`${p}: .js 가 남은 상대 경로 지정자 ${left.join(', ')}`);
  fileHashes[rel] = sha256(Buffer.from(body, 'utf8'));
  wanted.add(rel);
  if (writeIfChanged(join(COPY_DIR, rel), `// 원본: ${SOURCE_LABEL} @${short}\n${body}`)) changed++;
}
const rulesText = engineText(RULES_SOURCE);
const rules = JSON.parse(rulesText);
if (writeIfChanged(join(COPY_DIR, RULES_COPY), rulesText)) changed++;
for (const f of listFiles(COPY_DIR)) {
  if (!wanted.has(f)) {
    rmSync(join(COPY_DIR, f));
    console.log(`sync-engine: 닫힘 집합 밖이라 지움 — src/lib/exit-check/${f}`);
    changed++;
  }
}

// ---- 3. 원본 빌드(기준값은 사본이 아니라 원본으로 잰다) ----

rmSync(CACHE_DIR, { recursive: true, force: true });
for (const p of closure) writeIfChanged(join(CACHE_DIR, p), show(p));
writeIfChanged(join(CACHE_DIR, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
writeIfChanged(
  join(CACHE_DIR, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022', 'DOM'],
        types: [],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmitOnError: true,
        rootDir: 'src',
        outDir: 'dist',
      },
      include: ['src/**/*.ts'],
    },
    null,
    2,
  )}\n`,
);
try {
  execFileSync(process.execPath, [join(SITE, 'node_modules', 'typescript', 'lib', 'tsc.js'), '-p', join(CACHE_DIR, 'tsconfig.json')], {
    stdio: 'pipe',
  });
} catch (e) {
  fail(`원본 빌드 실패\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
}
const dist = (p) => pathToFileURL(join(CACHE_DIR, 'dist', p)).href;
const { prepareFromManifest } = await import(dist('config.js'));
const { runCore } = await import(dist('core/run.js'));
const { hasRrnValue, isRrnHeader } = await import(dist('core/rrn.js'));
const { isNameContactHeader } = await import(dist('core/aliases.js'));

// ---- 4. fixture: 내용 검사·바이트 왕복·기준 실행 ----

const fixtureIds = git(['ls-tree', '--name-only', `${commit}:fixtures`])
  .toString('utf8')
  .split('\n')
  .filter((n) => /^S\d+$/.test(n))
  .sort();

function personLike(manifestText, csvs) {
  if (hasRrnValue(manifestText)) return true;
  for (const text of csvs.values()) {
    if (hasRrnValue(text)) return true;
    const header = (text.split('\n')[0] ?? '').split(',');
    if (header.some((h) => isRrnHeader(h) || isNameContactHeader(h))) return true;
  }
  return false;
}

const scenarios = [];
const prints = {};
const flagged = [];
const nonCsv = [];
for (const id of fixtureIds) {
  const manifestText = engineText(`fixtures/${id}/manifest.json`);
  const manifest = JSON.parse(manifestText);
  const paths = [...new Set(manifest.inputs.filter((i) => i.path && !i.inline_rows).map((i) => i.path))].sort();
  if (paths.some((p) => !p.endsWith('.csv'))) {
    nonCsv.push(id);
    continue;
  }
  const csvs = new Map();
  const bytes = new Map();
  for (const p of paths) {
    const raw = show(`fixtures/${id}/${p}`);
    const text = raw.toString('utf8');
    if (text.includes('\r') || text.charCodeAt(0) === 0xfeff) fail(`fixtures/${id}/${p}: CR 이나 BOM 이 있어 줄 배열로 옮길 수 없다`);
    const lines = text.split('\n');
    const back = Buffer.from(lines.join('\n'), 'utf8');
    if (!back.equals(raw)) fail(`fixtures/${id}/${p}: 줄 배열을 LF 로 이어 붙인 바이트가 원본과 다르다`);
    csvs.set(p, lines);
    bytes.set(p, new Uint8Array(back));
  }
  if (personLike(manifestText, new Map([...csvs].map(([p, l]) => [p, l.join('\n')])))) flagged.push(id);
  if (id in SKIPPED) continue;

  const prepared = await prepareFromManifest({ manifest, cutoff_at: manifest.cutoff_at, files: bytes, deadline_rules: rules });
  if (prepared.synthetic !== true) fail(`${id}: manifest 에 synthetic: true 가 없다`);
  const run = runCore(prepared.core);
  const byStatus = {};
  for (const f of run.core_report.findings) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  prints[id] = {
    input_sha256: Object.fromEntries([...bytes].map(([p, b]) => [p, sha256(b)])),
    core_report_sha256: run.core_report_sha256,
    manifest_core_sha256: run.manifest_core_sha256,
    run_state: run.core_report.run_state,
    finding_count: run.core_report.findings.length,
    compared_item_count: run.core_report.compared_items.length,
    findings_by_status: byStatus,
  };
  scenarios.push({ id, manifest, files: Object.fromEntries(csvs) });
}
const flaggedKey = flagged.sort().join(',');
const skipKey = Object.keys(SKIPPED).sort().join(',');
if (flaggedKey !== skipKey) {
  fail(`사람 정보 형태가 든 fixture(${flaggedKey || '없음'})가 싣지 않는 목록(${skipKey})과 다르다. 목록과 계획을 다시 본다.`);
}
if (nonCsv.length > 0) fail(`CSV 가 아닌 입력이 든 fixture: ${nonCsv.join(', ')} — 싣지 않는 목록과 이유를 정한다`);

// ---- 5. 지문·시나리오 파일 ----

const fingerprint = sortKeysDeep({
  commit,
  source: SOURCE_LABEL,
  entry: ENTRY,
  files: fileHashes,
  deadline_rules_source: RULES_SOURCE,
  deadline_rules_canonical_sha256: sha256(Buffer.from(canonical(rules), 'utf8')),
  baseline:
    '원본을 node_modules/.cache/exit-check-engine 에 git show 로 꺼내 사이트 typescript 로 빌드하고 prepareFromManifest → runCore 로 잰 값(scripts/exit-check/sync-engine.mjs)',
  scenarios: prints,
  skipped_scenarios: SKIPPED,
});
if (writeIfChanged(join(FIXTURE_OUT, 'engine-fingerprint.json'), `${JSON.stringify(fingerprint, null, 2)}\n`)) changed++;

const ts = [
  `// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다. 손으로 고치지 않는다.`,
  `// 원본: ${SOURCE_LABEL} @${short} fixtures/S*/ (전부 합성 자료). 싣지 않은 fixture 와 이유는 engine-fingerprint.json 의 skipped_scenarios.`,
  `// files 는 manifest 의 path → CSV 줄 배열이다. LF 한 글자로 이어 붙이면 원본 바이트와 같다(마지막 빈 문자열 = 끝 줄바꿈).`,
  `// 줄 배열로 싣는 까닭: 이 저장소는 체크아웃 때 줄바꿈을 CRLF 로 바꿀 수 있고, 바뀌면 파일 해시와 core 해시가 달라진다.`,
  ``,
  `export interface ExitCheckScenario {`,
  `  id: string;`,
  `  manifest: Record<string, unknown>;`,
  `  files: Record<string, string[]>;`,
  `}`,
  ``,
  `export const EXIT_CHECK_SCENARIOS: readonly ExitCheckScenario[] = ${JSON.stringify(scenarios, null, 2)};`,
  ``,
].join('\n');
if (writeIfChanged(join(FIXTURE_OUT, 'scenarios.ts'), ts)) changed++;

console.log(`sync-engine: ${SOURCE_LABEL} @${short} — 사본 ${closure.length}파일 + ${RULES_COPY}, fixture ${scenarios.length}개(싣지 않음 ${skipKey}), 바뀐 파일 ${changed}개`);
for (const [id, p] of Object.entries(prints)) {
  console.log(`  ${id} 발견 ${p.finding_count} · 대조 ${p.compared_item_count} · ${p.run_state}`);
}
