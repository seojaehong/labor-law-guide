// 퇴고 check_prose — 규칙 실행기·팩 로더·출력 정책. 합성 문장·합성 팩만 쓴다(실제 사건 글·비공개 규칙 아님).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProse, loadPacks, GENERIC_PACK } from '../../tools/k-labor/lib/prose/check.mjs';

const PACK = {
  pack: 'test',
  version: 't1',
  rules: [
    { id: 't-1', re: '모래성', flags: 'm', grade: 'A', reason: '비유 표현', fix: '근거가 약하다' },
    { id: 't-2', re: '(?<![가-힣])아마도', flags: 'm', grade: 'B', reason: '추측 표현', fix: '근거를 쓴다' },
    { id: 't-3', re: '바라건대', flags: 'm', grade: 'A', genres: ['legal'], reason: '서술 표준', fix: '삭제' },
    { id: 't-q1', scope: 'quote', target: 'line', re: '[가-힣](\\s*)…(\\s*)[가-힣]', grade: 'A', reason: '인용 형식', fix: '문장 통째로' },
    { id: 't-q2', scope: 'quote', target: 'trim', once: true, re: '^>\\s*\\((사실관계|법리)\\)', grade: 'A', reason: '인용 형식', fix: '칸 이름 금지' },
  ],
  freq: { items: [{ word: '이른바', avg: 1 }], msg: '%s %d회(기준 %.1f)', brief: '자주 쓰는 표현' },
  density: [{ id: 't-d1', re: '[이가]\\s*아니라', limit: 2.5, min: 4, genres: ['legal'], reason: '대구가 많다' }],
  checks: {
    utterQuotes: { min: 2, msg: '발언 「」 %d회(“ ” %d회)', brief: '발언 인용 부호' },
    heads: { genres: ['legal'], maxWords: 5, re: '(할|합니다)(\\s|$)', msg: '제목 %d개: %s', brief: '목차 제목 형식' },
    sentences: { genres: ['legal'], minSents: 3, maxLen: 20, ratio: 0.15, run: 4, msgLong: '긴 문장 %d/%d(%.0f%%)', briefLong: '긴 문장', msgRun: '어미 반복 %d곳', briefRun: '어미 반복' },
  },
};

describe('규칙 실행', () => {
  it('본문 줄에서 A·B 를 찾고 줄·칸·길이를 준다', () => {
    const r = checkProse('첫 줄\n이 주장은 모래성입니다. 아마도 그렇습니다.', { packs: [PACK], detail: 'full' });
    expect(r.counts).toEqual({ A: 1, B: 1 });
    const a = r.hits.find((h) => h.grade === 'A');
    expect(a).toMatchObject({ line: 2, col: 7, len: 3, word: '모래성' });
  });

  it('> 인용 줄과 [관련 판결] 줄은 본문 규칙을 보지 않고 인용 규칙만 본다', () => {
    const doc = '> 원문에 모래성이라는 말이 있다 … 그렇다\n> (사실관계) 원고는 아마도\n[관련 판결] 모래성 사건';
    const r = checkProse(doc, { packs: [PACK], detail: 'full' });
    expect(r.hits.map((h) => h.rule)).toEqual(['t-q1', 't-q2']);
  });

  it('표 줄은 「」·“ ” 안을 가리고 B 등급을 건너뛴다', () => {
    const r = checkProse('| 「모래성」 | 아마도 | 모래성 |', { packs: [PACK], detail: 'full' });
    expect(r.hits.map((h) => [h.rule, h.col])).toEqual([['t-1', 17]]);
  });

  it('장르가 legal 이 아니면 legal 전용 규칙·밀도·제목·문장 검사를 끈다', () => {
    const doc = '바라건대 살펴 주십시오.';
    expect(checkProse(doc, { packs: [PACK], genre: 'legal' }).counts.A).toBe(1);
    expect(checkProse(doc, { packs: [PACK], genre: 'consulting' }).counts.A).toBe(0);
  });

  it('빈도·밀도·발언 인용·제목·문장 길이를 알린다', () => {
    const body = ['## 1. 무엇을 해야 할', '이른바 이른바 이른바 이른바 표현.', '「가」라고 했고 「나」라고 했다.']
      .concat(Array.from({ length: 4 }, () => '이것은 사실이 아니라 의견입니다.'))
      .concat(Array.from({ length: 4 }, () => '아주 길고 긴 문장이 여기에 계속 이어지고 있습니다.'))
      .join('\n');
    const r = checkProse(body, { packs: [PACK], detail: 'full' });
    const kinds = r.notes.map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['freq', 'density', 'utterQuotes', 'heads', 'sentences.long', 'sentences.run']));
    expect(r.notes.find((n) => n.kind === 'freq').text).toBe('이른바 4회(기준 1.0)');
  });
});

describe('출력 정책 — brief 는 규칙 원문·대안·기준값을 싣지 않는다(증류 방지)', () => {
  it('brief(기본)는 줄·칸·길이·등급·짧은 사유·참조 해시만', () => {
    const doc = '이 주장은 모래성입니다.\n' + Array.from({ length: 5 }, () => '사실이 아니라 의견이다.').join('\n') + '\n이른바 이른바 이른바 이른바';
    const r = checkProse(doc, { packs: [PACK] });
    for (const h of r.hits) expect(Object.keys(h).sort()).toEqual(['col', 'grade', 'len', 'line', 'reason', 'ref']);
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/모래성|근거가 약하다|\[이가\]|2\.5|기준 1\.0|t-1|t-d1/);
  });

  it('full 은 단어·대안·규칙 id 를 준다', () => {
    const r = checkProse('모래성', { packs: [PACK], detail: 'full' });
    expect(r.hits[0]).toMatchObject({ word: '모래성', fix: '근거가 약하다', rule: 't-1', pack: 'test' });
  });
});

describe('팩 읽기', () => {
  it('PROSE_PACK_DIR 의 json 을 범용 팩 뒤에 붙이고, 없으면 범용 팩만 쓴다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prose-pack-'));
    fs.writeFileSync(path.join(dir, 'test.json'), JSON.stringify(PACK));
    expect(loadPacks({ dir }).map((p) => p.pack)).toEqual([GENERIC_PACK.pack, 'test']);
    expect(loadPacks({ dir: path.join(dir, 'none') }).map((p) => p.pack)).toEqual([GENERIC_PACK.pack]);
  });

  it('정규식이 깨진 팩은 그 규칙 이름과 함께 멈춘다', () => {
    expect(() => checkProse('글', { packs: [{ pack: 'bad', rules: [{ id: 'b-1', re: '(', grade: 'A', reason: 'x' }] }] })).toThrow(/b-1/);
  });

  it('범용 팩(im-not-ai 유래)은 문맥 없는 「직조」를 잡지 않고, 상투 비유는 잡는다', () => {
    const g = [GENERIC_PACK];
    expect(checkProse('조직조정 절차를 거쳤다.', { packs: g }).hits).toHaveLength(0);
    expect(checkProse('결과를 가르는 것은 시간이다.', { packs: g }).hits).toHaveLength(1);
  });
});
