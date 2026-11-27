// k-labor/office 패키지 입구 시험 — npm pack 한 tarball 하나를 임시 폴더에 설치해 import·타입을 확인한다.
//   node tools/k-labor/office-pack-check.mjs
// ① npm pack(prepack = build.mjs, 트리가 dirty 면 거부) ② 임시 소비자 폴더에 tarball 설치
// ③ ESM import 로 만들기→검사→채우기→덱→읽기 왕복 ④ tsc(nodenext·bundler, skipLibCheck:false)로 d.ts 확인
// 임시 폴더는 끝나면 지운다. 실패하면 남겨 두고 경로를 찍는다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-office-pack-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// 윈도의 npm.cmd 만 셸로 띄운다(Node 는 .cmd 를 셸 없이 못 띄운다). node 는 셸 없이 — 경로의 빈칸이 깨지지 않게
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: cmd === npm && process.platform === 'win32' });

let ok = false;
try {
  // ① pack
  const packOut = sh(npm, ['pack', '--json', '--pack-destination', JSON.stringify(work)], here);
  const pack = JSON.parse(packOut.slice(packOut.indexOf('[')))[0];
  const tgz = path.join(work, pack.filename);
  const files = pack.files.map((f) => f.path);
  for (const need of ['dist/office/index.mjs', 'dist/office/types/index.d.ts', 'dist/server.mjs']) {
    if (!files.includes(need)) throw new Error(`tarball 에 ${need} 가 없습니다`);
  }
  if (files.some((f) => /^src\/|\.test\./.test(f))) throw new Error('tarball 에 원본 소스·시험 파일이 들어 있습니다');
  console.log(`pack: ${pack.filename} ${pack.size} bytes, 파일 ${files.length}개`);

  // ② 설치
  const app = path.join(work, 'consumer');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'office-consumer', private: true, type: 'module' }, null, 2));
  sh(npm, ['install', '--no-audit', '--no-fund', '--omit=optional', JSON.stringify(tgz)], app);

  // ③ 실행
  fs.writeFileSync(
    path.join(app, 'run.mjs'),
    `import * as office from 'k-labor/office';
const { DEFAULT_LIMITS, ENGINE, makeXlsxFromSpec, inspectXlsx, fillXlsxTemplate, makeMeetingPptx, extractPptx } = office;
const L = { limits: DEFAULT_LIMITS };
const need = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exit(1); } };
const mk = await makeXlsxFromSpec({ sheets: [{ name: '평가표', columns: [{ key: 'id', header: 'ID' }, { key: 'h', header: '위험요인' }] }] }, L);
need(mk.ok, 'make');
const ins = await inspectXlsx(mk.files[0].bytes, L);
need(ins.ok && ins.data.sheets[0].name === '평가표', 'inspect');
const fl = await fillXlsxTemplate(mk.files[0].bytes, { ...L, rows: { sheet: '평가표', startRow: 2, columns: { A: 'id', B: 'h' }, data: [{ id: 'H1', h: '합성' }] } });
need(fl.ok && fl.data.preserved.allSame, 'fill');
const deck = await makeMeetingPptx({ site: '합성', cycle: '1회차', basisDate: '2026-11-23', status: { label: '초안' }, scaleId: 's', scaleName: '합성 척도', prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [] }, L);
need(deck.ok, 'meeting');
const ex = await extractPptx(deck.files[0].bytes, L);
need(ex.ok && ex.data.slides.length === deck.data.slides.length, 'extractPptx');
const none = await inspectXlsx(mk.files[0].bytes, {});
need(!none.ok && none.code === 'INVALID_ARGS', 'limits 필수');
need(/^[0-9a-f]{40}$/.test(ENGINE.commit ?? '') && ENGINE.dirty === false, 'ENGINE 출처 ' + JSON.stringify(ENGINE));
need(fl.meta.engine.commit === ENGINE.commit, 'meta.engine');
console.log(JSON.stringify({ engine: ENGINE, slides: deck.data.slides.length, fillSha256: fl.files[0].sha256.slice(0, 12) }));
`,
  );
  console.log(`run: ${sh(process.execPath, ['run.mjs'], app).trim()}`);

  // MCP SDK·popbill·tesseract 가 office 묶음에 섞이지 않았는지 — 묶음 소스에서 이름을 찾는다
  const bundle = fs.readFileSync(path.join(app, 'node_modules/k-labor/dist/office/index.mjs'), 'utf8');
  for (const bad of ['@modelcontextprotocol', 'popbill', 'tesseract']) if (bundle.includes(bad)) throw new Error(`office 묶음에 ${bad} 가 들어 있습니다`);

  // ④ 타입
  fs.writeFileSync(
    path.join(app, 'consumer.ts'),
    `import { DEFAULT_LIMITS, fillXlsxTemplate, type ErrorCode, type Limits, type Result, type FillXlsxData, type Warning } from 'k-labor/office';
const limits: Limits = { ...DEFAULT_LIMITS, maxCells: 1000 };
export async function f(b: Uint8Array): Promise<string> {
  const r: Result<FillXlsxData> = await fillXlsxTemplate(b, { limits, cells: [{ sheet: 's', cell: 'A1', value: 1 }] });
  if (r.ok) return r.files![0].sha256 + r.data.preserved.allSame + r.warnings.map((w: Warning) => w.code).join();
  const code: ErrorCode = r.code;
  return code === 'PRESERVATION_LOSS' ? 'loss' : r.message;
}
`,
  );
  const tsc = path.join(repo, 'node_modules/typescript/bin/tsc');
  for (const [mod, res] of [['nodenext', 'nodenext'], ['esnext', 'bundler']]) {
    fs.writeFileSync(
      path.join(app, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { module: mod, moduleResolution: res, target: 'es2022', lib: ['es2022'], strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ['consumer.ts'] }),
    );
    try {
      sh(process.execPath, [tsc, '-p', 'tsconfig.json'], app);
    } catch (e) {
      throw new Error(`tsc(${res}) 실패:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    }
    console.log(`tsc ${res}: ok`);
  }
  ok = true;
  console.log('office-pack-check: PASS');
} catch (e) {
  console.error(`office-pack-check: FAIL — ${e.message}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  console.error(`(임시 폴더를 남깁니다: ${work})`);
  process.exitCode = 1;
} finally {
  if (ok) fs.rmSync(work, { recursive: true, force: true });
}
