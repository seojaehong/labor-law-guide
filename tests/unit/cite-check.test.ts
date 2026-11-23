// 판례 인용 대조(check_citations) — 결정론 대조. 대조 규칙은 ~/.claude/scripts/quote_check.py 와 같다(261123 이전).
// 합성 판결문·합성 인용 — 실제 사건이 아니다.
import { describe, expect, it, vi } from 'vitest';
import { checkCitations, matchPiece, parseCitationBlocks, VERDICT } from '../../tools/k-labor/lib/cite-check.mjs';

const BODY = [
  '【이 유】',
  '1. 징계양정의 판단',
  '피징계자에게 징계사유가 있어 징계처분을 하는 경우 어떠한 처분을 할 것인가는 징계권자의 재량에 맡겨진 것이다.',
  '다만 징계권자가 재량권의 행사로서 한 징계처분이 사회통념상 현저하게 타당성을 잃어 징계권자에게 맡겨진 재량권을 남용한 것이라고 인정되는 경우에 한하여 그 처분을 위법하다고 할 수 있다.',
].join('\n');

const DOC = [
  '## 3. 양정',
  '',
  '> [관련 판결] 대법원 2099. 1. 9. 선고 2099다1 판결',
  '> 피징계자에게 징계사유가 있어 징계처분을 하는 경우 어떠한 처분을 할 것인가는 징계권자의 재량에 맡겨진 것이다.',
  '> (중략)',
  '> 다만 징계권자가 재량권의 행사로서 한 징계처분이 사회통념상 현저하게 타당성을 잃어 징계권자에게 맡겨진 재량권을 남용한 것이라고 인정되는 경우에 한한다.',
  '',
  '[관련 판결] 서울행정법원 2099. 2. 1. 선고 2099구합2 판결',
  '원고의 행위는 회사의 질서를 크게 어지럽힌 것으로서 그 비위 정도가 가볍지 않다.',
  '',
  '> [관련 판결] 대전고등법원 2099. 3. 1. 선고 2099나3 판결',
  '> (사안 및 판단 요지) 팀장이 부하 직원에게 폭언한 사안에서 정직이 적정하다고 보았다.',
].join('\n');

describe('인용 블록 읽기', () => {
  it('md 인용(>) 블록과 머리줄 아래 인용부호 없는 블록(풍산식)을 모두 읽고, (중략)·…로 조각을 나눈다', () => {
    const b = parseCitationBlocks(DOC);
    expect(b.map((x) => [x.court, x.caseNo])).toEqual([['대법원', '2099다1'], ['서울행정법원', '2099구합2'], ['대전고등법원', '2099나3']]);
    expect(b[0].pieces).toHaveLength(2);
    expect(b[0].line).toBe(3);
    expect(b[1].pieces).toEqual(['원고의 행위는 회사의 질서를 크게 어지럽힌 것으로서 그 비위 정도가 가볍지 않다.']);
    expect(b[2].summary).toBe(true);
  });
});

describe('글자 대조(quote_check 와 같은 규칙)', () => {
  it('공백·따옴표·문장부호 차이는 일치, 몇 글자 바뀌면 근사, 다른 문장이면 불일치', () => {
    expect(matchPiece('피징계자에게  징계사유가 있어 “징계처분”을 하는 경우', BODY).verdict).toBe(VERDICT.SAME);
    expect(matchPiece('피징계자에게 징계사유가 있어 징계처분을 하는 경우 어떠한 처분을 할 것인지는 징계권자의 재량에 맡겨진 것이다', BODY).verdict).toBe(VERDICT.NEAR);
    expect(matchPiece('근로자가 무단결근을 반복한 것은 근로계약상 의무를 저버린 것이다', BODY).verdict).toBe(VERDICT.DIFF);
  });
});

describe('checkCitations', () => {
  it('대법원은 법제처 전문을 받아 대조한다 — 끝을 바꾼 조각은 근사·불일치로 잡힌다', async () => {
    const fetchBody = vi.fn(async (court: string, no: string) => (no === '2099다1' ? { court: '대법원', text: BODY, source: '법제처' } : null));
    const r = await checkCitations(DOC, { fetchBody });
    const sc = r.rows.filter((x) => x.caseNo === '2099다1');
    expect(sc.map((x) => x.verdict)).toEqual([VERDICT.SAME, VERDICT.NEAR]);
    expect(sc[0].source).toBe('법제처');
  });

  it('전문을 못 구하면 「전문 못 찾음」 — 「없는 판결」이라고 말하지 않는다', async () => {
    const r = await checkCitations(DOC, { fetchBody: async () => null });
    const row = r.rows.find((x) => x.caseNo === '2099구합2');
    expect(row?.verdict).toBe(VERDICT.NOT_FOUND);
    expect(JSON.stringify(r)).not.toMatch(/없는 판결|존재하지|판정|검증 완료|적법/);
  });

  it('같은 사건번호의 다른 법원 판결만 있으면 대조하지 않고 따로 알린다(같은 번호 다른 법원 선례)', async () => {
    const doc = '> [관련 판결] 대전고등법원 2099. 3. 1. 선고 2099나3 판결\n> 원고의 행위는 회사의 질서를 크게 어지럽힌 것으로서 그 비위 정도가 가볍지 않다.';
    const r = await checkCitations(doc, { fetchBody: async () => ({ court: '청주지방법원', text: '원고의 행위는 회사의 질서를 크게 어지럽힌 것으로서 그 비위 정도가 가볍지 않다.', source: '법제처' }) });
    expect(r.rows[0].verdict).toBe(VERDICT.OTHER_COURT);
  });

  it('붙여 넣은 전문이 있으면 그것을 먼저 쓰고 법제처를 부르지 않는다', async () => {
    const fetchBody = vi.fn(async () => null);
    const r = await checkCitations(DOC, { bodies: { '2099구합2': '…원고의 행위는 회사의 질서를 크게 어지럽힌 것으로서 그 비위 정도가 가볍지 않다…' }, fetchBody });
    expect(r.rows.find((x) => x.caseNo === '2099구합2')?.verdict).toBe(VERDICT.SAME);
    expect(fetchBody).not.toHaveBeenCalledWith(expect.anything(), '2099구합2');
  });

  it('요약 블록은 대조하지 않고 「요약(대조 제외)」로 세며, 사건마다 법제처는 한 번만 부른다', async () => {
    const fetchBody = vi.fn(async (_court: string, _no: string) => null);
    const r = await checkCitations(DOC + '\n\n> [관련 판결] 대법원 2099. 1. 9. 선고 2099다1 판결\n> 피징계자에게 징계사유가 있어 징계처분을 하는 경우', { fetchBody });
    expect(r.counts[VERDICT.SUMMARY]).toBe(1);
    expect(fetchBody.mock.calls.filter((c) => c[1] === '2099다1')).toHaveLength(1);
  });
});
