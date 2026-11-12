// 261112 — /ai 「근거 자료 찾기」. 화면이 먼저 보여 줄 자료 목록은 챗 경로가 이미 찾은 행에서 만든다.
// 검색을 따로 한 번 더 돌리지 않는다(유료 호출을 늘리지 않고, 요약과 목록이 어긋나지 않게).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildNlrcCasesContext, buildCourtCasesContext } from '@/lib/chat/context/cases';
import { buildInterpretationsContext } from '@/lib/chat/context/interpretations';
import { buildLawsContext } from '@/lib/chat/context/laws';
import { buildBlogSources } from '@/lib/chat/context/blog';
import { faqSourceItems, lawArticleHref } from '@/lib/chat/sources';

beforeEach(() => { vi.stubEnv('JEV_ON', 'false'); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const rpc = (rows: unknown[]) => ({ rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) }) as unknown as SupabaseClient;

it('판정례·판례·행정해석 목록은 컨텍스트에 넣은 그 행으로 만들고 사이트 상세 주소를 단다', async () => {
  const nlrc = await buildNlrcCasesContext(rpc([{ id: 'n1', title: '연차휴가 미사용 판정', decision_result: '기각', decision_date: '2024-05-01T00:00:00', holding_summary: '요지' }]), 'q', [0]);
  expect(nlrc.items).toEqual([expect.objectContaining({ type: 'CASE', id: 'n1', title: '연차휴가 미사용 판정', href: '/decisions/n1' })]);
  expect(nlrc.items?.[0].meta).toContain('2024-05-01');

  const court = await buildCourtCasesContext(rpc([{ id: '대법원_2023다302838', title: '통상임금', court: '대법원', decision_date: '2024-12-19' }]), [0]);
  expect(court.items?.[0]).toMatchObject({ type: 'COURT', href: `/cases/${encodeURIComponent('대법원_2023다302838')}` });

  const interp = await buildInterpretationsContext(rpc([{ id: '임금근로시간과-956', title: '노동절 휴일대체', case_number: '임금근로시간과-956', decision_date: '2020-01-01' }]), [0]);
  expect(interp.items?.[0]).toMatchObject({ type: 'INTERP', href: `/interpretations/${encodeURIComponent('임금근로시간과-956')}` });

  // 목록 id 는 인용 목록(evidenceIds)과 같은 집합이다
  for (const r of [nlrc, court, interp]) expect(r.items?.map(i => i.id)).toEqual(r.evidenceIds);
});

it('법령 조문은 상세 페이지가 없으므로 법제처 원문 주소로 잇는다', async () => {
  const laws = await buildLawsContext(rpc([
    { law_name: '근로기준법', article_label: '제60조', article_title: '연차 유급휴가', body: '제60조(연차 유급휴가) ① 사용자는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 주어야 한다.', law_kind: '법률', effective_date: '2021-01-01', score: 1, matched: 1 },
    { law_name: '근로기준법 시행령', article_label: '제30조', article_title: null, body: '본문', law_kind: '대통령령', effective_date: null, score: 1, matched: 1 },
  ]), '연차휴가는 언제 생기나요?');
  expect(laws.items?.[0]).toMatchObject({ type: 'LAW', id: '근로기준법 제60조', title: '근로기준법 제60조 (연차 유급휴가)', href: 'https://www.law.go.kr/법령/근로기준법/제60조' });
  expect(laws.items?.[0].excerpt).toMatch(/^① 사용자는/);
  expect(laws.items?.[1].href).toBe('https://www.law.go.kr/법령/근로기준법시행령/제30조');
  expect(lawArticleHref('근로기준법 시행령', '[별표 1]')).toBe('https://www.law.go.kr/법령/근로기준법시행령');
  expect(lawArticleHref('근로기준법', '제76조의2')).toBe('https://www.law.go.kr/법령/근로기준법/제76조의2');
});

it('FAQ 목록은 고른 FAQ 행 그대로, 인용과 같은 /faq?id= 주소로', () => {
  expect(faqSourceItems([{ id: 123, unified_category: '연차유급휴가', question: '연차는 언제 생기나요?', answer: '1년간 80% 이상 출근하면 15일이 생깁니다.' }]))
    .toEqual([expect.objectContaining({ type: 'FAQ', id: '123', title: '연차는 언제 생기나요?', href: '/faq?id=123', meta: '연차유급휴가' })]);
});

it('해설 글은 문장 전체가 아니라 첫 내용어로 찾는다', async () => {
  const calls: string[] = [];
  const chain = {
    select: () => chain,
    or: (expr: string) => { calls.push(expr); return chain; },
    order: () => chain,
    limit: async () => ({ data: [{ slug: 'leave-guide', title: '연차휴가 계산 해설', summary: '요약', category: 'guide', published_at: '2026-10-01' }], error: null }),
  };
  const db = { from: (table: string) => { expect(table).toBe('blog_articles'); return chain; } } as unknown as SupabaseClient;
  const items = await buildBlogSources(db, '연차휴가는 언제 생기나요?');
  expect(calls[0]).toContain('%연차휴가%');
  expect(calls[0]).not.toContain('언제');
  expect(items).toEqual([expect.objectContaining({ type: 'BLOG', id: 'leave-guide', title: '연차휴가 계산 해설', href: '/blog/leave-guide' })]);
  expect(await buildBlogSources(db, '?')).toEqual([]);
});
