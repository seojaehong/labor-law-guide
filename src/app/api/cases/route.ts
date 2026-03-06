import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

  if (type === 'all' || type === 'cases') {
    const { data, error } = await supabase.rpc('search_cases', {
      query: q,
      result_limit: type === 'all' ? 10 : limit,
      page_offset: type === 'all' ? 0 : offset,
    });
    if (!error && data) {
      for (const d of data) results.push({ type: 'case', data: d });
      totalCases = data.length;
    }
  }

  if (type === 'all' || type === 'admin') {
    const { data, error } = await supabase.rpc('search_admin', {
      query: q,
      result_limit: type === 'all' ? 10 : limit,
      page_offset: type === 'all' ? 0 : offset,
    });
    if (!error && data) {
      for (const d of data) results.push({ type: 'admin', data: d });
      totalAdmin = data.length;
    }
  }

  if (type === 'all' || type === 'news') {
    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
      .order('published_at', { ascending: false })
      .range(type === 'all' ? 0 : offset, type === 'all' ? 9 : offset + limit - 1);
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
    results,
  });
}
