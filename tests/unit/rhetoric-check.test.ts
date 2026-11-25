// 퇴고 AI 수사 검사(check_rhetoric) — 공개 틀·해석기 + 비공개 팩 절(rhetoric, format 2).
// 실제 팩(식·낱말·규칙·판정 단계·결정표)은 공개 저장소에 없다. 여기서는 뜻 없는 합성 음절로 지은 장난감 팩만 쓴다.
// 옛 파이썬 검사기와의 줄 단위 대조는 비공개 표본으로 따로 한다.
import { describe, expect, it } from 'vitest';
import {
  checkRhetoric,
  compileRhetoricPack,
  RHETORIC_CODE_RE,
  RHETORIC_CODE_WORDS,
  RHETORIC_TRACKS,
} from '../../tools/k-labor/lib/prose/rhetoric.mjs';
import { toyRhetoric, toyRule, type ToySection } from '../fixtures/prose/toy-rhetoric';

const E = String.fromCodePoint(0x1f600);

function compiled(sec: ToySection = toyRhetoric()) {
  const r = compileRhetoricPack(sec);
  if (!('pack' in r)) throw new Error(JSON.stringify(r.errors));
  return r.pack;
}
const errs = (sec: unknown) => {
  const r = compileRhetoricPack(sec);
  return 'errors' in r ? r.errors : null;
};
const run = (text: string, track = 'legal', sec: ToySection = toyRhetoric()) =>
  checkRhetoric(text, { pack: compiled(sec), track }).hits.map((h) => [h.line, h.grade, h.frag, h.alt, h.family, h.rule]);
const grades = (text: string, sec: ToySection, track = 'legal') =>
  checkRhetoric(text, { pack: compiled(sec), track }).hits.map((h) => `${h.line}${h.grade}:${h.rule}`);

describe('compileRhetoricPack — 칸 번호·고정 코드', () => {
  it('트랙 넷, 코드가 쓰는 칸은 번호만', () => {
    expect(RHETORIC_TRACKS).toEqual(['legal', 'blog', 'consult', 'lecture']);
    expect(RHETORIC_CODE_RE).toHaveLength(45);
    expect(RHETORIC_CODE_RE[0]).toBe('r01');
    expect(RHETORIC_CODE_WORDS).toHaveLength(11);
    expect([...RHETORIC_CODE_RE, ...RHETORIC_CODE_WORDS].every((k: string) => /^[rw]\d\d$/.test(k))).toBe(true);
  });
  it('형식·판이 다르면 RHETORIC_FORMAT', () => {
    expect(errs({ ...toyRhetoric(), format: 1 })).toEqual([{ code: 'RHETORIC_FORMAT' }]);
    expect(errs({ ...toyRhetoric(), version: '' })).toEqual([{ code: 'RHETORIC_FORMAT' }]);
  });
  it('빈 규칙·등급 없는 규칙·모르는 트랙은 오류(조용히 통과하지 않는다)', () => {
    expect(errs(toyRhetoric({ rules: [] }))).toEqual([{ code: 'RULE_SHAPE' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ grades: {} })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ grades: { legal: null } })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ grades: { nope: 'A' } })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule(), toyRule()] }))).toEqual([{ code: 'RULE_DUP', id: 'rule#2' }]);
  });
  it('없는 칸을 쓰거나, 쓰지 않는 칸이 있거나, 코드 칸이 빠지면 오류', () => {
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['s', 'r99', 'v04'], 'x']]] })] })))
      .toEqual([{ code: 'RHETORIC_SLOT', id: 'r99' }]);
    expect(errs(toyRhetoric({ re: { r98: ['뷁', ''] } }))).toEqual([{ code: 'RHETORIC_SLOT_UNUSED', id: 'r98' }]);
    const a = toyRhetoric();
    delete a.re.r10;
    expect(errs(a)).toEqual([{ code: 'RHETORIC_SLOT', id: 'r10' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['1'], ['A', 'w99']]]] })] })))
      .toEqual([{ code: 'RHETORIC_WORD', id: 'w99' }]);
    expect(errs(toyRhetoric({ words: { w98: 'x' } }))).toEqual([{ code: 'RHETORIC_WORD_UNUSED', id: 'w98' }]);
    // 한 낱말 칸을 목록과 글 양쪽으로 쓰면
    expect(errs(toyRhetoric({
      words: { w12: ['뷁'] },
      rules: [toyRule({ steps: [[[['in', 'v03', 'w12'], 'x'], [['eq', 'v03', ['w', 'w12']], 'B']]] })],
    }))).toEqual([{ code: 'RHETORIC_WORD', id: 'w12' }]);
  });
  it('빈 글자에 맞을 수 있는 식 — 규칙·되풀이 코드 칸·가림 칸은 오류, 한 번만 찾는 칸은 된다', () => {
    expect(errs(toyRhetoric({ rules: [toyRule({ re: '퀩*' })] }))).toEqual([{ code: 'RE_EMPTY', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ re: { r29: [';*', ''] } }))).toEqual([{ code: 'RE_EMPTY', id: 'r29' }]);
    expect(errs(toyRhetoric({ re: { r47: ['<*', ''] } }))).toEqual([{ code: 'RE_EMPTY', id: 'r47' }]);
    expect(errs(toyRhetoric({ re: { r08: [';*$', ''] } }))).toBeNull();
  });
  it('깨진 식은 RE_COMPILE — 식 원문은 싣지 않는다', () => {
    const r = errs(toyRhetoric({ rules: [toyRule({ re: '(?i)퀩뷁' })] }));
    expect(r).toEqual([{ code: 'RE_COMPILE', id: 'rule#1' }]);
    expect(JSON.stringify(r)).not.toContain('퀩');
  });
  it('결정표 모양 — 빠진 술어·빈 표·등급 조건은 규칙 단계에서만·규칙 전용 보기는 규칙에서만·모르는 이름', () => {
    const a = toyRhetoric();
    delete a.pred;
    expect(errs(a)).toEqual([{ code: 'RHETORIC_TABLE', id: 'pred' }]);
    expect(errs(toyRhetoric({ t1: { groups: [1, 2, 3], chars: [', ', ' ;'], chain: [] } })))
      .toEqual([{ code: 'RHETORIC_TABLE', id: 't1' }]);
    expect(errs(toyRhetoric({ t1: { groups: [1, 2, 3], chars: [', ', ' ;'], chain: [[['g', 'A'], 'B']] } })))
      .toEqual([{ code: 'RHETORIC_TABLE', id: 't1' }]);
    expect(errs(toyRhetoric({ t3: [[['eq', ['grp', 1], 'e1'], 'c']] }))).toEqual([{ code: 'RHETORIC_TABLE', id: 't3' }]);
    // 다른 문맥의 번호 보기는 받지 않는다(규칙 단계에서 t1 보기 k.. 를 쓰면)
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['nz', 'k01'], 'x']]] })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    // 받침 조건은 받침 번호(0~27)까지 적어야 한다
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['M', 'v03'], 'x']]] })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['M', 'v03', 28], 'x']]] })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['nz', 'nosuch'], 'x']]] })] })))
      .toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
    expect(errs(toyRhetoric({ rules: [toyRule({ steps: [[[['zz'], 'x']]] })] }))).toEqual([{ code: 'RULE_SHAPE', id: 'rule#1' }]);
  });
  it('승격 기준은 나올 수 있는 id(규칙 id·결정표·코드가 내는 id)만', () => {
    expect(errs(toyRhetoric({ promote: [[['k-9'], 2]] }))).toEqual([{ code: 'PROMOTE_SHAPE' }]);
    expect(errs(toyRhetoric({ promote: [[['k-1'], 0]] }))).toEqual([{ code: 'PROMOTE_SHAPE' }]);
    expect(errs(toyRhetoric({ promote: [[['k-1', 'z7'], 2]] }))).toBeNull();
  });
});

describe('checkRhetoric — 장난감 팩', () => {
  it('규칙은 트랙별 등급대로 — lecture 는 칸이 없으면 legal 등급, 칸이 null 이면 보지 않는다', () => {
    expect(run('앞 퀩뷁 뒤;')).toEqual([[1, 'A', '퀩뷁', 'a-1', 'f-1', 'k-1']]);
    expect(run('앞 퀩뷁 뒤;', 'blog')).toEqual([[1, 'B', '퀩뷁', 'a-1', 'f-1', 'k-1']]);
    expect(run('앞 퀩뷁 뒤;', 'consult')).toEqual([]);
    expect(run('앞 퀩뷁 뒤;', 'lecture')).toEqual([[1, 'A', '퀩뷁', 'a-1', 'f-1', 'k-1']]);
    expect(run('앞 퀩뷁 뒤;', 'lecture', toyRhetoric({ rules: [toyRule({ grades: { legal: 'A', lecture: null } })] }))).toEqual([]);
  });
  it('판정 단계 — 단계마다 처음 참인 행(x 버림 · 등급 · [등급, 낱말 칸] = 등급과 출력 id), 뒤 단계는 바뀐 등급을 본다', () => {
    const drop = toyRhetoric({ re: { r50: ['뛣', ''] }, rules: [toyRule({ steps: [[[['s', 'r50', 'v04'], 'x']]] })] });
    expect(grades('퀩뷁 뛣;', drop)).toEqual([]);
    expect(grades('퀩뷁 쀼;', drop)).toEqual(['1A:k-1']);
    const chain = toyRhetoric({
      re: { r51: ['뷁', ''] },
      words: { w12: 'k-2' },
      rules: [toyRule({ steps: [[[['s', 'r51', 'v03'], 'B']], [[['g', 'B'], ['A', 'w12']]]] })],
    });
    expect(grades('퀩뷁;', chain)).toEqual(['1A:k-2']);
    // 받침 번호 조건 — 일치 끝 글자의 받침 번호가 같을 때만
    const n = ('뷁'.codePointAt(0)! - 0xac00) % 28;
    const coda = (k: number) => toyRhetoric({ rules: [toyRule({ steps: [[[['M', 'v03', k], 'B']]] })] });
    expect(grades('퀩뷁;', coda(n))).toEqual(['1B:k-1']);
    expect(grades('퀩뷁;', coda((n + 1) % 28))).toEqual(['1A:k-1']);
  });
  it('규칙 문맥의 보기 — 일치 앞·뒤, 일치 뒤 n 글자, 파이썬 find 와 같은 자르기', () => {
    const views = toyRhetoric({
      rules: [toyRule({
        steps: [[[['and',
          ['eq', 'v06', ['q', '앞 ']],
          ['eq', 'v07', ['q', ' 뒤;']],
          ['eq', ['ah', 2], ['q', ' 뒤']],
          ['eq', ['aft', ['q', '가나다라'], ['q', '나다']], ['q', '라']],
          // 못 찾으면 파이썬 s[s.find(t) + len(t):] = s[-1 + 2:]
          ['eq', ['aft', ['q', '가나다라'], ['q', '마바']], ['q', '나다라']],
        ], 'B']]],
      })],
    });
    expect(grades('앞 퀩뷁 뒤;', views)).toEqual(['1B:k-1']);
  });
  it('unit 거르기 — 제목 줄에서는 보지 않는 규칙', () => {
    const sec = toyRhetoric({ rules: [toyRule({ unit: ['?', 'u2'] })] });
    expect(grades('# 퀩뷁;', sec)).toEqual([]);
    expect(grades('퀩뷁;', sec)).toEqual(['1A:k-1']);
  });
  it('가림 — 묶음만 남기기·같은 길이로 덮기(상한을 넘으면 덮지 않는다), 줄 수는 그대로', () => {
    expect(grades('{퀩뷁} 쀼;', toyRhetoric())).toEqual(['1A:k-1']);
    expect(grades('<<퀩뷁>> 쀼;', toyRhetoric())).toEqual([]);
    expect(grades('<<퀩뷁 퀩뷁>> 쀼;', toyRhetoric())).toEqual(['1A:k-1', '1A:k-1']);
    expect(grades('<<퀩\n뷁>>\n퀩뷁;', toyRhetoric())).toEqual(['3A:k-1']);
  });
  it('\\r\\n 줄바꿈도 같은 행 번호 · chars = 가린 뒤 공백을 뺀 코드포인트 수', () => {
    expect(grades('꿿;\r\n\r\n퀩뷁;', toyRhetoric())).toEqual(['3A:k-1']);
    const pack = compiled();
    expect(checkRhetoric('퀩뷁 쀼;', { pack, track: 'legal' }).chars).toBe(4);
    expect(checkRhetoric('<<퀩뷁>> 쀼;', { pack, track: 'legal' }).chars).toBe(8);
  });
  it('승격 기준 미달이면 A 를 B 로', () => {
    const sec = toyRhetoric({ promote: [[['k-1'], 2]] });
    expect(grades('퀩뷁;', sec)).toEqual(['1B:k-1']);
    expect(grades('퀩뷁 퀩뷁;', sec)).toEqual(['1A:k-1', '1A:k-1']);
  });
  it('같은 단위에서 겹치는 적중은 높은 등급 하나만', () => {
    const sec = toyRhetoric({
      rules: [toyRule({ grades: { legal: 'B' } }), toyRule({ id: 'k-2', re: '뷁쀼', alt: 'a-2' })],
    });
    expect(grades('퀩뷁쀼;', sec)).toEqual(['1A:k-2']);
  });
  it('t1 단계 — 묶음(k01·k02·k03) 보기와 결정표, 걸리는 행이 없으면 A', () => {
    const sec = toyRhetoric({
      re: { r52: ['뛣', ''] },
      t1: {
        groups: [1, 2, 3],
        chars: [', ', ' ;'],
        chain: [[['s', 'r52', 'k06'], 'x'], [['eq', 'k02', ['q', '뷁']], 'B']],
      },
      rules: [toyRule({ re: '(퀩)(뷁)?(쀼)', steps: ['t1'] })],
    });
    expect(grades('퀩쀼 꿿;', sec)).toEqual(['1A:k-1']);
    expect(grades('퀩뷁쀼 꿿;', sec)).toEqual(['1B:k-1']);
    expect(grades('퀩쀼 뛣;', sec)).toEqual([]);
  });
  it('이웃 두 조각 결정표 — t3(낱말 칸 교정문·id)·c(코드 칸 id)·t2(조건부 등급)', () => {
    const cnd = ['and', ['ew', 'e1', ['q', '퀩;']], ['sw', 'e2', ['q', '뷁']]];
    const none = toyRule({ re: '쀼쀼' });
    const p = toyRhetoric({ words: { w13: 'a-pair', w14: 'k-pair' }, t3: [[cnd, { g: 'B', alt: 'w13', id: 'w14' }]], rules: [none] });
    expect(run('꿿 퀩; 뷁 꿿;', 'legal', p)).toEqual([[1, 'B', '꿿 퀩;', 'a-pair', 'z5', 'k-pair']]);
    const two = toyRhetoric({ t3: [[cnd, 'c']], rules: [none] });
    expect(run('꿿 퀩; 뷁 꿿;', 'legal', two)).toEqual([[1, 'B', '꿿 퀩;', 'z6', 'z5', 'z7']]);
    const rev = toyRhetoric({
      words: { w15: 'k-rev', w16: 'a-rev' },
      t2: [[cnd, { id: 'w15', alt: 'w16', comma: null, g: [['has', 'e2', ['q', '꿿']], 'A', 'B'] }]],
      rules: [none],
    });
    expect(run('꿿 퀩; 뷁 꿿;', 'legal', rev)).toEqual([[1, 'A', '꿿 퀩; 뷁 꿿;', 'a-rev', 'z5', 'k-rev']]);
    expect(run('꿿 퀩; 뷁 쀼;', 'legal', rev)).toEqual([[1, 'B', '꿿 퀩; 뷁 쀼;', 'a-rev', 'z5', 'k-rev']]);
  });
  it('BMP 밖 글자 — 조각은 코드포인트로 자르고, 줄 머리 닻은 서로게이트 사이에서 맞지 않는다', () => {
    const long = toyRhetoric({ rules: [toyRule({ re: '퀩[^;]*' })] });
    const r = checkRhetoric(`퀩${E.repeat(40)};`, { pack: compiled(long), track: 'legal' });
    expect(r.hits.map((h) => h.frag)).toEqual([`퀩${E.repeat(29)}`]);
    expect(r.chars).toBe(42);
    const head = toyRhetoric({ rules: [toyRule({ re: '^퀩', flags: 'm' })] });
    expect(grades(`${E}퀩;\n퀩뷁;`, head)).toEqual(['2A:k-1']);
  });
  it('컴파일 결과는 여러 번 써도 같다', () => {
    const pack = compiled();
    const a = checkRhetoric('퀩뷁 쀼;', { pack, track: 'legal' });
    expect(checkRhetoric('퀩뷁 쀼;', { pack, track: 'legal' })).toEqual(a);
  });
});
