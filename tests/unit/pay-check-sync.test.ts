// 엔진 사본(src/lib/pay-check) 동기화 검사.
// 엔진 ~/dev/pay-exception-check 는 로컬 전용이라 CI 에는 없다. 그래서 두 단계로 본다.
//  1) 언제나: 사본 4파일의 머리 줄 해시가 지문 파일(engine-fingerprint.json)의 commit 과 같고, 사본 내용 해시가 지문과 같다.
//  2) 엔진 폴더가 있으면(PAY_CHECK_ENGINE_DIR 또는 ~/dev/pay-exception-check): 엔진 src/<파일>.ts 의 내용 해시가 사본과 같다.
// 내용 해시는 머리 줄(「// 원본: …」), CR, import 의 .js 확장자를 뺀 뒤 잰다.
// 엔진을 다시 옮겼으면: 4파일을 복사하고 머리 줄 해시를 바꾼 뒤 지문 파일의 commit·해시를 갱신한다.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILES = ['types', 'policies', 'check', 'card'] as const;
const COPY_DIR = join(__dirname, '../../src/lib/pay-check');
const fingerprint = JSON.parse(readFileSync(join(__dirname, '../fixtures/pay-check/engine-fingerprint.json'), 'utf8')) as {
  commit: string;
  files: Record<(typeof FILES)[number], string>;
};
const ENGINE_DIR = process.env.PAY_CHECK_ENGINE_DIR ?? join(homedir(), 'dev', 'pay-exception-check');
const HEADER = /^\/\/ 원본: ~\/dev\/pay-exception-check @([0-9a-f]{7,40})$/;

function normalize(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  if (HEADER.test(lines[0] ?? '')) lines.shift();
  return lines.map((l) => (/^\s*import\b/.test(l) ? l.replace(/\.js(["'])/g, '$1') : l)).join('\n');
}
const sha = (text: string) => createHash('sha256').update(normalize(text), 'utf8').digest('hex');
const copy = (f: string) => readFileSync(join(COPY_DIR, `${f}.ts`), 'utf8');

describe('엔진 사본 동기화', () => {
  it('사본 4파일의 머리 줄 해시가 모두 지문의 commit 이다', () => {
    for (const f of FILES) {
      const m = HEADER.exec(copy(f).replace(/\r/g, '').split('\n')[0] ?? '');
      expect(m?.[1], `${f}.ts 머리 줄`).toBe(fingerprint.commit);
    }
  });

  it('사본 내용이 지문에 기록된 엔진 내용과 같다', () => {
    for (const f of FILES) expect(sha(copy(f)), `${f}.ts`).toBe(fingerprint.files[f]);
  });

  it.skipIf(!existsSync(join(ENGINE_DIR, 'src', 'check.ts')))('엔진 원본이 있으면 원본 내용과 사본이 같다', () => {
    for (const f of FILES) {
      const engine = readFileSync(join(ENGINE_DIR, 'src', `${f}.ts`), 'utf8');
      expect(sha(engine), `${f}.ts — 엔진이 바뀌었으면 사본을 다시 옮긴다`).toBe(sha(copy(f)));
    }
  });

  it('정규화는 머리 줄·CR·import 확장자만 뺀다', () => {
    const a = '// 원본: ~/dev/pay-exception-check @486509a\r\nimport type { X } from "./types";\r\nconst s = "a.js";\r\n';
    const b = 'import type { X } from "./types.js";\nconst s = "a.js";\n';
    expect(normalize(a)).toBe(normalize(b));
    expect(normalize('const s = "a.js";')).toBe('const s = "a.js";');
  });
});
