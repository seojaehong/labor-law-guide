import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { relaxLaborQuery } from '@/lib/search/relax-query';

type Row = Record<string, unknown>;
type SourceResult = { rows: Row[]; usedRelaxed: boolean };

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all'; // 'cases' | 'admin' | 'news' | 'all'
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const offset = (page - 1) * limit;

  if (!q || q.length < 2) {
    return NextResponse.json({ error: '검색어는 2자 이상 입력해주세요.' }, { status: 400 });
  }

  // 1차 검색이 0건일 때만 쓰는 완화 검색어 ("부당전보" → "전보")
  const relaxed = relaxLaborQuery(q);

  const withRelaxFallback = async (
    run: (query: string) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  ): Promise<SourceResult> => {
    let { data, error } = await run(q);
    if (relaxed && (error || !data || data.length === 0)) {
      ({ data, error } = await run(relaxed));
      if (!error && data && data.length > 0) return { rows: data, usedRelaxed: true };
    }
    return { rows: !error && data ? data : [], usedRelaxed: false };
  };

  const empty: SourceResult = { rows: [], usedRelaxed: false };
  const wanted = (source: string) => type === 'all' || type === source;

  // 세 소스는 서로 의존하지 않는다 — 순차로 돌면 왕복 시간이 그대로 더해진다
  const [casesRes, adminRes, newsRes] = await Promise.all([
    wanted('cases')
      ? withRelaxFallback((query) =>
          supabase.rpc('search_cases', {
            query,
            result_limit: type === 'all' ? 10 : limit,
            page_offset: type === 'all' ? 0 : offset,
          }),
        )
      : empty,
    wanted('admin')
      ? withRelaxFallback((query) =>
          supabase.rpc('search_admin', {
            query,
            result_limit: type === 'all' ? 10 : limit,
            page_offset: type === 'all' ? 0 : offset,
          }),
        )
      : empty,
    wanted('news')
      ? withRelaxFallback((query) => {
          const pattern = `%${query.replace(/[%_\\,().]/g, '')}%`;
          return supabase
            .from('news')
            .select('*')
            .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
            .order('published_at', { ascending: false })
            .range(type === 'all' ? 0 : offset, type === 'all' ? 9 : offset + limit - 1);
        })
      : empty,
  ]);

  const results: { type: string; data: Row }[] = [];
  const relaxedUsed: string[] = [];
  for (const [source, label, res] of [
    ['cases', 'case', casesRes],
    ['admin', 'admin', adminRes],
    ['news', 'news', newsRes],
  ] as const) {
    for (const d of res.rows) results.push({ type: label, data: d });
    if (res.usedRelaxed) relaxedUsed.push(source);
  }

  const totalCases = casesRes.rows.length;
  const totalAdmin = adminRes.rows.length;
  const totalNews = newsRes.rows.length;

  return NextResponse.json({
    total: totalCases + totalAdmin + totalNews,
    page,
    limit,
    counts: { cases: totalCases, admin: totalAdmin, news: totalNews },
    // 완화 검색으로 채운 소스가 있으면 어떤 검색어를 썼는지 알린다
    ...(relaxedUsed.length ? { relaxed_query: relaxed, relaxed_sources: relaxedUsed } : {}),
    results,
  });
}
