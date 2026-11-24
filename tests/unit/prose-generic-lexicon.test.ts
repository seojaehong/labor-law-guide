// 퇴고 범용 팩 — im-not-ai lexicon v1.3 전 115항목 흡수(장르 판정·좁힌 식·물러서기).
// 예문은 상류가 만든 합성 문장만 쓴다(tests/fixtures/prose/imnotai-lexicon-examples.json, MIT). 실제 사건 글·비공개 팩 규칙 없음.
import { describe, expect, it } from 'vitest';
import { checkProse, compilePack, GENERIC_PACK, GENRES, validatePack } from '../../tools/k-labor/lib/prose/check.mjs';
import EX from '../fixtures/prose/imnotai-lexicon-examples.json';

type Rule = { id: string; src: string; re: string; resume?: string; exclude?: string; grade: string; reason: string; fix: string; genres?: string[] };
const RULES = GENERIC_PACK.rules as Rule[];
const ENTRIES = EX.entries as Record<string, { tier: string; skip: string[]; pos: string[]; neg: string[] }>;
// 법률 장르에서 둔다(legal 에서 돌지 않는다) — 판정표 toego_lexicon_keep_change_261124
const LEGAL_KEEP = ['L-34', 'INJ-07', 'X-01', 'X-12', 'X-16'];
const one = (r: Rule) => ({ ...GENERIC_PACK, rules: [r] });
const runsIn = (r: Rule) => (r.genres ?? GENRES).find((g) => g !== 'legal') ?? (r.genres ?? GENRES)[0];
const B = (s: string, r: Rule, genre: string) => checkProse(s, { packs: [one(r)], genre }).counts.B;

describe('범용 팩 모양', () => {
  it('상류 115항목을 하나씩 — 전부 B, 규칙 id 는 gen-<상류 id>, 팩 검증·컴파일 오류 0', () => {
    expect(RULES).toHaveLength(115);
    expect(new Set(RULES.map((r) => r.src))).toEqual(new Set(Object.keys(ENTRIES)));
    for (const r of RULES) {
      expect(r.id).toBe(`gen-${r.src}`);
      expect(r.grade).toBe('B');
      expect(r.fix).toContain(`im-not-ai ${r.src}`);
    }
    expect(validatePack(GENERIC_PACK)).toEqual([]);
    expect(compilePack(GENERIC_PACK).errors).toBeUndefined();
    expect(GENERIC_PACK.yield).toBe(true);
  });

  it('장르 — legal 은 판정표의 keep 만 빼고, 상류가 「일반」을 건너뛰면 general, 「보고서」를 건너뛰면 consulting 을 뺀다', () => {
    for (const r of RULES) {
      const skip = ENTRIES[r.src].skip;
      const want = GENRES.filter((g) => !(g === 'legal' && LEGAL_KEEP.includes(r.src)) && !(g === 'general' && skip.includes('일반')) && !(g === 'consulting' && skip.includes('보고서')));
      expect(r.genres ?? GENRES, r.src).toEqual(want);
    }
  });

  it('조건부(conditional) 항목은 사유에 「문맥 판단」을 단다', () => {
    for (const r of RULES) expect(r.reason.includes('문맥 판단'), r.src).toBe(ENTRIES[r.src].tier !== 'change');
  });
});

describe('상류 예문 — 양성은 걸리고 음성은 안 걸린다', () => {
  it.each(RULES.map((r) => [r.src, r] as const))('%s', (_id, r) => {
    const g = runsIn(r);
    for (const s of ENTRIES[r.src].pos) expect(B(s, r, g), s).toBeGreaterThan(0);
    for (const s of ENTRIES[r.src].neg) expect(B(s, r, g), s).toBe(0);
  });

  it('legal keep 항목은 legal 에서 양성 예문도 걸리지 않는다', () => {
    for (const id of LEGAL_KEEP) {
      const r = RULES.find((x) => x.src === id)!;
      for (const s of ENTRIES[id].pos) expect(B(s, r, 'legal'), id).toBe(0);
    }
  });
});

describe('고친 식 — 상류 좁은 식에서 바꾼 곳', () => {
  const rule = (id: string) => RULES.find((x) => x.src === id)!;
  it('L-05 「한 축」, L-54 「~로 작용하다」는 상류 v2.4.3 정밀화처럼 뺀다', () => {
    expect(B('그는 팀의 한 축이 될 선수다.', rule('L-05'), 'legal')).toBe(0);
    expect(B('이 사정은 불리한 정상으로 작용한다.', rule('L-54'), 'legal')).toBe(0);
    expect(B('이 제도는 사실상 진입 장벽으로 기능한다.', rule('L-54'), 'legal')).toBe(1);
  });

  it('앞에 경계를 붙인 식(L-04·L-17·L-24·L-51)은 상류 식과 같은 자리를 잡는다', () => {
    const toks = ['가', '나', ' ', '하는', ' 자리다', '그 자리에서 ', '갈린다', '렌즈로 ', '보면', '새로운', 'AI', '와 ', '과 ', '법의 ', '교차점에서', 'AI와 ', '법의 교차점에서','사례는 ', '이는 ', '필요성을 ', '강조한다', '.', 'ab'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % toks.length);
    for (const id of ['L-04', 'L-17', 'L-24', 'L-51']) {
      const r = rule(id);
      expect(r.resume, id).toBeTruthy();
      const raw = { ...r, re: r.resume!, resume: undefined };
      let seen = 0;
      for (let k = 0; k < 2000; k++) {
        const s = Array.from({ length: 6 + (k % 20) }, () => toks[rnd()]).join('');
        const cols = (x: Rule) => checkProse(s, { packs: [one(x)], genre: 'lecture' }).hits.map((h) => h.col);
        const want = cols(raw);
        expect(cols(r), `${id} ${s}`).toEqual(want);
        seen += want.length;
      }
      // 맞는 글이 실제로 나와야 같다는 확인이 뜻이 있다
      expect(seen, id).toBeGreaterThan(5);
    }
  });

  it('긴 한 줄(띄어쓰기 없는 한글·한글 영문 섞임)에서 선형', () => {
    const N = 400_000;
    for (const s of ['가나다라마바사아자차'.repeat(N / 10), 'abcde가나다라마'.repeat(N / 10)]) {
      const t0 = performance.now();
      checkProse(s, { packs: [GENERIC_PACK], genre: 'lecture' });
      expect(performance.now() - t0).toBeLessThan(3000);
    }
  });
});

describe('물러서기(yield) — 같은 자리를 다른 팩이 잡으면 범용 팩 걸림은 싣지도 세지도 않는다', () => {
  const OTHER = { pack: 'other', rules: [{ id: 'o-1', re: '가르는', grade: 'A', reason: 'x', fix: 'y' }] };
  const text = '결과를 가르는 것은 시간이다.\n결과를 가르는 것은 시간이다.\n이 대목은 길다.';

  it('겹치면 범용 걸림을 빼고, 겹치지 않는 범용 걸림은 남긴다(다른 팩 걸림은 그대로)', () => {
    const r = checkProse(text, { packs: [GENERIC_PACK, OTHER], detail: 'full' });
    expect(r.counts).toEqual({ A: 2, B: 1 });
    expect(r.hits.map((h) => [h.line, h.rule])).toEqual([[1, 'o-1'], [2, 'o-1'], [3, 'gen-INJ-02']]);
  });

  it('비공개 팩(위치만 내는 팩)과 겹쳐도 같다', () => {
    const r = checkProse(text, { packs: [GENERIC_PACK, { ...OTHER, private: true }], allowFull: false });
    expect(r.counts).toEqual({ A: 2, B: 1 });
  });

  it('다른 팩이 없거나 다른 팩도 물러서는 팩이면 줄이지 않는다', () => {
    expect(checkProse(text, { packs: [GENERIC_PACK] }).counts).toEqual({ A: 0, B: 3 });
    expect(checkProse(text, { packs: [GENERIC_PACK, { ...OTHER, yield: true }] }).counts).toEqual({ A: 2, B: 3 });
  });

  it('다른 팩이 그 장르에서 돌지 않으면(걸림이 없으면) 줄이지 않는다', () => {
    const legalOnly = { pack: 'other', rules: [{ id: 'o-1', re: '가르는', grade: 'A', reason: 'x', genres: ['legal'] }] };
    expect(checkProse(text, { packs: [GENERIC_PACK, legalOnly], genre: 'lecture' }).counts).toEqual({ A: 0, B: 3 });
  });

  it('yield 는 참·거짓만 받는다', () => {
    expect(validatePack({ pack: 'p', yield: 'yes', rules: [] })).toEqual([{ code: 'PACK_YIELD' }]);
  });
});
