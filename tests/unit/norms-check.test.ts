// 퇴고 check_norms — 공개 규범 검사(한글 맞춤법 제5장 띄어쓰기 · 부록 문장 부호 · 연결어미 뒤 쉼표).
// 합성 문장만 쓴다. 기대값은 옮기기 전 파이썬 검사기(spacing_check·punct_check·comma_check)가 같은 글에 낸 값이다.
import { describe, expect, it } from 'vitest';
import { checkNorms } from '../../tools/k-labor/lib/prose/norms.mjs';
import { registerDocs } from '../../tools/k-labor/groups/docs.mjs';

const SPACING = [
  '# 합성 시험 원고 — 띄어쓰기',
  '',
  '이사장및 이사들이 참석하였음.',
  '관계 회사 및협력 회사에 통지함.',
  '그렇게 볼 수 밖에 없음.',
  '가상법 제 63조에 따름.',
  '도급인이 할수 있는 조치임.',
  '확인할 수 있는것이 확인되었음.',
  '가상 시설을 관리하는것으로 봄.',
  '이사장 및 이사들이 참석하였음.',
  '그렇게 볼 수밖에 없음.',
  '주 4.5일제 70%가 찬성하였음.',
  '법대로 처리하였고 너만큼 잘하였음.',
  '> 인용문은 검사하지 않는다 — 이사장및 이사들, 제 63조, 할수 있다',
  '문장 안 원문 인용도 검사하지 않는다 — 그는 “직원들은 야근을 할 수 밖에 없다”라고 적었음.',
  '| 표 칸 | 할수 있다 |',
  '[관련 판결] 제 3조 할수',
  '책상·걸상등이 있음.',
  '계약금액 12억3456만 원임.',
].join('\n');

const PUNCT = [
  '# 합성 시험 원고 — 문장 부호',
  '',
  '사과, 배, ……귤이 있음.',
  '사과 , 배가 있음.',
  '회의를 마쳤음 .',
  '가상 회사( 본사 )에서 열렸음.',
  '사과,,배와 귤、감이 있음.',
  '기간 : 3일.',
  '그는 “ 근무시간 ”을 말했음.',
  '그는 ‘ 시간 ’이라고 했음.',
  '’24. 10. 보고서임.',
  '사과, 배, 그리고 귤이 있음.',
  '5,6세기의 일이며 2,680시간이 걸렸음.',
  '기다렸다...그리고 끝났음.',
  '가ㆍ나와 다, 라ㆍ마가 있음.',
  '제52조 (징계)와 가상 회사 (본사)임.',
  '그는 “사과 , 배”라고 했음.',
  '> 인용 , 줄은 보지 않음',
].join('\n');

const COMMA = [
  '# 합성 시험 원고 — 쉼표',
  '',
  '회사는 이를 검토하였고, 그 결과를 알렸음.',
  '근로자가 동의하였으며, 회사도 받아들였음.',
  '징계 종류는 경고, 견책, 감급이 있음.',
  '보고, 신고, 참고 자료를 냄.',
  '그는 “검토하였고, 알렸다”라고 말했음.',
  '이상과 같이, 회신함.',
  '> 판결은 검토하였고, 그 결과를 알렸다',
  '2026. 11. 24, 가상 회사에서.',
  '다만, 예외가 있음.',
  '그러나, 결과는 같았음.',
  '따라서,\t결론을 냄.',
  '사실이 인정되는 경우,',
].join('\n');

const brief = (hits: { line: number; grade: string; word: string; ctx: string; basis?: string }[]) => hits.map((h) => [h.grade, h.line, h.word, h.ctx, h.basis]);

describe('check_norms — 띄어쓰기(제5장)', () => {
  it('파이썬 spacing_check 와 같은 걸림 — 인용·표·판결 줄·문장 안 “ ” 는 보지 않는다', () => {
    const r = checkNorms(SPACING, { checks: ['spacing'] }).spacing;
    expect(r.counts).toEqual({ A: 7, B: 2 });
    expect(brief(r.hits)).toEqual([
      ['A', 3, '장및', '이사장및 이사들이 참석', '제45항'],
      ['A', 4, '및협', '관계 회사 및협력 회사에 통지', '제45항'],
      ['A', 5, '수 밖에', '그렇게 볼 수 밖에 없음.', '제41항'],
      ['A', 6, '제 6', '가상법 제 63조에 따름.', '제43항 다만'],
      ['A', 7, '할수', '도급인이 할수 있는 조치임.', '제42항'],
      ['A', 8, '있는것', '확인할 수 있는것이 확인되었음.', '제42항'],
      ['A', 9, '하는것', '상 시설을 관리하는것으로 봄.', '제42항'],
      ['B', 18, '상·걸상등', '책상·걸상등이 있음.', '제45항'],
      ['B', 19, '억', '계약금액 12억3456만 원임', '제44항'],
    ]);
    expect(r.hits[0]).toMatchObject({ col: 3, len: 2, reason: '「및」은 띄어 쓴다(이사장 및 이사들)' });
  });

  it('quote 를 켜면 > 줄과 “ ” 안도 본다(표·판결 줄은 여전히 뺀다)', () => {
    const r = checkNorms(SPACING, { checks: ['spacing'], quote: true }).spacing;
    expect(r.counts.A).toBe(7 + 3 + 1);
  });

  it('줄 나눔은 파이썬 splitlines 와 같다(CRLF·U+2028 도 줄을 나눈다)', () => {
    const r = checkNorms('첫 줄\r\n이사장및 이사 할수 있다', { checks: ['spacing'] }).spacing;
    expect(r.hits.map((h: { line: number }) => h.line)).toEqual([2, 3]);
  });
});

describe('check_norms — 문장 부호(부록)', () => {
  it('파이썬 punct_check 와 같은 걸림 — 따옴표 안은 글자로 채워 보고, 따옴표 띄어쓰기는 원문으로 본다', () => {
    const r = checkNorms(PUNCT, { checks: ['punct'] }).punct;
    expect(r.counts).toEqual({ A: 12, B: 6 });
    expect(r.hits.map((h: { grade: string; line: number; word: string }) => [h.grade, h.line, h.word])).toEqual([
      ['A', 3, ', ……'], ['A', 4, ' ,'], ['A', 5, '음 .'], ['A', 6, '( '], ['A', 6, ' )'], ['A', 7, ',,'], ['A', 7, '、'], ['A', 8, '간 :'],
      ['A', 9, '“ '], ['A', 9, ' ”'], ['A', 10, '‘ '], ['A', 10, ' ’'],
      ['B', 12, ', 그리고 '], ['B', 13, '5,6'], ['B', 14, '...'], ['B', 15, '가ㆍ나와 다, 라ㆍ'], ['B', 16, '조 ('], ['B', 16, '사 ('],
    ]);
    expect(r.hits[12]).toMatchObject({ ctx: '사과, 배, 그리고 귤이 있음.', basis: '§4 (1) 해설' });
    expect(r.hits[17]).toMatchObject({ ctx: '조 (징계)와 가상 회사 (본사)임.' });
  });

  it('quote 를 켜면 > 줄과 따옴표 안도 본다', () => {
    const r = checkNorms(PUNCT, { checks: ['punct'], quote: true }).punct;
    expect(r.counts.A).toBe(12 + 2);
  });
});

describe('check_norms — 연결어미 뒤 쉼표', () => {
  it('파이썬 comma_check 와 같은 걸림 — 「고」로 끝나는 명사·인용·> 줄·「이상과 같이,」는 뺀다', () => {
    const r = checkNorms(COMMA, { checks: ['comma'] }).comma;
    expect(r.counts).toEqual({ A: 6, B: 0 });
    expect(r.hits.map((h: { line: number; ctx: string }) => [h.line, h.ctx])).toEqual([
      [3, '회사는 이를 검토하였고, 그 결과를 알렸음'],
      [4, '근로자가 동의하였으며, 회사도 받아들였음'],
      [11, '다만, 예외가 있음.'],
      [12, '그러나, 결과는 같았음.'],
      [13, '따라서,\t결론을 냄.'],
      [14, '사실이 인정되는 경우,'],
    ]);
  });

  it('warnOnly 면 같은 걸림을 B 로 낸다(PDF·PPTX 추출본)', () => {
    const r = checkNorms(COMMA, { checks: ['comma'], warnOnly: true }).comma;
    expect(r.counts).toEqual({ A: 0, B: 6 });
  });

  it('줄은 \\n 으로만 나눈다(파이썬 split("\\n"))', () => {
    const r = checkNorms('검토하였고, 그 결과를 알렸음', { checks: ['comma'] }).comma;
    expect(r.counts.A).toBe(0);
  });
});

describe('check_norms — 공통', () => {
  it('checks 를 비우면 셋 다 돈다', () => {
    const r = checkNorms('도급인이 할수 있는 조치임 .');
    expect(Object.keys(r).sort()).toEqual(['comma', 'punct', 'spacing']);
    expect(r.spacing.counts.A).toBe(1);
    expect(r.punct.counts.A).toBe(1);
  });

  it('hits 는 상한까지(A 먼저) + truncated, counts 는 전부', () => {
    const text = Array.from({ length: 30 }, () => '할수 있음.').join('\n');
    const r = checkNorms(text, { checks: ['spacing'], cap: 10 }).spacing;
    expect(r.counts.A).toBe(30);
    expect(r.hits).toHaveLength(10);
    expect(r.truncated).toBe(true);
  });

  it('40만 자 글도 빠르다', () => {
    const line = '회사는 이를 검토하였고, 그 결과를 알렸음. 도급인이 할수 있는 조치임 . 사과 , 배가 있음.';
    const text = Array.from({ length: Math.ceil(400_000 / line.length) }, () => line).join('\n');
    const t = performance.now();
    checkNorms(text, { cap: 500 });
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe('docs 묶음 — check_norms 도구', () => {
  type Reg = { name: string; handler: (a: object) => Promise<{ content: { text: string }[] }> };
  const tools: Reg[] = [];
  registerDocs({ registerTool: (name: string, _cfg: unknown, handler: Reg['handler']) => tools.push({ name, handler }) });
  const t = tools.find((x) => x.name === 'check_norms')!;
  const call = async (a: object) => JSON.parse((await t.handler(a)).content[0].text);

  it('셋을 돌려 ok 와 함께 낸다, 주민번호 모양이면 멈춘다', async () => {
    const r = await call({ text: '도급인이 할수 있는 조치임.', checks: ['spacing', 'comma'] });
    expect(r).toMatchObject({ ok: true, spacing: { counts: { A: 1, B: 0 } }, comma: { counts: { A: 0, B: 0 } } });
    expect(r.punct).toBeUndefined();
    const stop = await call({ text: '주민번호 900101-1234567 이 있는 글' });
    expect(stop.ok).toBe(false);
    expect(stop.error).toContain('주민등록번호');
  });
});
