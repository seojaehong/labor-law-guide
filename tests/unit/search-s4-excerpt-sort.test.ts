// 261119 S4 — /decisions 검색 결과에 검색어 둘레 발췌, 「최신순」(관련 상위 100건 안에서 날짜순).
// DB 함수는 바꾸지 않는다(공용 DB 디스크 I/O 한도) — RPC 가 이미 돌려주는 요지·판단 칸을 쓴다.
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: mocks }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { runSearch, searchExcerpt } from '@/lib/decisions-data';
import { parse, pageHref } from '@/lib/decisions-query';
import { ResultRow } from '@/app/decisions/SearchResults';

beforeEach(() => vi.clearAllMocks());

it('발췌는 검색어가 처음 나오는 곳 둘레를 보여준다', () => {
  const long = '가'.repeat(100) + ' 징계 절차를 거치지 않은 해고는 ' + '나'.repeat(100);
  const ex = searchExcerpt([null, long], '징계 절차');
  expect(ex).toContain('징계 절차를 거치지 않은 해고는');
  expect(ex!.startsWith('…')).toBe(true);
  expect(ex!.length).toBeLessThanOrEqual(122);
});

it('검색어가 어디에도 없으면 첫 칸 앞부분, 칸이 모두 비면 null', () => {
  expect(searchExcerpt(['**요지** 첫 문장입니다.', '둘째'], '없는말')).toBe('요지 첫 문장입니다.');
  expect(searchExcerpt([null, '  ', undefined], '해고')).toBeNull();
});

it('최신순은 관련 상위 100건을 한 번 받아 날짜순으로 자른다', async () => {
  const data = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, title: `t${i}`, doc_number: `n${i}`, decision_date: `20${10 + (i % 15)}-01-0${1 + (i % 9)}`, summary: '해고 요지' }));
  mocks.rpc.mockResolvedValue({ data, error: null });
  const r = await runSearch('해고', 'admin', 1, 'date');
  expect(mocks.rpc).toHaveBeenCalledWith('search_admin', { query: '해고', result_limit: 100, page_offset: 0 });
  if (!r.ok) throw new Error('fail');
  expect(r.rows).toHaveLength(20);
  const dates = r.rows.map(x => x.date ?? '');
  expect([...dates].sort().reverse()).toEqual(dates);
  expect(r.hasMore).toBe(true);
  const p2 = await runSearch('해고', 'admin', 2, 'date');
  if (!p2.ok) throw new Error('fail');
  expect(p2.rows).toHaveLength(10);
  expect(p2.hasMore).toBe(false);
});

it('관련도순(기본)은 지금과 같은 RPC 호출이고 발췌가 붙는다', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: 'c1', title: '판결', case_number: '2013누8181', court: '서울고법', summary: '정직 처분의 징계 양정이 과도하다', holding_points: null }], error: null });
  const r = await runSearch('징계 양정', 'court', 1);
  expect(mocks.rpc).toHaveBeenCalledWith('search_cases', { query: '징계 양정', result_limit: 21, page_offset: 0 });
  if (!r.ok) throw new Error('fail');
  expect(r.rows[0].excerpt).toBe('정직 처분의 징계 양정이 과도하다');
});

it('주소: sort=date 는 남고 기본값은 빠진다, 이상한 값은 관련도순', () => {
  expect(parse({ q: '해고', sort: 'date' }).sort).toBe('date');
  expect(parse({ q: '해고', sort: 'x' }).sort).toBe('relevance');
  expect(pageHref('해고', 'admin', 2, 'date')).toBe('/decisions?q=%ED%95%B4%EA%B3%A0&type=admin&page=2&sort=date');
  expect(pageHref('해고', 'nlrc', 1)).toBe('/decisions?q=%ED%95%B4%EA%B3%A0');
});

it('결과 행은 발췌를 제목 아래에 보여준다', () => {
  const html = renderToStaticMarkup(createElement(ResultRow, { row: { kind: 'court', href: '/cases/x', title: '제목', caseNumber: null, date: null, tag: null, result: null, excerpt: '발췌 문장' } }));
  expect(html).toContain('발췌 문장');
});

it('AI 요약 표시는 남기고 줄 안에 붙은 제목 기호(#)는 지운다', () => {
  expect(searchExcerpt(['[AI요약] # 징계처분 취소소송 ## 결과 요약 - 원고 청구 기각'], '없는말'))
    .toBe('[AI요약] 징계처분 취소소송 결과 요약 - 원고 청구 기각');
});
