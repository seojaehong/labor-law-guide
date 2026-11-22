import { describe, expect, it } from 'vitest';
import { blockHeader, fmtDate, toBlocks, toMarkdown, toJsonl, toAiPaste, FIT } from '../../tools/k-labor/lib/sanction-format.mjs';
import { bannedHits } from '@/lib/tool-kit/banned';

// 합성 값 — 실제 판결 문장이 아니다
const short = {
  id: 'harass:서울행정법원|2099구합1',
  court: '서울행정법원', case_number: '2099구합1', decided_on: '2099-01-09', type: 'harass',
  disposition: '정직 3월', reason: '일부 인정', sanction: '적정', kind: '폭언·폭행',
  quote: '원고는 팀장으로서 부하 직원에게 반복하여 폭언을 하였다. 이러한 비위의 정도에 비추어 이 사건 정직 3월이 지나치게 무겁다고 보기 어렵다.',
  quote_fits: true,
  evidence: '원고가 회의 중 직원들에게 욕설을 한 사실이 인정된다.',
  generated_note: '팀장 폭언 정직 3월 유지',
};
const long = {
  ...short, id: 'attend:서울고등법원|2099누2', court: '서울고등법원', case_number: '2099누2', decided_on: '2099-12-31',
  type: 'attend', quote: '가'.repeat(FIT + 1) + '다.', quote_fits: false, evidence: null,
};

describe('sanction-format', () => {
  it('선고일은 「2099. 1. 9.」 꼴', () => {
    expect(fmtDate('2099-01-09')).toBe('2099. 1. 9.');
    expect(fmtDate(null)).toBe('');
  });

  it('머리줄은 정본 [관련 판결] 꼴 + 처분명 괄호(261122 결정)', () => {
    expect(blockHeader(short)).toBe('[관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결(정직 3월)');
    expect(blockHeader({ ...short, disposition: null })).toBe('[관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결');
  });

  it('블록 = 머리줄 + 발췌 원문 그대로(인용부호·칸 이름 없음)', () => {
    const { text } = toBlocks([short]);
    expect(text).toBe(`[관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결(정직 3월)\n${short.quote}`);
  });

  it('근거를 함께 달면 ❶ 사유 근거 ❷ 양정 발췌 — 둘 다 원문 그대로', () => {
    const { text } = toBlocks([short], { withEvidence: true });
    expect(text).toBe(`[관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결(정직 3월)\n❶ ${short.evidence}\n❷ ${short.quote}`);
  });

  it('검수 블록(block_body)이 있으면 그것을 싣고, 검수 통과가 아니면 블록에서 뺀다', () => {
    const vetted = { ...short, block_body: '❶ 합성 사실 문장이다.\n❷ 합성 양정 문장이다.', block_status: 'pass' };
    expect(toBlocks([vetted]).text).toBe(`${blockHeader(short)}\n${vetted.block_body}`);
    const rejected = { ...short, block_body: null, block_status: 'no_fit' };
    const r = toBlocks([rejected]);
    expect(r.text).toBe('');
    expect(r.overLength).toEqual(['서울행정법원 2099구합1']);
  });

  it('10줄을 넘는 발췌는 자르지 않고 블록에서 뺀 뒤 목록으로 알린다', () => {
    const { text, overLength } = toBlocks([short, long]);
    expect(text).not.toContain('2099누2');
    expect(overLength).toEqual(['서울고등법원 2099누2']);
    expect(text).not.toMatch(/…|\(중략\)/);
  });

  it('발췌 글자가 한 글자도 바뀌지 않는다(md·jsonl·AI 붙여넣기 모두)', () => {
    for (const out of [toMarkdown([short]), toJsonl([short]), toAiPaste([short])]) {
      expect(out).toContain(short.quote);
    }
  });

  it('jsonl 은 행마다 JSON 하나, 모델 메모는 원문과 다른 이름', () => {
    const lines = toJsonl([short, long]).trim().split('\n');
    expect(lines).toHaveLength(2);
    const o = JSON.parse(lines[0]);
    expect(o.quote).toBe(short.quote);
    expect(o).not.toHaveProperty('note');
    expect(o.ai_note).toBe(short.generated_note);
  });

  it('md 는 모델 메모를 「AI 정리 · 원문 아님」으로 표시한다', () => {
    const md = toMarkdown([short]);
    expect(md).toContain('AI 정리 · 원문 아님');
    expect(md).toContain(blockHeader(short));
  });

  it('AI 붙여넣기는 발췌를 바꾸지 말라는 지시와 원문/정리 구분을 담는다', () => {
    const t = toAiPaste([short]);
    expect(t).toMatch(/글자를 바꾸지/);
    expect(t).toContain('<발췌>');
    expect(t).toContain('<AI정리>');
  });

  it('우리가 쓴 문구에는 금지어가 없다(판결 원문 칸은 검사하지 않는다)', () => {
    const blank = { ...short, quote: 'Q', evidence: 'E', generated_note: 'N' };
    for (const out of [toBlocks([blank, { ...long, quote: 'Q' }], { withEvidence: true }).text, toMarkdown([blank]), toAiPaste([blank])]) {
      expect(bannedHits(out)).toEqual([]);
    }
  });
});
