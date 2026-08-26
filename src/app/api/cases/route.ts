import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { relaxLaborQuery } from '@/lib/search/relax-query';

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

  const results: { type: string; data: Record<string, unknown> }[] = [];
  let totalCases = 0;
  let totalAdmin = 0;
  let totalNews = 0;

  // 1차 검색이 0건일 때만 쓰는 완화 검색어 ("부당전보" → "전보")
  const relaxed = relaxLaborQuery(q);
  const relaxedUsed: string[] = [];

  if (type === 'all' || type === 'cases') {
    const searchCases = (query: string) =>
      supabase.rpc('search_cases', {
        query,
        result_limit: type === 'all' ? 10 : limit,
        page_offset: type === 'all' ? 0 : offset,
      });

    let { data, error } = await searchCases(q);
    if (relaxed && (error || !data || data.length === 0)) {
      ({ data, error } = await searchCases(relaxed));
      if (!error && data && data.length > 0) relaxedUsed.push('cases');
    }
    if (!error && data) {
      for (const d of data) results.push({ type: 'case', data: d });
      totalCases = data.length;
    }
  }

  if (type === 'all' || type === 'admin') {
    const searchAdmin = (query: string) =>
      supabase.rpc('search_admin', {
        query,
        result_limit: type === 'all' ? 10 : limit,
        page_offset: type === 'all' ? 0 : offset,
      });

    let { data, error } = await searchAdmin(q);
    if (relaxed && (error || !data || data.length === 0)) {
      ({ data, error } = await searchAdmin(relaxed));
      if (!error && data && data.length > 0) relaxedUsed.push('admin');
    }
    if (!error && data) {
      for (const d of data) results.push({ type: 'admin', data: d });
      totalAdmin = data.length;
    }
  }

  if (type === 'all' || type === 'news') {
    const searchNews = (query: string) => {
      const pattern = `%${query.replace(/[%_\\,().]/g, '')}%`;
      return supabase
        .from('news')
        .select('*')
        .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
        .order('published_at', { ascending: false })
        .range(type === 'all' ? 0 : offset, type === 'all' ? 9 : offset + limit - 1);
    };

    let { data, error } = await searchNews(q);
    if (relaxed && (error || !data || data.length === 0)) {
      ({ data, error } = await searchNews(relaxed));
      if (!error && data && data.length > 0) relaxedUsed.push('news');
    }
    if (!error && data) {
      for (const d of data) results.push({ type: 'news', data: d });
      totalNews = data.length;
    }
  }

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
