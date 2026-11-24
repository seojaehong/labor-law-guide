// 퇴고 체험(/tools/toego) 브라우저 진입점 — 엔진 runToego(MCP 도구 check_prose·check_norms 와 같은 판정)와 같은 응답을 내는지.
// 진입점은 판정 함수를 다시 만들지 않고 엔진 checkProse(범용 팩만)·checkNorms·rrnLines 를 그대로 부른다.
// 합성 문장만 쓴다. 비공개 팩은 쓰지 않는다 — PROSE_PACK_DIR 에 미끼 팩을 두어도 진입점 결과가 바뀌지 않아야 한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runToego } from '../../tools/k-labor/lib/prose/toego.mjs';
import { GENERIC_INFO, TOEGO_GENRES, runToegoBrowser } from '../../src/lib/toego/entry.mjs';
import { BEFORE_AFTER, EXAMPLES } from '../../src/app/tools/toego/copy';
import { CORPUS } from '../fixtures/toego/corpus';

const GENRES = ['legal', 'consulting', 'lecture', 'general', 'official'] as const;

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.PROSE_PACK_DIR;
  delete process.env.PROSE_PACK_DIR;
  delete process.env.PROSE_ALLOW_FULL;
});
afterEach(() => {
  if (saved === undefined) delete process.env.PROSE_PACK_DIR;
  else process.env.PROSE_PACK_DIR = saved;
});

describe('브라우저 진입점 = 엔진 runToego', () => {
  it('합성 글 × 장르 다섯 — 응답이 글자까지 같다', () => {
    for (const text of CORPUS) {
      for (const genre of GENRES) {
        expect(runToegoBrowser({ text, genre }), `${genre} ${JSON.stringify(text).slice(0, 40)}`).toEqual(runToego({ text, genre }));
      }
    }
  });

  it('예시 글은 실제로 걸린다 — 체험이 빈 결과를 보여 주지 않는다', () => {
    for (const e of EXAMPLES) {
      const r = runToegoBrowser({ text: e.text, genre: e.genre });
      expect(r.ok, e.label).toBe(true);
      const prose = r.prose.counts.A + r.prose.counts.B;
      const norms = ['spacing', 'punct', 'comma'].reduce((n, k) => n + r.norms[k].counts.A + r.norms[k].counts.B, 0);
      expect(prose, `${e.label} 문체`).toBeGreaterThan(0);
      expect(norms, `${e.label} 규범`).toBeGreaterThan(0);
      expect(r.prose.packs).toEqual([`${GENERIC_INFO.pack}@${GENERIC_INFO.version}`]);
    }
  });

  it('예시 전후 — 고친 글은 걸림이 하나도 없다', () => {
    const before = runToegoBrowser({ text: BEFORE_AFTER.before, genre: BEFORE_AFTER.genre });
    const after = runToegoBrowser({ text: BEFORE_AFTER.after, genre: BEFORE_AFTER.genre });
    const total = (r: typeof after) => r.prose.counts.A + r.prose.counts.B
      + ['spacing', 'punct', 'comma'].reduce((n, k) => n + r.norms[k].counts.A + r.norms[k].counts.B, 0);
    expect(total(before)).toBeGreaterThan(0);
    expect(total(after)).toBe(0);
  });

  it('빈 글 · 40만 자 초과 — 엔진과 같은 거절(코드포인트로 센다)', () => {
    const cases = [
      '',
      'a'.repeat(400_000),
      'a'.repeat(400_001),
      '😀'.repeat(400_000), // UTF-16 80만, 코드포인트 40만 — 받는다
      '😀'.repeat(400_001),
    ];
    for (const text of cases) {
      const got = runToegoBrowser({ text, genre: 'general' });
      expect(got, `${text.length}`).toEqual(runToego({ text, genre: 'general' }));
    }
    expect(runToegoBrowser({ text: '', genre: 'legal' })).toMatchObject({ ok: false, error: 'INVALID_ARGS', reason: '빈 글' });
    expect(runToegoBrowser({ text: 'a'.repeat(400_001), genre: 'legal' })).toMatchObject({ ok: false, reason: '40만 자 초과' });
  });

  it('모르는 장르 · 글이 아닌 값은 INVALID_ARGS', () => {
    for (const raw of [{ text: '글', genre: 'poem' }, { text: 3, genre: 'legal' }, { genre: 'legal' }]) {
      expect(runToegoBrowser(raw as never)).toEqual(runToego(raw as never));
    }
  });

  it('주민등록번호 모양이면 점검하지 않고 엔진과 같은 문구 · 줄 번호(50줄까지)', () => {
    const one = '첫 줄\n합성 번호 900101-1234567 이 있는 줄\n셋째 줄';
    expect(runToegoBrowser({ text: one, genre: 'legal' })).toEqual(runToego({ text: one, genre: 'legal' }));
    const many = Array.from({ length: 60 }, (_, i) => `${i} 줄 900101-1234567`).join('\n');
    const r = runToegoBrowser({ text: many, genre: 'legal' });
    expect(r).toEqual(runToego({ text: many, genre: 'legal' }));
    expect(r.ok).toBe(false);
    expect(r.rrnLines).toHaveLength(50);
    expect(r.prose).toBeUndefined();
  });
});

describe('비공개 팩을 쓰지 않는다', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toego-decoy-'));
    // 미끼 — 엔진이 이 폴더를 읽으면 「회사」에 A 걸림이 생긴다(합성 규칙)
    fs.writeFileSync(path.join(dir, 'decoy.json'), JSON.stringify({
      pack: 'decoy', version: 't1', rules: [{ id: 'decoy-1', re: '회사', grade: 'A', reason: '미끼' }],
    }));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('PROSE_PACK_DIR 에 팩이 있어도 진입점 결과는 범용 팩만 쓴 결과와 같다', () => {
    const text = EXAMPLES[0].text;
    const base = runToegoBrowser({ text, genre: 'legal' });
    process.env.PROSE_PACK_DIR = dir;
    process.env.PROSE_ALLOW_FULL = '1';
    // 엔진은 미끼를 읽는다 — 미끼가 실제로 걸리는 글임을 먼저 확인(이 시험이 헛돌지 않게)
    const engine = runToego({ text, genre: 'legal' });
    expect(engine.prose.packCount).toBe(2);
    expect(engine.prose.hits.some((h: { pack?: string }) => h.pack === 'decoy')).toBe(true);
    const got = runToegoBrowser({ text, genre: 'legal' });
    expect(got).toEqual(base);
    expect(got.prose.packCount).toBe(1);
    expect(got.prose.packs).toEqual([`${GENERIC_INFO.pack}@${GENERIC_INFO.version}`]);
    expect(JSON.stringify(got)).not.toContain('decoy');
  });

  it('범용 팩 정보 — 공개 사전 115항목 · 전부 B', () => {
    expect(GENERIC_INFO.pack).toBe('generic');
    expect(GENERIC_INFO.ruleCount).toBe(115);
    expect(GENERIC_INFO.grades).toEqual(['B']);
    expect(TOEGO_GENRES).toEqual(GENRES);
  });
});
