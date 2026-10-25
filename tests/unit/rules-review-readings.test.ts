// 판독문 원문 대조 — 조문이 아닌 판독(표·머리 줄·부칙·별표)을 쪽 번호와 두 판독으로 펼쳐 담당자가 원문과 맞춰 보게 한다.
// 합성 자료만 쓴다(실제 기관 이름 없음).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { crossCheck, type PageCheck } from '@/lib/rules-review/ocr-crosscheck';
import { nonArticleSegments } from '@/lib/rules-review/readings';
import ReadingsPanel from '@/app/tools/rules-review/ReadingsPanel';
import AmendPanel from '@/app/tools/rules-review/AmendPanel';
import { parseRegulation } from '@/lib/rules-review/model';
import { newWorkspace } from '@/lib/rules-review/workspace';

const TABLE = [
  '구분 | 위원 수 | 임기',
  '인사위원회 | 7명 | 2년',
  '징계위원회 | 5명 | 1년',
];
const ARTICLE_PAGE = [
  '시험공단 복무 규정',
  '제정 2019. 3. 1.',
  '제1조(목적) 이 규정은 시험공단 직원의 복무를 정한다.',
  '제2조(위원회) 위원회 구성은 다음 표와 같다.',
  ...TABLE,
  '부칙',
  '이 규정은 2024. 1. 1.부터 시행한다.',
];

const page = (no: number, a: string[], b: string | null): PageCheck => ({ page: no, ...crossCheck(a, b), a, b });

describe('nonArticleSegments — 조문이 아닌 판독 줄을 쪽별로 묶는다', () => {
  it('머리 줄·표·부칙은 모으고 조문 본문은 모으지 않는다', () => {
    const segs = nonArticleSegments([page(1, ARTICLE_PAGE, ARTICLE_PAGE.join('\n'))]);
    expect(segs.map((s) => s.kind)).toEqual(['머리', '표', '부칙']);
    expect(segs[0].lines.map((l) => l.text)).toEqual(['시험공단 복무 규정', '제정 2019. 3. 1.']);
    expect(segs[1].lines.map((l) => l.no)).toEqual([5, 6, 7]);
    const all = segs.flatMap((s) => s.lines.map((l) => l.text));
    expect(all).not.toContain('제1조(목적) 이 규정은 시험공단 직원의 복무를 정한다.');
    expect(all.every((t) => !t.startsWith('제2조'))).toBe(true);
  });

  it('조문 머리가 하나도 없는 표 쪽은 쪽 전체를 모은다', () => {
    const segs = nonArticleSegments([page(3, TABLE, null)]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ page: 3, kind: '표' });
    expect(segs[0].lines).toHaveLength(3);
  });

  it('앞 쪽에서 시작한 조문이 다음 쪽으로 이어지면 이어진 줄은 조문으로 본다', () => {
    const segs = nonArticleSegments([
      page(1, ['제1조(목적) 이 규정은 복무를 정한다.'], null),
      page(2, ['② 제1항의 세부 사항은 따로 정한다.'], null),
    ]);
    expect(segs).toEqual([]);
  });

  it('첫 장 제목 뒤 첫 조문 전의 날짜 줄은 머리로 모은다', () => {
    const segs = nonArticleSegments([page(1, ['제1장 총칙', '제정 2019. 3. 1.', '제1조(목적) 이 규정은 복무를 정한다.', '제2장 복무', '제2조(근무) 근무는 따로 정한다.'], null)]);
    expect(segs.map((s) => [s.kind, s.lines.map((l) => l.text)])).toEqual([
      ['장·절 제목', ['제1장 총칙']], ['머리', ['제정 2019. 3. 1.']], ['장·절 제목', ['제2장 복무']],
    ]);
  });

  it('판독문이 저장되지 않은 옛 작업 쪽은 건너뛴다', () => {
    expect(nonArticleSegments([{ page: 1, state: 'not_checked' }])).toEqual([]);
  });
});

describe('ReadingsPanel — 판독문 원문 대조 화면', () => {
  const render = (xcheck: PageCheck[]) => renderToStaticMarkup(createElement(ReadingsPanel, { path: '묶음/시험공단 위원회 규정.pdf', xcheck }));

  it('대조하지 못한 표 쪽 — 표 판독과 「대조 못 함 — 사람 확인 필요」를 보이고 통과처럼 말하지 않는다', () => {
    const html = render([page(4, TABLE, null)]);
    expect(html).toContain('판독문 원문 대조');
    expect(html).toContain('4쪽');
    expect(html).toContain('인사위원회');
    expect(html).toContain('7명');
    expect(html).toContain('대조 못 함 — 사람 확인 필요');
    expect(html).not.toMatch(/일치|통과|이상 없음/);
    // 표 칸은 판독기가 「 | 」로 준 그대로 칸을 나눈다
    expect(html).toContain('<td>징계위원회</td>');
  });

  it('두 번째 판독은 옆에 그대로 보이고, 두 판독이 다른 숫자는 표시한다', () => {
    const b = ['구분 위원 수 임기', '인사위원회 9명 2년', '징계위원회 5명 1년'].join('\n');
    const html = render([page(2, TABLE, b)]);
    expect(html).toContain('두 번째 판독');
    expect(html).toContain('인사위원회 9명 2년');
    expect(html).toContain('<mark>7</mark>');
    expect(html).toContain('두 판독에서 다른 줄 1곳');
    expect(html).not.toContain('대조 못 함');
  });

  it('숫자가 다 맞아도 「글자는 원문과 대조」로 남긴다', () => {
    const html = render([page(2, TABLE, TABLE.join('\n'))]);
    expect(html).toContain('글자는 원문과 대조');
    expect(html).not.toMatch(/일치|통과/);
  });

  it('원본 쪽 그림은 저장하지 않으므로 원본 pdf 쪽을 열라고 안내한다', () => {
    const html = render([page(4, TABLE, null)]);
    expect(html).toContain('원본 pdf 4쪽');
  });

  it('조문이 아닌 판독이 없으면 아무것도 그리지 않는다', () => {
    expect(render([page(1, ['제1조(목적) 이 규정은 복무를 정한다.'], null)])).toBe('');
  });

  it('조문 고치기 — 조문이 없는 표 규정은 「맞는 조문이 없습니다」 대신 읽은 글자를 보인다', () => {
    const reg = parseRegulation({ key: 'r1', name: '시험공단 위원회 규정', fileName: '시험공단 위원회 규정.pdf', kind: 'pdf', lines: TABLE.map((text) => ({ text, controls: 0 })) });
    const ws = newWorkspace([reg], [], { read: 1, duplicates: [], notRegulation: [], annexFiles: [], failed: [], skipped: [],
      pdf: [{ path: '시험공단 위원회 규정.pdf', pages: 1, scanned: [1], read: [1], xcheck: [page(1, TABLE, null)] }] });
    const html = renderToStaticMarkup(createElement(AmendPanel, { ws, setWs: () => {} }));
    expect(html).not.toContain('맞는 조문이 없습니다');
    expect(html).toContain('조문(제N조)을 찾지 못했습니다');
    expect(html).toContain('인사위원회 | 7명 | 2년');
    expect(html).toContain('판독문 원문 대조');
  });

  it('옛 작업(판독문 없음)은 다시 읽으라고 알린다', () => {
    const html = render([{ page: 1, state: 'not_checked' }]);
    expect(html).toContain('판독문이 저장되지 않았습니다');
  });
});
