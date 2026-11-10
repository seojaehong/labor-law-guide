// 엔진 사본(src/lib/exit-check) 동기화 검사 — 글자 지문과 동작 지문 두 겹.
// 엔진 ~/dev/exit-check 는 원격이 없는 로컬 저장소라 CI·Vercel 에는 없다. 그래서 두 단계로 본다.
//  1) 언제나: 사본 파일 집합 = 지문 키, 머리 줄 = 지문 commit, 정규화 내용 해시 = 지문,
//     deadline-rules.json 정렬 직렬화 해시 = 지문, 합성 fixture 를 사본으로 돌린 core 해시 = 지문(원본 빌드로 계산한 값).
//  2) 엔진 폴더가 있으면(EXIT_CHECK_ENGINE_DIR 또는 ~/dev/exit-check): 고정 커밋을 git(ls-tree·cat-file --batch)으로 읽어 정규화한 내용 = 사본,
//     src/config.ts 의 가져오기 닫힘 집합 = 사본 목록.
// 정규화 = 머리 줄(「// 원본: …」) 제거, CR 제거, 상대 경로 가져오기 지정자의 .js 제거.
// 사본은 손으로 고치지 않는다. 엔진을 다시 옮기려면 `node scripts/exit-check/sync-engine.mjs` 를 돌린다.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareFromManifest, type RunManifest } from '@/lib/exit-check/config';
import { runCore } from '@/lib/exit-check/core/run';
import type { DeadlineRulesFile } from '@/lib/exit-check/core/types';
import { EXIT_CHECK_SCENARIOS } from '../fixtures/exit-check/scenarios';
import { importRefs } from './exit-check-imports';

const ROOT = join(__dirname, '..', '..');
const COPY_DIR = join(ROOT, 'src', 'lib', 'exit-check');
const RULES_COPY = 'deadline-rules.json';

interface ScenarioPrint {
  input_sha256: Record<string, string>;
  core_report_sha256: string;
  manifest_core_sha256: string;
  run_state: string;
  finding_count: number;
  compared_item_count: number;
  findings_by_status: Record<string, number>;
}
const fingerprint = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'exit-check', 'engine-fingerprint.json'), 'utf8')) as {
  commit: string;
  source: string;
  entry: string;
  files: Record<string, string>;
  deadline_rules_source: string;
  deadline_rules_canonical_sha256: string;
  scenarios: Record<string, ScenarioPrint>;
  skipped_scenarios: Record<string, string>;
};

const ENGINE_DIR = process.env.EXIT_CHECK_ENGINE_DIR ?? join(homedir(), 'dev', 'exit-check');
const HEADER = /^\/\/ 원본: ~\/dev\/exit-check @([0-9a-f]{7,40})$/;

function engineHasCommit(): boolean {
  if (!existsSync(ENGINE_DIR)) return false;
  try {
    execFileSync('git', ['-C', ENGINE_DIR, 'cat-file', '-e', `${fingerprint.commit}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const ENGINE = engineHasCommit();

/** 고정 커밋의 src/**·rules/** 를 git 두 번(ls-tree, cat-file --batch)으로 읽는다. 파일마다 git 을 띄우면 부하가 클 때 느리다. */
function engineBlobs(): Map<string, string> {
  const git = (args: string[], input?: string) =>
    execFileSync('git', ['-C', ENGINE_DIR, ...args], { input, maxBuffer: 64 << 20 });
  const paths = git(['ls-tree', '-r', '--name-only', fingerprint.commit, '--', 'src', 'rules'])
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  const out = git(['cat-file', '--batch'], paths.map((p) => `${fingerprint.commit}:${p}\n`).join(''));
  const blobs = new Map<string, string>();
  let pos = 0;
  for (const p of paths) {
    const nl = out.indexOf(0x0a, pos);
    const header = out.subarray(pos, nl).toString('utf8');
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!m) throw new Error(`엔진 ${p}: ${header}`);
    const size = Number(m[1]);
    blobs.set(p, out.subarray(nl + 1, nl + 1 + size).toString('utf8'));
    pos = nl + 1 + size + 1;
  }
  return blobs;
}

// .js 를 빼는 자리: 「from "./…"」(한 줄 문장과 여러 줄 문장의 닫는 줄 `} from "./types.js";`, export … from 포함),
// 문장 첫머리의 「import "./…"」, 「import("./…")」. 줄 첫머리가 import 인 줄만 보는 pay-check 방식은 닫는 줄을 놓친다.
const REL_JS_SPEC = /(\bfrom[ \t]*|(?:^|\n)[ \t]*import[ \t]*|\bimport[ \t]*\(\s*)(['"])(\.{1,2}\/[^'"\n]*?)\.js\2/g;

function normalize(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  if (HEADER.test(lines[0] ?? '')) lines.shift();
  return lines.join('\n').replace(REL_JS_SPEC, '$1$2$3$2');
}
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(relative(COPY_DIR, p).split('\\').join('/'));
  }
  return out.sort();
}

const copyText = (rel: string) => readFileSync(join(COPY_DIR, rel), 'utf8');
const tsKeys = () => Object.keys(fingerprint.files).sort();

describe('정규화(머리 줄·CR·상대 경로 .js)', () => {
  it('한 줄 가져오기, 여러 줄 가져오기의 닫는 줄에서 .js 가 빠지고 문자열 "a.js" 는 그대로다', () => {
    const engine = [
      'import { A } from "./core/aliases.js";',
      'import type { B } from "../core/types.js";',
      'import {',
      '  C,',
      '  type D,',
      '} from "./types.js";',
      'export { E } from "./e.js";',
      'import ExcelJS from "exceljs";',
      'const s = "a.js";',
      "const t = './b.js';",
      '',
    ].join('\n');
    const copy = [
      '// 원본: ~/dev/exit-check @cab1cce',
      'import { A } from "./core/aliases";',
      'import type { B } from "../core/types";',
      'import {',
      '  C,',
      '  type D,',
      '} from "./types";',
      'export { E } from "./e";',
      'import ExcelJS from "exceljs";',
      'const s = "a.js";',
      "const t = './b.js';",
      '',
    ].join('\r\n');
    expect(normalize(copy)).toBe(normalize(engine));
    expect(normalize(engine)).toContain('} from "./types";');
    expect(normalize(engine)).toContain('const s = "a.js";');
    expect(normalize(engine)).toContain("const t = './b.js';");
    expect(normalize(engine)).toContain('from "exceljs"');
  });
});

describe('엔진 사본 — 글자 지문', () => {
  it('사본 폴더의 파일 집합이 지문 키와 정확히 같다(26개 + deadline-rules.json, cli.ts·report/ 없음)', () => {
    const files = listFiles(COPY_DIR);
    expect(files).toEqual([...tsKeys(), RULES_COPY].sort());
    expect(tsKeys()).toHaveLength(26);
    expect(tsKeys().every((k) => k.endsWith('.ts'))).toBe(true);
    expect(files.some((f) => f === 'cli.ts' || f.startsWith('report/'))).toBe(false);
  });

  it('사본 .ts 의 첫 줄이 「// 원본: ~/dev/exit-check @<지문 commit>」이다', () => {
    for (const k of tsKeys()) {
      const m = HEADER.exec(copyText(k).replace(/\r/g, '').split('\n')[0] ?? '');
      expect(m, `${k} 머리 줄`).not.toBeNull();
      expect(fingerprint.commit.startsWith(m![1]!), `${k} 머리 줄 해시 ${m![1]} ↔ 지문 ${fingerprint.commit}`).toBe(true);
    }
  });

  it('정규화한 사본 내용의 해시가 지문과 같다', () => {
    for (const k of tsKeys()) expect(sha(normalize(copyText(k))), k).toBe(fingerprint.files[k]);
  });

  it('사본에는 상대 경로 .js 지정자가 남아 있지 않다', () => {
    for (const k of tsKeys()) {
      const left = importRefs(copyText(k)).filter((r) => r.spec.startsWith('.') && r.spec.endsWith('.js'));
      expect(left, k).toEqual([]);
    }
  });

  it('deadline-rules.json 을 JSON 으로 읽어 키 정렬 직렬화한 해시가 지문과 같다(바이트 비교는 하지 않는다)', () => {
    expect(sha(canonical(JSON.parse(copyText(RULES_COPY))))).toBe(fingerprint.deadline_rules_canonical_sha256);
  });

  it('사본 순수성: node:·process.·fetch(·XMLHttpRequest·WebSocket·console. 이 없다', () => {
    const banned = ['node:', 'process.', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'console.'];
    for (const f of listFiles(COPY_DIR)) {
      const text = copyText(f);
      for (const b of banned) expect(text.includes(b), `${f} 에 ${b}`).toBe(false);
    }
  });
});

describe.skipIf(!ENGINE)(`엔진 원본 대조 — 엔진 폴더나 고정 커밋이 없으면 건너뛴다(${ENGINE_DIR} @${fingerprint.commit.slice(0, 7)})`, () => {
  let blobs = new Map<string, string>();
  let closure: string[] = [];

  beforeAll(() => {
    blobs = engineBlobs();
    // src/config.ts 에서 시작해 상대 경로 가져오기를 따라간다(타입 가져오기 포함).
    const seen = new Set<string>();
    const queue = [fingerprint.entry];
    while (queue.length > 0) {
      const p = queue.shift()!;
      if (seen.has(p)) continue;
      const text = blobs.get(p);
      if (text === undefined) throw new Error(`고정 커밋에 ${p} 가 없다`);
      seen.add(p);
      for (const r of importRefs(text)) {
        if (!r.spec.startsWith('.')) continue;
        queue.push(posix.normalize(posix.join(posix.dirname(p), r.spec)).replace(/\.js$/, '.ts'));
      }
    }
    closure = [...seen].sort();
  }, 180_000);

  it('config.ts 의 가져오기 닫힘 집합 = 사본 목록', () => {
    expect(closure.map((p) => p.replace(/^src\//, '')).sort()).toEqual(tsKeys());
    expect(closure).not.toContain('src/cli.ts');
    expect(closure.some((p) => p.startsWith('src/report/'))).toBe(false);
  });

  it('고정 커밋에서 읽은 원본을 정규화한 내용 = 사본', () => {
    for (const p of closure) expect(normalize(copyText(p.replace(/^src\//, ''))), p).toBe(normalize(blobs.get(p)!));
  });

  it('고정 커밋의 deadline-rules.json 정렬 직렬화 = 사본', () => {
    expect(canonical(JSON.parse(blobs.get(fingerprint.deadline_rules_source)!))).toBe(canonical(JSON.parse(copyText(RULES_COPY))));
  });
});

describe('엔진 사본 — 동작 지문(합성 fixture 를 사본으로 돌린 값 = 원본 빌드로 잰 값)', () => {
  const rules = JSON.parse(copyText(RULES_COPY)) as DeadlineRulesFile;

  it('실을 fixture 와 지문의 시나리오 목록이 같다(17개, S08·S11 은 싣지 않음)', () => {
    expect(EXIT_CHECK_SCENARIOS.map((s) => s.id).sort()).toEqual(Object.keys(fingerprint.scenarios).sort());
    expect(EXIT_CHECK_SCENARIOS).toHaveLength(17);
    expect(Object.keys(fingerprint.skipped_scenarios).sort()).toEqual(['S08', 'S11']);
  });

  it(
    '각 fixture 를 prepareFromManifest → runCore 로 돌린 core_report_sha256·manifest_core_sha256 이 지문과 같다',
    async () => {
      for (const sc of EXIT_CHECK_SCENARIOS) {
        const want = fingerprint.scenarios[sc.id]!;
        const files = new Map<string, Uint8Array>();
        for (const [path, lines] of Object.entries(sc.files)) {
          const bytes = new TextEncoder().encode(lines.join('\n'));
          expect(createHash('sha256').update(bytes).digest('hex'), `${sc.id} ${path} 입력 바이트`).toBe(want.input_sha256[path]);
          files.set(path, bytes);
        }
        const manifest = sc.manifest as unknown as RunManifest;
        const prepared = await prepareFromManifest({ manifest, cutoff_at: manifest.cutoff_at!, files, deadline_rules: rules });
        expect(prepared.synthetic, `${sc.id} synthetic`).toBe(true);
        const run = runCore(prepared.core);
        expect(run.core_report.findings.length, `${sc.id} 발견 수`).toBe(want.finding_count);
        expect(run.core_report.compared_items.length, `${sc.id} 대조 수`).toBe(want.compared_item_count);
        expect(run.core_report.run_state, `${sc.id} run_state`).toBe(want.run_state);
        expect(run.manifest_core_sha256, `${sc.id} manifest_core_sha256`).toBe(want.manifest_core_sha256);
        expect(run.core_report_sha256, `${sc.id} core_report_sha256`).toBe(want.core_report_sha256);
      }
    },
    120_000,
  );

  it('계획에 적힌 실행값: S01 발견 0·대조 14, S03 발견 1·대조 12, S12 발견 5·대조 11', () => {
    const n = (id: string) => [fingerprint.scenarios[id]!.finding_count, fingerprint.scenarios[id]!.compared_item_count];
    expect(n('S01')).toEqual([0, 14]);
    expect(n('S03')).toEqual([1, 12]);
    expect(n('S12')).toEqual([5, 11]);
  });
});
