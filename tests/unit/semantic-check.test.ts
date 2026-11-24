// 퇴고 의미범주 검사(check_semantic) — 공개 틀 + 비공개 팩 절(semantic, format 2).
// 실제 팩(식·낱말·태그·묶음 이름)은 공개 저장소에 없다. 여기서는 뜻 없는 합성 글자로 지은 장난감 팩만 쓴다.
// 칸·묶음·태그 이름도 아무렇게나 붙였다. 옛 파이썬 검사기와의 줄 단위 대조는 비공개 표본으로 따로 한다.
import { describe, expect, it } from 'vitest';
import { checkSemantic, compileSemanticPack } from '../../tools/k-labor/lib/prose/semantic.mjs';

type Sec = Record<string, unknown> & { re: Record<string, [string, string]>; rules: unknown[] };
const toy = (): Sec => ({
  format: 2,
  version: 'v-toy',
  re: {
    q1: ['(?P<g1>퀩|쀼)~(?P<g3>꿿+)', ''],
    q2: ['(?P<g2>뷁)@(?P<g1>퀩)', ''],
    q3: ['뷁@퀩@(?P<g2>뷁)', ''],
    q4: ['^\\s*%', ''],
    q5: ['<<[^>]*>>', ''],
    q6: ['퀩~꿿꿿', ''],
  },
  rules: [['q1', 't1'], ['q2', 't2'], ['q3', 't3']],
  skip: 'q4',
  span: 'q5',
  except: 'q6',
  anchor: ['g3', 'g2', 'g1'],
  allowBy: ['g2', 'g1'],
  fragMax: 12,
  allow: { blog: ['쀼'], legal: [] },
});

const MAIN = [
  '퀩~꿿 그리고 뷁@퀩.', // 1: 두 규칙
  '% 퀩~꿿', // 2: 건너뛰는 줄
  '<<퀩~꿿>> 밖', // 3: 가린 구간 안에서 시작
  '퀩~꿿꿿 이다', // 4: 기준 자리(g3)가 예외구 안
  '쀼~꿿', // 5: blog 에서는 허용 낱말
  '뷁@퀩@뷁', // 6: 겹친 조각은 긴 쪽만
  `퀩~${'꿿'.repeat(11)}`, // 7: 조각 13자 > 상한 12
  `쀼~${'꿿'.repeat(10)}`, // 8: 조각 12자 = 상한
].join('\n');

const run = (text: string, genre: string, sec: Sec = toy()) => {
  const c = compileSemanticPack(sec);
  if (!('pack' in c)) throw new Error(JSON.stringify(c.errors));
  return checkSemantic(text, { pack: c.pack, genre }).hits.map((h) => [h.line, h.tag, h.frag]);
};
const errs = (sec: unknown) => {
  const r = compileSemanticPack(sec);
  return 'errors' in r ? r.errors : null;
};

describe('compileSemanticPack — 빈 절·모르는 칸은 오류(고정 코드만)', () => {
  it('형식·판·빈 규칙', () => {
    expect(errs({ ...toy(), format: 1 })).toEqual([{ code: 'SEMANTIC_FORMAT' }]);
    expect(errs({ ...toy(), version: '' })).toEqual([{ code: 'SEMANTIC_FORMAT' }]);
    expect(errs({ ...toy(), rules: [] })).toEqual([{ code: 'SEMANTIC_FORMAT' }]);
  });
  it('없는 칸을 쓰거나 쓰지 않는 칸이 있으면', () => {
    const a = toy();
    a.rules = [...a.rules, ['q9', 't9']];
    expect(errs(a)).toEqual([{ code: 'SEMANTIC_SLOT', id: 'q9' }]);
    const b = toy();
    b.re.q8 = ['뷁', ''];
    expect(errs(b)).toEqual([{ code: 'SEMANTIC_SLOT_UNUSED', id: 'q8' }]);
  });
  it('깨진 식·빈 글자에 맞는 되풀이 식 — 식 원문은 싣지 않는다', () => {
    const a = toy();
    a.re.q1 = ['(?i)퀩', ''];
    const r = errs(a);
    expect(r).toEqual([{ code: 'RE_COMPILE', id: 'q1' }]);
    expect(JSON.stringify(r)).not.toContain('퀩');
    const b = toy();
    b.re.q2 = ['(?P<g2>뷁)*', ''];
    expect(errs(b)).toEqual([{ code: 'RE_EMPTY', id: 'q2' }]);
    const c = toy();
    c.re.q5 = ['<*', ''];
    expect(errs(c)).toEqual([{ code: 'RE_EMPTY', id: 'q5' }]);
  });
  it('예외구는 null 이면 없음, 키가 없으면 오류 · 허용 목록은 빠지면 오류(빈 목록은 된다)', () => {
    const a = toy();
    a.except = null;
    delete a.re.q6;
    expect(errs(a)).toBeNull();
    const b = toy();
    delete b.except;
    delete b.re.q6;
    expect(errs(b)).toEqual([{ code: 'SEMANTIC_SLOT', id: 'except' }]);
    const c = toy();
    delete c.allow;
    expect(errs(c)).toEqual([{ code: 'SEMANTIC_ALLOW' }]);
    expect(errs({ ...toy(), allow: {} })).toBeNull();
  });
  it('묶음 이름·길이 상한 모양', () => {
    expect(errs({ ...toy(), anchor: [] })).toEqual([{ code: 'SEMANTIC_GROUPS' }]);
    expect(errs({ ...toy(), fragMax: 0 })).toEqual([{ code: 'SEMANTIC_FRAG' }]);
  });
});

describe('checkSemantic — 장난감 팩', () => {
  it('건너뛰는 줄·가린 구간·예외구·길이 상한은 빼고, 같은 줄 겹친 조각은 긴 쪽만', () => {
    expect(run(MAIN, 'legal')).toEqual([
      [1, 't1', '퀩~꿿'],
      [1, 't2', '뷁@퀩'],
      [5, 't1', '쀼~꿿'],
      [6, 't3', '뷁@퀩@뷁'],
      [8, 't1', `쀼~${'꿿'.repeat(10)}`],
    ]);
  });
  it('장르별 허용 낱말은 allowBy 차례로 처음 값이 있는 묶음과 견준다', () => {
    expect(run(MAIN, 'blog')).toEqual([
      [1, 't1', '퀩~꿿'],
      [1, 't2', '뷁@퀩'],
      [6, 't3', '뷁@퀩@뷁'],
    ]);
  });
  it('모르는 장르는 허용 낱말 없이', () => {
    expect(run('쀼~꿿', 'unknown-genre')).toEqual([[1, 't1', '쀼~꿿']]);
  });
  it('줄 나눔은 파이썬 파일 읽기 + splitlines 와 같다(\\r\\n·\\r·U+2028)', () => {
    expect(run('앞줄\r\n퀩~꿿\r쀼~꿿', 'legal')).toEqual([[2, 't1', '퀩~꿿'], [3, 't1', '쀼~꿿']]);
    expect(run(`퀩~꿿${String.fromCharCode(0x2028)}쀼~꿿`, 'legal')).toEqual([[1, 't1', '퀩~꿿'], [2, 't1', '쀼~꿿']]);
  });
  it('BMP 밖 글자가 섞여도 위치·길이는 코드포인트로', () => {
    const E = String.fromCodePoint(0x1f600);
    // 조각 = 쀼~ + 꿿 10 + E = 13 코드포인트(UTF-16 으로는 14) — 상한 12 를 넘어 빠진다
    const sec = toy();
    sec.re.q1 = ['(?P<g1>퀩|쀼)~(?P<g3>[꿿\\U0001F600]+)', ''];
    expect(run(`${E}쀼~${'꿿'.repeat(9)}${E}`, 'legal', sec)).toEqual([[1, 't1', `쀼~${'꿿'.repeat(9)}${E}`]]);
    expect(run(`${E}쀼~${'꿿'.repeat(10)}${E}`, 'legal', sec)).toEqual([]);
  });
});
