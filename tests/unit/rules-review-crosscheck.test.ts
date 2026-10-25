// 스캔 쪽 두 판독 대조 — 모델이 읽은 줄의 숫자·날짜·조 번호·원문자가 두 번째 판독(tesseract)에도 나오는지
import { describe, expect, it } from 'vitest';
import { anchorsOf, attachChecks, crossCheck, summarize } from '@/lib/rules-review/ocr-crosscheck';

const PAGE = [
  '제5조(연차휴가) ① 1년간 80퍼센트 이상 출근한 직원에게 15일의 유급휴가를 준다. <개정 2024. 4. 26.>',
  '② 제1항에도 불구하고 계속 근로한 기간이 1년 미만인 직원에게는 1개월 개근 시 1일을 준다.',
  '제6조(휴가의 사용) 휴가는 제5조제1항제2호에 따라 쓴다.',
  '부칙',
  '이 규정은 공포한 날부터 시행한다.',
];

describe('anchorsOf — 줄에서 대조할 표지', () => {
  it('조·항·호, 원문자, 날짜, 숫자를 뽑는다', () => {
    expect(anchorsOf(PAGE[0])).toEqual(['제5조', '①', '1', '80', '15', '2024.4.26.']);
    expect(anchorsOf('휴가는 제5조제1항제2호에 따라 쓴다')).toEqual(['제5조', '제1항', '제2호']);
    expect(anchorsOf('제8조의2(휴게) 제 3 항')).toEqual(['제8조의2', '제3항']);
  });
  it('표지가 없는 줄은 빈 목록', () => {
    expect(anchorsOf('이 규정은 공포한 날부터 시행한다.')).toEqual([]);
  });
});

describe('crossCheck', () => {
  it('두 판독이 같으면 걸리는 줄이 없다', () => {
    const r = crossCheck(PAGE, PAGE.join('\n'));
    expect(r).toEqual({ state: 'checked', checked: 3, flagged: [] });
  });

  it('숫자 하나가 다르면 그 줄이 걸린다', () => {
    const other = PAGE.join('\n').replace('15일의', '16일의');
    const r = crossCheck(PAGE, other);
    expect(r.state).toBe('checked');
    if (r.state !== 'checked') return;
    expect(r.flagged).toEqual([{ line: 1, text: PAGE[0], anchors: ['15'] }]);
  });

  it('조 번호가 다르면 걸린다', () => {
    const r = crossCheck(PAGE, PAGE.join('\n').replace('제6조', '제8조'));
    expect(r.state === 'checked' && r.flagged.map((f) => [f.line, f.anchors])).toEqual([[3, ['제6조']]]);
  });

  it('줄바꿈·띄어쓰기가 달라도 걸리지 않는다', () => {
    const other = [
      '제 5 조(연차휴가) ① 1년간 80퍼센트 이상 출근한',
      '직원에게 15일의 유급휴가를 준다. <개정 2024.',
      '4. 26.> ② 제1항에도 불구하고 계속 근로한 기간이 1년',
      '미만인 직원에게는 1개월 개근 시 1일을 준다. 제6조(휴가의 사용) 휴가는 제5조 제1항 제2호에 따라 쓴다.',
      '부칙 이 규정은 공포한 날부터 시행한다.',
    ].join('\n');
    expect(crossCheck(PAGE, other)).toEqual({ state: 'checked', checked: 3, flagged: [] });
  });

  it('같은 숫자가 여러 번이면 개수까지 본다 — 다른 줄에 같은 숫자가 있다고 넘기지 않는다', () => {
    const lines = ['① 휴직 기간은 30일로 한다.', '② 연장은 30일까지 한다.'];
    const r = crossCheck(lines, '① 휴직 기간은 30일로 한다.\n② 연장은 80일까지 한다.');
    expect(r.state === 'checked' && r.flagged.map((f) => f.line)).toEqual([2]);
  });

  it('두 번째 판독이 원문자를 하나도 내지 못한 쪽(tesseract 는 ①을 「0)」로 읽는다)은 원문자를 대조하지 않는다', () => {
    const lines = ['제4조(휴가) ① 휴가는 연 15일로 한다.', '② 휴가 신청은 3일 전까지 한다.', '③ 휴가는 나눠 쓸 수 있다.'];
    const r = crossCheck(lines, '제4조(휴가) 0) 휴가는 연 15일로 한다.\n@) 휴가 신청은 3일 전까지 한다.\n®) 휴가는 나눠 쓸 수 있다.');
    expect(r).toEqual({ state: 'checked', checked: 2, flagged: [] });
    // 원문자를 낸 쪽이면 대조한다
    const s = crossCheck(lines, '제4조(휴가) ① 휴가는 연 15일로 한다.\n③ 휴가 신청은 3일 전까지 한다.\n③ 휴가는 나눠 쓸 수 있다.');
    expect(s.state === 'checked' && s.flagged.map((f) => [f.line, f.anchors])).toEqual([[2, ['②']]]);
  });

  it('두 번째 판독이 없거나 비면 「대조 못 함」 — 일치로 보지 않는다', () => {
    expect(crossCheck(PAGE, null)).toEqual({ state: 'not_checked' });
    expect(crossCheck(PAGE, '   \n ')).toEqual({ state: 'not_checked' });
  });
});

describe('attachChecks · summarize — 파일별로 붙이고 센다', () => {
  const pdf = [{ path: 'a/인사규정.pdf', pages: 3, scanned: [2, 3], read: [2, 3] }, { path: 'b.pdf', pages: 1, scanned: [], read: [] }];
  const checks = new Map([['a/인사규정.pdf', [
    { page: 3, state: 'not_checked' as const },
    { page: 2, state: 'checked' as const, checked: 4, flagged: [{ line: 1, text: 'x 15', anchors: ['15'] }, { line: 3, text: 'y 제2조', anchors: ['제2조'] }] },
  ]]]);

  it('경로가 같은 pdf 에만 쪽 순서로 붙인다', () => {
    const out = attachChecks(pdf, checks);
    expect(out[0].xcheck?.map((c) => c.page)).toEqual([2, 3]);
    expect(out[1].xcheck).toBeUndefined();
    expect(pdf[0]).not.toHaveProperty('xcheck');
  });

  it('스캔 쪽 수 · 다른 줄 수 · 대조 못 한 쪽 수', () => {
    const [a, b] = attachChecks(pdf, checks);
    expect(summarize(a)).toEqual({ pages: 2, flagged: [{ page: 2, line: 1, text: 'x 15', anchors: ['15'] }, { page: 2, line: 3, text: 'y 제2조', anchors: ['제2조'] }], notChecked: 1 });
    expect(summarize(b)).toBeNull();
  });
});

describe('두 번째 판독이 숫자를 많이 놓친 쪽(빽빽한 표) — 줄마다 걸지 않고 「대조 못 함」', () => {
  // 실측: 이수학점표 쪽에서 tesseract 가 표 숫자를 거의 놓쳐 대조한 15줄 중 14줄이 걸렸다(하이쿠는 맞게 읽었다)
  const rows = Array.from({ length: 8 }, (_, i) => `학과${i} | 15 | 12 | ${i + 3} | 30 | 7${i} | 0 | 132`);
  it('대조한 줄의 절반 넘게 걸리면 쪽 전체를 「대조 못 함」(사유 low_coverage)으로 돌린다', () => {
    expect(crossCheck(rows, '학과 표 이수학점 기준표')).toEqual({ state: 'not_checked', reason: 'low_coverage' });
  });
  it('몇 줄만 다르면 그대로 그 줄을 짚는다', () => {
    const other = rows.join('\n').replace('| 74 |', '| 47 |');
    const r = crossCheck(rows, other);
    expect(r.state).toBe('checked');
    if (r.state === 'checked') expect(r.flagged.map((f) => f.line)).toEqual([5]);
  });
});
