import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { pairArticles, splitArticles } from '@/lib/laws/precise/articles';
import { extractQuantities, quantityDrops } from '@/lib/laws/precise/quantities';
import { anthropicAsk, usd, BATCH_RUNS, BATCH_SCHEMA, BATCH_SIZE, chunks, groupCount, judgeAll, merge, NO_BASELINE, type Finding } from '@/lib/laws/precise/judge';
import { clean, disadvantageOf, precisePipeline, rowsForStore } from '@/lib/laws/precise/pipeline';
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
  it('진행 문구의 묶음 수·회차는 judgeAll 의 실제 값이다', () => {
    expect([BATCH_SIZE, BATCH_RUNS]).toEqual([8, 2]);
    expect(groupCount(19)).toBe(chunks(pairs(19), BATCH_SIZE).length);
    expect(groupCount(0)).toBe(0);
  });

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
    expect(out.get('제1조')?.incomplete).toBe(true);
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

  it('요청 전체 시간이 끊기면 남은 묶음은 기다리지 않고 「추가 확인」(사람이 읽는 사유)', async () => {
    const ctl = new AbortController();
    const slow = (_b: string, s?: AbortSignal) => new Promise<Finding[] | string>((res) => {
      const t = setTimeout(() => res([]), 10_000);
      s?.addEventListener('abort', () => { clearTimeout(t); res('TimeoutError'); });
    });
    setTimeout(() => ctl.abort(), 30);
    const t0 = Date.now();
    const out = await judgeAll(pairs(3), new Map(), new Map(), { ask: slow, runs: 2, workers: 8, signal: ctl.signal });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(out.get('제1조')?.reason).toBe('판단 실패: 응답 시간 초과');
  });

  it('혼잡(529)이면 한 번 쉬었다 다시 묻는다', async () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let n = 0;
    const fetchImpl = (async () => (++n === 1 ? new Response('', { status: 529 })
      : new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { output_tokens: 1 }, content: [{ type: 'text', text: '{"findings":[]}' }] })))) as unknown as typeof fetch;
    expect(await anthropicAsk({ apiKey: 'k', usage, fetchImpl })('{}')).toEqual([]);
    expect(n).toBe(2);
  }, 10_000);

  it('점검 요청이 묶음 입력에 들어간다(재질문 포함)', async () => {
    const seen: string[] = [];
    const seq: (Finding[] | string)[] = [[], [f('제1조')]];
    await judgeAll(pairs(1), new Map(), new Map(), {
      ask: async (b) => { seen.push(JSON.parse(b)['점검 요청']); return seq.shift() ?? []; }, runs: 1, focus: '재택근무 조항',
    });
    expect(seen).toEqual(['재택근무 조항', '재택근무 조항']);
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
    expect(r.rows.filter((x) => x['운영 메모'].includes('조문 번호 중복')).map((x) => x.조문)).toEqual(['제55조', '제55조(번호 중복)']);
    expect(r.rows.filter((x) => x['운영 메모'].includes('조문 번호 중복')).every((x) => x['점검 결과'] === '현행 수정 필요')).toBe(true);
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

  it('종전 규칙 없이 점검하면 판단이 해당 없음이어도 「비교 불가 — 종전 규칙 미제공」', async () => {
    const r = await precisePipeline({ rules: '제1조(목적) 목적\n제2조(휴가) 연 15일', since: '20230101' }, [],
      { ask: ask([f('제1조', '회사 선택', '해당 없음'), f('제2조', '현행 수정 필요', '해당')]), runs: 1 });
    expect(r.rows.map((x) => x.불이익변경)).toEqual([NO_BASELINE, NO_BASELINE]);
    expect(r.rows.some((x) => x.불이익변경 === '해당 없음')).toBe(false);
  });

  it('종전 규칙은 있는데 판단이 비교 불가를 내면(짝 없는 조문) 확인 필요로 올린다', async () => {
    const r = await precisePipeline({ rules: '제1조(목적) 목적\n제9조(재택) 재택근무를 둔다.', old: '제1조(목적) 목적', since: '20230101' }, [],
      { ask: ask([f('제1조'), f('제9조', '회사 선택', '비교 불가')]), runs: 1 });
    expect(r.rows.find((x) => x.조문 === '제9조')!.불이익변경).toBe('확인 필요');
  });

  it('불이익변경 칸 — 종전 유무·기계 신호·모르는 값', () => {
    expect(disadvantageOf(f('제1조', '회사 선택', '해당'), true, false)).toBe(NO_BASELINE);
    expect(disadvantageOf(null, false, false)).toBe(NO_BASELINE);
    expect(disadvantageOf(null, false, true)).toBe('해당 없음');
    expect(disadvantageOf(f('제1조', '회사 선택', '해당 없음'), true, true)).toBe('확인 필요');
    expect(disadvantageOf({ ...f('제1조'), disadvantage: '모름' as never }, false, true)).toBe('확인 필요');
    // 종전 규칙이 있는 점검에서 새로 생긴 조문이 「해당」이면 그대로 남는다(비교 불가로 눌리지 않는다)
    expect(disadvantageOf(f('제1조', '회사 선택', '해당'), false, true)).toBe('해당');
  });

  it('합칠 때 비교 불가는 해당 없음에 지워지지 않는다', () => {
    expect(merge([f('제1조', '회사 선택', '해당 없음'), f('제1조', '회사 선택', '비교 불가')]).disadvantage).toBe('비교 불가');
    expect(merge([f('제1조', '회사 선택', '비교 불가'), f('제1조', '회사 선택', '확인 필요')]).disadvantage).toBe('확인 필요');
  });

  it('스키마·프롬프트가 비교 불가를 해당 없음과 가른다', () => {
    const items = BATCH_SCHEMA.properties.findings.items.properties.disadvantage.enum;
    expect(items).toContain('비교 불가');
    expect(BATCH_SYSTEM).not.toContain('종전 규정이 없는 점검이면 해당 없음');
    expect(BATCH_SYSTEM).toContain('- 비교 불가:');
    expect(BATCH_SYSTEM).toContain('새로 생긴 조문이라도 새 의무·제재·공제처럼 근로조건을 낮추는 내용을 담고 있으면 해당이다');
    expect(BATCH_SYSTEM).toContain('종전 규칙이 없는 점검에서는 불리해졌다·저하·낮아졌다처럼 종전과 비교하는 말을 쓰지 말고 현행 법령 기준과의 차이로만 적는다');
  });

  it('본문에서 찾지 못한 법령 기준에 법령명을 붙인다', async () => {
    const spec = { lawId: '000130', law: '남녀고용평등법', article: '제18조의2', effective: '20250223', topic: '배우자 출산휴가 20일',
      art93: '8', required: true, keywords: ['배우자 출산'], ok: ['20일'], stale: ['10일'], point: '', clause: '', mst: null };
    const r = await precisePipeline({ rules: '제1조(목적) 목적', since: '20230101' }, [spec], { ask: ask([f('제1조')]), runs: 1 });
    const row = r.rows.find((x) => x.조문 === '신설 필요')!;
    expect(row['근거·시행일']).toBe('남녀고용평등법 제18조의2 (2025.02.23. 시행)');
  });

  it('보관 동의가 없어도 저장 행에 비교 불가 표시는 남는다', () => {
    const row = { 조문: '제1조', 현행: 'a', 개정안: 'b', '개정 사유': 'c', '근거·시행일': '', 불이익변경: NO_BASELINE, '점검 결과': '회사 선택', '운영 메모': '', '제안 문안': '' };
    expect(rowsForStore([row], false)[0].불이익변경).toBe(NO_BASELINE);
  });

  it('본문 없는 문서는 거절한다', async () => {
    await expect(precisePipeline({ rules: '목 차\n제1조(목적)\n제2조(적용)', since: '20230101' }, [], { ask: ask([]) })).rejects.toThrow('empty_rules');
  });

  it('보관 동의가 없으면 저장 행에 조문 원문·원문을 옮기기 쉬운 칸이 남지 않는다', () => {
    const row = { 조문: '제1조', 현행: '종전 원문', 개정안: '개정 원문', '개정 사유': '원문 인용', '근거·시행일': '근로기준법 제60조', 불이익변경: '해당 없음', '점검 결과': '회사 선택', '운영 메모': '원문', '제안 문안': '원문 고쳐 씀' };
    expect(rowsForStore([row], false)[0]).toEqual({ ...row, 현행: '', 개정안: '', '개정 사유': '', '운영 메모': '', '제안 문안': '' });
    expect(rowsForStore([row], true)[0].현행).toBe('종전 원문');
  });

  it('확률 숫자만 지우고 법령 용어는 그대로 둔다', () => {
    expect(clean('가능성 80% 건강진단과 고충상담, 노동위원회 판정 확률 0.72')).toBe('건강진단과 고충상담, 노동위원회 판정');
  });

  it('제안 문안은 손대지 않는다', async () => {
    const fin = { ...f('제1조', '현행 수정 필요'), proposed_text: '회사는 건강진단을 실시한다. 고충상담 창구를 둔다.' };
    const r = await precisePipeline({ rules: '제1조(건강) 건강진단', since: '20230101' }, [], { ask: ask([fin]), runs: 1 });
    expect(r.rows[0]['제안 문안']).toBe(fin.proposed_text);
  });

  it('조문이 너무 많으면 호출 전에 거절한다', async () => {
    const big = Array.from({ length: 301 }, (_, i) => `제${i + 1}조(t) 본문`).join('\n');
    let called = false;
    await expect(precisePipeline({ rules: big, since: '20230101' }, [], { ask: async () => { called = true; return []; } }))
      .rejects.toThrow('too_many_articles');
    expect(called).toBe(false);
  });

  it('전각 숫자·낱 CR 줄바꿈도 조문으로 나눈다', () => {
    expect(nos('제１조(목적) 목적\r제２조(적용) 적용')).toEqual(['제1조', '제2조']);
  });
});

it('프롬프트가 기준 구현과 같다', () => {
  const md = readFileSync(path.resolve(__dirname, '../../scripts/work_rules_c/prompts/batch_system.md'), 'utf8');
  expect(BATCH_SYSTEM.replace(/\r\n/g, '\n')).toBe(md.replace(/\r\n/g, '\n')); // 체크아웃 줄끝(CRLF)은 따지지 않는다
});

describe('미완료·충돌·근거 회귀', () => {
  it('한 회차 실패와 다른 회차 문제없음을 함께 보존한다', async () => {
    const seq: (Finding[] | string)[] = ['http_500', [f('제1조')]];
    const got = await judgeAll(pairs(1), new Map(), new Map(), { ask: async () => seq.shift()!, workers: 1 });
    expect(got.get('제1조')).toMatchObject({ result: '추가 확인', incomplete: true });
    expect(got.get('제1조')?.ops_note).toContain('미완료');
  });
  it('회차 충돌은 두 의견을 기록한다', () => {
    const got = merge([f('제1조'), f('제1조', '현행 수정 필요', '해당')]);
    expect(got.conflict).toBe(true); expect(got.ops_note).toContain('문제없음/해당 없음');
    expect(got.ops_note).toContain('현행 수정 필요/해당');
  });
  it('세 개 이상 같은 번호를 덮어쓰지 않는다', () => {
    const a = splitArticles('제55조(교육) A\n제55조(조직) B\n제55조(접수) C\n제55조(보호) D');
    expect(a.map((x) => x.body)).toEqual(['A', 'B', 'C', 'D']); expect(new Set(a.map((x) => x.no)).size).toBe(4);
  });
  it('조문 일부 누락은 다른 회차 정상이어도 미완료다', async () => {
    const seq = [[f('제1조')], [f('제1조'), f('제2조')]];
    const got = await judgeAll(pairs(2), new Map(), new Map(), { ask: async () => seq.shift()!, workers: 1 });
    expect(got.get('제2조')?.incomplete).toBe(true); expect(got.has('제1조')).toBe(false);
  });
  it('원문 없는 AI 인용은 검증된 근거나 완료로 표시하지 않는다', async () => {
    const r = await precisePipeline({ rules: '제1조(합성) 본문', since: '20260101' }, [], {
      ask: async () => [{ ...f('제1조', '현행 수정 필요'), basis: '가상법 제999조' }], asOf: '20261022',
    });
    expect(r.rows[0]['근거·시행일']).toContain('AI 인용(미검증)'); expect(r.rows[0]['점검 결과']).toBe('추가 확인');
    expect(r.review).toMatchObject({ asOf: '20261022', since: '20260101' });
  });
  it('실패 응답의 사용량과 재시도 사용량을 합하고 Messages 단가를 쓴다', async () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const accounting = { attempts: 0, responsesWithUsage: 0 }; let n = 0;
    const fetchImpl = (async () => new Response(JSON.stringify({ usage: { input_tokens: 100, output_tokens: 20 },
      content: [{ type: 'text', text: '{"findings":[]}' }] }), { status: ++n === 1 ? 529 : 200 })) as typeof fetch;
    await anthropicAsk({ apiKey: 'fake', usage, accounting, fetchImpl })('{}');
    expect(usage.input_tokens).toBe(200); expect(usage.output_tokens).toBe(40);
    expect(accounting).toEqual({ attempts: 2, responsesWithUsage: 2 });
    expect(usd({ input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 })).toBe(14.6);
  });
});


it('원문 근거 없이 문제없음이라고 답해도 추가 확인 행을 남긴다', async () => {
  const r = await precisePipeline({ rules: '제1조(합성) 본문', since: '20260101' }, [], { ask: async () => [f('제1조')] });
  expect(r.rows[0]['점검 결과']).toBe('추가 확인');
  expect(r.rows[0]['운영 메모']).toContain('법령 원문 없음');
  const row = { ...r.rows[0], '근거·시행일': 'AI 인용(미검증): 고객 원문을 옮긴 가상 인용' };
  expect(rowsForStore([row], false)[0]['근거·시행일']).toBe('');
});


it('보관 미동의 때도 원문 없이 미완료·충돌·날짜 메타데이터는 보존한다', async () => {
  const seq: (Finding[] | string)[] = ['http_500', [f('제1조')]];
  const result = await precisePipeline({ rules: '제1조(합성) 비공개 합성 본문', since: '20260101' }, [], { ask: async () => seq.shift()!, workers: 1, asOf: '20261022' });
  const stored = rowsForStore(result.rows, false)[0];
  expect(stored.개정안).toBe(''); expect(stored['운영 메모']).toBe('');
  expect(stored.review).toMatchObject({ incomplete: true, asOf: '20261022', since: '20260101' });
});


it('재질문 응답은 빠진 조문만 반영하며 다른 조문 의견을 덮지 않는다', async () => {
  const seq = [[f('제1조')], [f('제1조')], [f('제1조', '현행 수정 필요'), f('제2조')]];
  const result = await judgeAll(pairs(2), new Map(), new Map(), { ask: async () => seq.shift()!, workers: 1 });
  expect(result.has('제1조')).toBe(false);
  expect(result.get('제2조')).toMatchObject({ incomplete: true, unanswered: false });
});

it('문제없음 회차에 남은 불이익 의견도 합집합에서 보존한다', () => {
  const result = merge([f('제1조', '문제없음', '해당'), f('제1조', '현행 수정 필요', '해당 없음')]);
  expect(result.disadvantage).toBe('해당'); expect(result.conflict).toBe(true);
});


it('두 회차 모두 문제없음이어도 불이익 의견 충돌을 결과에서 버리지 않는다', async () => {
  const seq = [[f('제1조', '문제없음', '해당')], [f('제1조', '문제없음', '해당 없음')]];
  const result = await judgeAll(pairs(1), new Map(), new Map(), { ask: async () => seq.shift()!, workers: 1 });
  expect(result.get('제1조')).toMatchObject({ conflict: true, disadvantage: '해당' });
  const pipelineSeq = [[f('제1조', '문제없음', '해당')], [f('제1조', '문제없음', '해당 없음')]];
  const output = await precisePipeline({ rules: '제1조(합성) 합성 본문', since: '20260101' }, [], { ask: async () => pipelineSeq.shift()!, workers: 1 });
  expect(output.review.conflicts).toBe(1);
  expect(output.rows[0].review?.conflict).toBe(true);
  expect(output.rows[0]['점검 결과']).toBe('추가 확인');
});

it('종전이 있고 기계 신호가 없어도 모델 조문 누락은 해당 없음으로 떨어지지 않는다', async () => {
  const text = '제1조(합성 절차) 합성 절차를 따른다.';
  const result = await precisePipeline({ rules: text, old: text, since: '20260101' }, [], { ask: async () => [], workers: 1 });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].불이익변경).toBe('확인 필요');
  expect(result.rows[0]['점검 결과']).toBe('추가 확인');
  expect(result.rows[0].review?.incomplete).toBe(true);
  expect(result.rows[0]['운영 메모']).not.toContain('수치 하락');
  expect(result.rows[0]['운영 메모']).not.toContain('조문 삭제');
});
