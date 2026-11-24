// 퇴고 체험이 브라우저로 내보내는 묶음(scripts/build-toego-browser.mjs → src/lib/toego/engine.bundle.mjs)을 직접 만들어 본다.
// 화면이 실제로 싣는 것은 이 묶음이다 — 원본 진입점이 맞아도 묶는 과정에서 node 모듈·다른 팩이 끼면 소용없다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runToego } from '../../tools/k-labor/lib/prose/toego.mjs';
import { buildToegoBrowser } from '../../scripts/build-toego-browser.mjs';
import { CORPUS } from '../fixtures/toego/corpus';

const GENRES = ['legal', 'consulting', 'lecture', 'general', 'official'] as const;
let dir = '';
let code = '';
let mod: typeof import('../../src/lib/toego/engine.bundle.mjs');

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-bundle-'));
  const out = path.join(dir, 'engine.bundle.mjs');
  await buildToegoBrowser({ out });
  code = fs.readFileSync(out, 'utf8');
  mod = await import(/* @vite-ignore */ pathToFileURL(out).href);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('브라우저 묶음', () => {
  it('node 모듈을 들여오지 않는다 — 가져오기·require 가 하나도 없다', () => {
    expect(code).not.toMatch(/\bfrom\s*["']node:/);
    expect(code).not.toMatch(/\bimport\s*\(\s*["']/);
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });

  it('네트워크 통로가 없다 — fetch·XMLHttpRequest·sendBeacon·WebSocket·EventSource·importScripts', () => {
    for (const w of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts']) expect(code, w).not.toContain(w);
  });

  it('팩은 범용 팩 하나만 들어 있다', () => {
    expect(code).toContain(`"${mod.GENERIC_INFO.version}"`);
    // 팩 JSON 의 머리 칸("pack": 이름)은 범용 팩 한 번뿐
    expect(code.match(/["']?pack["']?\s*:\s*["'][^"']+["']/g)).toEqual([expect.stringMatching(/generic/)]);
  });

  it('브라우저에 없는 전역(process·Buffer·require)을 지워도 같은 응답 — 엔진의 process.env 기본값 자리를 지나가지 않는다', () => {
    // 묶음에 process.env 가 두 곳 남아 있다(팩 폴더 기본값·allowFull 기본값). 진입점이 packs·allowFull 을 넘겨 둘 다 계산되지 않아야 한다
    expect(code.match(/\bprocess\.env\b/g)?.length ?? 0).toBeLessThanOrEqual(2);
    const exportLine = /^export \{ GENERIC_INFO, TOEGO_GENRES, runToegoBrowser \};\s*$/m;
    expect(code).toMatch(exportLine);
    const body = code.replace('import.meta.url', '"file:///browser/engine.bundle.mjs"').replace(exportLine, 'return { GENERIC_INFO, TOEGO_GENRES, runToegoBrowser };');
    const load = new Function('process', 'Buffer', 'require', 'global', 'module', 'exports', `"use strict";\n${body}`);
    const bare = load(undefined, undefined, undefined, undefined, undefined, undefined) as typeof mod;
    for (const text of CORPUS) {
      for (const genre of GENRES) expect(bare.runToegoBrowser({ text, genre }), genre).toEqual(mod.runToegoBrowser({ text, genre }));
    }
  });

  it('묶음의 응답 = 엔진 runToego(범용 팩만)', () => {
    const old = process.env.PROSE_PACK_DIR;
    delete process.env.PROSE_PACK_DIR;
    try {
      for (const text of CORPUS) {
        for (const genre of GENRES) expect(mod.runToegoBrowser({ text, genre })).toEqual(runToego({ text, genre }));
      }
    } finally {
      if (old !== undefined) process.env.PROSE_PACK_DIR = old;
    }
  });
});
