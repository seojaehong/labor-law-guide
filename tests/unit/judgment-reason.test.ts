import { describe, expect, it } from 'vitest';
import { extractJudgmentPart, findReasonText } from '@/lib/judgment-reason';

// 판결문 이유 중 「판단 부분」을 원문 글자 그대로 잘라 낸다 — 다듬기·이어붙이기·공백 정리 없이 연속 구간 하나.
const judged = (reason: string) => {
  const part = extractJudgmentPart(reason);
  // 반환값은 언제나 입력의 부분 문자열이다(원문 왜곡 금지).
  expect(reason.includes(part), part).toBe(true);
  return part;
};

describe('extractJudgmentPart', () => {
  it('skips 기초사실 and 당사자의 주장 and starts at 3. 판단, keeping 결론', () => {
    const reason = [
      '1. 기초사실',
      '가. 원고는 2015. 3. 2. 피고에 입사하였다.',
      '나. 피고는 2019. 6. 1. 원고를 해고하였다.',
      '',
      '2. 당사자의 주장',
      '원고는 해고가 무효라고 주장한다.',
      '',
      '3. 판단',
      '가. 해고의 정당성',
      '  원고에게 해고 사유가 있다고 보기 어렵다.',
      '',
      '4. 결론',
      '원고의 청구는 이유 있다.',
    ].join('\n');
    const part = judged(reason);
    expect(part).toBe(reason.slice(reason.indexOf('3. 판단')));
    expect(part.startsWith('3. 판단\n가. 해고의 정당성\n  원고에게')).toBe(true);
    expect(part.endsWith('4. 결론\n원고의 청구는 이유 있다.')).toBe(true);
  });

  it('skips 처분의 경위·원고의 주장·관계법령 and ignores statute items quoted under 관계법령', () => {
    const reason = [
      '1. 처분의 경위',
      '피고는 원고에게 해임처분을 하였다.',
      '2. 원고의 주장',
      '이 사건 처분은 재량권을 일탈하였다.',
      '3. 관계법령',
      '국가공무원법 제78조(징계 사유)',
      '1. 이 법 및 이 법에 따른 명령을 위반한 경우',
      '2. 직무상의 의무를 위반하거나 직무를 태만히 한 때',
      '4. 처분의 적법 여부',
      '가. 징계사유의 존부',
      '징계사유는 인정된다.',
      '5. 결론',
      '원고의 청구를 기각한다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('4. 처분의 적법 여부')));
  });

  it('keeps the whole 이유 when the first heading is not a fact, claim or statute heading', () => {
    const reason = '1. 제1심 판결의 인용\n이 법원이 이 사건에 관하여 쓸 이유는 다음과 같이 고쳐 쓰는 외에는 제1심 판결의 이유와 같다.\n2. 고쳐쓰는 부분\n제1심 판결 제5쪽 제3행을 고친다.\n3. 결론\n항소를 기각한다.';
    expect(judged(reason)).toBe(reason);
  });

  it('keeps a preamble before a non-skipped first heading', () => {
    const reason = '상고이유를 판단한다.\n\n1. 상고이유 제1점에 관하여\n원심의 판단은 정당하다.\n2. 상고이유 제2점에 관하여\n이유 없다.';
    expect(judged(reason)).toBe(reason);
  });

  it('starts at the first claim-specific judgment heading after 기초사실', () => {
    const reason = '1. 기초사실\n원고는 교사로 임용되었다.\n2. 이 사건 임용취소결정의 무효 확인 청구에 관한 판단\n임용취소결정은 무효이다.\n3. 임금 청구에 관한 판단\n피고는 임금을 지급할 의무가 있다.\n4. 결론\n원고의 청구를 인용한다.';
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('2. 이 사건 임용취소결정')));
  });

  it('a judgment heading that only mentions a claim or an issue is not skipped', () => {
    const claim = '1. 기초사실\n사실.\n2. 원고의 주장에 대한 판단\n이유 없다.\n3. 결론\n기각한다.';
    expect(judged(claim)).toBe(claim.slice(claim.indexOf('2. 원고의 주장에 대한 판단')));
    const issue = '1. 이 사건의 쟁점\n쟁점은 해고의 정당성이다.\n2. 쟁점에 관한 판단\n해고는 정당하다.';
    expect(judged(issue)).toBe(issue.slice(issue.indexOf('2. 쟁점에 관한 판단')));
    const misfinding = '1. 사실오인 주장에 관하여\n원심의 사실인정은 정당하다.\n2. 법리오해 주장에 관하여\n이유 없다.';
    expect(judged(misfinding)).toBe(misfinding);
  });

  it('skips compound and spaced fact headings', () => {
    const reason = '1. 기초 사실 및 처분의 경위 등\n사실.\n2. 당사자들의 주장 요지\n주장.\n3. 관 련 법 령\n법령.\n4. 판 단\n판단.\n5. 결 론\n결론.';
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('4. 판 단')));
    const retrial = '1. 이 사건 재심판정의 경위\n경위.\n2. 이 사건 재심판정의 적법 여부\n적법하다.';
    expect(judged(retrial)).toBe(retrial.slice(retrial.indexOf('2. 이 사건 재심판정의 적법 여부')));
  });

  it('returns the whole 이유 when nothing remains after the skipped headings', () => {
    const reason = '1. 기초사실\n사실.\n2. 원고의 주장\n주장.';
    expect(judged(reason)).toBe(reason);
  });

  it('returns the whole 이유 when there is no numbered heading or only lower-level ones', () => {
    const plain = '상고이유를 판단한다.\n원심의 판단에 잘못이 없다.\n\n대법관 합성';
    expect(judged(plain)).toBe(plain);
    const lower = '가. 기초사실\n사실.\n나. 판단\n(1) 해고 사유\n판단.\n1) 세부\n세부.';
    expect(judged(lower)).toBe(lower);
  });

  it('numbered sentences, decimals and out-of-order numbers are not headings', () => {
    const reason = [
      '1. 기초사실',
      '원고의 연장근로수당은 통상임금의',
      '1.5배로 계산한다.',
      '2. 원고는 2019. 1. 1. 입사하여 근무하였다.',
      '7. 판단 아닌 줄',
      '2. 판단',
      '해고는 무효이다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('2. 판단')));
  });

  it('trims only leading and trailing blank lines and keeps inner spacing verbatim', () => {
    const reason = '\n\n1. 기초사실\n사실.\n\n\n3. 아님\n2. 판단   \n가.  띄어 쓴   글자\n\n\n\n끝.  \n\n';
    const part = judged(reason);
    expect(part).toBe('2. 판단   \n가.  띄어 쓴   글자\n\n\n\n끝.');
  });

  it('works on CRLF text without changing the line endings', () => {
    const reason = '1. 기초사실\r\n사실.\r\n2. 판단\r\n판단한다.\r\n3. 결론\r\n기각한다.';
    const part = judged(reason);
    expect(part).toBe('2. 판단\r\n판단한다.\r\n3. 결론\r\n기각한다.');
  });

  it('returns an empty string for blank input', () => {
    expect(extractJudgmentPart('  \n ')).toBe('');
  });
});

describe('findReasonText', () => {
  it('takes the section titled 이유, ignoring spaces in the title', () => {
    const sections = [
      { title: '', text: '사 건 2019두1', type: 'head' },
      { title: '주문', text: '상고를 기각한다.' },
      { title: '이 유', text: '1. 기초사실\n사실.' },
    ];
    expect(findReasonText(sections, '무시되는 전문')).toBe('1. 기초사실\n사실.');
  });

  it('falls back to the text after a line that reads 이유 in the collected full text', () => {
    const full = '서울행정법원\n판결\n주 문\n원고의 청구를 기각한다.\n이    유\n1. 처분의 경위\n경위.\n2. 판단\n판단.';
    const reason = findReasonText([], full);
    expect(reason).toBe('1. 처분의 경위\n경위.\n2. 판단\n판단.');
    expect(full.includes(reason!)).toBe(true);
    expect(findReasonText([{ title: '주문', text: '기각.' }], '주문\n기각.\n【이    유】\n판단한다.')).toBe('판단한다.');
    expect(findReasonText([], '머리\r\n이 유\r\n판단한다.\r\n끝.')).toBe('판단한다.\r\n끝.');
    // 이유 절이 따로 없고 전문도 없으면 절 글자 안의 표지 줄을 찾는다.
    expect(findReasonText([{ title: '', text: '주문\n기각.\n이 유\n판단.' }], '')).toBe('판단.');
  });

  it('does not treat 이유 inside a sentence as the marker', () => {
    expect(findReasonText([], '원고의 청구는 이유 없다.\n상고이유를 판단한다.')).toBeNull();
    expect(findReasonText([{ title: '이유', text: '   ' }], '')).toBeNull();
    expect(findReasonText([], '')).toBeNull();
  });
});
