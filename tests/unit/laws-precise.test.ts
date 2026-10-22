import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { pairArticles, splitArticles } from '@/lib/laws/precise/articles';
import { extractQuantities, quantityDrops } from '@/lib/laws/precise/quantities';
import { anthropicAsk, chunks, judgeAll, merge, type Finding } from '@/lib/laws/precise/judge';
import { clean, precisePipeline } from '@/lib/laws/precise/pipeline';
import { BATCH_SYSTEM } from '@/lib/laws/precise/prompts';

// 기준 구현 scripts/work_rules_c 의 시험(test_articles·test_quantities·test_review_fixes·test_batch_judge)과 같은 사례

const f = (no: string, result: Finding['result'] = '문제없음', disadvantage: Finding['disadvantage'] = '해당 없음'): Finding =>
  ({ no, result, disadvantage, reason: 'r', basis: '', ops_note: '', proposed_text: '' });
const nos = (t: string) => splitArticles(t).map((a) => a.no);
const pairs = (n: number) => pairArticles([], splitArticles(Array.from({ length: n }, (_, i) => `제${i + 1}조(t${i + 1}) 본문${i + 1}`).join('\n')));
const pair50 = (o: string, n: string) => pairArticles(splitArticles(`제50조(단축) ${o}`), splitArticles(`제50조(단축) ${n}`))[0];

describe('조문 분할', () => {
  it('기본', () => {
    const a = splitArticles('제1조(목적) 이 규칙은...\n제2조(적용) ① 근로자에게 적용한다.\n② 예외는 없다.');
    expect(a.map((x) => x.no)).toEqual(['제1조', '제2조']);
    expect(a[1].title).toBe('적용');
    expect(a[1].body).toContain('② 예외는 없다.');
  });
  it('부칙 제1조가 본칙을 덮지 않는다', () => {
    const a = splitArticles('제1조(목적) 본칙 목적\n부 칙\n제1조(시행일) 2026년부터 시행');
    expect(a.map((x) => x.body)).toEqual(['본칙 목적']);
  });
  it.each(['부칙', '개정 부칙', '附則', '[별지 제1호]', '【별표 1】', '별지 제2호 서식'])('부칙 변형 %s 에서 멈춘다', (stop) => {
    const a = splitArticles(`제1조(목적) 본칙 목적\n제2조(적용범위) 정규직에 적용\n${stop}\n제1조(시행일) 시행\n제2조(경과조치) 경과`);
    expect(a.map((x) => x.body)).toEqual(['본칙 목적', '정규직에 적용']);
  });
  it('목차의 부칙은 멈춤이 아니다', () => {
    const t = '목 차\n제1조(목적)\n제2조(적용범위)\n부칙\n제1조(목적) 실제 목적\n제2조(적용범위) 실제 범위\n부 칙\n제1조(시행일) 시행';
    expect(splitArticles(t).map((x) => x.body)).toEqual(['실제 목적', '실제 범위']);
  });
  it('목차 쪽 번호·태그·장 제목은 본문이 아니다', () => {
    const t = '제1장 총칙\n제1조(목적) [필수] \t7\n제2장 보칙\n제2조(비치) [선택] \t70\n부  칙 \t71\n'
      + '제1장 총칙\n제1조(목적) 목적을 정한다.\n제2장 보칙\n제2조(비치) 비치한다.\n부 칙\n제1조(시행일) 시행';
    expect(splitArticles(t).map((x) => x.body)).toEqual(['목적을 정한다.', '비치한다.']);
  });
  it('번호가 같고 제목이 다르면 둘 다 남긴다(강동 제55조)', () => {
    const t = '제55조(예방교육) 연 1회 교육한다.\n제55조(예방·대응조직) 담당자를 둔다.\n제56조(접수) 신고한다.';
    expect(nos(t)).toEqual(['제55조', '제55조(번호 중복)', '제56조']);
  });
  it('제목이 같은 반복은 중복이 아니다(목차 군더더기)', () => {
    const a = splitArticles('제32조(대기발령)\n(인사)\n제32조(대기발령) ① 대기발령할 수 있다.');
    expect(a.map((x) => [x.no, x.body])).toEqual([['제32조', '① 대기발령할 수 있다.']]);
  });
  it('조 머리 형식 — 【】·괄호 없음, 본문 인용은 머리가 아니다', () => {
    expect(splitArticles('제1조【목적】 목적\n제2조【적용】 적용').map((x) => [x.no, x.title])).toEqual([['제1조', '목적'], ['제2조', '적용']]);
    expect(nos('제1조 이 규칙은 목적을 정한다.\n제2조 배우자 출산휴가는 10일로 한다.')).toEqual(['제1조', '제2조']);
    expect(splitArticles('제1조(목적) 목적\n제3조에 따라 정한다.')).toHaveLength(1);
  });
  it('쪽 표시는 무시한다', () => {
    const o = splitArticles('제7조(금지) ① 강요하지 못한다.  - 7 -\n② 저축을 강제하지 못한다.\n- 8 -');
    const n = splitArticles('제7조(금지) ① 강요하지 못한다.\n② 저축을 강제하지 못한다.');
    expect(pairArticles(o, n)[0].status).toBe('동일');
  });
});

describe('짝짓기', () => {
  it('상태와 순서', () => {
    const o = splitArticles('제26조(육아휴직) A\n제27조(가족돌봄) B');
    const n = splitArticles('제26조(육아휴직) A2\n제26조의2(단기 육아휴직) C\n제27조(가족돌봄) B');
    expect(pairArticles(o, n).map((p) => [p.no, p.status])).toEqual([['제26조', '변경'], ['제26조의2', '신설'], ['제27조', '동일']]);
  });
  it('번호가 밀려도 제목으로 짝짓고 삭제 조문을 남긴다', () => {
    const o = splitArticles('제2조(휴직) 단축은 총 3년으로 한다.\n제3조(경조사휴가) 결혼 5일.\n제9조(포상) 상');
    const n = splitArticles('제2조(교육) 연 1회 교육한다.\n제3조(휴직) 단축은 1년 이내로 한다.\n제4조(경조사휴가) 결혼 5일.');
    const ps = new Map(pairArticles(o, n).map((p) => [p.no, p]));
    expect(ps.get('제3조')!.oldNo).toBe('제2조');
    expect(quantityDrops(ps.get('제3조')!)).toEqual([{ unit: '년', oldMax: 3, newMax: 1 }]);
    expect(ps.get('제4조')!.status).toBe('동일');
    expect(ps.get('제9조')!.status).toBe('삭제');
  });
});

describe('수치', () => {
  it('조문 인용은 수치가 아니다', () => {
    expect(extractQuantities('제3조제1항에 따라 연간 6일, 최초 2일은 유급').map((q) => [q.value, q.unit])).toEqual([[6, '일'], [2, '일']]);
  });
  it('백분율 두 꼴', () => {
    expect(extractQuantities('통상임금의 100분의 50 이상, 평균임금 70퍼센트').map((q) => q.unit)).toEqual(['%', '%']);
  });
  it('하락·단위 환산·사라진 단위·증가', () => {
    expect(quantityDrops(pair50('단축 기간은 최대 3년 이내로 한다.', '기간은 1년 이내로 한다.'))).toEqual([{ unit: '년', oldMax: 3, newMax: 1 }]);
    expect(quantityDrops(pair50('휴직 기간은 1년', '휴직 기간은 6개월'))).toHaveLength(1);
    expect(quantityDrops(pair50('휴가 30일을 준다.', '회사가 정하는 기간의 휴가를 준다.'))).toHaveLength(1);
    expect(quantityDrops(pair50('휴직 기간은 6개월', '휴직 기간은 1년'))).toEqual([]);
    expect(quantityDrops(pair50('배우자 출산휴가 10일', '배우자 출산전후휴가 20일'))).toEqual([]);
  });
});

describe('묶음 판단', () => {
  it('묶음 크기', () => expect(chunks(pairs(19), 8).map((c) => c.length)).toEqual([8, 8, 3]));

  it('회차 합집합 — 한 회차만 지적해도 남는다', async () => {
    const seq: (Finding[] | string)[] = [[f('제1조'), f('제2조')], [f('제1조'), f('제2조', '현행 수정 필요', '확인 필요')]];
    const out = await judgeAll(pairs(2), new Map(), new Map(), { ask: async () => seq.shift()!, runs: 2, workers: 1 });
    expect([...out.keys()]).toEqual(['제2조']);
  });

  it('합칠 때 결과·불이익변경은 무거운 쪽', () => {
    const m = merge([f('제1조', '추가 확인', '해당'), f('제1조', '현행 수정 필요', '해당 없음')]);
    expect([m.result, m.disadvantage]).toEqual(['현행 수정 필요', '해당']);
  });

  it('어느 회차도 답하지 않은 조문만 재질문, 그래도 없으면 추가 확인', async () => {
    const asked: string[][] = [];
    const seq: (Finding[] | string)[] = [[f('제1조')], 'http_500', [f('제2조')]];
    const out = await judgeAll(pairs(3), new Map(), new Map(), {
      ask: async (b) => { asked.push(JSON.parse(b).조문들.map((x: { 조문: string }) => x.조문)); return seq.shift() ?? 'x'; },
      runs: 2, workers: 1,
    });
    expect(asked[2]).toEqual(['제2조', '제3조']);
    expect(out.get('제3조')?.result).toBe('추가 확인');
    expect(out.has('제1조')).toBe(false);
  });

  it('묶음을 동시에 보낸다', async () => {
    let live = 0;
    let peak = 0;
    await judgeAll(pairs(8), new Map(), new Map(), {
      size: 2, runs: 1, workers: 4,
      ask: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 20)); live--; return []; },
    });
    expect(peak).toBeGreaterThan(1);
  });

  it('상시 인원이 묶음 입력에 들어간다', async () => {
    let seen = '';
    await judgeAll(pairs(1), new Map(), new Map(), { ask: async (b) => { seen = JSON.parse(b)['사업장 상시 인원']; return [f('제1조')]; }, runs: 1, headcount: '24' });
    expect(seen).toBe('24');
  });

  it('API 응답을 읽고 사용량을 더한다', async () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const req = JSON.parse(String(init.body));
      expect(req.output_config.format.type).toBe('json_schema');
      expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
      return new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ findings: [f('제1조')] }) }] }));
    }) as unknown as typeof fetch;
    const got = await anthropicAsk({ apiKey: 'k', usage, fetchImpl })('{}');
    expect(got).toEqual([f('제1조')]);
    expect(usage.input_tokens).toBe(10);
  });
});

describe('파이프라인', () => {
  const ask = (fs: Finding[]) => async () => fs;

  it('번호 중복은 판단이 문제없음이어도 올린다', async () => {
    const t = '제55조(예방교육) 연 1회 교육한다.\n제55조(예방·대응조직) 담당자를 둔다.\n제56조(접수) 신고한다.';
    const r = await precisePipeline({ rules: t, since: '20230101' }, [], { ask: ask([f('제55조'), f('제55조(번호 중복)'), f('제56조')]), runs: 1 });
    expect(r.rows.map((x) => x.조문)).toEqual(['제55조', '제55조(번호 중복)']);
    expect(r.rows.every((x) => x['운영 메모'].includes('조문 번호 중복') && x['점검 결과'] === '현행 수정 필요')).toBe(true);
  });

  it('수치 하락은 판단이 해당 없음으로 지우지 못한다', async () => {
    const r = await precisePipeline({ rules: '제50조(단축) 기간은 1년 이내로 한다.', old: '제50조(단축) 기간은 최대 3년 이내로 한다.', since: '20230101' }, [],
      { ask: ask([f('제50조', '회사 선택', '해당 없음')]), runs: 1 });
    expect(r.rows[0].불이익변경).toBe('확인 필요');
    expect(r.rows[0]['운영 메모']).toContain('3년 → 1년');
  });

  it('삭제 조문은 행이 생긴다', async () => {
    const r = await precisePipeline({ rules: '제1조(목적) 목적', old: '제1조(목적) 목적\n제3조(경조사휴가) 본인 결혼 5일.', since: '20230101' }, [],
      { ask: ask([f('제1조'), f('제3조')]), runs: 1 });
    const row = r.rows.find((x) => x.조문 === '제3조')!;
    expect(row.개정안).toBe('');
    expect(row.불이익변경).not.toBe('해당 없음');
  });

  it('본문 없는 문서는 거절한다', async () => {
    await expect(precisePipeline({ rules: '목 차\n제1조(목적)\n제2조(적용)', since: '20230101' }, [], { ask: ask([]) })).rejects.toThrow('empty_rules');
  });

  it('금지어·확률 숫자를 지운다', () => {
    expect(clean('판정 결과 확률 80% 자문')).toBe('점검 결과 결과 검토');
  });
});

it('프롬프트가 기준 구현과 같다', () => {
  const md = readFileSync(path.resolve(__dirname, '../../scripts/work_rules_c/prompts/batch_system.md'), 'utf8');
  expect(BATCH_SYSTEM.replace(/\r\n/g, '\n')).toBe(md.replace(/\r\n/g, '\n')); // 체크아웃 줄끝(CRLF)은 따지지 않는다
});
