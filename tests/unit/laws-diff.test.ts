import { describe, expect, it } from 'vitest';
import { diffArticle, stripAnnotations } from '@/lib/laws/diff';

const flat = (segs: { text: string; hl: boolean }[] | undefined) =>
  (segs ?? []).map((s) => (s.hl ? `[${s.text}]` : s.text)).join('');

describe('stripAnnotations', () => {
  it('개정·신설 꼬리표를 뗀다', () => {
    expect(stripAnnotations('① 휴가를 준다. <개정 2012.2.1, 2026.6.9>')).toBe('① 휴가를 준다.');
    expect(stripAnnotations('⑤ 분할 청구 <신설 2026.6.9>')).toBe('⑤ 분할 청구');
    expect(stripAnnotations('제44조의4(구분지급) [본조신설 2026.4.7]')).toBe('제44조의4(구분지급)');
  });
});

describe('diffArticle', () => {
  it('꼬리표만 바뀐 줄은 같은 줄로 본다', () => {
    const rows = diffArticle('① 준다. <개정 2012.2.1>', '① 준다. <개정 2012.2.1, 2026.6.9>');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('same');
  });

  it('바뀐 줄 안에서 바뀐 글자만 칠한다', () => {
    const rows = diffArticle(
      '④ 배우자 출산휴가는 3회에 한정하여 나누어 사용할 수 있다.',
      '④ 배우자 출산전후휴가는 3회에 한정하여 나누어 사용할 수 있다.',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('mod');
    expect(flat(rows[0].after)).toBe('④ 배우자 출산[전후]휴가는 3회에 한정하여 나누어 사용할 수 있다.');
    expect(flat(rows[0].before)).toBe('④ 배우자 출산휴가는 3회에 한정하여 나누어 사용할 수 있다.');
  });

  it('끼어든 항은 추가로, 나머지는 같은 줄로 맞춘다', () => {
    const rows = diffArticle('제60조\n① 가\n② 나', '제60조\n① 가\n⑤ 새 항 <신설 2026.6.9>\n② 나');
    expect(rows.map((r) => r.type)).toEqual(['same', 'same', 'add', 'same']);
    expect(flat(rows[2].after)).toBe('[⑤ 새 항]');
  });

  it('신설 조문(전이 없음)은 전부 추가', () => {
    const rows = diffArticle(null, '제44조의4(구분지급)\n① 지급한다.');
    expect(rows.every((r) => r.type === 'add')).toBe(true);
  });

  it('삭제 조문(후가 없음)은 전부 삭제', () => {
    const rows = diffArticle('제103조(의무)\n비밀을 지킨다.', null);
    expect(rows.every((r) => r.type === 'del')).toBe(true);
  });

  it('호의 들여쓰기 깊이를 보존한다', () => {
    const rows = diffArticle('① 각 호\n  1. 국가', '① 각 호\n  1. 국가\n  2. 지방자치단체');
    expect(rows[2]).toMatchObject({ type: 'add', depth: 1 });
  });

  it('거의 다 바뀐 줄은 글자 비교 대신 통째로 바꾼다', () => {
    const rows = diffArticle('가나다라마바사', '하파타카차자아');
    expect(rows.map((r) => r.type)).toEqual(['del', 'add']);
  });
});
