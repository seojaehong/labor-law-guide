/**
 * 해설 글(블로그) 목록 — /ai 「근거 자료 찾기」의 자료 목록에 붙인다 (261112).
 *
 * /blog 목록 검색과 같은 방식(제목·요약 ilike)이고 DB 조회 한 번뿐이라 추가 유료 호출이 없다.
 * 문장 전체를 ilike 패턴으로 넣으면 거의 아무것도 안 걸리므로 첫 내용어 하나로 찾는다.
 * 요약 프롬프트에는 넣지 않는다 — 더 읽을거리로만 보여 준다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { toLexQuery } from './lex-query';
import { excerpt, joinMeta, type SourceItem } from '../sources';

export async function buildBlogSources(db: SupabaseClient, text: string, limit = 3): Promise<SourceItem[]> {
  const first = toLexQuery(text).split(/\s+/)[0] || '';
  // or() 문법을 깨는 문자와 ilike 와일드카드를 지운다
  const keyword = first.replace(/[,()*%_\\.:'"?!]/g, '').trim();
  if (keyword.length < 2) return [];
  const { data, error } = await db
    .from('blog_articles')
    .select('slug, title, summary, category, published_at')
    .or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%`)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ slug: string; title: string; summary?: string | null; published_at?: string | null }>).map(row => ({
    type: 'BLOG' as const,
    id: row.slug,
    title: row.title,
    href: `/blog/${encodeURIComponent(row.slug)}`,
    meta: joinMeta(row.published_at ? String(row.published_at).slice(0, 10) : null),
    excerpt: excerpt(row.summary),
  }));
}
