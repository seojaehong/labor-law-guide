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

  it('decimals and out-of-order numbers are not headings', () => {
    const reason = [
      '1. 기초사실',
      '원고의 연장근로수당은 통상임금의',
      '1.5배로 계산한다.',
      '7. 판단 아닌 줄',
      '2. 판단',
      '해고는 무효이다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('2. 판단')));
  });

  // 표제 자리 번호에 문장이 오고 뒤에 같은 번호 표제가 또 나오면 어느 쪽이 진짜 표제인지 가릴 수 없다 — 이유 전체로 물러난다.
  // (앞 문장이 「~본다」로 끝난 진짜 판단 표제일 수 있다. 뒤쪽에서 자르면 그 판단 글자가 빠진다.)
  it('falls back to the whole 이유 when a numbered sentence takes the place of a heading number that appears again later', () => {
    const reason = [
      '1. 기초사실',
      '사실.',
      '2. 원고는 2019. 1. 1. 입사하여 근무하였다.',
      '7. 판단 아닌 줄',
      '2. 판단',
      '해고는 무효이다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason);
  });

  // 본문에 인용한 호 목록(취업규칙·법령의 1. 2. 3.)은 최상위 표제가 아니다 — 표제 뒤에서 1. 부터 다시 시작한 목록이다.
  it('a numbered list restarting at 1. under 기초사실 does not take the next heading number', () => {
    const reason = [
      '1. 기초사실',
      '가. 원고는 2015. 3. 2. 피고에 입사하였다.',
      '나. 피고 취업규칙 제55조(징계사유)는 다음과 같다.',
      '1. 법령 또는 회사 규정을 위반한 때',
      '2. 직무상 의무를 위반하거나 직무를 태만히 한 때',
      '3. 회사의 명예를 훼손한 때',
      '다. 피고는 2019. 6. 1. 원고를 해고하였다.',
      '2. 당사자의 주장',
      '원고는 해고가 무효라고 주장한다.',
      '3. 판단',
      '원고에게 해고 사유가 있다고 보기 어렵다.',
      '4. 결론',
      '원고의 청구는 이유 있다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('3. 판단')));
  });

  it('a statute quoted under 관계법령 with four or more items does not take the next heading number', () => {
    const reason = [
      '1. 처분의 경위',
      '피고는 원고에게 해임처분을 하였다.',
      '2. 원고의 주장',
      '이 사건 처분은 재량권을 일탈하였다.',
      '3. 관계법령',
      '근로기준법 제2조(정의)',
      '1. "근로자"란 임금을 목적으로 근로를 제공하는 사람을 말한다.',
      '2. "사용자"란 사업주 또는 사업 경영 담당자를 말한다.',
      '3. "근로"란 정신노동과 육체노동을 말한다.',
      '4. "근로계약"이란 근로자가 근로를 제공하고 임금을 지급하는 계약',
      '5. "임금"이란 근로의 대가로 지급하는 금품',
      '4. 처분의 적법 여부',
      '징계사유는 인정된다.',
      '5. 결론',
      '원고의 청구를 기각한다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('4. 처분의 적법 여부')));
  });

  it('indented statute items under 관계 법령 are not top headings', () => {
    const reason = '1. 관계 법령\n근로기준법\n  1. 근로계약의 체결\n  2. 근로계약의 종료\n2. 판단\n해고는 무효이다.\n3. 결론\n인용한다.';
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('2. 판단')));
  });

  it('a long judgment heading followed by a quoted list never loses the judgment text', () => {
    const reason = [
      '1. 기초사실',
      '사실.',
      '2. 이 사건 근로계약 종료가 해고에 해당하는지 여부와 해고에 해당한다면 근로기준법 제23조 제1항의 정당한 이유가 있는지 여부에 관한 판단',
      '가. 관련 법리',
      '법리 문단이다.',
      '나. 피고 취업규칙 제55조는 다음과 같다.',
      '1. 무단결근 7일 이상',
      '2. 업무상 횡령',
      '다. 그러므로 해고는 무효이다.',
      '3. 결론',
      '원고의 청구를 인용한다.',
    ].join('\n');
    const part = judged(reason);
    expect(part).toContain('가. 관련 법리\n법리 문단이다.');
    expect(part).toContain('이유가 있는지 여부에 관한 판단');
  });

  it('a judgment heading phrased as a sentence followed by a quoted list never loses the judgment text', () => {
    const scale = [
      '1. 기초사실', '사실.', '2. 원고의 주장', '주장.',
      '3. 이 사건 해고의 정당성에 관하여 살펴본다', '해고 사유는 인정된다.', '피고 규정상 징계의 종류는 다음과 같다.',
      '1. 해고', '2. 정직', '3. 감봉', '4. 견책', '따라서 해고는 정당하다.',
      '4. 결론', '기각한다.',
    ].join('\n');
    expect(judged(scale)).toContain('3. 이 사건 해고의 정당성에 관하여 살펴본다\n해고 사유는 인정된다.');
    const lawful = [
      '1. 처분의 경위', '경위.', '2. 이 사건 처분이 적법한지에 관하여 본다', '가. 징계사유는 인정된다.', '나. 징계의 종류',
      '1. 견책', '2. 감봉', '3. 정직', '다. 해임은 재량권을 일탈하였다.',
    ].join('\n');
    expect(judged(lawful)).toContain('2. 이 사건 처분이 적법한지에 관하여 본다\n가. 징계사유는 인정된다.');
  });

  // 인용 목록 번호와 다음 표제 번호가 겹칠 때, 판단·결론·건너뛸 표제 글자면 목록 항목이 아니라 표제로 본다.
  it('a heading whose number continues a quoted list is still a heading when it reads 판단, 결론 or a skipped title', () => {
    const reason = '1. 기초사실\n사실.\n2. 원고의 주장\n원고는 다음 사유를 다툰다.\n1. 사유 하나\n2. 사유 둘\n3. 판단\n해고 사유가 인정되지 않는다.\n4. 결론\n인용한다.';
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('3. 판단')));
    const single = '1. 기초사실\n가. 징계사유는 다음과 같다.\n1. 무단결근\n2. 원고의 주장\n주장.\n3. 판단\n판단문.\n4. 결론\n인용한다.';
    expect(judged(single)).toBe(single.slice(single.indexOf('3. 판단')));
  });

  // 목록 밖에서 이미 지난 표제 번호가 다시 나오면 번호 구조를 믿을 수 없다 — 뒤쪽에서 자르면 판단이 빠질 수 있어 이유 전체로 물러난다.
  it('falls back to the whole 이유 when a number already used by a heading appears again outside a list', () => {
    const stray = '1. 기초사실\n사실.\n2. 원고의 주장\n주장.\n1. 사유 하나\n2. 사유 둘\n3. 판단\n해고 사유가 인정되지 않는다.\n2. 무단결근\n3. 업무상 횡령\n4. 결론\n인용한다.';
    const part = judged(stray);
    expect(part).toContain('3. 판단\n해고 사유가 인정되지 않는다.');
    expect(part).toBe(stray);
    const same = '1. 기초사실\n사실.\n2. 원고의 주장\n주장.\n1. 사유 하나\n2. 사유 둘\n3. 판단\n해고 사유가 인정되지 않는다.\n3. 업무상 횡령\n4. 결론\n인용한다.';
    expect(judged(same)).toContain('3. 판단\n해고 사유가 인정되지 않는다.');
  });

  it('a date wrapped onto the start of a line (「2. 15. …」) is not a heading', () => {
    const reason = [
      '1. 기초사실',
      '가. 피고는 2019.',
      '2. 15. 징계위원회를 열어 원고를 해고하기로 의결하고',
      '같은 날 이를 통지하였다.',
      '2. 당사자의 주장',
      '주장.',
      '3. 판단',
      '해고 사유가 인정되지 않는다.',
      '4. 결론',
      '인용한다.',
    ].join('\n');
    expect(judged(reason)).toBe(reason.slice(reason.indexOf('3. 판단')));
  });

  // 판단이 건너뛸 절 안의 하위 표제(「나. 판단」)로 들어 있으면 그 절을 건너뛰지 않는다.
  it('does not skip a fact, claim or issue section that holds a 판단 sub-heading', () => {
    const claim = '1. 기초사실\n사실.\n2. 원고의 주장\n가. 주장의 요지\n해고는 무효이다.\n나. 판단\n해고 사유가 인정되므로 원고의 주장은 받아들이지 않는다.\n3. 결론\n원고의 청구를 기각한다.';
    const part = judged(claim);
    expect(part).toBe(claim.slice(claim.indexOf('2. 원고의 주장')));
    expect(part).toContain('해고 사유가 인정되므로 원고의 주장은 받아들이지 않는다.');
    const issue = '1. 처분의 경위\n경위.\n2. 쟁점\n가. 쟁점의 정리\n쟁점은 징계양정이다.\n나. 판단\n(1) 징계양정\n재량권을 일탈하지 않았다.\n3. 결론\n기각한다.';
    expect(judged(issue)).toBe(issue.slice(issue.indexOf('2. 쟁점')));
  });

  // 건너뛴 뒤 결론만 남으면 판단은 앞 절 안에 표제 없이 들어 있다 — 결론 한 줄을 요지로 내지 않는다.
  it('returns the whole 이유 when only the conclusion remains after the skipped headings', () => {
    const reason = '1. 기초사실\n사실.\n2. 원고의 주장\n원고는 해고가 무효라고 주장하나, 해고 사유가 인정되므로 받아들이지 않는다.\n3. 결론\n기각한다.';
    expect(judged(reason)).toBe(reason);
  });

  it('skips 「이 사건의 경위」 and other common background headings', () => {
    for (const heading of ['이 사건의 경위', '처분 경위', '사건 경위', '다툼 없는 사실', '이 사건 처분의 경위 및 재심판정의 내용']) {
      const reason = `1. ${heading}\n경위.\n2. 판단\n판단한다.\n3. 결론\n기각한다.`;
      expect(judged(reason), heading).toBe(reason.slice(reason.indexOf('2. 판단')));
    }
  });

  it('trims only leading and trailing blank lines and keeps inner spacing verbatim', () => {
    const reason = '\n\n1. 기초사실\n사실.\n\n\n3. 아님\n2. 판단   \n가.  띄어 쓴   글자\n\n\n\n끝.  \n\n';
    const part = judged(reason);
    // 마지막 글자 줄의 줄 끝 공백도 원문 그대로 둔다 — 떼는 것은 빈 줄뿐이다.
    expect(part).toBe('2. 판단   \n가.  띄어 쓴   글자\n\n\n\n끝.  ');
  });

  it('keeps the leading spaces of the first line and the trailing spaces of the last line', () => {
    expect(judged('\n   \n  1. 판단 없이 시작\n끝.  \r\n \r\n')).toBe('  1. 판단 없이 시작\n끝.  ');
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
