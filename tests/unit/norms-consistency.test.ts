// 퇴고 check_norms — 문서 안 일관성 검사 2종(261125). listEnd = 목록 끝맺음, abbrev = 기관 약칭.
// 규정이 아니라 업무 문서 관행이라 B 만 내고, checks 에 이름을 적어야만 돈다(기본 세 검사는 그대로).
// 합성 문장·가상 기관명만 쓴다.
import { describe, expect, it } from 'vitest';
import { checkNorms } from '../../tools/k-labor/lib/prose/norms.mjs';
import { runToego } from '../../tools/k-labor/lib/prose/toego.mjs';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

type Hit = { line: number; col: number; len: number; grade: string; word: string; reason: string; basis: string; ctx: string };
const lines = (hits: Hit[]) => hits.map((h) => h.line);
const listEnd = (text: string) => checkNorms(text, { checks: ['listEnd'] }).listEnd as { counts: { A: number; B: number }; hits: Hit[]; truncated?: boolean };
const abbrev = (text: string) => checkNorms(text, { checks: ['abbrev'] }).abbrev as { counts: { A: number; B: number }; hits: Hit[]; truncated?: boolean };

// 문장으로 끝나는 항목 사이에 서술어 없이(괄호로) 끝나는 항목 하나 — 괄호로 끝나는 문장(「…둡니다(…).」)은 문장이다
const LIST_DOC = [
  '# 가상 점검 메모',
  '',
  '## 확인한 사항',
  '',
  '- 제1조 가상 규정: 가상 부서 열 곳 중 다섯 곳이 같은 서식을 씁니다.',
  '- 제2조 가상 규정: 네 곳이 같은 결재 단계를 둡니다(한 곳은 시범 운영).',
  '- 제3조 가상 규정: 가상 부서 아홉 곳 중 세 곳(가상 지점은 오전만, 다른 가상 지점은 시범 운영).',
  '- 제4조 가상 규정: 여섯 곳이 회의록을 한 달 안에 올립니다.',
  '- 제5조 가상 규정: 휴게 시간은 나누어 쓸 수 있습니다(가상 안내서 2026. 1. 1. 개정판 3쪽).',
  '',
  '## 받을 자료',
  '',
  '- 가상 서식 원본(보낸 메일에 첨부가 없습니다)',
  '- 가상 회의록, 가상 일정표',
  '- 가상 안내서에 적힌 해당 쪽',
  '- 가상 부서장이 승인했는지 여부(일정 조정용)',
].join('\n');

describe('check_norms listEnd — 목록 끝맺음', () => {
  it('문장 목록에서 서술어 없이 끝난 항목만 B 로 — 괄호 안 글은 보지 않고 괄호 앞말로 판단한다', () => {
    const r = listEnd(LIST_DOC);
    expect(r.counts).toEqual({ A: 0, B: 1 });
    const src = LIST_DOC.split('\n')[6];
    expect(r.hits[0]).toMatchObject({ line: 7, grade: 'B', word: '운영).', col: src.lastIndexOf(' ') + 2, len: 4 });
    expect(r.hits[0].reason).toContain('서술어 없이');
    expect(r.hits[0].reason).toContain('5개 항목 중 4개');
    expect(r.hits[0].basis).toContain('규정이 아니라 업무 문서 관행');
  });

  it('반대로 명사 목록에서 문장으로 끝난 항목만 — 「필요」「개요」는 명사, 「~어요」「~니까?」는 문장', () => {
    const nounList = ['- 가상 규정 제1조 확인', '- 가상 규정 제2조 검토 필요', '- 가상 회의록 사본', '- 가상 운영 계획은 다음 주에 보냅니다.'].join('\n');
    const r = listEnd(nounList);
    expect(lines(r.hits)).toEqual([4]);
    expect(r.hits[0].reason).toContain('이 항목은 문장으로');
    const sentList = ['- 가상 회사는 이를 검토합니다.', '- 가상 노조는 이를 받아들였어요.', '- 가상 조항의 개요', '- 가상 위원회는 다시 논의합니까?'].join('\n');
    expect(lines(listEnd(sentList).hits)).toEqual([3]);
  });

  it('여러 줄 항목은 끝 줄로 판단하고 그 줄을 짚는다(들여 쓴 이어쓰기·게으른 이어쓰기), 강조 표시는 벗긴다', () => {
    const indented = [
      '- 첫째 항목은 문장으로 끝납니다.',
      '- 둘째 항목은 줄을 넘겨',
      '  이어지다가 문장으로 끝납니다.',
      '- 셋째 항목도 줄을 넘겨',
      '  명사로 끝나는 가상 항목',
      '- 넷째 항목도 **문장입니다.**',
    ].join('\n');
    expect(listEnd(indented).hits.map((h) => [h.line, h.word])).toEqual([[5, '항목']]);
    const lazy = ['1. 가상 회사는 이를 검토합니다.', '2. 가상 노조는 이를 받아들입니다.', '3. 가상 위원회는', '다시 논의합니다.', '4. 가상 위원 명단'].join('\n');
    expect(lines(listEnd(lazy).hits)).toEqual([5]);
  });

  it('하위 목록은 따로 본다 — 상위 항목 끝맺음에 하위 항목 글을 붙이지 않는다', () => {
    const nested = [
      '- 상위 항목 하나는 문장입니다.',
      '  - 하위 가',
      '  - 하위 나',
      '  - 하위 다',
      '- 상위 항목 둘도 문장입니다.',
      '- 상위 항목 셋은 명사',
    ].join('\n');
    expect(lines(listEnd(nested).hits)).toEqual([6]);
  });

  it('항목 3개 이상이고 소수가 1/3 이하일 때만 — 3개 중 1개는 걸고, 5개 중 2개·4개 중 2개·2개 중 1개는 두지 않는다', () => {
    const doc = [
      '- 가상 하나입니다.', '- 가상 둘입니다.', '- 가상 셋',
      '', '본문 문단으로 목록을 끊는다.', '',
      '- 가상 하나입니다.', '- 가상 둘입니다.', '- 가상 셋입니다.', '- 가상 넷', '- 가상 다섯',
      '', '본문 문단으로 목록을 끊는다.', '',
      '- 가상 하나입니다.', '- 가상 둘', '- 가상 셋입니다.', '- 가상 넷',
      '', '본문 문단으로 목록을 끊는다.', '',
      '- 가상 하나입니다.', '- 가상 둘',
    ].join('\n');
    expect(lines(listEnd(doc).hits)).toEqual([3]);
  });

  it('빈 줄로 띄운 항목은 같은 목록이다(마크다운의 느슨한 목록)', () => {
    const loose = ['- 가상 하나입니다.', '', '- 가상 둘입니다.', '', '- 가상 셋'].join('\n');
    expect(lines(listEnd(loose).hits)).toEqual([5]);
  });

  it('인용으로 끝나는 항목은 서술어가 없는 것으로 본다', () => {
    const doc = ['- 가상 노조안은 협의 절차를 둡니다.', '- 가상 회사안은 통보 절차를 둡니다.', '- 가상 노조안 문구: 「협의한다」'].join('\n');
    expect(lines(listEnd(doc).hits)).toEqual([3]);
  });

  it('목록이 아닌 것 — 연도로 시작하는 줄·표 칸·> 인용·코드 블록', () => {
    const doc = [
      '2025. 1. 1. 가상 협약 체결',
      '2025. 6. 30. 가상 협약을 개정합니다.',
      '2026. 1. 1. 가상 협약 만료',
      '',
      '| - 표 칸은 목록이 아닙니다. | 가 |',
      '| - 표 칸 둘 | 나 |',
      '| - 표 칸 셋 | 다 |',
      '',
      '> - 인용 항목입니다.',
      '> - 인용 항목 둘',
      '> - 인용 항목 셋',
      '',
      '```',
      '- 코드 항목입니다.',
      '- 코드 항목 둘',
      '- 코드 항목 셋',
      '```',
    ].join('\n');
    expect(listEnd(doc).counts).toEqual({ A: 0, B: 0 });
  });
});

// 가상 기관명만 — 「한국」+X 정식 명칭과 「한국」 없는 X
const ABBR_DOC = [
  '# 가상공사 점검 메모',
  '',
  '- 대상: 한국가상기술공사와 한국가상공사의 안내서를 보았습니다.',
  '- 한국가상평가원은 오전 근무만 둡니다.',
  '- 대한가상공사와 가상공사노조는 따로 봅니다.',
  '',
  '| 항목 | 내용 |',
  '|---|---|',
  '| 제1조 | 세 곳(가상공사는 시범 운영)이 같은 서식을 씁니다. |',
  '| 제2조 | 가상기관·평가원·다른기관이 같은 서식을 씁니다. |',
  '',
  '가상기술공사 안내서는 따로 보았습니다.',
  '> 가상공사는 인용 줄이라 보지 않습니다.',
  '그는 “가상공사는 따로 본다”라고 적었고 「가상공사」 표기도 원문 그대로 둡니다.',
].join('\n');

describe('check_norms abbrev — 기관 약칭', () => {
  it('「한국」+X 정식 명칭이 있는데 X 를 정의 없이 쓴 곳만 — 표 칸도 본다, 제목·인용·다른 낱말 안은 보지 않는다', () => {
    const r = abbrev(ABBR_DOC);
    expect(r.hits.map((h) => [h.line, h.word, h.grade])).toEqual([[9, '가상공사', 'B'], [12, '가상기술공사', 'B']]);
    expect(r.hits[0].col).toBe(ABBR_DOC.split('\n')[8].indexOf('가상공사') + 1);
    expect(r.hits[0].len).toBe(4);
    expect(r.hits[0].reason).toMatch(/^「한국가상공사」를 줄인 「가상공사」를 정의 없이 썼다/);
    expect(r.hits[0].reason).toContain('(이하 「가상공사」)');
    expect(r.hits[0].basis).toContain('규정이 아니라 업무 문서 관행');
  });

  it('정의가 있으면 정의보다 앞에 쓴 곳만 — 같은 줄 앞도, 「한국」 없는 기관명 정의도, 따옴표 없는 정의도', () => {
    const doc = [
      '가상공사는 정의보다 먼저 나왔습니다.',
      '가상공사와 한국가상공사(이하 「가상공사」)의 안내서를 봅니다.',
      '가상공사는 정의 뒤라 그대로 둡니다.',
      '가창공은 먼저 나왔습니다.',
      '가상창업지원공단(이하 가창공이라 한다)과 일정을 맞춥니다.',
      '가창공은 뒤에 나와 그대로 둡니다.',
    ].join('\n');
    const r = abbrev(doc);
    expect(r.hits.map((h) => [h.line, h.col, h.word])).toEqual([[1, 1, '가상공사'], [2, 1, '가상공사'], [4, 1, '가창공']]);
    expect(r.hits[0].reason).toContain('2행');
    expect(r.hits[0].reason).toMatch(/^약칭 「가상공사」를 /);
    expect(r.hits[2].reason).toContain('5행');
    expect(r.hits[2].reason).toMatch(/^약칭 「가창공」을 /);
  });

  it('기관이 아닌 정의(법령·회사)는 보지 않는다', () => {
    const doc = ['가상법은 먼저 나왔습니다.', '「가상 노동관계법」(이하 「가상법」)에 따릅니다.', '회사는 먼저 나왔습니다.', '가상 주식회사(이하 「회사」)와 체결합니다.'].join('\n');
    expect(abbrev(doc).counts).toEqual({ A: 0, B: 0 });
  });

  it('과잉 걸림을 막는다 — 끝말만 남은 짧은 이름(「한국교원」「한국연구원」「한국공사」)은 정식 명칭으로 보지 않는다', () => {
    const doc = ['한국교원 연수와 교원 연수를 봅니다.', '한국연구원과 연구원 두 명이 참석했습니다.', '한국공사와 공사 현장을 봅니다.', '한국가상기술공사는 한국가상공사와 다릅니다.'].join('\n');
    expect(abbrev(doc).counts).toEqual({ A: 0, B: 0 });
  });
});

describe('check_norms — 새 두 검사는 적어야만 돈다(기본 세 검사는 그대로)', () => {
  it('checks 를 비우면 종전 세 검사만, 적으면 적은 것만', () => {
    expect(Object.keys(checkNorms(LIST_DOC)).sort()).toEqual(['comma', 'punct', 'spacing']);
    expect(Object.keys(checkNorms(LIST_DOC, { checks: ['listEnd', 'abbrev'] }))).toEqual(['listEnd', 'abbrev']);
    const all = checkNorms(ABBR_DOC, { checks: ['spacing', 'punct', 'comma', 'listEnd', 'abbrev'] });
    const old = checkNorms(ABBR_DOC);
    for (const k of ['spacing', 'punct', 'comma'] as const) expect(all[k]).toEqual(old[k]);
  });

  it('MCP check_norms · runToego 가 새 이름을 받는다(모르는 이름은 여전히 거절)', async () => {
    type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
    const tools: Reg[] = [];
    registerDocs({ registerTool: (name: string, _cfg: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
    const t = tools.find((x) => x.name === 'check_norms')!;
    const viaTool = JSON.parse((await t.handler({ text: LIST_DOC, checks: ['listEnd', 'abbrev'] })).content[0].text);
    expect(viaTool).toMatchObject({ ok: true, listEnd: { counts: { A: 0, B: 1 } }, abbrev: { counts: { A: 0, B: 0 } } });
    expect(viaTool.spacing).toBeUndefined();
    const r = runToego({ text: LIST_DOC, norms: { checks: ['listEnd', 'abbrev'] } });
    expect(r.norms).toEqual(viaTool);
    expect(runToego({ text: '가', norms: { checks: ['listend'] } }).error).toBe('INVALID_ARGS');
  });
});

describe('check_norms listEnd·abbrev — 길이에 비례해 끝난다', () => {
  it('40만 자 글도 빠르다', () => {
    const block = ['- 가상 항목입니다.', '- 가상 항목', '- 가상 항목입니다.', '한국가상공사와 가상공사는 같다.', '| 표 | 가상공사 |', ''].join('\n');
    const text = Array.from({ length: Math.ceil(400_000 / block.length) }, () => block).join('\n');
    const t = performance.now();
    const r = checkNorms(text, { checks: ['listEnd', 'abbrev'], cap: 500 });
    expect(performance.now() - t).toBeLessThan(3000);
    expect(r.listEnd.counts.B).toBeGreaterThan(0);
    expect(r.abbrev.truncated).toBe(true);
  });

  it('병적 입력 — 긴 한 줄·닫히지 않는 괄호·겹친 정의·많은 기관명', { timeout: 20_000 }, () => {
    const t = performance.now();
    expect(abbrev('한국가상공사 '.repeat(50_000)).counts.B).toBe(0);
    expect(abbrev(`한국가상공사\n${'가상공사 '.repeat(50_000)}`).counts.B).toBe(50_000);
    expect(abbrev('(이하'.repeat(80_000)).counts.B).toBe(0);
    expect(abbrev(`가${'('.repeat(100_000)}이하 가상공사)`).counts.B).toBe(0);
    const many = Array.from({ length: 20_000 }, (_, i) => `한국가${String.fromCharCode(0xac00 + (i % 11_172))}${String.fromCharCode(0xac00 + Math.floor(i / 11_172))}공사`).join(' ');
    expect(abbrev(many).counts.B).toBe(0);
    expect(listEnd(`- 가${'('.repeat(100_000)}`).counts.B).toBe(0);
    expect(listEnd(`- 가${')'.repeat(100_000)}`).counts.B).toBe(0);
    expect(listEnd(`- 가${'()'.repeat(100_000)}`).counts.B).toBe(0);
    expect(listEnd(Array.from({ length: 60_000 }, (_, i) => (i % 2 ? '- 가상입니다.' : '- 가상')).join('\n')).counts.B).toBe(0);
    expect(listEnd(Array.from({ length: 60_000 }, (_, i) => (i % 6 ? '- 가상입니다.' : '- 가상')).join('\n')).counts.B).toBe(10_000);
    expect(performance.now() - t).toBeLessThan(10_000);
  });
});
