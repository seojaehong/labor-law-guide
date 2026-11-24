// 퇴고 check_rewrite — 윤문 뒤 보존 대조(수치·인용·[관련 …] 블록·법령 용어·당위/추측·대구 + 글자 변경률).
// 자기시험은 양쪽이다: 손대지 않은 윤문(어순·조사만 다듬음)은 보존됨, 일부러 망친 윤문은 그 항목만 훼손.
// 합성 문장만 쓴다(실제 의견서·고객명 없음).
import { describe, expect, it } from 'vitest';
import { checkRewrite, rateLevel, rewriteResult, rewriteRrnStop } from '../../tools/k-labor/lib/prose/preserve.mjs';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

type Change = { kind: string; line: { before: number | null; after: number | null }; before?: string; after?: string; value?: { before?: string; after?: string }; term?: string; modality?: string };
type Item = { label: string; status: string; changes: Change[]; count: unknown; truncated?: boolean };
type Result = {
  status: string;
  genre: string;
  changeRate: { rate: number; percent: number; level?: string; approximate?: boolean };
  damaged: string[];
  items: Record<'numbers' | 'quotes' | 'blocks' | 'terms' | 'modality' | 'polarity' | 'antithesis', Item>;
};
const run = (b: string, a: string, genre?: string) => checkRewrite(b, a, genre ? { genre } : {}) as unknown as Result;
const ITEMS = ['numbers', 'quotes', 'blocks', 'terms', 'modality', 'polarity', 'antithesis'] as const;
/** 그 항목만 훼손이고 나머지는 보존됨인지 */
const onlyDamaged = (r: Result, ...keys: string[]) => {
  for (const k of ITEMS) expect(r.items[k].status, k).toBe(keys.includes(k) ? '훼손' : '보존됨');
  expect(r.damaged.sort()).toEqual([...keys].sort());
};

const BEFORE = [
  '# 가상 검토 메모',
  '',
  '가상상사는 2026. 3. 2. 근로자 갑에게 해고를 통보하였다.',
  '취업규칙 제23조는 「무단결근이 연속하여 5일 이상인 때」를 징계 사유로 정한다.',
  '사용자는 해고 사유와 해고 시기를 서면으로 통지하여야 한다.',
  '이 사건 해고에는 정당한 이유가 있는 것으로 보인다.',
  '감봉 1회의 금액은 평균임금 1일분의 2분의 1을 넘지 못한다.',
  '갑은 “출근하라는 연락을 받은 적이 없다”라고 진술하였다.',
  '회사는 다음 달까지 개선 계획을 제출해야 한다.',
  '',
  '[관련 판결] 가상법원 2026. 1. 15. 선고 2025가합0000 판결',
  '> 사용자가 근로자를 해고하려면 해고 사유와 해고 시기를 서면으로 통지하여야 하고, 이를 어긴 해고는 효력이 없다.',
].join('\n');

// 어순·조사만 다듬은 윤문 — 보존 항목은 그대로
const GOOD = [
  '# 가상 검토 메모',
  '',
  '가상상사는 2026. 3. 2. 근로자 갑에게 해고를 알렸다.',
  '취업규칙 제23조는 징계 사유로 「무단결근이 연속하여 5일 이상인 때」를 정한다.',
  '사용자는 해고 사유와 해고 시기를 반드시 서면으로 통지하여야 한다.',
  '이 사건 해고에는 정당한 이유가 있는 것으로 보인다.',
  '감봉 1회 금액은 평균임금 1일분의 2분의 1을 넘지 못한다.',
  '갑은 “출근하라는 연락을 받은 적이 없다”라고 진술하였다.',
  '회사는 개선 계획을 다음 달까지 제출해야 한다.',
  '',
  '[관련 판결] 가상법원 2026. 1. 15. 선고 2025가합0000 판결',
  '> 사용자가 근로자를 해고하려면 해고 사유와 해고 시기를 서면으로 통지하여야 하고, 이를 어긴 해고는 효력이 없다.',
].join('\n');

/** BEFORE 의 한 곳만 바꾼 윤문 */
const broken = (from: string, to: string) => {
  expect(BEFORE.split(from)).toHaveLength(2);
  return BEFORE.replace(from, to);
};

describe('check_rewrite — 자기시험: 손대지 않은 윤문은 보존됨', () => {
  it('어순·조사만 다듬은 윤문 → 모든 항목 보존됨, 변경률 30% 미만', () => {
    const r = run(BEFORE, GOOD);
    expect(r.status).toBe('보존됨');
    onlyDamaged(r);
    expect(r.changeRate.rate).toBeGreaterThan(0);
    expect(r.changeRate.rate).toBeLessThan(0.3);
    expect(r.changeRate.level).toBeUndefined();
    expect(r.genre).toBe('legal');
  });

  it('같은 글이면 변경률 0·보존됨', () => {
    const r = run(BEFORE, BEFORE);
    expect(r).toMatchObject({ status: '보존됨', damaged: [], changeRate: { rate: 0 } });
  });

  it('줄바꿈(CRLF)·공백 폭만 바뀐 글도 보존됨', () => {
    const r = run(BEFORE, BEFORE.replace(/\n/g, '\r\n').replace('서면으로 통지', '서면으로   통지'));
    expect(r.status).toBe('보존됨');
    expect(r.changeRate.rate).toBe(0);
  });
});

describe('check_rewrite — 자기시험: 일부러 망친 윤문은 그 항목만 훼손', () => {
  it('수치를 바꿈(제23조 → 제24조) → 수치 훼손, 줄과 전후 글', () => {
    const r = run(BEFORE, broken('제23조', '제24조'));
    expect(r.status).toBe('훼손');
    onlyDamaged(r, 'numbers');
    expect(r.items.numbers.changes).toEqual([
      expect.objectContaining({ kind: 'changed', line: { before: 4, after: 4 }, value: { before: '제23조', after: '제24조' } }),
    ]);
    expect(r.items.numbers.changes[0].before).toContain('제23조');
    expect(r.items.numbers.changes[0].after).toContain('제24조');
  });

  it('수치를 지움·더함 → 빠짐·더해짐', () => {
    const del = run(BEFORE, broken('2026. 3. 2. 근로자', '근로자'));
    onlyDamaged(del, 'numbers');
    // 날짜는 한 덩이로 센다
    expect(del.items.numbers.changes.map((c) => [c.kind, c.value?.before])).toEqual([['removed', '2026. 3. 2.']]);
    const add = run(BEFORE, broken('개선 계획을', '개선 계획 3건을'));
    onlyDamaged(add, 'numbers');
    expect(add.items.numbers.changes).toEqual([expect.objectContaining({ kind: 'added', line: { before: null, after: 9 }, value: { after: '3건' } })]);
  });

  it('같은 값이 두 번 나오던 것 하나를 바꿔도 잡는다(개수까지 센다)', () => {
    const b = '기한은 30일이다. 유예 기간도 30일이다.';
    const r = run(b, '기한은 30일이다. 유예 기간도 5일이다.');
    expect(r.items.numbers.status).toBe('훼손');
    expect(r.items.numbers.changes[0]).toMatchObject({ kind: 'changed', value: { before: '30일', after: '5일' } });
  });

  it('표기만 바꾼 수치(천 단위 쉼표·날짜 점·앞자리 0)는 같은 값, 만·억 환산은 하지 않는다', () => {
    expect(run('금액은 1,000원이고 날짜는 2026. 03. 02.이다.', '금액은 1000원이고 날짜는 2026.3.2.이다.').items.numbers.status).toBe('보존됨');
    expect(run('금액은 1만 원이다.', '금액은 10,000원이다.').items.numbers.status).toBe('훼손');
  });

  it('인용 “ ” 안을 고침 → 인용 훼손(바뀜)', () => {
    const r = run(BEFORE, broken('“출근하라는 연락을 받은 적이 없다”', '“출근 연락을 받은 적이 없다”'));
    onlyDamaged(r, 'quotes');
    expect(r.items.quotes.changes).toEqual([
      expect.objectContaining({ kind: 'changed', line: { before: 8, after: 8 }, before: '“출근하라는 연락을 받은 적이 없다”', after: '“출근 연락을 받은 적이 없다”' }),
    ]);
  });

  it('인용 「 」 안을 고침 → 인용 훼손, 수치는 그대로라 보존됨', () => {
    const r = run(BEFORE, broken('「무단결근이 연속하여 5일 이상인 때」', '「무단결근이 5일 이상 이어진 때」'));
    onlyDamaged(r, 'quotes');
  });

  it('인용 부호만 걷어냄 → 인용 훼손(부호 빠짐)', () => {
    const r = run(BEFORE, broken('“출근하라는 연락을 받은 적이 없다”라고', '출근하라는 연락을 받은 적이 없다고'));
    expect(r.items.quotes.status).toBe('훼손');
    expect(r.items.quotes.changes[0]).toMatchObject({ kind: 'unquoted', line: { before: 8, after: null } });
  });

  it('판례 블록(> 꼴) 한 글자 고침 → 블록 훼손, 블록 안 글은 다른 항목에서 세지 않는다', () => {
    const r = run(BEFORE, broken('서면으로 통지하여야 하고', '서면으로 통보하여야 하고'));
    onlyDamaged(r, 'blocks');
    // 줄은 처음 달라진 글자가 든 줄(머리줄 11 이 아니라 > 줄 12)
    expect(r.items.blocks.changes).toEqual([expect.objectContaining({ kind: 'changed', line: { before: 12, after: 12 } })]);
    expect(r.items.blocks.changes[0].before).toContain('통지');
    expect(r.items.blocks.changes[0].after).toContain('통보');
  });

  it('판례 블록 머리줄의 수치 하나를 고쳐도 블록 훼손(수치 항목은 블록 밖만 본다)', () => {
    const r = run(BEFORE, broken('2025가합0000', '2025가합0001'));
    onlyDamaged(r, 'blocks');
  });

  it('판례 블록 — 풍산식(머리줄 아래 원문 줄)·> **[관련 판결]** 꼴·판례·결정 머리줄도 같다', () => {
    const pungsan = ['본문 문장이다.', '', '[관련 판례] 가상법원 2026. 2. 3. 선고 2025나1111 판결', '근로자를 해고하려면 정당한 이유가 있어야 한다.', '', '맺는 문장이다.'].join('\n');
    const p = run(pungsan, pungsan.replace('있어야 한다', '있어야 하다'));
    onlyDamaged(p, 'blocks');
    expect(p.items.blocks.changes[0].line).toEqual({ before: 4, after: 4 });
    expect(run(BEFORE, broken('2025가합0000', '2025가합0001')).items.blocks.changes[0].line).toEqual({ before: 11, after: 11 });
    const md = ['> **[관련 판결]** 가상법원 2026. 2. 3. 선고 2025나2222 판결', '> 해고는 서면으로 통지하여야 효력이 있다.', '', '본문이다.'].join('\n');
    onlyDamaged(run(md, md.replace('효력이 있다', '효력이 생긴다')), 'blocks');
    const dec = ['[관련 결정] 가상위원회 2026. 2. 3. 결정', '> 사용자의 징계는 정당하다.'].join('\n');
    onlyDamaged(run(dec, dec.replace('정당하다', '부당하다')), 'blocks');
    // 블록을 통째로 지우거나 새로 만들면 빠짐·더해짐
    const gone = run(BEFORE, BEFORE.split('\n').slice(0, 9).join('\n'));
    expect(gone.items.blocks.changes.map((c) => c.kind)).toEqual(['removed']);
    const made = run(pungsan, `${pungsan}\n\n[관련 판결] 가상법원 2026. 4. 5. 선고 2025다3333 판결\n> 새로 넣은 판결 글이다.`);
    expect(made.items.blocks.changes.map((c) => c.kind)).toEqual(['added']);
  });

  it('블록 표시(** · > 앞 공백)만 바뀌면 보존됨', () => {
    const md = ['> **[관련 판결]** 가상법원 2026. 2. 3. 선고 2025나2222 판결', '> 해고는 서면으로 통지하여야 효력이 있다.'].join('\n');
    expect(run(md, md.replace('**[관련 판결]**', '[관련 판결]').replace('> 해고', '>  해고')).items.blocks.status).toBe('보존됨');
  });

  it('「하여야 한다」→「하면 좋다」 → 당위 사라짐(legal 은 법령 용어 「하여야」도 훼손)', () => {
    const after = broken('서면으로 통지하여야 한다.', '서면으로 통지하면 좋다.');
    const r = run(BEFORE, after);
    onlyDamaged(r, 'modality', 'terms');
    expect(r.items.modality.changes).toEqual([
      expect.objectContaining({ kind: 'lost', modality: '당위', line: { before: 5, after: 5 }, before: '사용자는 해고 사유와 해고 시기를 서면으로 통지하여야 한다.', after: '사용자는 해고 사유와 해고 시기를 서면으로 통지하면 좋다.' }),
    ]);
    expect(r.items.terms.changes[0]).toMatchObject({ kind: 'removed', term: '하여야', line: { before: 5, after: null } });
    // 법령 문장 꼴은 legal 만 용어로 본다 — 장르를 바꾸면 당위 검사만 잡는다(두 검사가 서로를 가리지 않는다)
    onlyDamaged(run(BEFORE, after, 'general'), 'modality');
  });

  it('「제출해야 한다 → 제출하면 좋다」 → 당위 사라짐(legal 은 해야 = 하여야 용어도 훼손)', () => {
    const r = run(BEFORE, broken('제출해야 한다.', '제출하면 좋다.'));
    onlyDamaged(r, 'modality', 'terms');
    onlyDamaged(run(BEFORE, broken('제출해야 한다.', '제출하면 좋다.'), 'general'), 'modality');
    expect(r.items.modality.changes[0]).toMatchObject({ modality: '당위', line: { before: 9, after: 9 } });
  });

  it('추측 → 단정(있는 것으로 보인다 → 있다) → 추측 사라짐', () => {
    const r = run(BEFORE, broken('정당한 이유가 있는 것으로 보인다.', '정당한 이유가 있다.'));
    onlyDamaged(r, 'modality');
    expect(r.items.modality.changes[0]).toMatchObject({ kind: 'lost', modality: '추측', line: { before: 6, after: 6 } });
  });

  it('추측 「듯하」는 활용형(듯합니다·듯한)도 본다', () => {
    const r = run('가상 회사는 이를 알았던 듯합니다. 끝이다.', '가상 회사는 이를 알았습니다. 끝이다.', 'general');
    expect(r.items.modality).toMatchObject({ status: '훼손', changes: [expect.objectContaining({ modality: '추측' })] });
    expect(run('알았던 듯한 모습이다. 끝이다.', '알았던 모습이다. 끝이다.', 'general').items.modality.status).toBe('훼손');
  });

  it('금지(넘지 못한다 → 넘지 않는다)도 당위로 본다', () => {
    const r = run(BEFORE, broken('넘지 못한다.', '넘지 않는다.'));
    onlyDamaged(r, 'modality');
  });

  it('당위가 든 문장을 통째로 지움 → 당위 사라짐(짝 없음)', () => {
    const r = run(BEFORE, broken('회사는 다음 달까지 개선 계획을 제출해야 한다.\n', ''));
    expect(r.items.modality.status).toBe('훼손');
    expect(r.items.modality.changes[0]).toMatchObject({ kind: 'lost', modality: '당위', line: { before: 9, after: null } });
  });

  it('당위를 옆 문장으로 옮기며 문장을 나눈 것은 사라짐이 아니다', () => {
    const b = '회사는 계획을 세우고 결과를 제출하여야 한다. 끝.';
    expect(run(b, '회사는 계획을 세운다. 그리고 결과를 제출하여야 한다. 끝.', 'general').items.modality.status).toBe('보존됨');
  });

  it('당위·추측이 든 문장을 다른 문단으로 옮기기만 한 것은 사라짐이 아니다(옮긴 뒤 조금 고쳐도)', () => {
    const p = ['첫 문단은 사과 이야기다.', '둘째 문단에서 회사는 계획을 제출하여야 한다.', '셋째 문단은 감 이야기다.', '넷째 문단은 비가 올 것으로 보인다.'];
    const moved = [p[1], p[0], p[2], p[3]].join('\n');
    expect(run(p.join('\n'), moved, 'general').items.modality.status).toBe('보존됨');
    const movedEdited = [p[1].replace('둘째 문단에서 회사는', '회사는 둘째 문단에서'), p[0], p[2], p[3]].join('\n');
    expect(run(p.join('\n'), movedEdited, 'general').items.modality.status).toBe('보존됨');
  });

  it('법령 용어를 바꿈(근로자 → 직원) → 용어 훼손', () => {
    const r = run(BEFORE, broken('근로자 갑에게', '직원 갑에게'));
    onlyDamaged(r, 'terms');
    expect(r.items.terms.changes).toEqual([expect.objectContaining({ kind: 'removed', term: '근로자', line: { before: 3, after: null } })]);
    expect(r.items.terms.count).toMatchObject({ 근로자: { before: 1, after: 0 } });
  });

  it('「아니하」는 활용형(아니한다·아니함·아니합니다)까지 「않」과 한 용어 — 「아니한다 → 않는다」는 보존됨, 부정을 지우면 용어 훼손(legal)', () => {
    for (const form of ['아니한다', '아니함', '아니합니다', '아니하였다']) {
      const r = run(`사용자는 이를 지급하지 ${form}.`, '사용자는 이를 지급하지 않는다.');
      expect(r.items.terms.status, form).toBe('보존됨');
      const gone = run(`사용자는 이를 지급하지 ${form}.`, '사용자는 이를 지급한다.');
      expect(gone.items.terms.changes, form).toEqual([expect.objectContaining({ kind: 'removed', term: '아니하' })]);
    }
  });

  it('징계 「정직」은 형용사 정직하다의 활용형(정직한·정직할·정직함)을 세지 않는다', () => {
    const r = run('가상 직원은 정직한 태도로 일했다. 정직할 것이다. 정직함이 있다.', '가상 직원은 성실한 태도로 일했다. 성실할 것이다. 성실함이 있다.', 'general');
    expect(r.items.terms).toMatchObject({ status: '보존됨', count: {} });
    expect(run('가상 직원에게 정직 1월을 정했다.', '가상 직원에게 감봉 1월을 정했다.', 'general').items.terms.status).toBe('훼손');
  });

  it('용어는 어간으로 센다 — 「하여야 한다 → 하여야 하며」는 보존됨', () => {
    const r = run('회사는 통지하여야 한다. 끝이다.', '회사는 통지하여야 하며 끝이다.');
    expect(r.items.terms.status).toBe('보존됨');
    expect(r.items.modality.status).toBe('보존됨');
  });

  it('대구 전멸(5개 이상 → 0) → 대구 훼손, 줄이기만 했거나 원래 5개 미만이면 보존됨', () => {
    const five = Array.from({ length: 5 }, (_, i) => `요점 ${'가나다라마'[i]}는 속도가 아니라 방향이다.`).join('\n');
    const none = five.replace(/속도가 아니라 방향이다/g, '방향이 중요하다');
    const r = run(five, none, 'general');
    onlyDamaged(r, 'antithesis');
    expect(r.items.antithesis.count).toEqual({ before: 5, after: 0 });
    const one = five.split('\n').map((l, i) => (i ? l.replace('속도가 아니라 방향이다', '방향이 중요하다') : l)).join('\n');
    expect(run(five, one, 'general').items.antithesis.status).toBe('보존됨');
    const four = five.split('\n').slice(0, 4).join('\n');
    expect(run(four, none.split('\n').slice(0, 4).join('\n'), 'general').items.antithesis.status).toBe('보존됨');
  });
});

// 보존 항목이 없는 문장만으로 변경률을 본다
const PLAIN = [
  '가상상사 직원들은 매주 화요일 오전에 회의를 연다.',
  '회의에서는 지난주 일을 돌아보고 이번 주 일을 나눈다.',
  '회의록은 총무팀이 정리해 게시판에 올린다.',
  '새로 온 사람은 첫 회의에서 자기소개를 한다.',
  '회의실은 맨 위층 끝에 있고 창이 넓다.',
  '점심은 근처 식당에서 함께 먹는 날이 많다.',
  '오후에는 각자 맡은 일을 하고 저녁 전에 정리한다.',
  '금요일에는 한 주를 마무리하는 짧은 모임이 있다.',
  '모임에서는 잘된 일과 아쉬운 일을 짧게 적는다.',
  '적은 내용은 다음 주 회의에서 다시 본다.',
];
const OTHER = [
  '바닷가 마을에는 오래된 등대가 서 있다.',
  '등대지기는 밤마다 불빛을 살피며 기록장을 채웠다.',
  '마을 아이들은 썰물 때 갯벌에서 조개를 줍는다.',
  '겨울바람이 거세지면 배들은 포구에 묶여 쉰다.',
  '봄이 오면 언덕에 유채꽃이 노랗게 핀다.',
  '시장 골목에서는 생선 굽는 냄새가 퍼진다.',
  '할머니들은 평상에 앉아 그물을 손질하신다.',
  '해 질 녘 바다는 붉은빛으로 물든다.',
  '여름밤에는 별이 쏟아질 듯 많이 보인다.',
  '마을 축제는 가을 보름에 열린다.',
];
const swap = (k: number) => PLAIN.map((s, i) => (i < k ? OTHER[i] : s)).join('\n');

describe('check_rewrite — 변경률', () => {
  it('30% 이상 → 변경률 초과·경고, 50% 이상 → 변경률 초과·중단', () => {
    const warn = run(PLAIN.join('\n'), swap(5), 'general');
    expect(warn.changeRate.rate).toBeGreaterThanOrEqual(0.3);
    expect(warn.changeRate.rate).toBeLessThan(0.5);
    expect(warn).toMatchObject({ status: '변경률 초과', changeRate: { level: '경고' }, damaged: [] });
    const stop = run(PLAIN.join('\n'), swap(10), 'general');
    expect(stop.changeRate.rate).toBeGreaterThanOrEqual(0.5);
    expect(stop).toMatchObject({ status: '변경률 초과', changeRate: { level: '중단' } });
    expect(run(PLAIN.join('\n'), swap(1), 'general').changeRate.level).toBeUndefined();
  });

  it('경계는 이상(≥) — 30% 는 경고, 50% 는 중단', () => {
    expect([rateLevel(0.2999), rateLevel(0.3), rateLevel(0.4999), rateLevel(0.5), rateLevel(1)]).toEqual([null, '경고', '경고', '중단', '중단']);
  });

  it('상태 순서 = 중단 > 훼손 > 경고 > 보존됨', () => {
    const damagedWarn = run(`${PLAIN.join('\n')}\n기한은 30일이다.`, `${swap(5)}\n기한은 31일이다.`, 'general');
    expect(damagedWarn.changeRate.level).toBe('경고');
    expect(damagedWarn.status).toBe('훼손');
    const damagedStop = run(`${PLAIN.join('\n')}\n기한은 30일이다.`, `${swap(10)}\n기한은 31일이다.`, 'general');
    expect(damagedStop.changeRate.level).toBe('중단');
    expect(damagedStop.status).toBe('변경률 초과');
    expect(damagedStop.damaged).toContain('numbers');
  });
});

describe('check_rewrite — 주민번호·오류·속도', () => {
  it('주민번호 모양이 있으면 대조하지 않고 어느 쪽 몇 줄인지 알린다', () => {
    expect(rewriteRrnStop('가\n900101-1234567', '나')).toMatchObject({ ok: false, error: expect.stringContaining('주민등록번호'), rrnLines: { before: [2], after: [] } });
    expect(rewriteRrnStop('가', '나\n다\n9001011234567')).toMatchObject({ rrnLines: { before: [], after: [3] } });
    expect(rewriteRrnStop('가', '나')).toBeNull();
  });

  it('rewriteResult 는 ok 와 함께 낸다', () => {
    expect(rewriteResult({ before: BEFORE, after: GOOD })).toMatchObject({ ok: true, status: '보존됨' });
  });

  it('바뀐 곳이 많으면 항목마다 100건까지 + truncated', () => {
    const b = Array.from({ length: 150 }, (_, i) => `항목 ${i + 1}번이다.`).join('\n');
    const a = Array.from({ length: 150 }, (_, i) => `항목 ${i + 1001}번이다.`).join('\n');
    const r = run(b, a, 'general');
    expect(r.items.numbers.changes).toHaveLength(100);
    expect(r.items.numbers.truncated).toBe(true);
  });

  it('40만 자 × 2(문장 일부만 바꿈·통째로 다름·긴 한 줄·닫히지 않는 따옴표)도 빨리 끝난다', { timeout: 60_000 }, () => {
    const unit = `${BEFORE.split('\n').slice(2, 9).join(' ')}\n`;
    const big = unit.repeat(Math.floor(400_000 / unit.length));
    const edited = big.split('\n').map((l, i) => (i % 7 === 3 ? l.replace('제23조', '제24조') : l)).join('\n');
    const cases: [string, string][] = [
      [big, edited],
      [PLAIN.join(' ').repeat(Math.floor(400_000 / PLAIN.join(' ').length)), OTHER.join(' ').repeat(Math.floor(400_000 / OTHER.join(' ').length))],
      ['가나다라마바사'.repeat(57_000), `${'가나다라마바사'.repeat(28_000)}아${'가나다라마바사'.repeat(29_000)}`],
      ['“가'.repeat(150_000), '“나'.repeat(150_000)],
      // 바뀐 곳이 아주 많을 때 — 닫힌 인용 10만 줄 · 한 줄에 인용 문장 5.7만 · 판례 블록 3만 개가 전부 바뀜
      ['“가”\n'.repeat(100_000), '“나”\n'.repeat(100_000)],
      ['“가” 다. '.repeat(57_000), '“나” 다. '.repeat(57_000)],
      ['[관련 판결] 가\n\n'.repeat(30_000), '[관련 판결] 나\n\n'.repeat(30_000)],
    ];
    for (const [b, a] of cases) {
      const t = performance.now();
      const r = run(b, a, 'general');
      expect(['보존됨', '훼손', '변경률 초과']).toContain(r.status);
      expect(performance.now() - t).toBeLessThan(8000);
    }
    expect(run(big, edited).items.numbers.status).toBe('훼손');
  });
});

describe('docs 묶음 — check_rewrite 도구', () => {
  type Reg = { name: string; cfg: { annotations?: object }; handler: (a: object) => Promise<{ content: { text: string }[] }> };
  const tools: Reg[] = [];
  registerDocs({ registerTool: (name: string, cfg: Reg['cfg'], handler: Reg['handler']) => tools.push({ name, cfg, handler }) });
  const t = tools.find((x) => x.name === 'check_rewrite')!;
  const call = async (a: object) => JSON.parse((await t.handler(a)).content[0].text);

  it('읽기 전용으로 등록되고, 대조 결과와 ok 를 낸다', async () => {
    expect(t.cfg.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    const r = await call({ before: BEFORE, after: broken('제23조', '제24조') });
    expect(r).toMatchObject({ ok: true, status: '훼손', damaged: ['numbers'] });
  });

  it('주민번호 모양이면 멈춘다(숫자는 응답에 없다)', async () => {
    const r = await call({ before: '주민번호 900101-1234567 이 있는 글', after: '고친 글' });
    expect(r).toMatchObject({ ok: false, rrnLines: { before: [1], after: [] } });
    expect(JSON.stringify(r)).not.toContain('1234567');
  });
});
