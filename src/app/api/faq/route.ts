import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseAdmin || supabase;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const idParam = searchParams.get('id');
  const category = searchParams.get('category') || null;
  const query = searchParams.get('q') || null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt(searchParams.get('size') || '20', 10)));
  const offset = (page - 1) * size;

  // 단일 FAQ id 조회 (Phase 1.3 인용 링크용)
  if (idParam && /^\d+$/.test(idParam)) {
    const { data, error } = await db
      .from('faq')
      .select('id, unified_category, category, question, answer')
      .eq('id', parseInt(idParam, 10))
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ faqs: [], total: 0 }, { status: error ? 500 : 200 });
    }
    return NextResponse.json({
      faqs: [
        {
          id: data.id,
          unified_category: data.unified_category || data.category,
          question: data.question,
          answer: data.answer,
        },
      ],
      total: 1,
    });
  }

  // 검색어 있고 카테고리 없으면 hybrid 사용 (구어체↔학술어 gap 커버)
  if (query && !category) {
    const hybrid = await db.rpc('search_faq_hybrid', {
      query_text: query,
      max_results: size * page,
    });
    if (!hybrid.error && Array.isArray(hybrid.data)) {
      const rows = hybrid.data as Array<{ id: number; unified_category?: string; category?: string; question: string; answer: string }>;
      const paged = rows.slice(offset, offset + size);
      const faqs = paged.map((row) => ({
        id: row.id,
        unified_category: row.unified_category || row.category,
        question: row.question,
        answer: row.answer,
      }));
      return NextResponse.json({ faqs, total: rows.length });
    }
    // hybrid 실패 시 레거시 폴백
  }

  const { data, error } = await db.rpc('get_faq_by_category', {
    cat: category,
    page_size: size,
    page_offset: offset,
    search_query: query,
    canonical_only: !query,
  });

  if (error) {
    return NextResponse.json({ faqs: [], total: 0, error: error.message }, { status: 500 });
  }

  const faqs = (data || []).map((row: { id: number; unified_category: string; question: string; answer: string; total_count: number }) => ({
    id: row.id,
    unified_category: row.unified_category,
    question: row.question,
    answer: row.answer,
  }));

  const total = data?.[0]?.total_count || 0;

  return NextResponse.json({ faqs, total });
}
