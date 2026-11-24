// 퇴고 check_prose — 규칙 실행기·팩 검증·팩 로더·출력 정책·정규식 방언·성능.
// 합성 문장·합성 팩만 쓴다(값은 시험용으로 지어낸 것이다 — 실제 사건 글·실제 팩 규칙 아님).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkProse, compilePack, execAll, fmtFixed, GENERIC_PACK, loadPackSet, toJsSource, validatePack } from '../../tools/k-labor/lib/prose/check.mjs';
import { looksLikeRrn, mask } from '../../tools/k-labor/lib/common.mjs';

const PACK = {
  pack: 'test',
  version: 't1',
  table: { open: '「“', close: '」”', skip: ['B'] },
  rules: [
    { id: 't-1', re: '모래성', flags: 'm', grade: 'A', reason: '비유 표현', fix: '근거가 약하다' },
    { id: 't-2', re: '(?<![가-힣])아마도', flags: 'm', grade: 'B', reason: '추측 표현', fix: '근거를 쓴다' },
    { id: 't-3', re: '바라건대', flags: 'm', grade: 'A', genres: ['legal'], reason: '문체 기준', fix: '삭제' },
    { id: 't-4', re: '얼씨구', flags: 'm', grade: 'A', genres: ['general'], reason: '구어', fix: '삭제' },
    { id: 't-q1', scope: 'quote', target: 'line', re: '별별', grade: 'A', reason: '인용 형식', fix: '고친다' },
    { id: 't-q2', scope: 'quote', target: 'trim', once: true, re: '^>\\s*@@', grade: 'A', reason: '인용 형식', fix: '뺀다' },
  ],
  freq: { floor: 1, factor: 4, items: [{ word: '바야흐로', avg: 0.7 }], msg: '%s %d회(기준 %.1f)', brief: '자주 쓰는 표현' },
  density: [{ id: 't-d1', re: '푸른\\s*새', limit: 7.5, min: 3, genres: ['legal'], reason: '푸른 새가 많다', brief: '반복 문형' }],
  checks: {
    utterQuotes: { re: '◇[^◇]{1,9}◇말', curly: '◆[^◆]{1,9}◆', min: 2, msg: '발언 %d회(%d)', brief: '발언 부호' },
    heads: { genres: ['legal'], line: '^##\\s+(.+)$', re: '어찌$', maxWords: 3, msg: '제목 %d개: %s', brief: '제목 꼴' },
    sentences: { genres: ['legal'], end: '요', minChars: 2, minSents: 3, maxLen: 12, ratio: 0.45, run: 3, tail: 3, msgLong: '긴 문장 %d/%d(%.0f%%)', briefLong: '긴 문장', msgRun: '어미 반복 %d곳', briefRun: '어미 반복' },
  },
};
const PRIV = { ...PACK, private: true };
const full = (text: string, o: object = {}) => checkProse(text, { packs: [PACK], detail: 'full', ...o });
const rulePack = (rules: object[], extra: object = {}) => ({ pack: 'syn', rules, ...extra });
const one1 = (re: string, extra: object = {}) => rulePack([{ id: 's-1', re, grade: 'A', reason: 'x', ...extra }]);

describe('규칙 실행', () => {
  it('본문 줄에서 A·B 를 찾고 줄·칸·길이를 준다', () => {
    const r = full('첫 줄\n이 주장은 모래성입니다. 아마도 그렇습니다.');
    expect(r.counts).toEqual({ A: 1, B: 1 });
    expect(r.hits.find((h) => h.grade === 'A')).toMatchObject({ line: 2, col: 7, len: 3, word: '모래성' });
  });

  it('칸은 코드포인트로 센다(앞에 이모지가 있어도, 짝 없는 서로게이트는 한 글자)', () => {
    expect(full('😀 모래성').hits[0].col).toBe(3);
    expect(full('첫 줄\r\n😀 모래성').hits[0]).toMatchObject({ line: 2, col: 3 });
    expect(full('\uD800모래성').hits[0].col).toBe(2);
    expect(full('\uDC00가모래성').hits[0].col).toBe(3);
  });

  it('> 인용 줄과 [관련 판결] 줄은 인용 규칙만 보고, 다듬은 줄 규칙의 칸에 들여쓰기를 더한다', () => {
    const r = full('> 모래성 별별 아마도\n   > @@ 표시\n[관련 판결] 모래성');
    expect(r.hits.map((h) => [h.rule, h.line, h.col])).toEqual([['t-q1', 1, 7], ['t-q2', 2, 4]]);
  });

  it('인용 규칙도 제외어 창을 본다', () => {
    const p = rulePack([{ id: 'q', scope: 'quote', re: 'Q', exclude: 'sample', grade: 'A', reason: 'x' }]);
    expect(checkProse('> sample Q', { packs: [p] }).counts.A).toBe(0);
    expect(checkProse('> Q', { packs: [p] }).counts.A).toBe(1);
  });

  it('표 줄은 「」·“ ” 안을 코드포인트 수만큼 가리고(칸 유지) B 를 건너뛴다', () => {
    const r = full('| 😀「모래성」 | 아마도 | 모래성 |');
    expect(r.hits.map((h) => [h.rule, h.col])).toEqual([['t-1', 18]]);
    expect(full('| “😀” | 모래성 |').hits[0].col).toBe(9);
  });

  it('표 가리기 설정이 없는 팩은 표 줄도 그대로 본다', () => {
    const r = checkProse('| 「모래성」 | 아마도 |', { packs: [{ ...PACK, table: undefined }], detail: 'full' });
    expect(r.counts).toEqual({ A: 1, B: 1 });
  });

  it('장르 — legal 전용 규칙은 legal 에서만, official 은 general 과 같다', () => {
    expect(full('바라건대 살펴 주십시오.', { genre: 'legal' }).counts.A).toBe(1);
    expect(full('바라건대 살펴 주십시오.', { genre: 'consulting' }).counts.A).toBe(0);
    expect(full('얼씨구', { genre: 'official' }).counts.A).toBe(1);
  });

  it('제외어는 후보 앞뒤 12글자 안에서만 본다(같은 줄의 먼 낱말은 면제하지 않는다)', () => {
    const g = [GENERIC_PACK];
    expect(checkProse('조직조정 절차를 거쳤다.', { packs: g }).hits).toHaveLength(0);
    expect(checkProse('결과를 가르는 것은 시간이다.', { packs: g }).hits).toHaveLength(1);
    expect(checkProse('헷갈리지만 결과를 가르는 것은 시간이다.', { packs: g }).hits).toHaveLength(0);
    const far = `헷갈리는 이야기는 앞에서 이미 충분히 길게 끝냈고 이제 다른 이야기를 한다. 결과를 가르는 것은 시간이다.`;
    expect(checkProse(far, { packs: g }).hits).toHaveLength(1);
  });
});

describe('줄 거르기(합친 식) — 결과는 규칙을 하나씩 돌린 것과 같다', () => {
  it('합칠 수 없는 팩(캡처 이름이 겹침)도, 긴 줄(합친 식을 안 쓰는 줄)에서도 같다', () => {
    const p = rulePack([
      { id: 'u-1', re: '(?P<n>가)가', grade: 'A', reason: 'x' },
      { id: 'u-2', re: '나다', grade: 'B', reason: 'x' },
      { id: 'u-3', re: '(?P<n>라)마', grade: 'A', reason: 'x' },
    ]);
    expect(checkProse('가가 나다 라마', { packs: [p] }).counts).toEqual({ A: 2, B: 1 });
    expect(checkProse(`${'바'.repeat(3000)} 가가 나다 라마`, { packs: [p] }).counts).toEqual({ A: 2, B: 1 });
    expect(checkProse('아무것도 없는 줄', { packs: [p] }).counts).toEqual({ A: 0, B: 0 });
  });

  it('범용 팩 L-17(앞에 한글 경계를 붙인 식)은 그대로 잡는다', () => {
    const r = checkProse('이 문제를 새로운 렌즈로 보면 달라진다.', { packs: [GENERIC_PACK], detail: 'full' });
    expect(r.hits.map((h) => [h.rule, h.col, h.word])).toEqual([['gen-L-17', 7, '새로운 렌즈로 보면']]);
  });

  it('L-17 — 앞 일치가 한글 덩어리 가운데에서 끝나면 그 자리에서 원래 식을 다시 본다(상류 식과 같은 결과)', () => {
    const r = checkProse('첫 렌즈로 읽는 렌즈로 본다', { packs: [GENERIC_PACK] });
    expect(r.hits.map((h) => h.col)).toEqual([1, 8]);
    // 상류 식(앞 경계 없음)을 그대로 돌린 결과와 같다
    const up = GENERIC_PACK.rules.find((x: { id: string }) => x.id === 'gen-L-17')!;
    const raw = checkProse('첫 렌즈로 읽는 렌즈로 본다', { packs: [rulePack([{ id: 'up', re: up.resume, flags: 'm', grade: 'B', reason: 'x', exclude: up.exclude }])] });
    expect(raw.hits.map((h) => h.col)).toEqual([1, 8]);
  });
});

describe('알림 — 검출식·기준값은 팩에서 읽는다', () => {
  const body = [
    '## 제목이 무척 길어서 넘치는 어찌',
    '바야흐로 바야흐로 바야흐로 바야흐로 표현.',
    '◇가◇말 했고 ◇나◇말 했다.',
    '푸른 새 푸른새 푸른 새 푸른 새.',
    '짧아요.이것은 아주 길고 긴 문장이에요.저것도 아주 길고 긴 문장이에요.그것도 아주 길고 긴 문장이에요.',
  ].join('\n');

  it('full — 빈도·밀도·발언 인용·제목·문장 길이·어미 반복', () => {
    const r = full(body);
    expect(r.notes.map((n) => n.kind)).toEqual(['freq', 'density', 'utterQuotes', 'heads', 'sentences.long', 'sentences.run']);
    expect(r.notes[0].text).toBe('바야흐로 4회(기준 0.7)');
    expect(r.notes.find((n) => n.kind === 'density')!.text).toMatch(/^푸른 새가 많다 4회\(만자당 /);
    expect(r.notes.find((n) => n.kind === 'sentences.long')!.text).toBe('긴 문장 3/4(75%)');
  });

  it('brief — 밀도 알림은 팩의 짧은 말만(횟수·문턱·설명 없음)', () => {
    const r = checkProse(body, { packs: [PRIV] });
    expect(r.notes.find((n) => n.kind === 'density')!.text).toBe('반복 문형');
    expect(JSON.stringify(r.notes)).not.toMatch(/푸른|7\.5|바야흐로|기준 0\.7/);
  });

  it('문장은 「마침표로 자른 조각이 끝말로 끝나는 것」(파이썬 findall 과 같다)', () => {
    const p = { ...PACK, checks: { sentences: { ...PACK.checks.sentences, minSents: 1, ratio: 2, run: 2 } } };
    const r = checkProse('가나요.다라.마나요.사아요', { packs: [p], detail: 'full' });
    expect(r.notes.map((n) => n.text)).toEqual(['어미 반복 1곳']);
  });

  it('장르 조건 — legal 이 아니면 밀도·제목·문장 알림을 끈다', () => {
    expect(full(body, { genre: 'general' }).notes.map((n) => n.kind)).toEqual(['freq', 'utterQuotes']);
  });

  it('제목 식은 줄 첫머리에서만 맞춘다(파이썬 re.match)', () => {
    const p = { pack: 'h', rules: [], checks: { heads: { line: '##\\s+(.+)$', re: '없음$', maxWords: 3, brief: '제목' } } };
    expect(checkProse('머리말 ## 하나 둘 셋 넷', { packs: [p] }).notes).toHaveLength(0);
    expect(checkProse('## 하나 둘 셋 넷', { packs: [p] }).notes).toHaveLength(1);
  });

  it('제목 줄의 긴 공백 — 팩이 허락하지 않으면 원문 그대로 맞추고, 허락하면 줄여 맞춘 뒤 제목 글은 원문에서 꺼낸다', () => {
    const exact = { pack: 'h', rules: [], checks: { heads: { line: '^## (A {2}B +C)$', re: '없음$', maxWords: 1, msg: '%d %s', brief: '제목' } } };
    expect(checkProse(`## A  B${' '.repeat(64)}C`, { packs: [exact] }).notes).toHaveLength(1);
    const lazy = { pack: 'h', rules: [], checks: { heads: { line: '^##\\s+(.+?)\\s*$', re: '없음$', maxWords: 1, msg: '%d [%s]', brief: '제목', collapseWs: true } } };
    const r = checkProse(`## 가${' '.repeat(100)}나`, { packs: [lazy], detail: 'full' });
    expect(r.notes[0].text).toBe(`1 [가${' '.repeat(29)}]`);
  });
});

describe('출력 정책', () => {
  it('공개 팩은 기본이 full(걸린 글자·고칠 말까지), detail brief 면 위치만', () => {
    const d = checkProse('이 주장은 모래성입니다.', { packs: [PACK] });
    expect(d.hits[0]).toMatchObject({ word: '모래성', fix: '근거가 약하다', rule: 't-1' });
    const r = checkProse('이 주장은 모래성입니다. 아마도.', { packs: [PACK], detail: 'brief' });
    for (const h of r.hits) expect(Object.keys(h).sort()).toEqual(['col', 'grade', 'len', 'line', 'reason', 'ref']);
    expect(JSON.stringify(r)).not.toMatch(/모래성|근거가 약하다|t-1|"test"/);
    expect(r.packs).toBeUndefined();
  });

  it('참조값은 한 응답 안에서는 같은 규칙끼리 같고, 응답마다 바뀐다', () => {
    const a = checkProse('모래성 모래성', { packs: [PRIV] });
    const b = checkProse('모래성 모래성', { packs: [PRIV] });
    expect(a.hits[0].ref).toBe(a.hits[1].ref);
    expect(a.hits[0].ref).not.toBe(b.hits[0].ref);
  });

  it('private 팩은 기본·full 모두 brief — 허용할 때만 full, full 을 줄였으면 withheld', () => {
    const r = checkProse('모래성', { packs: [GENERIC_PACK, PRIV], detail: 'full', allowFull: false });
    expect(r.hits[0]).not.toHaveProperty('word');
    expect(r.withheld).toBe(true);
    expect(r.packs).toEqual([`${GENERIC_PACK.pack}@${GENERIC_PACK.version}`]);
    expect(checkProse('모래성', { packs: [PRIV], allowFull: false }).withheld).toBeUndefined();
    const ok = checkProse('모래성', { packs: [PRIV], allowFull: true });
    expect(ok.hits[0]).toMatchObject({ word: '모래성', rule: 't-1', pack: 'test' });
    expect(ok.withheld).toBeUndefined();
  });

  it('env PROSE_ALLOW_FULL=1 이 허용 기본값이다', () => {
    const old = process.env.PROSE_ALLOW_FULL;
    try {
      process.env.PROSE_ALLOW_FULL = '1';
      expect(checkProse('모래성', { packs: [PRIV] }).hits[0]).toHaveProperty('word');
      delete process.env.PROSE_ALLOW_FULL;
      expect(checkProse('모래성', { packs: [PRIV], detail: 'full' }).hits[0]).not.toHaveProperty('word');
    } finally {
      if (old === undefined) delete process.env.PROSE_ALLOW_FULL;
      else process.env.PROSE_ALLOW_FULL = old;
    }
  });

  it('PROSE_PACK_DIR 의 팩은 private: false 라고 적어야만 공개', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    try {
      const noFlag: Record<string, unknown> = { ...PRIV };
      delete noFlag.private;
      fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ ...noFlag, pack: 'nf' }));
      fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ ...noFlag, pack: 'pub', private: false }));
      const s = loadPackSet({ dir });
      const r = checkProse('모래성', { packs: s.packs, allowFull: false });
      expect(r.hits.map((h) => ('word' in h ? 'full' : 'brief'))).toEqual(['brief', 'full']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('걸린 곳이 많으면 hits 는 상한까지, counts 는 전부 + truncated', () => {
    const r = checkProse('모래성 '.repeat(30), { packs: [PACK], cap: 5 });
    expect(r.hits).toHaveLength(5);
    expect(r.counts.A).toBe(30);
    expect(r.truncated).toBe(true);
    expect(checkProse('모래성', { packs: [PACK] }).truncated).toBeUndefined();
  });

  it('상한 — A 를 먼저 싣고, 같은 등급은 문서 앞의 것부터(규칙 순서가 아니라)', () => {
    const p = rulePack([
      { id: 'b-1', re: '나비', grade: 'B', reason: 'x' },
      { id: 'b-2', re: '가지', grade: 'B', reason: 'x' },
      { id: 'a-1', re: '모래성', grade: 'A', reason: 'x' },
    ]);
    const r = checkProse(`가지 ${'나비 '.repeat(10)}\n${'나비 '.repeat(10)}\n모래성`, { packs: [p], cap: 5 });
    expect(r.counts).toEqual({ A: 1, B: 21 });
    expect(r.hits.map((h) => [h.grade, h.line, h.col])).toEqual([['B', 1, 1], ['B', 1, 4], ['B', 1, 7], ['B', 1, 10], ['A', 3, 1]]);
  });

  it('걸림이 없으면 참조값 소금을 만들지 않아도 된다(응답 모양은 같다)', () => {
    const r = checkProse('봄', { packs: [PRIV] });
    expect(r).toMatchObject({ counts: { A: 0, B: 0 }, hits: [], packCount: 1 });
  });
});

describe('팩 검증·읽기 — 깨진 팩은 건너뛰고 incomplete 와 고정 코드만 남긴다', () => {
  const utterBad = { pack: 'b', rules: [], checks: { utterQuotes: { re: '가', curly: '나', min: 1, brief: 'b', genres: 5 } } };
  const broken = [
    { pack: 'b', rules: [{ id: 'b-1', re: '(', grade: 'A', reason: 'x' }] },
    { pack: 'b', rules: [{ id: 'b-2', re: '', grade: 'A', reason: 'x' }] },
    { pack: 'b', rules: [{ id: 'b-3', re: '가', grade: 'C', reason: 'x' }] },
    { pack: 'b', rules: [{ id: 'b-4', re: '가', grade: 'A', reason: 'x', once: true }] },
    { pack: 'b', rules: [{ id: 'b-5', re: '\\w+', grade: 'A', reason: 'x' }] },
    { pack: 'b', rules: null as unknown as [] },
    null,
    utterBad,
    { pack: 'b', rules: [{ id: 'b-6', re: '가', grade: 'A', reason: 'x', genres: ['Legal'] }] },
    { pack: 'b', rules: [{ id: 'b-7', re: '가', grade: 'A', reason: 'x' }, { id: 'b-7', re: '나', grade: 'A', reason: 'x' }] },
    { pack: 'b', rules: [{ id: 'b-8', re: '가', grade: 'A', reason: 'x', fix: { o: 1 } }] },
    { pack: 'b', rules: [{ id: 'b-9', re: '가', grade: 'A', reason: 'x' }], table: { open: '𝄆', close: '𝄇' } },
    { pack: 'b', rules: [{ id: 'b-10', re: '별*', grade: 'A', reason: 'x' }] },
    { pack: 'b', rules: [{ id: 'b-11', re: '가', flags: 'mi', grade: 'A', reason: 'x' }] },
  ];

  it.each(broken.map((p, i) => [i, p]))('깨진 팩 %i 은 건너뛰고 범용 팩은 돈다', (_i, p) => {
    const r = checkProse('결과를 가르는 것은 시간이다. 가가', { packs: [GENERIC_PACK, p] });
    expect(r.skipped).toEqual([{ code: 'PACK_INVALID' }]);
    expect(r.incomplete).toBe(true);
    expect(r.counts.B).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/b-\d|\\\\w|"\("/);
  });

  it('팩 글의 알 수 없는 키(anyRx·tableOpen 등)는 컴파일 결과와 섞이지 않는다', () => {
    const p = { pack: 'k', rules: [{ id: 'k-1', re: '모래성', grade: 'A', reason: 'x' }], anyRx: {}, tableOpen: ['「'], bodyRules: 3 };
    expect(checkProse('| 「모래성」 |', { packs: [p] })).toMatchObject({ counts: { A: 1, B: 0 } });
  });

  it('점검 중 멈춘 팩은 그 팩만 빼고 PACK_RUNTIME — 다른 팩 결과는 남는다', () => {
    let k = 0;
    const utter: Record<string, unknown> = { re: '가', curly: '나', brief: 'b' };
    Object.defineProperty(utter, 'min', { get() { if (k++ > 0) throw new Error('boom 숨긴글'); return 1; } });
    const p = { pack: 'rt', rules: [{ id: 'rt-1', re: '모래성', grade: 'A', reason: 'x' }], checks: { utterQuotes: utter } };
    const r = checkProse('결과를 가르는 것은 시간이다. 모래성 가', { packs: [GENERIC_PACK, p] });
    expect(r).toMatchObject({ counts: { A: 0, B: 1 }, skipped: [{ code: 'PACK_RUNTIME' }], incomplete: true, packCount: 1 });
    expect(r.hits).toHaveLength(1);
  });

  it('같은 이름의 팩은 뒤의 것을 뺀다', () => {
    const r = checkProse('모래성', { packs: [PACK, { ...PACK }] });
    expect(r).toMatchObject({ counts: { A: 1 }, skipped: [{ code: 'PACK_DUP' }] });
  });

  it('검증 오류는 id·고정 코드뿐이다', () => {
    expect(validatePack(broken[3])).toEqual([{ id: 'b-4', code: 'RULE_ONCE' }]);
    expect(compilePack(broken[0])).toEqual({ errors: [{ id: 'b-1', code: 'RE_COMPILE' }] });
    expect(compilePack(broken[12])).toEqual({ errors: [{ id: 'b-10', code: 'RE_EMPTY' }] });
    expect(validatePack(utterBad)).toEqual([{ code: 'CHECK_UTTER' }]);
    expect(validatePack(PACK)).toEqual([]);
    expect(validatePack(GENERIC_PACK)).toEqual([]);
  });

  it('PROSE_PACK_DIR — 절대 경로만, BOM 은 벗기고, 깨진 JSON 은 건너뛰고, 없는 폴더는 PACK_DIR_MISSING', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.json'), `﻿${JSON.stringify(PACK)}`);
      fs.writeFileSync(path.join(dir, 'b.json'), '{ 깨진');
      const s = loadPackSet({ dir });
      expect(s.packs.map((p) => p.pack)).toEqual([GENERIC_PACK.pack, 'test']);
      expect(s.skipped).toEqual([{ code: 'PACK_UNREADABLE' }]);
      expect(loadPackSet({ dir: 'relative/dir' })).toMatchObject({ packs: [GENERIC_PACK], skipped: [{ code: 'PACK_DIR_NOT_ABSOLUTE' }] });
      expect(loadPackSet({ dir: path.join(dir, 'none') })).toEqual({ packs: [GENERIC_PACK], skipped: [{ code: 'PACK_DIR_MISSING' }] });
      expect(checkProse('글', { packs: [GENERIC_PACK], skipped: [{ code: 'PACK_DIR_MISSING' }] }).incomplete).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stderr 에도 팩 파일 이름·원문 조각·팩 이름·규칙 id 를 싣지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fs.writeFileSync(path.join(dir, 'secretname.json'), 'XYZ숨긴조각 not json');
      fs.writeFileSync(path.join(dir, 'z.json'), JSON.stringify({ pack: '숨긴팩', rules: [{ id: '숨긴id', re: '(', grade: 'A', reason: 'x' }] }));
      checkProse('글', loadPackSet({ dir }));
      const logged = spy.mock.calls.flat().map(String).join('\n');
      expect(logged).not.toMatch(/secretname|XYZ|숨긴/);
      expect(logged).toMatch(/1번째/);
    } finally {
      spy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('정규식 방언 — 팩은 파이썬 re 문법', () => {
  const one = (re: string, s: string, flags = 'm') => checkProse(s, { packs: [one1(re, { flags })] }).counts.A;
  const quote = (re: string, s: string) => checkProse(s, { packs: [one1(re, { scope: 'quote' })] }).counts.A;
  const bad = (re: string, extra: object = {}) => compilePack(one1(re, extra)).errors?.[0]?.code;

  it('\\s 는 파이썬 공백(U+0085·U+001C 포함, BOM 제외)', () => {
    expect(quote('가\\s나', '> 가\u0085나')).toBe(1);
    expect(quote('가\\s나', '> 가\u001c나')).toBe(1);
    expect(quote('가\\s나', '> 가﻿나')).toBe(0);
    expect(one('가[\\s,]나', '가\u0085나')).toBe(1);
  });

  it('m 플래그의 ^ $ 는 \\n 에서만 줄을 나눈다(U+2028 은 줄 경계가 아님)', () => {
    expect(one('^나비', '목록\u2028나비')).toBe(0);
    expect(one('^나비', '나비 한 마리')).toBe(1);
    expect(one('목록$', '목록\u2028다음')).toBe(0);
  });

  it('m 없는 $ 는 끝 줄바꿈 앞에서도 맞는다(파이썬)', () => {
    expect(new RegExp(toJsSource('가$'), 'u').test('나가\n')).toBe(true);
    expect(new RegExp(toJsSource('가$'), 'u').test('나가\n다')).toBe(false);
    const p = { pack: 'u', rules: [], checks: { utterQuotes: { re: 'OK$', curly: '◆', min: 1, brief: '발언' } } };
    expect(checkProse('앞\nOK', { packs: [p] }).notes).toHaveLength(1);
  });

  it('\\d 는 유니코드 숫자, . 은 \\n 만 빼고', () => {
    expect(one('\\d번', '１번 하나')).toBe(1);
    expect(one('가.나', '가\u2028나')).toBe(1);
    expect(toJsSource('[.]')).toBe('[.]');
  });

  it('파이썬에서 맞는 문장부호 이스케이프·{,n}·홀로 선 { ] ·(?P<이름>)·\\A \\Z·묶음 안 \\D 를 옮긴다', () => {
    expect(one('가\\ 나', '가 나')).toBe(1);
    expect(one('가\\-나', '가-나')).toBe(1);
    expect(one('가\\#나\\~다\\&라', '가#나~다&라')).toBe(1);
    expect(one('가{나', '가{나')).toBe(1);
    expect(one('가]나', '가]나')).toBe(1);
    expect(one('가}나', '가}나')).toBe(1);
    expect(one('가{}', '가{}')).toBe(1);
    expect(one('X가{,2}', 'X가가가')).toBe(1);
    expect(checkProse('X가가가', { packs: [one1('X가{,2}')], detail: 'full' }).hits[0].word).toBe('X가가');
    expect(one('(?P<x>가)나', '가나')).toBe(1);
    expect(one('[\\D가]나', 'X나')).toBe(1);
    expect(one('[\\D가]나', '1나')).toBe(0);
    expect(one('\\A가', '가나', '')).toBe(1);
    expect(one('나\\Z', '가나', '')).toBe(1);
  });

  it('같은 뜻으로 옮길 수 없는 식은 받지 않는다', () => {
    expect(bad('[\\s-가]나')).toBe('RE_COMPILE');
    expect(bad('[가-\\s]나')).toBe('RE_COMPILE');
    expect(bad('(Z)?Q\\1')).toBe('RE_COMPILE');
    expect(bad('(?:(?P<n>가))?(?P=n)')).toBe('RE_COMPILE');
    expect(bad('(?i)a')).toBe('RE_COMPILE');
    expect(bad('(?s:a.)')).toBe('RE_COMPILE');
    expect(bad('a(?#주석)')).toBe('RE_COMPILE');
    expect(bad('\\w')).toBe('RE_COMPILE');
    expect(bad('a', { flags: 'i' })).toBe('RULE_FLAGS');
    expect(bad('(?<![가-힣])(?=나)')).toBe('RE_EMPTY');
    expect(bad('(?:|Q)')).toBe('RE_EMPTY');
    expect(bad('[\\s-]나')).toBeUndefined();
  });

  it('제목 식도 같은 방언으로 — 전각 숫자 제목', () => {
    const p = { pack: 'h', rules: [], checks: { heads: { line: '^##\\s+\\d+[)]\\s*(.+)$', re: '없음$', maxWords: 3, brief: '제목' } } };
    expect(checkProse('## １) 하나 둘 셋 넷', { packs: [p] }).notes).toHaveLength(1);
  });

  it('%.Nf 는 파이썬처럼 정확한 반은 짝수 쪽으로', () => {
    expect([fmtFixed(22.5, 0), fmtFixed(23.5, 0), fmtFixed(0.125, 2), fmtFixed(2.675, 2), fmtFixed(-3.5, 0), fmtFixed(8.25, 1)]).toEqual(['22', '24', '0.12', '2.67', '-4', '8.2']);
  });
});

describe('성능 — 40만 자 모양별(제곱 경로가 없다)', () => {
  const N = 400_000;
  const time = (s: string, packs: object[] = [PACK]) => {
    const t0 = performance.now();
    const r = checkProse(s, { packs, genre: 'legal' });
    return { ms: performance.now() - t0, r };
  };
  const LAZY = { pack: 'h', rules: [], checks: { heads: { line: '^##\\s+(.+?)\\s*$', re: '없음$', maxWords: 3, brief: '제목', collapseWs: true } } };
  it.each([
    ['줄 가운데 긴 공백', `가${' '.repeat(N)}나`],
    ['제목 줄 가운데 긴 공백', `## 가${' '.repeat(N)}나`],
    ['닫히지 않는 「 표 줄', `|${'「'.repeat(N)}`],
    ['마침표 없는 긴 글', '가나다라마바사 '.repeat(N / 8)],
    ['한 줄에 걸림이 아주 많음', '모래성'.repeat(N / 3)],
    ['짧은 줄이 아주 많음', '가\n'.repeat(N / 2)],
  ])('%s', (_k, s) => {
    const { ms, r } = time(s, [GENERIC_PACK, PACK, LAZY]);
    expect(r.hits.length).toBeLessThanOrEqual(500);
    expect(ms).toBeLessThan(3000);
  });

  it('띄어쓰기 없는 긴 한글 줄 — 범용 팩', () => {
    expect(time('가나다라마바사아자차'.repeat(N / 10), [GENERIC_PACK]).ms).toBeLessThan(3000);
  });

  it('L-17 이어 찾기가 붙어도 긴 한글 줄에서 선형', () => {
    expect(time(`${'가나다라마바사아자차'.repeat(N / 20)} 렌즈로 읽 ${'가나다라마바사아자차'.repeat(N / 20)}`, [GENERIC_PACK]).ms).toBeLessThan(3000);
  });

  it('주민번호 모양 검사 — 긴 공백 덩어리에서도 선형이고, 사이 공백 길이와 상관없이 가린다', () => {
    const t0 = performance.now();
    expect(looksLikeRrn(`900101${' '.repeat(400_000)}끝`)).toBe(false);
    expect(looksLikeRrn(`900101${' '.repeat(200_000)}-${' '.repeat(200_000)}끝`)).toBe(false);
    expect(mask(`900101${' '.repeat(400_000)}끝`)).toContain('900101');
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(mask(`900101${' '.repeat(128_000)}-1234567`)).not.toContain('900101');
    expect(looksLikeRrn(`900101${' '.repeat(50)}-${'\t'.repeat(9)}1234567`)).toBe(true);
    expect(looksLikeRrn('900101 - 1234567')).toBe(true);
  });

  it('주민번호 모양 — 종전(사이 공백 무제한) 판정·가림과 같다(합성 입력 전수)', () => {
    // 종전 식(297fd65) — 짧은 입력에서만 돌린다(긴 공백에서는 제곱으로 느리다)
    const OLD_FULL = /(?<!\d)\d{6}\s*-?\s*[1-8]\d{6}(?!\d)/g;
    const OLD_DASH = /(?<!\d)\d{6}\s*-\s*[1-8]\d{0,6}(?!\d)/g;
    const OLD_LIKE = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\s*-?\s*[1-8]\d{6}(?!\d)/;
    const oldMask = (s: string) => s.replace(OLD_FULL, '******-*******').replace(OLD_DASH, '******-*******');
    const heads = ['900101', '991332', '123456', '0901011', '12345'];
    const seps = ['', ' ', '  ', '-', ' -', '- ', '    -    ', '\t\t\t\t', '\n', ' 　 -   ', '--', ' x '];
    const tails = ['1234567', '9234567', '1234', '12345678', '1', '0234567', '1234567가'];
    let n = 0;
    for (const a of heads) for (const s of seps) for (const t of tails) for (const pre of ['', '가', '7']) {
      const x = `${pre}${a}${s}${t}`;
      expect(mask(x), x).toBe(oldMask(x));
      expect(looksLikeRrn(x), x).toBe(OLD_LIKE.test(x));
      n++;
    }
    expect(n).toBe(heads.length * seps.length * tails.length * 3);
  });
});

describe('3차 보정 — 캐시·상한·빈 일치·방언·진단 표시', () => {
  const bad = (re: string, extra: object = {}) => compilePack(one1(re, extra)).errors?.[0]?.code;

  it('팩 파일 캐시는 내용으로 가린다 — 경로·크기·수정 시각이 같아도 바뀐 내용·공개 설정을 읽는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    try {
      const f = path.join(dir, 'a.json');
      const body = (re: string, priv: string) => JSON.stringify({ pack: 'c', private: 'PRIV', rules: [{ id: 'c-1', re, grade: 'A', reason: 'x', fix: 'f' }] }).replace('"PRIV"', priv);
      fs.writeFileSync(f, body('모래성', 'false'));
      const st = fs.statSync(f);
      const r1 = checkProse('모래성 바람개', loadPackSet({ dir }));
      expect(r1.counts.A).toBe(1);
      expect(r1.hits[0]).toHaveProperty('word', '모래성');
      // 같은 바이트 길이로 식만 바꾸고 수정 시각을 되돌린다
      fs.writeFileSync(f, body('바람개', 'false'));
      fs.utimesSync(f, st.atime, st.mtime);
      expect(fs.statSync(f).size).toBe(st.size);
      const r2 = checkProse('모래성 바람개', loadPackSet({ dir }));
      expect(r2.hits.map((h) => h.col)).toEqual([5]);
      // 공개 → 비공개(같은 길이: 'true ' 대 'false')
      fs.writeFileSync(f, body('바람개', 'true '));
      fs.utimesSync(f, st.atime, st.mtime);
      expect(fs.statSync(f).size).toBe(st.size);
      const r3 = checkProse('바람개', { ...loadPackSet({ dir }), allowFull: false });
      expect(r3.hits[0]).not.toHaveProperty('word');
      // 다시 공개로
      fs.writeFileSync(f, body('바람개', 'false'));
      fs.utimesSync(f, st.atime, st.mtime);
      expect(checkProse('바람개', { ...loadPackSet({ dir }), allowFull: false }).hits[0]).toHaveProperty('word', '바람개');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('부르는 쪽이 넘긴 팩 객체를 그 자리에서 고치면 다음 호출은 고친 규칙·공개 설정을 쓴다', () => {
    const p: { pack: string; private?: boolean; rules: { id: string; re: string; grade: string; reason: string; fix: string }[] } = rulePack([{ id: 'm-1', re: '모래성', grade: 'A', reason: 'x', fix: 'f' }]) as never;
    expect(checkProse('모래성 바람개', { packs: [p] }).hits.map((h) => h.col)).toEqual([1]);
    p.rules[0].re = '바람개';
    expect(checkProse('모래성 바람개', { packs: [p] }).hits.map((h) => h.col)).toEqual([5]);
    p.private = true;
    expect(checkProse('바람개', { packs: [p], allowFull: false }).hits[0]).not.toHaveProperty('word');
  });

  it('점검 중 멈춘 팩이 상한을 먼저 채워도 살아남은 팩의 걸림은 실린다', () => {
    let k = 0;
    const utter: Record<string, unknown> = { re: '가', curly: '나', brief: 'b' };
    Object.defineProperty(utter, 'min', { get() { if (k++ > 0) throw new Error('boom'); return 1; } });
    const dying = { pack: 'die', rules: [{ id: 'd-1', re: '모래성', grade: 'A', reason: 'x' }], checks: { utterQuotes: utter } };
    const good = rulePack([{ id: 'g-1', re: '바람개', grade: 'A', reason: 'x' }]);
    const r = checkProse(`${'모래성 '.repeat(20)}\n바람개 가`, { packs: [dying, good], cap: 5 });
    expect(r.counts).toEqual({ A: 1, B: 0 });
    expect(r.hits.map((h) => [h.line, h.col])).toEqual([[2, 1]]);
    expect(r.truncated).toBeUndefined();
  });

  it('한 줄에 상한을 훨씬 넘는 걸림 — 줄 안에서도 앞의 것부터 상한만큼', () => {
    const p = rulePack([{ id: 'b-1', re: '나비', grade: 'A', reason: 'x' }, { id: 'b-2', re: '가지', grade: 'A', reason: 'x' }]);
    const r = checkProse(`${'나비 '.repeat(3000)}가지`, { packs: [p], cap: 5 });
    expect(r.counts.A).toBe(3001);
    expect(r.hits.map((h) => h.col)).toEqual([1, 4, 7, 10, 13]);
    expect(r.truncated).toBe(true);
  });

  it('빈 글자로 맞을 수 있는 식은 컴파일에서 받지 않는다(조건부 빈 일치 포함)', () => {
    for (const re of ['(?=Z)|Z', 'Z|(?=Z)', '(?<![가-힣])(?=나)', 'a*', '(?:)', 'x|', '(|a)', 'a?', '(?:a|b?)', 'a{0,3}', '(?<=x)']) expect(bad(re), re).toBe('RE_EMPTY');
    for (const re of ['a+', '(?=a)a', 'a?b', '[가-힣]{2}', '(?<!x)모래', '(?:a|bc)+', 'a{1,3}', '(?P<n>가)(?P=n)?']) expect(bad(re), re).toBeUndefined();
  });

  it('PROSE_PACK_DIR 에서 팩을 하나도 못 읽으면(빈 폴더) PACK_DIR_EMPTY', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    try {
      expect(loadPackSet({ dir })).toEqual({ packs: [GENERIC_PACK], skipped: [{ code: 'PACK_DIR_EMPTY' }] });
      expect(checkProse('글', loadPackSet({ dir })).incomplete).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(?P=이름) — 반드시 지나간 이름 묶음이면 되참조로 옮기고, 지나지 않을 수 있으면 받지 않는다', () => {
    expect(checkProse('가가 가나 나나', { packs: [one1('(?P<n>[가나])(?P=n)')] }).counts.A).toBe(2);
    expect(bad('(?:(?P<n>가))?(?P=n)')).toBe('RE_COMPILE');
    expect(bad('(?P<n>가)?(?P=n)')).toBe('RE_COMPILE');
    expect(bad('(?P<n>가)|(?P=n)')).toBe('RE_COMPILE');
    expect(bad('(?P<n>가(?P=n))')).toBe('RE_COMPILE');
    expect(bad('(?P=n)(?P<n>가)')).toBe('RE_COMPILE');
  });

  it('글자 묶음 안의 이스케이프된 - 뒤 \\s 는 범위가 아니다([a\\-\\s])', () => {
    expect(bad('[a\\-\\s]Q')).toBeUndefined();
    expect(checkProse('aQ -Q  Q bQ', { packs: [one1('[a\\-\\s]Q')] }).counts.A).toBe(3);
    expect(bad('[a-\\s]Q')).toBe('RE_COMPILE');
  });

  it('withheld 는 끝까지 살아남은 팩으로 정한다', () => {
    let k = 0;
    const utter: Record<string, unknown> = { re: '가', curly: '나', brief: 'b' };
    Object.defineProperty(utter, 'min', { get() { if (k++ > 0) throw new Error('boom'); return 1; } });
    const dying = { pack: 'die', private: true, rules: [{ id: 'd-1', re: '모래성', grade: 'A', reason: 'x' }], checks: { utterQuotes: utter } };
    const r = checkProse('모래성 가', { packs: [GENERIC_PACK, dying], detail: 'full', allowFull: false });
    expect(r.skipped).toEqual([{ code: 'PACK_RUNTIME' }]);
    expect(r.withheld).toBeUndefined();
  });

  it('stderr 의 JSON 오류 줄은 고정 글뿐(위치 숫자도 싣지 않는다)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fs.writeFileSync(path.join(dir, 'a.json'), '{"pack": 12345678 9}');
      loadPackSet({ dir });
      const logged = spy.mock.calls.flat().map(String).join('\n');
      expect(logged).toBe('[check_prose] 팩 파일 1번째를 읽지 못했습니다(JSON)');
    } finally {
      spy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('규칙 id 는 rules·density 를 통틀어 겹치지 않아야 한다', () => {
    const p = { pack: 'u', rules: [{ id: 'u-1', re: '가', grade: 'A', reason: 'x' }], density: [{ id: 'u-1', re: '나', limit: 1, min: 1, brief: 'b' }] };
    expect(validatePack(p)).toEqual([{ id: 'u-1', code: 'DENSITY_ID_DUP' }]);
  });

  it('제목 검사는 원본 검사기처럼 줄 앞뒤 공백을 벗긴 뒤 줄 첫머리에서 맞춘다(prose_check.py: re.match(HEAD_LINE_RE, l.strip()))', () => {
    const p = { pack: 'h', rules: [], checks: { heads: { line: '^##\\s+(.+)$', re: '없음$', maxWords: 3, brief: '제목' } } };
    expect(checkProse('   ## 하나 둘 셋 넷   ', { packs: [p] }).notes).toHaveLength(1);
  });
});

describe('execAll — matchAll 과 같은 일치(식 복제 없이)', () => {
  const pick = (ms: RegExpMatchArray[]) => ms.map((m) => [m.index, ...m]);
  const SMILE = String.fromCodePoint(0x1f600);
  it.each([
    ['a|', 'gu', `xa${SMILE}a`],
    ['(?:)', 'gu', `가${SMILE}나`],
    ['(?:)', 'g', SMILE],
    ['(\\d)?', 'gu', '1a2'],
    ['(?<=a)', 'gu', 'aaa'],
  ])('%s /%s', (src, flags, text) => {
    const rx = new RegExp(src, flags);
    expect(pick(execAll(rx, text))).toEqual(pick([...text.matchAll(rx)]));
    expect(rx.lastIndex).toBe(0);
  });
  it('g 없는 식은 거절한다', () => {
    expect(() => execAll(/a/u, 'a')).toThrow(TypeError);
  });
});
