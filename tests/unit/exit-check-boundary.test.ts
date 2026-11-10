// 엔진 사본(src/lib/exit-check) 가져오기 경계.
// src/ 아래에서 사본의 실행 코드를 가져올 수 있는 곳은 사본 자신(src/lib/exit-check/**)과
// 앞으로 만들 합성 예시 입구(src/lib/exit-check-demo/**)뿐이다. 정적·동적 가져오기, '@/lib/exit-check' 별칭과
// 상대 경로를 모두 실제 경로로 풀어 판정한다.
// ESLint no-restricted-imports 는 동적 import() 와 상대 경로 우회를 보지 않으므로 이 시험이 경계의 본체다.
// import type … 문장은 컴파일하면 지워져 실행 코드를 끌어오지 않으므로 허용한다(조각 2 의 화면 모델이 타입만 쓴다).
// 인자가 계산식인 import(`…${x}`) 는 풀 수 없어 이 시험이 보지 못한다.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importRefs, isInside, resolveSiteSpecifier } from './exit-check-imports';

const ROOT = join(__dirname, '..', '..');
const COPY = 'src/lib/exit-check';
const ALLOWED = [COPY, 'src/lib/exit-check-demo'];
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/** file 은 저장소 기준 posix 경로. 경계를 넘는 가져오기를 「경로: 종류 지정자」로 돌려준다. */
function violations(file: string, text: string): string[] {
  if (ALLOWED.some((d) => isInside(file, d))) return [];
  return importRefs(text)
    .filter((r) => !r.typeOnly)
    .flatMap((r) => {
      const target = resolveSiteSpecifier(file, r.spec);
      return target !== null && isInside(target, COPY) ? [`${file}: ${r.kind} ${r.spec}`] : [];
    });
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (SOURCE.test(name)) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

describe('엔진 사본 가져오기 경계 — 검사기 자기시험', () => {
  const page = 'src/app/exit-employer/check/page.tsx';

  it.each([
    ['별칭 하위 경로', `import { runCore } from '@/lib/exit-check/core/run';`],
    ['별칭 폴더 자체', `import * as engine from "@/lib/exit-check";`],
    ['여러 줄 문장의 닫는 줄', `import {\n  prepareFromManifest,\n  type RunManifest,\n} from "@/lib/exit-check/config";`],
    ['상대 경로', `import { runCore } from '../../../lib/exit-check/core/run';`],
    ['동적 import()', `const m = await import('@/lib/exit-check/core/run');`],
    ['next/dynamic 안의 import()', `const C = dynamic(() => import(\n  "@/lib/exit-check/config"\n));`],
    ['export … from', `export * from '@/lib/exit-check/core/types';`],
    ['부수 효과 가져오기', `import '@/lib/exit-check/core/run';`],
    ['require()', `const r = require("@/lib/exit-check/config");`],
    ['JSON', `import rules from '@/lib/exit-check/deadline-rules.json';`],
  ])('심어 둔 위반을 잡는다: %s', (_label, text) => {
    expect(violations(page, `'use client';\n${text}\nexport default function X() { return null; }\n`)).toHaveLength(1);
  });

  it.each([
    ['합성 예시 입구(이름 앞부분만 같은 폴더)', `import { runScenario } from '@/lib/exit-check-demo/run';`],
    ['import type 문장', `import type { CoreReport } from '@/lib/exit-check/core/run';`],
    ['export type 문장', `export type { Finding } from '@/lib/exit-check/core/types';`],
    ['그냥 문자열', `const s = "@/lib/exit-check/config";`],
    ['주석 처리된 가져오기', `// import { runCore } from '@/lib/exit-check/core/run';`],
    ['다른 lib', `import { toInput } from '@/lib/headcount-plan';`],
  ])('위반이 아닌 것은 잡지 않는다: %s', (_label, text) => {
    expect(violations(page, text)).toEqual([]);
  });

  it('사본 자신과 합성 예시 입구 폴더 안의 가져오기는 허용한다', () => {
    const text = `import { prepareFromManifest } from '@/lib/exit-check/config';`;
    expect(violations('src/lib/exit-check-demo/run.ts', text)).toEqual([]);
    expect(violations('src/lib/exit-check/rules/r009_deadlines.ts', `import { addDays } from "../core/values";`)).toEqual([]);
    expect(violations('src/lib/exit-check-view/view.ts', text)).toHaveLength(1);
  });
});

describe('엔진 사본 가져오기 경계 — 실제 src/', () => {
  it(
    'src/ 에서 src/lib/exit-check/** 를 실행 코드로 가져오는 파일은 사본 자신과 src/lib/exit-check-demo/** 뿐이다',
    () => {
      const files = walk(join(ROOT, 'src'));
      expect(files.length).toBeGreaterThan(100);
      expect(files).toContain('src/lib/exit-check/config.ts');
      const found = files.flatMap((f) => violations(f, readFileSync(join(ROOT, f), 'utf8')));
      expect(found).toEqual([]);
    },
    60_000,
  );
});
