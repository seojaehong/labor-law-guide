// 퇴사 자료 대조 — 「합성 예시만」을 코드로 고정한다(계획 조각 2).
// 엔진 사본(src/lib/exit-check)으로 가는 입구는 src/lib/exit-check-demo/run 하나이고, 그 입구는 내장 표본(samples.ts)의
// 파일 바이트와 manifest 가 허용목록(allowlist.ts — 표본과 따로 둔 생성 상수)의 해시와 같고 manifest 가 synthetic 일 때만
// 엔진을 부른다. 표본·허용목록은 깊게 얼려 있고, 둘을 가져오는 곳은 run.ts 하나다. 업로드 코드는 두지 않는다.
// 업로드를 여는 일은 이 시험들을 고치는 별도 PR 이 된다. 선행 조건: 법률·개인정보 검토(계획 【C】), 조각 5, 결정 B5~B8.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNameContactHeader } from '@/lib/exit-check/core/aliases';
import { hasRrnValue, isRrnHeader } from '@/lib/exit-check/core/rrn';
import { fileHashRef } from '@/lib/exit-check/core/sha256';
import { DEMO_SAMPLES } from '@/lib/exit-check-demo/samples';
import { importRefs, isInside, resolveSiteSpecifier } from './exit-check-imports';

const ROOT = join(__dirname, '..', '..');
const DEMO_DIR = 'src/lib/exit-check-demo';
const VIEW_DIR = 'src/lib/exit-check-view';
const fingerprint = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'exit-check', 'engine-fingerprint.json'), 'utf8')) as {
  scenarios: Record<string, { input_sha256: Record<string, string>; core_report_sha256: string }>;
  samples: Record<string, { files: Record<string, string>; manifest_sha256: string; core_report_sha256: string }>;
};

/** 입구 폴더의 파일 목록. 새 파일을 더하면(입구를 하나 더 여는 일) 이 시험이 붉어진다. allowlist.ts 는 표본과 따로 둔 해시 상수다. */
const DEMO_FILES = ['allowlist.ts', 'run.ts', 'samples.ts', 'types.ts'] as const;

type Sample = { manifest: Record<string, unknown>; files: Record<string, readonly string[]> };
const S = DEMO_SAMPLES as unknown as Record<string, Sample>;

/** 표본을 바꾼 samples 모듈로 갈아 끼운다(시험 안에서만). */
function mockSamples(edit: (orig: Record<string, Sample>) => Record<string, unknown>) {
  vi.doMock('@/lib/exit-check-demo/samples', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@/lib/exit-check-demo/samples')>();
    return { ...orig, DEMO_SAMPLES: edit(orig.DEMO_SAMPLES as unknown as Record<string, Sample>) };
  });
}

/** 얼려 있지 않은 객체·배열의 자리 목록. */
function unfrozen(v: unknown, where: string): string[] {
  if (!v || typeof v !== 'object') return [];
  const own = Object.isFrozen(v) ? [] : [where];
  return [...own, ...Object.entries(v).flatMap(([k, x]) => unfrozen(x, `${where}.${k}`))];
}

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
  vi.doUnmock('@/lib/exit-check-demo/allowlist');
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

  it('바이트와 그 해시를 함께 바꾼 표본도 던진다(허용 해시는 표본 객체가 아니라 allowlist.ts 에 있다)', async () => {
    // 검수 탐침 그대로: 다른 근로자 행으로 바꾸고, 표본 쪽에 적힌 해시도 새 바이트의 해시로 맞춘다.
    const path = 'personnel_exit.csv';
    const lines = [...S.S01!.files[path]!];
    lines[1] = 'C-Z,W-77,1,2026-09-30,2026-09-30,exited,2026-10-01T09:00:00+09:00';
    const hash = fileHashRef(new TextEncoder().encode(lines.join('\n')));
    mockSamples((orig) => {
      const s01 = orig.S01! as Sample & { file_sha256?: Record<string, string> };
      return { ...orig, S01: { ...s01, files: { ...s01.files, [path]: lines }, file_sha256: { ...(s01.file_sha256 ?? {}), [path]: hash } } };
    });
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S01')).rejects.toThrow(/허용목록/);
  });

  // 검수 탐침의 다섯 가지 — synthetic 은 true 그대로 두고 manifest 한 칸만 바꾼다.
  it.each([
    ['cutoff_at', (m: Record<string, unknown>) => ({ ...m, cutoff_at: '2026-10-25T23:59:59+09:00' })],
    ['required_schemes', (m: Record<string, unknown>) => ({ ...m, required_schemes: ['NPS', 'NHIS', 'EI', 'IACI'] })],
    ['column_aliases', (m: Record<string, unknown>) => ({ ...m, column_aliases: { personnel_exit: { employment_status: 'last_worked_date' } } })],
    [
      'approvals',
      (m: Record<string, unknown>) => ({
        ...m,
        approvals: [{ key: 'C-A|W-01|1', scheme: 'EI', status: 'NOT_APPLICABLE', reason_code: 'X', approved_by: 'x', approved_at: '2026-10-01T00:00:00+09:00' }],
      }),
    ],
    ['target_events', (m: Record<string, unknown>) => ({ ...m, target_events: [{ company_key: 'C-A', worker_token: 'W-01', employment_sequence: 1 }] })],
  ])('manifest 의 %s 한 칸을 바꾸면 던진다(파일 바이트·synthetic 은 그대로)', async (_k, edit) => {
    mockSamples((orig) => ({ ...orig, S01: { ...orig.S01!, manifest: edit(orig.S01!.manifest) } }));
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    await expect(runScenario('S01')).rejects.toThrow(/허용목록/);
  });

  it('표본·허용목록·예시 id 목록은 깊게 얼려 있어 실행 중에 바꿀 수 없다', async () => {
    const run = await import('@/lib/exit-check-demo/run');
    const { SAMPLE_ALLOWLIST } = await import('@/lib/exit-check-demo/allowlist');
    expect(unfrozen(DEMO_SAMPLES, 'DEMO_SAMPLES')).toEqual([]);
    expect(unfrozen(SAMPLE_ALLOWLIST, 'SAMPLE_ALLOWLIST')).toEqual([]);
    expect(unfrozen(run.SCENARIO_IDS, 'SCENARIO_IDS')).toEqual([]);
    const files = S.S01!.files as Record<string, string[]>;
    expect(() => {
      files['personnel_exit.csv'] = ['x'];
    }).toThrow(TypeError);
    expect(() => {
      files['personnel_exit.csv']![1] = 'x';
    }).toThrow(TypeError);
    expect(() => {
      (S.S01!.manifest as Record<string, unknown>).cutoff_at = 'x';
    }).toThrow(TypeError);
    expect(() => {
      (run.SCENARIO_IDS as unknown as string[]).push('S12');
    }).toThrow(TypeError);
    // 바꾸려던 값이 남지 않았고, 입구는 그대로 지문 값을 낸다.
    const r = await run.runScenario('S01');
    expect(r.core_report_sha256).toBe(fingerprint.samples.S01!.core_report_sha256);
  }, 60_000);
});

describe('실행 입구 — 결과가 지문과 같다', () => {
  it.each(['S01', 'S03'] as const)('%s 의 core_report_sha256 이 지문(원본 빌드로 잰 값)과 같다', async (id) => {
    const { runScenario } = await import('@/lib/exit-check-demo/run');
    const r = await runScenario(id);
    expect(r.core_report_sha256).toBe(fingerprint.samples[id]!.core_report_sha256);
    expect(r.core_report_sha256).toBe(fingerprint.scenarios[id]!.core_report_sha256);
  }, 60_000);

  it('허용목록(allowlist.ts)의 파일·manifest 해시가 지문 samples 절과 같고, 파일 해시는 scenarios 절과도 같다. 표본 객체에는 해시가 없다', async () => {
    const { SAMPLE_ALLOWLIST } = await import('@/lib/exit-check-demo/allowlist');
    const allow = SAMPLE_ALLOWLIST as Record<string, { manifest: string; files: Record<string, string> }>;
    expect(Object.keys(fingerprint.samples).sort()).toEqual(Object.keys(DEMO_SAMPLES).sort());
    expect(Object.keys(allow).sort()).toEqual(Object.keys(DEMO_SAMPLES).sort());
    for (const [id, s] of Object.entries(S)) {
      expect(Object.keys(s).sort(), `${id} 표본 객체의 키`).toEqual(['files', 'manifest']);
      expect(allow[id]!.files, id).toEqual(fingerprint.samples[id]!.files);
      expect(allow[id]!.manifest, id).toBe(fingerprint.samples[id]!.manifest_sha256);
      expect(allow[id]!.manifest, id).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(Object.keys(s.files).sort(), id).toEqual(Object.keys(allow[id]!.files).sort());
      for (const [p, h] of Object.entries(allow[id]!.files)) expect(h, `${id} ${p}`).toBe(`sha256:${fingerprint.scenarios[id]!.input_sha256[p]}`);
      for (const lines of Object.values(s.files)) for (const l of lines) expect(l.includes('\r'), `${id} CR`).toBe(false);
      expect(s.manifest.synthetic, `${id} synthetic`).toBe(true);
    }
    expect(read(`${DEMO_DIR}/samples.ts`).includes('\r')).toBe(false);
  });

  it(`내장 표본: R-009(날짜 관계) 발견 0건, 그리고 화면 모델의 개수·목록·문장에 R-009 에서 온 것이 0건(대조한 항목 포함) — ${B4}`, async () => {
    // 엔진은 표본마다 R-009 대조 항목을 낸다(S01 7개: 상실일 3·지급일 1·제출 시각 3, S03 5개). 화면 모델은 B4 전에는 이것을 세지도 싣지도 않는다.
    // 기한 표본을 더하거나 화면 모델이 R-009 를 싣기 시작하면 여기서 붉어진다 — 그 일은 B4 를 정한 뒤 조각 4 에서 한다.
    const { toExitCheckView } = await import('@/lib/exit-check-view/view');
    const run = await import('@/lib/exit-check-demo/run');
    const expectRaw: Record<string, number> = { S01: 7, S03: 5 };
    for (const id of run.SCENARIO_IDS) {
      const r = await run.runScenario(id);
      const findings = r.core_report.findings.filter((f) => f.rule_id === 'R-009');
      expect(findings.map((f) => `${f.field} ${f.reason_code}`), `${id}: ${B4}`).toEqual([]);
      const raw = r.core_report.compared_items.filter((c) => c.rule_id === 'R-009');
      expect(raw.length, `${id} 엔진 R-009 대조 항목`).toBe(expectRaw[id]);
      const v = toExitCheckView(r.core_report);
      const locator = r.core_report.compared_items.filter((c) => c.item === 'file_sha256_and_locator_present').length;
      expect(v.counts.compared, `${id}: ${B4}`).toBe(r.core_report.compared_items.length - raw.length - locator);
      const shown = [...v.comparedItems, ...[...v.checkItems, ...v.notComparedItems, ...v.excluded].map((i) => i.text), v.summary];
      expect(shown.filter((s) => s.includes('날짜 관계')), `${id}: ${B4}`).toEqual([]);
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

/** 앞으로 만들 예시 화면 폴더(조각 3). 실행 입구(run)를 가져올 수 있는 유일한 바깥 자리다. */
const SCREEN_DIR = 'src/app/exit-employer/check';

/** 입구 폴더 안을 가리키는 경로를 모듈 이름으로 바꾼다(확장자·/index 를 떼고, 폴더 자체는 index). 폴더 밖이면 null. */
function demoModule(target: string): string | null {
  if (!isInside(target, DEMO_DIR)) return null;
  const rest = target === DEMO_DIR ? '' : target.slice(DEMO_DIR.length + 1);
  const name = rest.replace(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, '').replace(/(^|\/)index$/, '');
  return name === '' ? 'index' : name;
}

/**
 * 입구 폴더로 들어가는 가져오기의 위반. 허용하는 것은 셋뿐이다.
 *   types           — 누구나(타입 다시 내보내기만 있다)
 *   run             — 예시 화면 폴더(SCREEN_DIR)에서만
 *   samples·allowlist — 입구 폴더의 run.ts 에서만
 * 그 밖의 모듈(새 파일, 폴더 자체, run 을 다시 내보내는 파일)은 어디서 가져와도 위반이다.
 */
function entryViolations(file: string, text: string): string[] {
  return importRefs(text).flatMap((r) => {
    const t = resolveSiteSpecifier(file, r.spec);
    const mod = t === null ? null : demoModule(t);
    if (mod === null || mod === 'types') return [];
    if (mod === 'run' && isInside(file, SCREEN_DIR)) return [];
    if ((mod === 'samples' || mod === 'allowlist') && file === `${DEMO_DIR}/run.ts`) return [];
    return [`${file}: ${r.kind} ${r.spec}`];
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

  it.each([
    ['확장자를 붙인 지정자(run.js)', 'src/components/X.tsx', `const m = await import('@/lib/exit-check-demo/run.js');`],
    ['확장자를 붙인 지정자(run.ts)', 'src/components/X.tsx', `import { runScenario } from '@/lib/exit-check-demo/run.ts';`],
    ['/index 를 붙인 지정자', 'src/components/X.tsx', `import { x } from '@/lib/exit-check-demo/run/index';`],
    ['폴더 자체', 'src/components/X.tsx', `import * as demo from '@/lib/exit-check-demo';`],
    ['입구 폴더의 새 파일(바이트를 받아 엔진을 돌리는 함수)', 'src/components/X.tsx', `import { runBytes } from '@/lib/exit-check-demo/zz-open';`],
    ['입구 폴더의 새 파일이 run 을 다시 내보냄', `${DEMO_DIR}/zz-reexport.ts`, `export { runScenario } from './run';`],
    ['예시 화면 폴더에서 표본을 직접', `${SCREEN_DIR}/ExitCheckDemoClient.tsx`, `import { DEMO_SAMPLES } from '@/lib/exit-check-demo/samples';`],
    ['예시 화면 폴더에서 허용목록을 직접', `${SCREEN_DIR}/ExitCheckDemoClient.tsx`, `import { SAMPLE_ALLOWLIST } from '@/lib/exit-check-demo/allowlist.js';`],
    ['입구 폴더의 다른 파일에서 표본', `${DEMO_DIR}/types.ts`, `import { DEMO_SAMPLES } from './samples';`],
    ['예시 화면 폴더 밖의 상대 경로 동적 가져오기', 'src/app/exit-employer/X.tsx', `const m = await import('../../lib/exit-check-demo/run.js');`],
  ])('검사기 자기시험 — 심어 둔 위반을 잡는다: %s', (_label, file, text) => {
    expect(entryViolations(file, text)).toHaveLength(1);
  });

  it.each([
    ['run.ts 가 표본·허용목록을 가져옴', `${DEMO_DIR}/run.ts`, `import { DEMO_SAMPLES } from './samples';\nimport { SAMPLE_ALLOWLIST } from './allowlist';`],
    ['화면 모델이 타입 파일을 가져옴', `${VIEW_DIR}/view.ts`, `import type { CoreReport } from '@/lib/exit-check-demo/types';`],
    ['예시 화면 폴더가 run.js 를 동적으로 가져옴', `${SCREEN_DIR}/ExitCheckDemoClient.tsx`, `const m = await import('@/lib/exit-check-demo/run.js');`],
    ['이름 앞부분만 같은 폴더', 'src/components/X.tsx', `import { x } from '@/lib/exit-check-demo-other/run';`],
  ])('검사기 자기시험 — 위반이 아닌 것은 잡지 않는다: %s', (_label, file, text) => {
    expect(entryViolations(file, text)).toEqual([]);
  });

  it(`입구 폴더 파일 목록은 정확히 ${DEMO_FILES.join('·')} 이다(새 파일 = 새 입구)`, () => {
    expect(walk(DEMO_DIR, /.*/)).toEqual(DEMO_FILES.map((f) => `${DEMO_DIR}/${f}`));
  });

  it('samples.ts·allowlist.ts 는 생성된 값뿐이다(아무것도 가져오거나 다시 내보내지 않는다)', () => {
    for (const f of ['samples.ts', 'allowlist.ts']) {
      const text = read(`${DEMO_DIR}/${f}`);
      expect(text.startsWith('// 생성물 — scripts/exit-check/sync-engine.mjs 가 쓴다.'), f).toBe(true);
      expect(importRefs(text), f).toEqual([]);
    }
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

  it(`src/ 에서 입구 폴더로 들어가는 가져오기는 types(누구나)·run(${SCREEN_DIR} 만)·samples·allowlist(run.ts 만)뿐이다 — ${UPLOAD_PREREQ}`, () => {
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
