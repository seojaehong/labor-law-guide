// 261124 · #213 — 행정해석 검색이 두 표 중 하나만 읽어 전체의 65%가 빠졌다.
// 「섞어서 점수로 줄세우면 된다」가 아니다 — 두 함수의 relevance 는 서로 다른 자로 잰 값이라
// 한 줄로 세우면 한쪽이 늘 뒤로 밀린다. 그래서 번갈아 끼우는 쪽을 고정한다.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  interleaveInterpretations,
  interpretationKey,
  toInterpretation,
} from '@/lib/search/interpretation-merge';

const src = readFileSync('src/lib/search/search-modes.ts', 'utf8');

const molab = (n: number) => ({
  id: `ml_${n}`, title: `molab ${n}`, case_number: `임금 68207-${n}`,
  decision_date: '2015-01-01', inquiry_summary: null, answer_summary: null, keywords_matched: [],
});

it('두 표가 다 차 있으면 번갈아 들어간다 — 한쪽이 상위 칸을 전부 먹지 않는다', () => {
  const admin = [1, 2, 3, 4, 5].map((n) => ({ ...molab(n), id: `근로기준과-${n}`, title: `행정 ${n}` }));
  const out = interleaveInterpretations(admin, [6, 7, 8, 9, 10].map(molab), 5);
  expect(out.map((x) => x.id)).toEqual(['근로기준과-1', 'ml_6', '근로기준과-2', 'ml_7', '근로기준과-3']);
});

it('한쪽이 비면 남은 쪽으로 칸을 채운다', () => {
  expect(interleaveInterpretations([1, 2, 3].map(molab), [], 5).map((x) => x.id)).toEqual(['ml_1', 'ml_2', 'ml_3']);
  expect(interleaveInterpretations([], [1, 2].map(molab), 5)).toHaveLength(2);
});

it('번호와 제목이 같으면 한 번만 — 지우지 않고 읽는 시점에 걷어낸다', () => {
  const a = { ...molab(1), id: 'ml_dup' };
  const b = { ...molab(1), id: '근로기준과-99' }; // 같은 번호·제목, 다른 표
  const out = interleaveInterpretations([a], [b], 5);
  expect(out).toHaveLength(1);
});

it('번호도 제목도 없으면 id 로 가른다 — 빈 값끼리 한 건으로 뭉치지 않는다', () => {
  const blank = (id: string) => ({ ...molab(0), id, case_number: null, title: '' });
  expect(interpretationKey(blank('a'))).not.toBe(interpretationKey(blank('b')));
  expect(interleaveInterpretations([blank('a')], [blank('b')], 5)).toHaveLength(2);
});

it('admin_interpretations 의 다른 열 이름을 화면이 쓰는 모양으로 옮긴다', () => {
  expect(
    toInterpretation({
      id: '근로기준과-1', title: '제목', doc_number: '근로기준과-1', decision_date: '2020-01-01',
      summary: '질의', holding_points: '회시', keywords_matched: null,
    })
  ).toEqual({
    id: '근로기준과-1', title: '제목', case_number: '근로기준과-1', decision_date: '2020-01-01',
    inquiry_summary: '질의', answer_summary: '회시', keywords_matched: [],
  });
});

it('텍스트 검색은 두 표의 함수를 모두 부른다 — molab 한 표에 ilike 하던 길로 돌아가지 않는다', () => {
  expect(src).toContain("supabase.rpc('search_admin_core'");
  expect(src).toContain("supabase.rpc('search_molab_only'");
  expect(src).not.toMatch(/from\('molab_interpretations'\)[\s\S]{0,400}?\.or\(`title\.ilike/);
});

it('사유 분류 경로도 두 표를 본다', () => {
  const reasonBlock = src.slice(src.indexOf('REASON_TO_LAWGO_KEYWORDS[reason]'), src.indexOf('// 2순위'));
  expect(reasonBlock).toContain("from('molab_interpretations')");
  expect(reasonBlock).toContain("from('admin_interpretations')");
});
