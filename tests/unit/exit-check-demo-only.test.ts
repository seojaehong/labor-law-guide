// 퇴사 자료 대조 — 「합성 예시만」을 코드로 고정한다(계획 조각 2).
// 엔진 사본(src/lib/exit-check)으로 가는 입구는 src/lib/exit-check-demo/run 하나이고, 그 입구는 내장 표본(samples.ts)의
// 바이트가 허용목록(file_sha256)과 같고 manifest 가 synthetic 일 때만 엔진을 부른다. 업로드 코드는 두지 않는다.
// 업로드를 여는 일은 이 시험들을 고치는 별도 PR 이 된다. 선행 조건: 법률·개인정보 검토(계획 【C】), 조각 5, 결정 B5~B8.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNameContactHeader } from '@/lib/exit-check/core/aliases';
import { hasRrnValue, isRrnHeader } from '@/lib/exit-check/core/rrn';
import { DEMO_SAMPLES } from '@/lib/exit-check-demo/samples';
import { importRefs, isInside, resolveSiteSpecifier } from './exit-check-imports';

const ROOT = join(__dirname, '..', '..');
const DEMO_DIR = 'src/lib/exit-check-demo';
const VIEW_DIR = 'src/lib/exit-check-view';
const fingerprint = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'exit-check', 'engine-fingerprint.json'), 'utf8')) as {
  scenarios: Record<string, { input_sha256: Record<string, string>; core_report_sha256: string }>;
  samples: Record<string, { files: Record<string, string>; core_report_sha256: string }>;
};

const UPLOAD_PREREQ = '선행 조건: 법률·개인정보 검토(계획 【C】), 조각 5, 결정 B5~B8';
const B4 = '기한 표본은 사장님 결정 B4(14일 지급 기한을 어느 쪽에 맞출지) 전에는 싣지 않는다 — 계획 조각 4';

function walk(dir: string, re = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/): string[] {
  const abs = join(ROOT, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...walk(relative(ROOT, p).split('\\').join('/'), re));
    else if (re.test(name)) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out.sort();
}
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

afterEach(() => {
  vi.doUnmock('@/lib/exit-check-demo/samples');
  vi.resetModules();
});

// 시험마다 모듈을 새로 불러 엔진 사본 전체를 다시 읽는다. 전체 시험을 함께 돌리면 기본 5초를 넘길 수 있어 묶음 시간을 늘린다.
describe('실행 입구 — 닫힌 입구', { timeout: 60_000 }, () => {
  it('run 모듈의 내보내기는 정확히 runScenario 와 SCENARIO_IDS 다(바이트·파일·문자열을 받는 내보내기가 없다)', async () => {
    const run = await import('@/lib/exit-check-demo/run');
    expect(Object.keys(run).sort()).toEqual(['SCENARIO_IDS', 'runScenario']);
    expect([...run.SCENARIO_IDS]).toEqual(['S01', 'S03']);
    expect(Object.keys(DEMO_SAMPLES).sort()).toEqual([...run.SCENARIO_IDS].sort());
  });

  it.each(['S12', 'S02', '', '__proto__', 'toString', '../S01'])('목록에 없는 id(%j)는 던진다', async (id) => {
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario(id as 'S01')).rejects.toThrow(/목록에 없는 예시/);
  });

  it('표본 CSV 한 글자를 바꾸면 던진다(바이트 해시 허용목록)', async () => {
    vi.doMock('@/lib/exit-check-demo/samples', async (importOriginal) => {
      const orig = await importOriginal<typeof import('@/lib/exit-check-demo/samples')>();
      const s01 = orig.DEMO_SAMPLES.S01!;
      const path = 'personnel_exit.csv';
      const lines = [...s01.files[path]!];
      lines[1] = lines[1]!.replace('2026-09-30', '2026-09-29');
      expect(lines[1]).not.toBe(s01.files[path]![1]);
      return { DEMO_SAMPLES: { ...orig.DEMO_SAMPLES, S01: { ...s01, files: { ...s01.files, [path]: lines } } } };
    });
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S01')).rejects.toThrow(/허용목록/);
  });

  it('표본 파일 하나를 더 끼워 넣어도 던진다(허용목록에 없는 경로)', async () => {
    vi.doMock('@/lib/exit-check-demo/samples', async (importOriginal) => {
      const orig = await importOriginal<typeof import('@/lib/exit-check-demo/samples')>();
      const s03 = orig.DEMO_SAMPLES.S03!;
      return { DEMO_SAMPLES: { ...orig.DEMO_SAMPLES, S03: { ...s03, files: { ...s03.files, 'extra.csv': ['a,b', ''] } } } };
    });
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S03')).rejects.toThrow(/허용목록/);
  });

  it('manifest 의 synthetic 을 false 로 바꾸면 던진다(파일 바이트는 그대로)', async () => {
    vi.doMock('@/lib/exit-check-demo/samples', async (importOriginal) => {
      const orig = await importOriginal<typeof import('@/lib/exit-check-demo/samples')>();
      const s01 = orig.DEMO_SAMPLES.S01!;
      return { DEMO_SAMPLES: { ...orig.DEMO_SAMPLES, S01: { ...s01, manifest: { ...s01.manifest, synthetic: false } } } };
    });
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S01')).rejects.toThrow(/합성 자료 표시/);
  });

  it('manifest 에 표본 파일 밖의 입력(직접 입력 행)을 끼워 넣어도 던진다(파일 해시를 거치지 않는 길을 막는다)', async () => {
    vi.doMock('@/lib/exit-check-demo/samples', async (importOriginal) => {
      const orig = await importOriginal<typeof import('@/lib/exit-check-demo/samples')>();
      const s01 = orig.DEMO_SAMPLES.S01!;
      const inputs = [...(s01.manifest.inputs as unknown[]), { family: 'insurance_loss', path: null, inline_rows: [{ scheme: 'IACI' }] }];
      return { DEMO_SAMPLES: { ...orig.DEMO_SAMPLES, S01: { ...s01, manifest: { ...s01.manifest, inputs } } } };
    });
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S01')).rejects.toThrow(/허용목록/);
  });
});

describe('실행 입구 — 결과가 지문과 같다', () => {
  it.each(['S01', 'S03'] as const)('%s 의 core_report_sha256 이 지문(원본 빌드로 잰 값)과 같다', async (id) => {
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    const r = await runScenario(id);
    expect(r.core_report_sha256).toBe(fingerprint.samples[id]!.core_report_sha256);
    expect(r.core_report_sha256).toBe(fingerprint.scenarios[id]!.core_report_sha256);
  }, 60_000);

  it('samples.ts 의 파일 sha256 이 지문 samples 절·scenarios 절과 같고, 표본 문자열에 CR 이 없다', () => {
    expect(Object.keys(fingerprint.samples).sort()).toEqual(Object.keys(DEMO_SAMPLES).sort());
    for (const [id, s] of Object.entries(DEMO_SAMPLES)) {
      expect(s.file_sha256, id).toEqual(fingerprint.samples[id]!.files);
      expect(Object.keys(s.files).sort(), id).toEqual(Object.keys(s.file_sha256).sort());
      for (const [p, h] of Object.entries(s.file_sha256)) expect(h, `${id} ${p}`).toBe(`sha256:${fingerprint.scenarios[id]!.input_sha256[p]}`);
      for (const lines of Object.values(s.files)) for (const l of lines) expect(l.includes('\r'), `${id} CR`).toBe(false);
      expect(s.manifest.synthetic, `${id} synthetic`).toBe(true);
    }
    expect(read(`${DEMO_DIR}/samples.ts`).includes('\r')).toBe(false);
  });

  it(`내장 표본 전체에서 R-009(기한 후보) 항목이 0건이다 — ${B4}`, async () => {
    const run = await import('@/lib/exit-check-demo/run');
    for (const id of run.SCENARIO_IDS) {
      const r = await run.runScenario(id);
      const r009 = r.core_report.findings.filter((f) => f.rule_id === 'R-009');
      expect(r009.map((f) => `${f.field} ${f.reason_code}`), `${id}: ${B4}`).toEqual([]);
    }
  }, 60_000);
});

describe('표본 내용 — 사람 정보 형태가 없다', () => {
  it('표본 CSV 헤더에 주민등록번호·이름·연락처 열이 없고, 어느 칸에도 주민등록번호 형태 값이 없다', () => {
    for (const [id, s] of Object.entries(DEMO_SAMPLES)) {
      expect(hasRrnValue(JSON.stringify(s.manifest)), `${id} manifest`).toBe(false);
      for (const [p, lines] of Object.entries(s.files)) {
        const header = (lines[0] ?? '').split(',');
        expect(header.filter((h) => isRrnHeader(h) || isNameContactHeader(h)), `${id} ${p} 헤더`).toEqual([]);
        for (const l of lines) expect(hasRrnValue(l), `${id} ${p}: ${l}`).toBe(false);
      }
    }
  });

  it('검사기 자기시험: 이름 열·주민등록번호 형태를 넣으면 잡는다', () => {
    expect(isNameContactHeader('성명')).toBe(true);
    expect(isRrnHeader('주민등록번호')).toBe(true);
    expect(hasRrnValue('C-A,W-01,900101-1234567')).toBe(true);
  });
});

// ---- 가져오기 경계(조각 1 의 exit-check-boundary 위에 한 겹 더) ----

/** 정적 가져오기 문장(여러 줄 포함)과 그 앞의 `import type` 여부. 이 시험이 보는 세 파일은 우리가 쓰는 파일이라 이 꼴로 충분하다. */
function importStatements(text: string): Array<{ spec: string; typeOnly: boolean }> {
  const out: Array<{ spec: string; typeOnly: boolean }> = [];
  for (const m of text.replace(/\r/g, '').matchAll(/(?:^|\n)[ \t]*(import|export)([ \t]+type)?\b[^;'"`]*?\bfrom[ \t]*(['"])([^'"\n]+)\3/g)) {
    out.push({ spec: m[4]!, typeOnly: m[2] !== undefined });
  }
  return out;
}

/** 화면 모델 폴더의 위반: 엔진 사본·실행 입구로 가는 가져오기가 `import type` 이 아니거나, 동적 가져오기·require 가 있다. */
function viewViolations(file: string, text: string): string[] {
  const bad: string[] = [];
  for (const r of importRefs(text)) {
    if (r.kind === 'dynamic' || r.kind === 'require') bad.push(`${file}: ${r.kind} ${r.spec}`);
  }
  for (const s of importStatements(text)) {
    const target = resolveSiteSpecifier(file, s.spec);
    if (target === null) {
      bad.push(`${file}: 패키지 ${s.spec}`);
      continue;
    }
    const engine = isInside(target, 'src/lib/exit-check') || isInside(target, DEMO_DIR);
    if (engine && !s.typeOnly) bad.push(`${file}: 실행 가져오기 ${s.spec}`);
    if (isInside(target, DEMO_DIR) && target !== `${DEMO_DIR}/types`) bad.push(`${file}: 타입 파일 밖 ${s.spec}`);
  }
  return bad;
}

/** src/ 에서 실행 입구(run)·표본(samples)을 가져오는 곳은 입구 폴더 자신과 앞으로 만들 예시 화면 폴더뿐이다. */
const ENTRY_USERS = [DEMO_DIR, 'src/app/exit-employer/check'];
function entryViolations(file: string, text: string): string[] {
  if (ENTRY_USERS.some((d) => isInside(file, d))) return [];
  return importRefs(text).flatMap((r) => {
    const t = resolveSiteSpecifier(file, r.spec);
    return t !== null && (t === `${DEMO_DIR}/run` || t === `${DEMO_DIR}/samples`) ? [`${file}: ${r.kind} ${r.spec}`] : [];
  });
}

describe('가져오기 경계 — 화면 모델은 타입만, 실행 입구는 화면 폴더만', () => {
  it('검사기 자기시험: 심어 둔 위반을 잡는다', () => {
    const v = `${VIEW_DIR}/view.ts`;
    expect(viewViolations(v, `import { runCore } from '@/lib/exit-check/core/run';`)).toHaveLength(1);
    expect(viewViolations(v, `import { runScenario } from '@/lib/exit-check-demo/run';`).length).toBeGreaterThan(0);
    expect(viewViolations(v, `import type { CoreReport } from '@/lib/exit-check-demo/run';`)).toHaveLength(1);
    expect(viewViolations(v, `import {\n  type CoreReport,\n} from '@/lib/exit-check-demo/types';`)).toHaveLength(1);
    expect(viewViolations(v, `const m = await import('@/lib/exit-check-demo/run');`).length).toBeGreaterThan(0);
    expect(viewViolations(v, `import x from 'some-package';`)).toHaveLength(1);
    expect(viewViolations(v, `import type { CoreReport } from '@/lib/exit-check-demo/types';`)).toEqual([]);
    expect(viewViolations(v, `import { LABELS } from './labels';`)).toEqual([]);
    expect(entryViolations('src/app/tools/x/page.tsx', `const m = await import('@/lib/exit-check-demo/run');`)).toHaveLength(1);
    expect(entryViolations('src/components/X.tsx', `import { DEMO_SAMPLES } from '../lib/exit-check-demo/samples';`)).toHaveLength(1);
    expect(entryViolations('src/app/exit-employer/check/ExitCheckDemoClient.tsx', `const m = await import('@/lib/exit-check-demo/run');`)).toEqual([]);
  });

  it('화면 모델 폴더(view·labels·copy)는 엔진 쪽을 `import type` 으로만, 타입 파일(exit-check-demo/types)에서만 가져온다', () => {
    const files = walk(VIEW_DIR);
    expect(files).toEqual([`${VIEW_DIR}/copy.ts`, `${VIEW_DIR}/labels.ts`, `${VIEW_DIR}/view.ts`]);
    expect(files.flatMap((f) => viewViolations(f, read(f)))).toEqual([]);
    // labels·copy 는 아무것도 실행 코드로 가져오지 않는다(문안 두 파일만 읽으면 되게).
    for (const f of [`${VIEW_DIR}/labels.ts`, `${VIEW_DIR}/copy.ts`]) {
      expect(importStatements(read(f)).filter((s) => !s.typeOnly), f).toEqual([]);
    }
  });

  it('exit-check-demo/types.ts 는 타입 다시 내보내기만 있다(실행 코드 없음)', () => {
    const lines = read(`${DEMO_DIR}/types.ts`)
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.trim() !== '' && !l.trim().startsWith('//'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l, l).toMatch(/^export type \{[^}]*\} from '@\/lib\/exit-check\/[a-z/_-]+';$/);
  });

  it(`src/ 에서 실행 입구·표본을 가져오는 파일은 ${ENTRY_USERS.join('·')} 안뿐이다 — ${UPLOAD_PREREQ}`, () => {
    const files = walk('src');
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((f) => entryViolations(f, read(f)))).toEqual([]);
  }, 60_000);
});

// ---- 금지 글자: 입력 자리·밖으로 보내는 자리·숨은 스위치 ----

const FORBIDDEN_GLYPHS = [
  'type="file"',
  "type='file'",
  'onDrop',
  'onDragOver',
  'onPaste',
  'DataTransfer',
  'FileReader',
  'clipboardData',
  '.arrayBuffer(',
  'showOpenFilePicker',
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'WebSocket',
  'EventSource',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'document.cookie',
  'history.pushState',
  'history.replaceState',
  'searchParams',
  'useRouter',
  'useSearchParams',
  'dataLayer',
  'gtag(',
  'postMessage',
  'process.env',
] as const;

function glyphHits(text: string): string[] {
  return FORBIDDEN_GLYPHS.filter((g) => text.includes(g));
}

describe(`금지 글자 — 새 두 폴더 소스(주석 포함) — ${UPLOAD_PREREQ}`, () => {
  it('검사기 자기시험', () => {
    expect(glyphHits('<input type="file" onDrop={x} />')).toEqual(['type="file"', 'onDrop']);
    expect(glyphHits('const v = process.env.NEXT_PUBLIC_EXIT_UPLOAD;')).toEqual(['process.env']);
    expect(glyphHits('await fetch(url)')).toEqual(['fetch(']);
  });

  it(`${DEMO_DIR}/**·${VIEW_DIR}/** 에 금지 글자가 없다`, () => {
    const files = [...walk(DEMO_DIR), ...walk(VIEW_DIR)];
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.flatMap((f) => glyphHits(read(f)).map((g) => `${f}: ${g}`))).toEqual([]);
  });
});
